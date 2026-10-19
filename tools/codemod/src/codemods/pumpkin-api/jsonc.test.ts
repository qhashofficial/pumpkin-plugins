import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { mergeJsonStringArray } from './jsonc.js';

describe('mergeJsonStringArray', () => {
    it('deduplicates and appends entries without dropping JSONC comments or layout', () => {
        const source = `{
    "pumpkinPlugin": {
        "wasi": [
            // Keep the original capability note.
            "http",
            // Keep this note after deduplicating the grant.
            "http",
            "sockets",
        ]
    }
}`;

        const updated = mergeJsonStringArray(source, ['pumpkinPlugin', 'wasi'], ['filesystem', 'http'], source);

        expect(parse(updated).pumpkinPlugin.wasi).toEqual(['http', 'sockets', 'filesystem']);
        expect(updated).toContain('            // Keep the original capability note.');
        expect(updated).toContain('            // Keep this note after deduplicating the grant.');
        expect(updated).toContain('            "sockets",\n            "filesystem",\n');
    });
});
