import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["client/src/**/*.ts", "server/src/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-explicit-any": "off",
            "no-case-declarations": "off",
        },
    },
    {
        ignores: [
            "dist/**",
            "out/**",
            "server/out/**",
            "client/out/**",
            "server/src/generated/**",
            "server/src/parser/benchmark-warmup.ts",
            "**/*.js",
            "**/*.mjs",
            "**/*.cjs",
        ],
    }
);
