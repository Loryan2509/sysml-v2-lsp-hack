import { describe, it, expect } from 'vitest';

describe('Diagnostics', () => {
    it('should produce diagnostics for syntax errors', async () => {
        const { parseDocument } = await import('../../server/src/parser/parseDocument.js');

        const text = 'package Broken { @@@ }';
        const result = parseDocument(text);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].line).toBeGreaterThanOrEqual(0);
        expect(result.errors[0].message).toBeTruthy();
    });

    it('should produce zero diagnostics for valid input', async () => {
        const { parseDocument } = await import('../../server/src/parser/parseDocument.js');

        const text = `
package ValidModel {
    part def Sensor {
        attribute reading : Real;
    }
}
`;
        const result = parseDocument(text);
        expect(result.errors.length).toBe(0);
    });
});

/** Create a TextDocument from raw SysML text */
async function makeDoc(text: string, uri = 'test://test.sysml') {
    const mod = await import('../../server/node_modules/vscode-languageserver-textdocument/lib/esm/main.js');
    return mod.TextDocument.create(uri, 'sysml', 1, text);
}

// Helper to get semantic diagnostics for a given SysML text
async function getSemanticDiagnostics(text: string) {
    const { DocumentManager } = await import('../../server/src/documentManager.js');
    const { SemanticValidator } = await import('../../server/src/providers/semanticValidator.js');

    const docManager = new DocumentManager();
    const uri = 'file:///test.sysml';
    const doc = await makeDoc(text, uri);
    docManager.parse(doc);

    const validator = new SemanticValidator(docManager);
    return validator.validate(uri);
}

describe('Semantic Validation', () => {
    describe('unresolved type references', () => {
        it('should flag a type that does not exist in the document', async () => {
            const text = `
package Test {
    part def Vehicle {
        part engine : Engine[1];
    }
}
`;
            const diags = await getSemanticDiagnostics(text);
            const unresolvedDiags = diags.filter(d => d.code === 'unresolved-type');
            expect(unresolvedDiags.length).toBe(1);
            expect(unresolvedDiags[0].message).toContain("'Engine'");
        });

        it('should not flag types that are defined in the document', async () => {
            const text = `
package Test {
    part def Engine {
        attribute power : Real;
    }
    part def Vehicle {
        part engine : Engine[1];
    }
}
`;
            const diags = await getSemanticDiagnostics(text);
            const unresolvedDiags = diags.filter(d => d.code === 'unresolved-type');
            expect(unresolvedDiags.length).toBe(0);
        });

        it('should not flag standard library types (Real, String, Boolean, Integer)', async () => {
            const text = `
package Test {
    part def Sensor {
        attribute value : Real[1];
        attribute name : String[1];
        attribute active : Boolean[1];
        attribute count : Integer[1];
    }
}
`;
            const diags = await getSemanticDiagnostics(text);
            const unresolvedDiags = diags.filter(d => d.code === 'unresolved-type');
            expect(unresolvedDiags.length).toBe(0);
        });

        it('should not flag ISQ quantity value types (LengthValue, MassValue, TorqueValue, etc.)', async () => {
            const text = `
package Test {
    part def Wheel {
        attribute diameter : LengthValue;
    }
    interface def WheelInterface {
        attribute maxTorque : TorqueValue;
    }
    part def FuelTank {
        attribute mass : MassValue;
    }
}
`;
            const diags = await getSemanticDiagnostics(text);
            const unresolvedDiags = diags.filter(d => d.code === 'unresolved-type');
            // LengthValue, TorqueValue, MassValue are all recognized ISQ types
            expect(unresolvedDiags.length).toBe(0);
        });

        it('should recognize alias as a valid type definition', async () => {
            const text = `
package Test {
    public import ISQ::*;
    alias Torque for ISQ::TorqueValue;
    
    part def Engine {
        attribute maxTorque : Torque;
    }
}
`;
            const diags = await getSemanticDiagnostics(text);
            const unresolvedDiags = diags.filter(d => d.code === 'unresolved-type');
            // Torque should be resolved via the alias
            const torqueDiag = unresolvedDiags.find(d => d.message.includes("'Torque'"));
            expect(torqueDiag).toBeUndefined();
        });
    });

    describe('invalid multiplicity bounds', () => {
        it('should flag when lower bound exceeds upper bound', async () => {
            const text = `
package Test {
    part def Vehicle {
        part wheels : Wheel[5..2];
    }
    part def Wheel;
}
`;
            const diags = await getSemanticDiagnostics(text);
            const multDiags = diags.filter(d => d.code === 'invalid-multiplicity');
            expect(multDiags.length).toBe(1);
            expect(multDiags[0].message).toContain('lower bound');
            expect(multDiags[0].message).toContain('exceeds upper bound');
        });
    });

    describe('interface end port syntax (issue #15)', () => {
        it('should produce zero errors for "end port portName" in interface def', async () => {
            const text = `
port def PowerPort;
interface def MyIntf1 {
    end port port1 : PowerPort;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should produce zero errors for "end portName" shorthand in interface def', async () => {
            const text = `
port def SignalPort;
interface def MyIntf2 {
    end port2 : SignalPort;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should produce zero errors when both forms are used together', async () => {
            const text = `
port def PowerPort;
port def SignalPort;
interface def MyIntf3 {
    end port port1 : PowerPort;
    end port2 : SignalPort;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });
    });

    describe('end keyword patterns in definition bodies', () => {
        it('should parse "end occurrence" in flow def', async () => {
            const text = `
flow def DataFlow {
    end occurrence source : Anything;
    end occurrence target : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should parse "end item" in connection def', async () => {
            const text = `
connection def ItemLink {
    end item a : Anything;
    end item b : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should parse "end part" in connection def', async () => {
            const text = `
connection def PartLink {
    end part left : Anything;
    end part right : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should parse "end occurrence" in connection def', async () => {
            const text = `
connection def OccLink {
    end occurrence a : Anything;
    end occurrence b : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should parse "end part" in allocation def', async () => {
            const text = `
allocation def HwAlloc {
    end part source : Anything;
    end part target : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });

        it('should still parse plain "end name" without keyword', async () => {
            const text = `
connection def SimpleLink {
    end source : Anything;
    end target : Anything;
}
`;
            const result = (await import('../../server/src/parser/parseDocument.js')).parseDocument(text);
            expect(result.errors.length).toBe(0);
        });
    });

    describe('empty enumerations', () => {
        it('should flag enum definitions with no values', async () => {
            const text = `
package Test {
    enum def Color;
}
`;
            const diags = await getSemanticDiagnostics(text);
            const enumDiags = diags.filter(d => d.code === 'empty-enum');
            expect(enumDiags.length).toBe(1);
            expect(enumDiags[0].message).toContain("'Color'");
        });
    });
});
