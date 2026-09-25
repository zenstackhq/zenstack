import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Custom type primitive tests', () => {
    it('supports custom type primitives', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id   Int   @id
                    name UserName
                }

                type UserName with String {
                    this String
                }
            `);
    });

    it('supports custom type primitives in validation', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id   Int   @id
                    age  Age

                    @@validate(age >= 18)
                }

                type Age with Int {
                    this Int
                }
            `);
    });

    it('supports custom type primitives with default values', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id   String @id
                    name UserName @default('')
                }

                type UserName with String {
                    this String
                }
            `);
    });

    it('detects duplicate attributes', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String   @id
                    name  UserName @onlyOnce
                }

                type UserName with String {
                    this String @onlyOnce
                }

                attribute @onlyOnce() @@@targetField([StringField]) @@@once @@@validation
            `,
            'can only be applied once',
        );

        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    name  UserName
                    name2 UserName
                }

                type UserName with String {
                    this String @onlyOnce
                }

                attribute @onlyOnce() @@@targetField([StringField]) @@@onceInModel @@@validation
            `,
            'can only be applied to one field per model',
        );
    });

    it('resolves `this` to the base type', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String

                    @@validate(isEmail(this))
                }
            `);
    });

    it('rejects invalid attributes', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String @db.Text
                }
            `,
            'attribute "@db.Text" cannot be used with primitive type defs',
        );

        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email  @gt(5)
                }

                type Email with String {
                    this String
                }
            `,
            'cannot be used on this type of field',
        );
    });

    it('accepts attributes on the field declaration', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email @length(1, 2) @db.Text
                }

                type Email with String {
                    this String
                }
            `);
    });

    it('accepts attributes on the `this` declaration', async () => {
        await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String @email
                }
            `);
    });

    it('rejects when there is more than 1 field', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String
                    this2 String
                }
            `,
            'primitive type def must only declare 1 field',
        );
    });

    it('rejects when there is no "this" field', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this2 String
                }
            `,
            'primitive type def is missing "this" field',
        );
    });

    it('rejects when "this" field does not match declared type', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this Int
                }
            `,
            'primitive type def\'s "this" field must match the declared type',
        );
    });

    it('rejects when "this" field is not scalar', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String[]
                }
            `,
            'primitive type def\'s "this" field must be scalar',
        );
    });

    it('rejects when "this" field is optional', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String?
                }
            `,
            'primitive type def\'s "this" field must not be optional',
        );
    });

    it('rejects when trying to use mixins', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String, Mixin {
                    this String
                }

                type Mixin {
                }
            `,
            'primitive type def cannot use mixins',
        );
    });

    it('rejects when used as a mixin', async () => {
        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User with Email {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String
                }
            `,
            'cannot use primitive type def "Email" as a mixin',
        );

        await loadSchemaWithError(
            `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id    String @id
                    email Email
                }

                type Email with String {
                    this String
                }

                type Mixin with Email {
                }
            `,
            'cannot use primitive type def "Email" as a mixin',
        );
    });
});
