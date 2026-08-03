import { describe, expect, it } from 'vitest';
import { zip } from '../src/zip';

describe('zip tests', () => {
    it('should zip two arrays of equal length', () => {
        const arr1 = [1, 2, 3];
        const arr2 = ['a', 'b', 'c'];
        expect(zip(arr1, arr2)).toEqual([
            [1, 'a'],
            [2, 'b'],
            [3, 'c'],
        ]);
    });

    it('should zip arrays when first is shorter', () => {
        const arr1 = [1, 2];
        const arr2 = ['a', 'b', 'c'];
        expect(zip(arr1, arr2)).toEqual([
            [1, 'a'],
            [2, 'b'],
        ]);
    });

    it('should zip arrays when second is shorter', () => {
        const arr1 = [1, 2, 3];
        const arr2 = ['a', 'b'];
        expect(zip(arr1, arr2)).toEqual([
            [1, 'a'],
            [2, 'b'],
        ]);
    });

    it('should handle empty arrays', () => {
        expect(zip([], [])).toEqual([]);
        expect(zip([1, 2, 3], [])).toEqual([]);
        expect(zip([], ['a', 'b', 'c'])).toEqual([]);
    });

    it('should handle single element arrays', () => {
        expect(zip([1], ['a'])).toEqual([[1, 'a']]);
    });

    it('should handle different types', () => {
        const arr1 = [1, 2, 3];
        const arr2 = [true, false, true];
        expect(zip(arr1, arr2)).toEqual([
            [1, true],
            [2, false],
            [3, true],
        ]);
    });

    it('should handle objects in arrays', () => {
        const arr1 = [{ id: 1 }, { id: 2 }];
        const arr2 = [{ name: 'a' }, { name: 'b' }];
        expect(zip(arr1, arr2)).toEqual([
            [{ id: 1 }, { name: 'a' }],
            [{ id: 2 }, { name: 'b' }],
        ]);
    });

    it('should handle nested arrays', () => {
        const arr1 = [
            [1, 2],
            [3, 4],
        ];
        const arr2 = [
            ['a', 'b'],
            ['c', 'd'],
        ];
        expect(zip(arr1, arr2)).toEqual([
            [
                [1, 2],
                ['a', 'b'],
            ],
            [
                [3, 4],
                ['c', 'd'],
            ],
        ]);
    });

    it('should preserve null and undefined values', () => {
        const arr1 = [1, null, undefined];
        const arr2 = ['a', 'b', 'c'];
        expect(zip(arr1, arr2)).toEqual([
            [1, 'a'],
            [null, 'b'],
            [undefined, 'c'],
        ]);
    });

    it('should work with readonly arrays', () => {
        const arr1: readonly number[] = [1, 2, 3];
        const arr2: readonly string[] = ['a', 'b', 'c'];
        expect(zip(arr1, arr2)).toEqual([
            [1, 'a'],
            [2, 'b'],
            [3, 'c'],
        ]);
    });

    it('should handle very different length arrays', () => {
        const arr1 = [1];
        const arr2 = ['a', 'b', 'c', 'd', 'e'];
        expect(zip(arr1, arr2)).toEqual([[1, 'a']]);
    });
});
