import { describe, expect, it } from 'vitest';
import * as constants from '../src/constants';
import * as orm from '../src/index';

describe('constants entry', () => {
    it('exports the operation lists of the main entry', () => {
        expect(Object.keys(constants).sort()).toEqual([
            'AllCrudOperations',
            'AllReadOperations',
            'AllWriteOperations',
            'CoreCreateOperations',
            'CoreCrudOperations',
            'CoreDeleteOperations',
            'CoreReadOperations',
            'CoreUpdateOperations',
            'CoreWriteOperations',
        ]);
        for (const [name, value] of Object.entries(constants)) {
            expect(orm[name as keyof typeof orm]).toBe(value);
        }
    });
});
