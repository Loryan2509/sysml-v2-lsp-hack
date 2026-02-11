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
