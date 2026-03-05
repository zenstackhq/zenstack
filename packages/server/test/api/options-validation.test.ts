import { ClientContract } from '@zenstackhq/orm';
import { SchemaDef } from '@zenstackhq/orm/schema';
import { createTestClient } from '@zenstackhq/testtools';
import { beforeEach, describe, expect, it } from 'vitest';
import { RestApiHandler } from '../../src/api/rest';
import { RPCApiHandler } from '../../src/api/rpc';

describe('API Handler Options Validation', () => {
    let client: ClientContract<SchemaDef>;

    const testSchema = `
        model User {
            id String @id @default(cuid())
            email String @unique
            name String
        }
    `;

    beforeEach(async () => {
        client = await createTestClient(testSchema);
    });

    describe('RestApiHandler Options Validation', () => {
        it('should accept valid options', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                });
            }).not.toThrow();
        });

        it('should accept valid options with all optional fields', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    log: ['debug', 'info', 'warn', 'error'],
                    pageSize: 50,
                    idDivider: '-',
                    urlSegmentCharset: 'a-zA-Z0-9-_~',
                    modelNameMapping: { User: 'users' },
                });
            }).not.toThrow();
        });

        it('should accept custom log function', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    log: (level: string, message: string) => {
                        console.log(`[${level}] ${message}`);
                    },
                });
            }).not.toThrow();
        });

        it('should throw error when schema is missing', () => {
            expect(() => {
                new RestApiHandler({
                    endpoint: 'http://localhost/api',
                } as any);
            }).toThrow('Invalid options');
        });

        it('should throw error when endpoint is missing', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                } as any);
            }).toThrow('Invalid options');
        });

        it('should throw error when endpoint is empty string', () => {
            // Note: Zod z.string() validation allows empty strings
            // The endpoint validation doesn't enforce non-empty string
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: '',
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when endpoint is not a string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 123,
                } as any);
            }).toThrow('Invalid options');
        });

        it('should throw error when pageSize is not a number', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when pageSize is zero', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: 0,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when pageSize is negative', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: -10,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when idDivider is empty string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    idDivider: '',
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when idDivider is not a string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    idDivider: 123 as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when urlSegmentCharset is empty string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    urlSegmentCharset: '',
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when urlSegmentCharset is not a string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    urlSegmentCharset: [] as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when modelNameMapping is not an object', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    modelNameMapping: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when modelNameMapping values are not strings', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    modelNameMapping: { User: 123 } as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when externalIdMapping is not an object', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    externalIdMapping: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when externalIdMapping values are not strings', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    externalIdMapping: { User: 123 } as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when nestedRoutes is not an object', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    nestedRoutes: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when nestedRoutes relation is not a string', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    nestedRoutes: {
                        User: {
                            User: {
                                relation: 123,
                            },
                        },
                    } as any,
                });
            }).toThrow('Invalid options');
        });

        describe('nestedRoutes semantic validation', () => {
            let relClient: ClientContract<SchemaDef>;

            const relSchema = `
                model User {
                    id String @id @default(cuid())
                    email String @unique
                    posts Post[]
                }
                model Post {
                    id Int @id @default(autoincrement())
                    title String
                    author User @relation(fields: [authorId], references: [id])
                    authorId String
                }
            `;

            beforeEach(async () => {
                relClient = await createTestClient(relSchema);
            });

            it('should throw when parent model does not exist in schema', () => {
                expect(() => {
                    new RestApiHandler({
                        schema: relClient.$schema,
                        endpoint: 'http://localhost/api',
                        nestedRoutes: {
                            NonExistent: { Post: { relation: 'author' } },
                        },
                    });
                }).toThrow('Invalid nestedRoutes');
            });

            it('should throw when child model does not exist in schema', () => {
                expect(() => {
                    new RestApiHandler({
                        schema: relClient.$schema,
                        endpoint: 'http://localhost/api',
                        nestedRoutes: {
                            User: { NonExistent: { relation: 'author' } },
                        },
                    });
                }).toThrow('Invalid nestedRoutes');
            });

            it('should throw when relation does not exist on child model', () => {
                expect(() => {
                    new RestApiHandler({
                        schema: relClient.$schema,
                        endpoint: 'http://localhost/api',
                        nestedRoutes: {
                            User: { Post: { relation: 'nonExistentRelation' } },
                        },
                    });
                }).toThrow('Invalid nestedRoutes');
            });

            it('should throw when relation does not point to the parent model', () => {
                // Post.author points to User, so using it from User→Post is correct.
                // But if we pretend Post is the parent and User the child, we'd need
                // a relation on User that points to Post — which doesn't exist.
                expect(() => {
                    new RestApiHandler({
                        schema: relClient.$schema,
                        endpoint: 'http://localhost/api',
                        nestedRoutes: {
                            // author on Post points to User, not Post itself
                            Post: { Post: { relation: 'author' } },
                        },
                    });
                }).toThrow('Invalid nestedRoutes');
            });

            it('should accept valid nestedRoutes configuration', () => {
                expect(() => {
                    new RestApiHandler({
                        schema: relClient.$schema,
                        endpoint: 'http://localhost/api',
                        nestedRoutes: {
                            User: { Post: { relation: 'author' } },
                        },
                    });
                }).not.toThrow();
            });

            describe('requireOrphanProtection', () => {
                it('should throw when requireOrphanProtection is true and onDelete is not set', () => {
                    // relSchema has no onDelete on Post.author
                    expect(() => {
                        new RestApiHandler({
                            schema: relClient.$schema,
                            endpoint: 'http://localhost/api',
                            nestedRoutes: {
                                User: { Post: { relation: 'author', requireOrphanProtection: true } },
                            },
                        });
                    }).toThrow('requireOrphanProtection');
                });

                it('should throw when requireOrphanProtection is true and onDelete is SetNull', async () => {
                    const c = await createTestClient(`
                        model User {
                            id String @id @default(cuid())
                            posts Post[]
                        }
                        model Post {
                            id Int @id @default(autoincrement())
                            title String
                            author User? @relation(fields: [authorId], references: [id], onDelete: SetNull)
                            authorId String?
                        }
                    `);
                    expect(() => {
                        new RestApiHandler({
                            schema: c.$schema,
                            endpoint: 'http://localhost/api',
                            nestedRoutes: {
                                User: { Post: { relation: 'author', requireOrphanProtection: true } },
                            },
                        });
                    }).toThrow('requireOrphanProtection');
                });

                it('should accept when requireOrphanProtection is true and onDelete is Cascade', async () => {
                    const c = await createTestClient(`
                        model User {
                            id String @id @default(cuid())
                            posts Post[]
                        }
                        model Post {
                            id Int @id @default(autoincrement())
                            title String
                            author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
                            authorId String
                        }
                    `);
                    expect(() => {
                        new RestApiHandler({
                            schema: c.$schema,
                            endpoint: 'http://localhost/api',
                            nestedRoutes: {
                                User: { Post: { relation: 'author', requireOrphanProtection: true } },
                            },
                        });
                    }).not.toThrow();
                });

                it('should accept when requireOrphanProtection is true and onDelete is Restrict', async () => {
                    const c = await createTestClient(`
                        model User {
                            id String @id @default(cuid())
                            posts Post[]
                        }
                        model Post {
                            id Int @id @default(autoincrement())
                            title String
                            author User @relation(fields: [authorId], references: [id], onDelete: Restrict)
                            authorId String
                        }
                    `);
                    expect(() => {
                        new RestApiHandler({
                            schema: c.$schema,
                            endpoint: 'http://localhost/api',
                            nestedRoutes: {
                                User: { Post: { relation: 'author', requireOrphanProtection: true } },
                            },
                        });
                    }).not.toThrow();
                });

                it('should not check orphan protection when requireOrphanProtection is not set', () => {
                    // relSchema has no onDelete — still fine without the flag
                    expect(() => {
                        new RestApiHandler({
                            schema: relClient.$schema,
                            endpoint: 'http://localhost/api',
                            nestedRoutes: {
                                User: { Post: { relation: 'author' } },
                            },
                        });
                    }).not.toThrow();
                });
            });
        });

        it('should throw error when log is invalid type', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    log: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when log array contains invalid values', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    log: ['debug', 'invalid'] as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when schema is not an object', () => {
            expect(() => {
                new RestApiHandler({
                    schema: 'invalid' as any,
                    endpoint: 'http://localhost/api',
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when schema is null', () => {
            expect(() => {
                new RestApiHandler({
                    schema: null as any,
                    endpoint: 'http://localhost/api',
                });
            }).toThrow('Invalid options');
        });

        it('should accept valid pageSize of 1', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: 1,
                });
            }).not.toThrow();
        });

        it('should accept large pageSize', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: 10000,
                });
            }).not.toThrow();
        });

        it('should accept Infinity as pageSize to disable pagination', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: Infinity,
                });
            }).not.toThrow();
        });

        it('should throw error when pageSize is a decimal', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: 10.5,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when pageSize is NaN', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: NaN,
                });
            }).toThrow('Invalid options');
        });

        it('should accept single character idDivider', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    idDivider: '|',
                });
            }).not.toThrow();
        });

        it('should accept multi-character idDivider', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    idDivider: '---',
                });
            }).not.toThrow();
        });
    });

    describe('RPCApiHandler Options Validation', () => {
        it('should accept valid options', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                });
            }).not.toThrow();
        });

        it('should accept valid options with log array', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: ['debug', 'info', 'warn', 'error'],
                });
            }).not.toThrow();
        });

        it('should accept valid options with log function', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: (level: string, message: string) => {
                        console.log(`[${level}] ${message}`);
                    },
                });
            }).not.toThrow();
        });

        it('should throw error when schema is missing', () => {
            expect(() => {
                new RPCApiHandler({} as any);
            }).toThrow('Invalid options');
        });

        it('should throw error when schema is not an object', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when schema is null', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: null as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when schema is undefined', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: undefined as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when log is invalid type', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: 'invalid' as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when log array contains invalid values', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: ['debug', 'invalid'] as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when log is a number', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: 123 as any,
                });
            }).toThrow('Invalid options');
        });

        it('should throw error when log is an object', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: {} as any,
                });
            }).toThrow('Invalid options');
        });

        it('should accept empty log array', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: [],
                });
            }).not.toThrow();
        });

        it('should accept single log level', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: ['error'],
                });
            }).not.toThrow();
        });

        it('should throw error with extra unknown options', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    unknownOption: 'value',
                } as any);
            }).toThrow('Invalid options'); // z.strictObject() rejects extra properties
        });
    });

    describe('strictObject validation - extra properties', () => {
        it('RestApiHandler should reject extra unknown properties', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    extraProperty: 'should-fail',
                } as any);
            }).toThrow('Invalid options');
        });

        it('RPCApiHandler should reject extra unknown properties', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    extraProperty: 'should-fail',
                } as any);
            }).toThrow('Invalid options');
        });

        it('RestApiHandler should reject multiple extra unknown properties', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    extra1: 'value1',
                    extra2: 'value2',
                } as any);
            }).toThrow('Invalid options');
        });

        it('RPCApiHandler should reject multiple extra unknown properties', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    extra1: 'value1',
                    extra2: 'value2',
                } as any);
            }).toThrow('Invalid options');
        });
    });

    describe('Edge Cases and Type Safety', () => {
        it('RestApiHandler should handle undefined optional fields gracefully', () => {
            const handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                log: undefined,
                pageSize: undefined,
                idDivider: undefined,
            });
            expect(handler).toBeDefined();
        });

        it('RPCApiHandler should handle undefined optional fields gracefully', () => {
            const handler = new RPCApiHandler({
                schema: client.$schema,
                log: undefined,
            });
            expect(handler).toBeDefined();
        });

        it('RestApiHandler should expose schema property', () => {
            const handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            expect(handler.schema).toBe(client.$schema);
        });

        it('RPCApiHandler should expose schema property', () => {
            const handler = new RPCApiHandler({
                schema: client.$schema,
            });
            expect(handler.schema).toBe(client.$schema);
        });

        it('RestApiHandler should expose log property', () => {
            const logConfig = ['debug', 'error'] as const;
            const handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                log: logConfig,
            });
            expect(handler.log).toBe(logConfig);
        });

        it('RPCApiHandler should expose log property', () => {
            const logConfig = ['debug', 'error'] as const;
            const handler = new RPCApiHandler({
                schema: client.$schema,
                log: logConfig,
            });
            expect(handler.log).toBe(logConfig);
        });

        it('RestApiHandler should handle empty modelNameMapping', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    modelNameMapping: {},
                });
            }).not.toThrow();
        });

        it('RestApiHandler should handle empty externalIdMapping', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    externalIdMapping: {},
                });
            }).not.toThrow();
        });
    });

    describe('Real-world Scenarios', () => {
        it('RestApiHandler with production-like configuration', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'https://api.example.com/v1',
                    log: (level, message) => {
                        if (level === 'error') {
                            console.error(message);
                        }
                    },
                    pageSize: 100,
                    idDivider: '_',
                    modelNameMapping: {
                        User: 'users',
                    },
                });
            }).not.toThrow();
        });

        it('RPCApiHandler with production-like configuration', () => {
            expect(() => {
                new RPCApiHandler({
                    schema: client.$schema,
                    log: (level, message) => {
                        if (level === 'error') {
                            console.error(message);
                        }
                    },
                });
            }).not.toThrow();
        });

        it('RestApiHandler with disabled pagination (Infinity pageSize)', () => {
            expect(() => {
                new RestApiHandler({
                    schema: client.$schema,
                    endpoint: 'http://localhost/api',
                    pageSize: Infinity,
                });
            }).not.toThrow();
        });
    });

    describe('Schema validation', () => {
        it('RestApiHandler should validate schema structure', () => {
            const validSchema = client.$schema;
            expect(() => {
                new RestApiHandler({
                    schema: validSchema,
                    endpoint: 'http://localhost/api',
                });
            }).not.toThrow();
        });

        it('RPCApiHandler should validate schema structure', () => {
            const validSchema = client.$schema;
            expect(() => {
                new RPCApiHandler({
                    schema: validSchema,
                });
            }).not.toThrow();
        });

        it('RestApiHandler should handle empty schema object but will error when building type map', () => {
            // Empty schema passes Zod validation (z.object()) but fails when building type map
            expect(() => {
                new RestApiHandler({
                    schema: {} as any,
                    endpoint: 'http://localhost/api',
                });
            }).toThrow(); // Throws when trying to build type map from empty schema
        });
    });
});
