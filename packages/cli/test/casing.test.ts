import { describe, expect, it } from 'vitest';
import { resolveNameCasing, toPascalCase, toCamelCase, toSnakeCase } from '../src/actions/pull/casing';

describe('toPascalCase', () => {
    it('converts snake_case', () => {
        expect(toPascalCase('user_status')).toBe('UserStatus');
        expect(toPascalCase('first_name')).toBe('FirstName');
    });

    it('converts kebab-case', () => {
        expect(toPascalCase('user-status')).toBe('UserStatus');
    });

    it('capitalizes first char of lowercase', () => {
        expect(toPascalCase('user')).toBe('User');
    });

    it('preserves already PascalCase', () => {
        expect(toPascalCase('UserStatus')).toBe('UserStatus');
    });

    it('preserves all-uppercase strings', () => {
        expect(toPascalCase('ACTIVE')).toBe('ACTIVE');
        expect(toPascalCase('USER')).toBe('USER');
        expect(toPascalCase('MODERATOR')).toBe('MODERATOR');
        expect(toPascalCase('SET_NULL')).toBe('SET_NULL');
        expect(toPascalCase('NO_ACTION')).toBe('NO_ACTION');
    });

    it('converts mixed snake_case with uppercase', () => {
        expect(toPascalCase('User_status')).toBe('UserStatus');
    });
});

describe('toCamelCase', () => {
    it('converts snake_case', () => {
        expect(toCamelCase('user_status')).toBe('userStatus');
        expect(toCamelCase('first_name')).toBe('firstName');
    });

    it('converts kebab-case', () => {
        expect(toCamelCase('user-status')).toBe('userStatus');
    });

    it('lowercases first char of PascalCase', () => {
        expect(toCamelCase('User')).toBe('user');
        expect(toCamelCase('Post')).toBe('post');
    });

    it('preserves already camelCase', () => {
        expect(toCamelCase('userStatus')).toBe('userStatus');
    });

    it('preserves all-uppercase strings', () => {
        expect(toCamelCase('ACTIVE')).toBe('ACTIVE');
        expect(toCamelCase('INACTIVE')).toBe('INACTIVE');
        expect(toCamelCase('SUSPENDED')).toBe('SUSPENDED');
        expect(toCamelCase('USER')).toBe('USER');
        expect(toCamelCase('SET_NULL')).toBe('SET_NULL');
        expect(toCamelCase('NO_ACTION')).toBe('NO_ACTION');
    });
});

describe('toSnakeCase', () => {
    it('converts camelCase', () => {
        expect(toSnakeCase('userStatus')).toBe('user_status');
        expect(toSnakeCase('firstName')).toBe('first_name');
    });

    it('converts PascalCase', () => {
        expect(toSnakeCase('UserStatus')).toBe('user_status');
    });

    it('converts kebab-case', () => {
        expect(toSnakeCase('user-status')).toBe('user_status');
    });

    it('preserves already snake_case', () => {
        expect(toSnakeCase('user_status')).toBe('user_status');
    });

    it('preserves all-uppercase strings', () => {
        expect(toSnakeCase('ACTIVE')).toBe('ACTIVE');
        expect(toSnakeCase('INACTIVE')).toBe('INACTIVE');
        expect(toSnakeCase('SUSPENDED')).toBe('SUSPENDED');
        expect(toSnakeCase('SET_NULL')).toBe('SET_NULL');
        expect(toSnakeCase('NO_ACTION')).toBe('NO_ACTION');
    });
});

describe('resolveNameCasing', () => {
    it('applies pascal casing', () => {
        expect(resolveNameCasing('pascal', 'user_status')).toEqual({ modified: true, name: 'UserStatus' });
        expect(resolveNameCasing('pascal', 'User')).toEqual({ modified: false, name: 'User' });
    });

    it('applies camel casing', () => {
        expect(resolveNameCasing('camel', 'User')).toEqual({ modified: true, name: 'user' });
        expect(resolveNameCasing('camel', 'first_name')).toEqual({ modified: true, name: 'firstName' });
    });

    it('applies snake casing', () => {
        expect(resolveNameCasing('snake', 'UserStatus')).toEqual({ modified: true, name: 'user_status' });
        expect(resolveNameCasing('snake', 'user_status')).toEqual({ modified: false, name: 'user_status' });
    });

    it('preserves name with none casing', () => {
        expect(resolveNameCasing('none', 'User_status')).toEqual({ modified: false, name: 'User_status' });
        expect(resolveNameCasing('none', 'ACTIVE')).toEqual({ modified: false, name: 'ACTIVE' });
    });

    it('preserves all-uppercase enum values across all casings', () => {
        expect(resolveNameCasing('pascal', 'ACTIVE')).toEqual({ modified: false, name: 'ACTIVE' });
        expect(resolveNameCasing('camel', 'ACTIVE')).toEqual({ modified: false, name: 'ACTIVE' });
        expect(resolveNameCasing('snake', 'ACTIVE')).toEqual({ modified: false, name: 'ACTIVE' });
        expect(resolveNameCasing('none', 'ACTIVE')).toEqual({ modified: false, name: 'ACTIVE' });
    });

    it('preserves all-uppercase enum values with underscores across all casings', () => {
        expect(resolveNameCasing('pascal', 'SET_NULL')).toEqual({ modified: false, name: 'SET_NULL' });
        expect(resolveNameCasing('camel', 'SET_NULL')).toEqual({ modified: false, name: 'SET_NULL' });
        expect(resolveNameCasing('snake', 'SET_NULL')).toEqual({ modified: false, name: 'SET_NULL' });
        expect(resolveNameCasing('none', 'SET_NULL')).toEqual({ modified: false, name: 'SET_NULL' });
    });

    it('prefixes names starting with a digit', () => {
        expect(resolveNameCasing('none', '1foo')).toEqual({ modified: true, name: '_1foo' });
        expect(resolveNameCasing('camel', '1foo')).toEqual({ modified: true, name: '_1foo' });
    });
});
