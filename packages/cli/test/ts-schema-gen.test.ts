import { ExpressionUtils } from '@zenstackhq/orm/schema';
import { createTestProject, generateTsSchema, generateTsSchemaInPlace } from '@zenstackhq/testtools';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TypeScript schema generation tests', () => {
    it('generates correct data models', async () => {
        const { schema } = await generateTsSchema(`
model User {
    id String @id @default(uuid())
    name String
    email String @unique
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    posts Post[]

    @@map('users')
}

model Post {
    id String @id @default(cuid())
    title String
    published Boolean @default(false)
    author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String
}
            `);

        expect(schema.provider).toMatchObject({
            type: 'sqlite',
        });

        expect(schema.models).toMatchObject({
            User: {
                fields: {
                    id: {
                        type: 'String',
                        id: true,
                        default: ExpressionUtils.call('uuid'),
                        attributes: [
                            { name: '@id' },
                            {
                                name: '@default',
                                args: [
                                    {
                                        value: {
                                            kind: 'call',
                                            function: 'uuid',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    name: { type: 'String' },
                    email: { type: 'String', unique: true },
                    createdAt: {
                        type: 'DateTime',
                        default: ExpressionUtils.call('now'),
                        attributes: [
                            {
                                name: '@default',
                                args: [
                                    {
                                        value: {
                                            kind: 'call',
                                            function: 'now',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    updatedAt: {
                        type: 'DateTime',
                        attributes: [
                            {
                                name: '@updatedAt',
                            },
                        ],
                        updatedAt: true,
                    },
                    posts: {
                        type: 'Post',
                        array: true,
                        relation: {
                            opposite: 'author',
                        },
                    },
                },
                attributes: [
                    {
                        name: '@@map',
                        args: [{ name: 'name', value: { kind: 'literal' } }],
                    },
                ],
                idFields: ['id'],
                uniqueFields: {
                    id: { type: 'String' },
                    email: { type: 'String' },
                },
            },
            Post: {
                fields: {
                    id: {
                        type: 'String',
                        id: true,
                        default: ExpressionUtils.call('cuid'),
                        attributes: [
                            { name: '@id' },
                            {
                                name: '@default',
                                args: [
                                    {
                                        value: {
                                            kind: 'call',
                                            function: 'cuid',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    title: { type: 'String' },
                    published: {
                        type: 'Boolean',
                        default: false,
                    },
                    authorId: { type: 'String' },
                    author: {
                        type: 'User',
                        relation: {
                            fields: ['authorId'],
                            references: ['id'],
                            onDelete: 'Cascade',
                            opposite: 'posts',
                        },
                        attributes: [
                            {
                                name: '@relation',
                                args: [
                                    {
                                        name: 'fields',
                                        value: {
                                            kind: 'array',
                                            items: [
                                                {
                                                    kind: 'field',
                                                    field: 'authorId',
                                                },
                                            ],
                                        },
                                    },
                                    {
                                        name: 'references',
                                        value: {
                                            kind: 'array',
                                            items: [
                                                {
                                                    kind: 'field',
                                                    field: 'id',
                                                },
                                            ],
                                        },
                                    },
                                    {
                                        name: 'onDelete',
                                        value: {
                                            kind: 'literal',
                                            value: 'Cascade',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
                idFields: ['id'],
                uniqueFields: {
                    id: { type: 'String' },
                },
            },
        });
    });

    it('generates correct procedures with array params and returns', async () => {
        const { schema } = await generateTsSchema(`
model User {
    id Int @id
}

procedure findByIds(ids: Int[]): User[]
procedure getIds(): Int[]
        `);

        expect(schema.procedures).toMatchObject({
            findByIds: {
                params: { ids: { name: 'ids', type: 'Int', array: true } },
                returnType: 'User',
                returnArray: true,
            },
            getIds: {
                params: {},
                returnType: 'Int',
                returnArray: true,
            },
        });
    });

    it('merges fields and attributes from mixins', async () => {
        const { schema } = await generateTsSchema(`
type Timestamped {
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}

type Named {
    name String
    @@unique([name])
}
    
model User with Timestamped Named {
    id String @id @default(uuid())
    email String @unique
}
        `);
        expect(schema).toMatchObject({
            models: {
                User: {
                    fields: {
                        id: { type: 'String' },
                        email: { type: 'String' },
                        createdAt: {
                            type: 'DateTime',
                            default: expect.objectContaining({ function: 'now', kind: 'call' }),
                        },
                        updatedAt: { type: 'DateTime', updatedAt: true },
                        name: { type: 'String' },
                    },
                    uniqueFields: expect.objectContaining({
                        name: { type: 'String' },
                    }),
                },
            },
        });
    });

    it('generates type definitions', async () => {
        const { schema } = await generateTsSchema(`
type Base {
    name String
    @@meta('foo', 'bar')
}

type Address with Base {
    street String
    city String
}
    `);
        expect(schema).toMatchObject({
            typeDefs: {
                Base: {
                    fields: {
                        name: { type: 'String' },
                    },
                    attributes: [
                        {
                            name: '@@meta',
                            args: [
                                { name: 'name', value: { kind: 'literal', value: 'foo' } },
                                { name: 'value', value: { kind: 'literal', value: 'bar' } },
                            ],
                        },
                    ],
                },
                Address: {
                    fields: {
                        street: { type: 'String' },
                        city: { type: 'String' },
                    },
                    attributes: [
                        {
                            name: '@@meta',
                            args: [
                                { name: 'name', value: { kind: 'literal', value: 'foo' } },
                                { name: 'value', value: { kind: 'literal', value: 'bar' } },
                            ],
                        },
                    ],
                },
            },
        });
    });

    it('merges fields and attributes from base models', async () => {
        const { schema } = await generateTsSchema(`
model Base {
    id String @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    type String
    @@delegate(type)
}

model User extends Base {
    email String @unique
}
        `);
        expect(schema).toMatchObject({
            models: {
                Base: {
                    fields: {
                        id: {
                            type: 'String',
                            id: true,
                            default: expect.objectContaining({ function: 'uuid', kind: 'call' }),
                        },
                        createdAt: {
                            type: 'DateTime',
                            default: expect.objectContaining({ function: 'now', kind: 'call' }),
                        },
                        updatedAt: { type: 'DateTime', updatedAt: true },
                        type: { type: 'String' },
                    },
                    attributes: [
                        {
                            name: '@@delegate',
                            args: [{ name: 'discriminator', value: { kind: 'field', field: 'type' } }],
                        },
                    ],
                    isDelegate: true,
                },
                User: {
                    baseModel: 'Base',
                    fields: {
                        id: { type: 'String' },
                        createdAt: {
                            type: 'DateTime',
                            default: expect.objectContaining({ function: 'now', kind: 'call' }),
                            originModel: 'Base',
                        },
                        updatedAt: { type: 'DateTime', updatedAt: true, originModel: 'Base' },
                        type: { type: 'String', originModel: 'Base' },
                        email: { type: 'String' },
                    },
                    uniqueFields: expect.objectContaining({
                        email: { type: 'String' },
                    }),
                },
            },
        });
    });

    it('merges all declarations from imported modules', async () => {
        const workDir = createTestProject();
        fs.writeFileSync(
            path.join(workDir, 'a.zmodel'),
            `
        enum Role {
          Admin
          User
        }
          `,
        );
        fs.writeFileSync(
            path.join(workDir, 'b.zmodel'),
            `
        import './a'

        datasource db {
            provider = 'sqlite'
            url = 'file:./test.db'
        }

        model User {
          id Int @id
          role Role
        }
        `,
        );

        const { schema } = await generateTsSchemaInPlace(path.join(workDir, 'b.zmodel'));
        expect(schema.enums).toMatchObject({ Role: expect.any(Object) });
        expect(schema.models).toMatchObject({ User: expect.any(Object) });
    });

    it('generates correct default literal function arguments', async () => {
        const { schema } = await generateTsSchema(`
model User {
    id String @id @default(uuid(7))
}
        `);

        expect(schema.models).toMatchObject({
            User: {
                name: 'User',
                fields: {
                    id: {
                        name: 'id',
                        type: 'String',
                        id: true,
                        attributes: [
                            {
                                name: '@id',
                            },
                            {
                                name: '@default',
                                args: [
                                    {
                                        name: 'value',
                                        value: {
                                            kind: 'call',
                                            function: 'uuid',
                                            args: [
                                                {
                                                    kind: 'literal',
                                                    value: 7,
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        ],
                        default: {
                            kind: 'call',
                            function: 'uuid',
                            args: [
                                {
                                    kind: 'literal',
                                    value: 7,
                                },
                            ],
                        },
                    },
                },
                idFields: ['id'],
                uniqueFields: {
                    id: {
                        type: 'String',
                    },
                },
            },
        });
    });

    it('supports lite schema generation', async () => {
        const { schemaLite } = await generateTsSchema(
            `
model User {
    id String @id @default(uuid())
    name String
    email String @unique

    @@map('users')
}
        `,
            undefined,
            undefined,
            undefined,
            true,
        );

        expect(schemaLite!.models.User.attributes).toBeUndefined();
        expect(schemaLite!.models.User.fields.id.attributes).toBeUndefined();
        expect(schemaLite!.models.User.fields.email.attributes).toBeUndefined();
    });

    it('supports ignorable fields for @updatedAt', async () => {
        const { schema } = await generateTsSchema(`
model User {
    id String @id @default(uuid())
    name String
    email String @unique
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt(ignore: [email])
    posts Post[]

    @@map('users')
}

model Post {
    id String @id @default(cuid())
    title String
    published Boolean @default(false)
    author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String
}
            `);

        expect(schema).toMatchObject({
            provider: {
                type: 'sqlite'
            },
            models: {
                User: {
                    name: 'User',
                    fields: {
                        id: {
                            name: 'id',
                            type: 'String',
                            id: true,
                            attributes: [
                                {
                                    name: '@id'
                                },
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'uuid'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'uuid'
                            }
                        },
                        name: {
                            name: 'name',
                            type: 'String'
                        },
                        email: {
                            name: 'email',
                            type: 'String',
                            unique: true,
                            attributes: [
                                {
                                    name: '@unique'
                                }
                            ]
                        },
                        createdAt: {
                            name: 'createdAt',
                            type: 'DateTime',
                            attributes: [
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'now'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'now'
                            }
                        },
                        updatedAt: {
                            name: 'updatedAt',
                            type: 'DateTime',
                            updatedAt: {
                                ignore: [
                                    'email'
                                ]
                            },
                            attributes: [
                                {
                                    name: '@updatedAt',
                                    args: [
                                        {
                                            name: 'ignore',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'email'
                                                    }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            ]
                        },
                        posts: {
                            name: 'posts',
                            type: 'Post',
                            array: true,
                            relation: {
                                opposite: 'author'
                            }
                        }
                    },
                    attributes: [
                        {
                            name: '@@map',
                            args: [
                                {
                                    name: 'name',
                                    value: {
                                        kind: 'literal',
                                        value: 'users'
                                    }
                                }
                            ]
                        }
                    ],
                    idFields: [
                        'id'
                    ],
                    uniqueFields: {
                        id: {
                            type: 'String'
                        },
                        email: {
                            type: 'String'
                        }
                    }
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: {
                            name: 'id',
                            type: 'String',
                            id: true,
                            attributes: [
                                {
                                    name: '@id'
                                },
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'cuid'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'cuid'
                            }
                        },
                        title: {
                            name: 'title',
                            type: 'String'
                        },
                        published: {
                            name: 'published',
                            type: 'Boolean',
                            attributes: [
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'literal',
                                                value: false
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: false
                        },
                        author: {
                            name: 'author',
                            type: 'User',
                            attributes: [
                                {
                                    name: '@relation',
                                    args: [
                                        {
                                            name: 'fields',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'authorId'
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            name: 'references',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'id'
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            name: 'onDelete',
                                            value: {
                                                kind: 'literal',
                                                value: 'Cascade'
                                            }
                                        }
                                    ]
                                }
                            ],
                            relation: {
                                opposite: 'posts',
                                fields: [
                                    'authorId'
                                ],
                                references: [
                                    'id'
                                ],
                                onDelete: 'Cascade'
                            }
                        },
                        authorId: {
                            name: 'authorId',
                            type: 'String',
                            foreignKeyFor: [
                                'author'
                            ]
                        }
                    },
                    idFields: [
                        'id'
                    ],
                    uniqueFields: {
                        id: {
                            type: 'String'
                        }
                    }
                }
            },
            authType: 'User',
            plugins: {}
        });
    });

    it('supports specifying fields for @updatedAt', async () => {
        const { schema } = await generateTsSchema(`
model User {
    id String @id @default(uuid())
    name String
    email String @unique
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt(fields: [email])
    posts Post[]

    @@map('users')
}

model Post {
    id String @id @default(cuid())
    title String
    published Boolean @default(false)
    author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String
}
            `);

        expect(schema).toMatchObject({
            provider: {
                type: 'sqlite'
            },
            models: {
                User: {
                    name: 'User',
                    fields: {
                        id: {
                            name: 'id',
                            type: 'String',
                            id: true,
                            attributes: [
                                {
                                    name: '@id'
                                },
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'uuid'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'uuid'
                            }
                        },
                        name: {
                            name: 'name',
                            type: 'String'
                        },
                        email: {
                            name: 'email',
                            type: 'String',
                            unique: true,
                            attributes: [
                                {
                                    name: '@unique'
                                }
                            ]
                        },
                        createdAt: {
                            name: 'createdAt',
                            type: 'DateTime',
                            attributes: [
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'now'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'now'
                            }
                        },
                        updatedAt: {
                            name: 'updatedAt',
                            type: 'DateTime',
                            updatedAt: {
                                fields: [
                                    'email'
                                ]
                            },
                            attributes: [
                                {
                                    name: '@updatedAt',
                                    args: [
                                        {
                                            name: 'fields',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'email'
                                                    }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            ]
                        },
                        posts: {
                            name: 'posts',
                            type: 'Post',
                            array: true,
                            relation: {
                                opposite: 'author'
                            }
                        }
                    },
                    attributes: [
                        {
                            name: '@@map',
                            args: [
                                {
                                    name: 'name',
                                    value: {
                                        kind: 'literal',
                                        value: 'users'
                                    }
                                }
                            ]
                        }
                    ],
                    idFields: [
                        'id'
                    ],
                    uniqueFields: {
                        id: {
                            type: 'String'
                        },
                        email: {
                            type: 'String'
                        }
                    }
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: {
                            name: 'id',
                            type: 'String',
                            id: true,
                            attributes: [
                                {
                                    name: '@id'
                                },
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'call',
                                                function: 'cuid'
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: {
                                kind: 'call',
                                function: 'cuid'
                            }
                        },
                        title: {
                            name: 'title',
                            type: 'String'
                        },
                        published: {
                            name: 'published',
                            type: 'Boolean',
                            attributes: [
                                {
                                    name: '@default',
                                    args: [
                                        {
                                            name: 'value',
                                            value: {
                                                kind: 'literal',
                                                value: false
                                            }
                                        }
                                    ]
                                }
                            ],
                            default: false
                        },
                        author: {
                            name: 'author',
                            type: 'User',
                            attributes: [
                                {
                                    name: '@relation',
                                    args: [
                                        {
                                            name: 'fields',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'authorId'
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            name: 'references',
                                            value: {
                                                kind: 'array',
                                                items: [
                                                    {
                                                        kind: 'field',
                                                        field: 'id'
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            name: 'onDelete',
                                            value: {
                                                kind: 'literal',
                                                value: 'Cascade'
                                            }
                                        }
                                    ]
                                }
                            ],
                            relation: {
                                opposite: 'posts',
                                fields: [
                                    'authorId'
                                ],
                                references: [
                                    'id'
                                ],
                                onDelete: 'Cascade'
                            }
                        },
                        authorId: {
                            name: 'authorId',
                            type: 'String',
                            foreignKeyFor: [
                                'author'
                            ]
                        }
                    },
                    idFields: [
                        'id'
                    ],
                    uniqueFields: {
                        id: {
                            type: 'String'
                        }
                    }
                }
            },
            authType: 'User',
            plugins: {}
        });
    });
});
