import { describe, expect, it } from 'vitest';
import { enumerate } from '../src/enumerable';

describe('enumerate tests', () => {
    it('should return empty array for null', () => {
        expect(enumerate(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
        expect(enumerate(undefined)).toEqual([]);
    });

    it('should return array as-is', () => {
        const arr = [1, 2, 3];
        expect(enumerate(arr)).toBe(arr);
        expect(enumerate(arr)).toEqual([1, 2, 3]);
    });

    it('should wrap scalar values in an array', () => {
        expect(enumerate(42)).toEqual([42]);
        expect(enumerate('hello')).toEqual(['hello']);
        expect(enumerate(true)).toEqual([true]);
        expect(enumerate(false)).toEqual([false]);
    });

    it('should handle empty arrays', () => {
        const arr: number[] = [];
        expect(enumerate(arr)).toBe(arr);
        expect(enumerate(arr)).toEqual([]);
    });

    it('should handle objects', () => {
        const obj = { a: 1 };
        expect(enumerate(obj)).toEqual([obj]);
    });

    it('should handle nested arrays', () => {
        const arr = [
            [1, 2],
            [3, 4],
        ];
        expect(enumerate(arr)).toBe(arr);
        expect(enumerate(arr)).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it('should handle functions', () => {
        const fn = () => 42;
        expect(enumerate(fn)).toEqual([fn]);
    });

    it('should handle zero', () => {
        expect(enumerate(0)).toEqual([0]);
    });

    it('should handle empty string', () => {
        expect(enumerate('')).toEqual(['']);
    });
});
