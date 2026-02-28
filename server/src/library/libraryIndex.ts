import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Index of SysML v2 standard library packages and type declarations.
 *
 * Maps package names (e.g. "ISQ", "SI", "ScalarValues") to their
 * file URIs on disk.  Also indexes individual type declarations
 * (e.g. "Real", "Boolean", "String") with file URI and line number
 * so Go-to-Definition can navigate directly to library types.
 *
 * Built by scanning the bundled `sysml.library` directory (or a
 * user-specified custom path) for `.sysml` / `.kerml` files.
 */

/**
 * Regex to extract the package name from a library file's first
 * declaration line.  Handles:
 *   standard library package ISQ {
 *   standard library package <USCU> USCustomaryUnits {
 *   package Foo {
 */
const PACKAGE_DECL_RE = /^(?:standard\s+)?(?:library\s+)?package\s+(?:<\w+>\s+)?(\w+)/m;

/**
 * Regex to extract individual type declarations from library files.
 * Matches declaration keywords followed by an optional `all` keyword
 * and the type name.  Handles patterns like:
 *   datatype Real specializes Complex;
 *   abstract datatype ScalarValue specializes DataValue;
 *   part def Vehicle { ... }
 *   enum def Color { ... }
 *   struct all Body specializes Object { ... }
 *   metaclass Element { ... }
 *   metadata def ActionUsage { ... }
 *   alias Box for RectangularCuboid;
 */
const TYPE_DECL_RE = /^\s*(?:abstract\s+)?(?:datatype|struct|metaclass|alias|(?:(?:part|attribute|port|action|state|item|connection|interface|requirement|constraint|allocation|usecase|use\s+case|enum|calc|view|viewpoint|metadata|analysis|case|concern|rendering|verification|flow|occurrence|ref)\s+def))\s+(?:all\s+)?'?(\w+)'?/;

/** Library type location: file URI and 0-based line number. */
export interface LibraryTypeLocation {
    uri: string;
    line: number;
}

/** package name → file URI (e.g. "file:///.../.sysml") */
let index: Map<string, string> | undefined;

/** type name → { uri, line } for individual declarations */
let typeIndex: Map<string, LibraryTypeLocation> | undefined;

/**
 * Build the library index by scanning a directory tree for
 * `.sysml` / `.kerml` files.
 */
function buildIndex(libRoot: string): { packages: Map<string, string>; types: Map<string, LibraryTypeLocation> } {
    const packages = new Map<string, string>();
    const types = new Map<string, LibraryTypeLocation>();

    const walk = (dir: string): void => {
        let entries: string[];
        try { entries = readdirSync(dir); }
        catch { return; }

        for (const name of entries) {
            const full = join(dir, name);
            try {
                const stat = statSync(full);
                if (stat.isDirectory()) {
                    walk(full);
                } else if (name.endsWith('.sysml') || name.endsWith('.kerml')) {
                    const fileUri = pathToFileURL(full).href;

                    // Quick package extraction from first 512 bytes
                    const fd = openSync(full, 'r');
                    const buf = Buffer.alloc(512);
                    readSync(fd, buf, 0, 512, 0);
                    closeSync(fd);

                    const head = buf.toString('utf8');
                    const m = PACKAGE_DECL_RE.exec(head);
                    if (m) {
                        packages.set(m[1], fileUri);
                    }

                    // Full-file scan for type declarations with line numbers
                    const content = readFileSync(full, 'utf8');
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const tm = TYPE_DECL_RE.exec(lines[i]);
                        if (tm) {
                            const typeName = tm[1];
                            // Don't overwrite — first match wins (avoids
                            // shadowing by reflective re-declarations)
                            if (!types.has(typeName)) {
                                types.set(typeName, { uri: fileUri, line: i });
                            }
                        }
                    }
                }
            } catch { /* skip unreadable files */ }
        }
    };

    walk(libRoot);
    return { packages, types };
}

/**
 * Initialise the library index.
 *
 * @param serverDir  `__dirname` of the running server module
 *                   (typically `dist/server/` in the npm package).
 * @param customPath Optional user-configured library path override
 *                   (`sysml.library.path` setting).
 * @returns The number of packages indexed.
 */
export function initLibraryIndex(serverDir: string, customPath?: string): number {
    let libRoot: string | undefined;

    if (customPath && customPath.trim()) {
        const abs = resolve(customPath);
        if (existsSync(abs)) {
            libRoot = abs;
        }
    }

    if (!libRoot) {
        // Default: bundled library relative to the server module.
        // Server lives at <pkg>/dist/server/server.js →
        // library is at <pkg>/sysml.library/
        const bundled = resolve(serverDir, '..', '..', 'sysml.library');
        if (existsSync(bundled)) {
            libRoot = bundled;
        }
    }

    if (!libRoot) {
        index = new Map();
        typeIndex = new Map();
        return 0;
    }

    const result = buildIndex(libRoot);
    index = result.packages;
    typeIndex = result.types;
    return index.size;
}

/**
 * Look up a library package by name.
 * Handles qualified names like "ISQ::TorqueValue" — resolves just
 * the first segment (the package name).
 *
 * @returns The file URI of the library file, or `undefined`.
 */
export function resolveLibraryPackage(name: string): string | undefined {
    if (!index) return undefined;
    const pkg = name.split('::')[0];
    return index.get(pkg);
}

/**
 * Look up an individual type declaration in the standard library.
 *
 * Returns the file URI and 0-based line number so Go-to-Definition
 * can navigate directly to the declaration.
 *
 * @returns `{ uri, line }` or `undefined` if not found.
 */
export function resolveLibraryType(name: string): LibraryTypeLocation | undefined {
    if (!typeIndex) return undefined;
    return typeIndex.get(name);
}

/**
 * Get all indexed package names (for diagnostics / completions).
 */
export function getLibraryPackageNames(): string[] {
    return index ? Array.from(index.keys()) : [];
}

/**
 * Get all indexed type names (for completions / hover).
 */
export function getLibraryTypeNames(): string[] {
    return typeIndex ? Array.from(typeIndex.keys()) : [];
}
