import { describe, expect, it } from 'vitest';
import { InvalidSchemaError, SchemaAccessor } from '../src/accessor';
import { schema } from './schema/schema';

describe('SchemaAccessor tests', () => {
    const accessor = new SchemaAccessor(schema);

    it('proxies schema properties through', () => {
        expect(accessor.provider).toEqual({ type: 'sqlite' });
        expect(accessor.models).toBe(schema.models);
        expect(accessor.authType).toBe('User');
    });

    it('returns providerType', () => {
        expect(accessor.providerType).toBe('sqlite');
    });

    it('getModel returns model if found', () => {
        expect(accessor.getModel('User')).toBe(schema.models.User);
        expect(accessor.getModel('Post')).toBe(schema.models.Post);
    });

    it('getModel returns undefined for unknown model', () => {
        expect(accessor.getModel('Unknown')).toBeUndefined();
    });

    it('requireModel returns model if found', () => {
        expect(accessor.requireModel('User')).toBe(schema.models.User);
    });

    it('requireModel throws for unknown model', () => {
        expect(() => accessor.requireModel('Unknown')).toThrow(InvalidSchemaError);
        expect(() => accessor.requireModel('Unknown')).toThrow('Model "Unknown" not found in schema');
    });

    it('getEnum returns enum if found', () => {
        expect(accessor.getEnum('Role')).toBe(schema.enums.Role);
    });

    it('getEnum returns undefined for unknown enum', () => {
        expect(accessor.getEnum('Unknown')).toBeUndefined();
    });

    it('requireEnum returns enum if found', () => {
        const enumDef = accessor.requireEnum('Role');
        expect(enumDef.name).toBe('Role');
        expect(enumDef.values).toEqual({ ADMIN: 'ADMIN', USER: 'USER' });
    });

    it('requireEnum throws for unknown enum', () => {
        expect(() => accessor.requireEnum('Unknown')).toThrow(InvalidSchemaError);
        expect(() => accessor.requireEnum('Unknown')).toThrow('Enum "Unknown" not found in schema');
    });

    it('getTypeDef returns typeDef if found', () => {
        expect(accessor.getTypeDef('Address')).toBe(schema.typeDefs.Address);
    });

    it('getTypeDef returns undefined for unknown typeDef', () => {
        expect(accessor.getTypeDef('Unknown')).toBeUndefined();
    });

    it('requireTypeDef returns typeDef if found', () => {
        const typeDef = accessor.requireTypeDef('Address');
        expect(typeDef.name).toBe('Address');
        expect(typeDef.fields.street).toMatchObject({ name: 'street', type: 'String' });
        expect(typeDef.fields.city).toMatchObject({ name: 'city', type: 'String' });
        expect(typeDef.fields.zip).toMatchObject({ name: 'zip', type: 'String', optional: true });
    });

    it('requireTypeDef throws for unknown typeDef', () => {
        expect(() => accessor.requireTypeDef('Unknown')).toThrow(InvalidSchemaError);
        expect(() => accessor.requireTypeDef('Unknown')).toThrow('TypeDef "Unknown" not found in schema');
    });

    it('getProcedure returns procedure if found', () => {
        expect(accessor.getProcedure('getUserPosts')).toBe(schema.procedures.getUserPosts);
    });

    it('getProcedure returns undefined for unknown procedure', () => {
        expect(accessor.getProcedure('unknown')).toBeUndefined();
    });

    it('requireProcedure returns procedure if found', () => {
        const proc = accessor.requireProcedure('getUserPosts');
        expect(proc.returnType).toBe('Post');
        expect(proc.returnArray).toBe(true);
        expect(proc.params.userId).toMatchObject({ name: 'userId', type: 'String' });
    });

    it('requireProcedure throws for unknown procedure', () => {
        expect(() => accessor.requireProcedure('unknown')).toThrow(InvalidSchemaError);
        expect(() => accessor.requireProcedure('unknown')).toThrow('Procedure "unknown" not found in schema');
    });

    it('getUniqueFields returns singular unique fields for User', () => {
        const fields = accessor.getUniqueFields('User');
        const names = fields.map((f) => f.name);
        expect(names).toContain('id');
        expect(names).toContain('email');
        // each entry should be a singular field with a `def`
        for (const f of fields) {
            expect('def' in f).toBe(true);
        }
    });

    it('getUniqueFields returns singular unique field for Post', () => {
        const fields = accessor.getUniqueFields('Post');
        expect(fields).toHaveLength(1);
        expect(fields[0]!.name).toBe('id');
        expect('def' in fields[0]!).toBe(true);
    });

    it('getUniqueFields throws for unknown model', () => {
        expect(() => accessor.getUniqueFields('Unknown')).toThrow(InvalidSchemaError);
    });
});
