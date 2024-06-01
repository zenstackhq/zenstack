import { loadModel, safelyLoadModel, errorLike } from '../../utils';

describe('Data Model Validation Tests', () => {
    const prelude = `
        datasource db {
            provider = "postgresql"
            url = "url"
        }
    `;

    it('duplicated fields', async () => {
        const result = await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                x Int
                x String
            }
        `);

        expect(result).toMatchObject(errorLike('Duplicated declaration name "x"'));
    });

    it('scalar types', async () => {
        const result = await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                a String
                b Boolean?
                c Int[] @default([])
                c1 Int[] @default([1, 2, 3])
                d BigInt
                e Float
                f Decimal
                g DateTime
                h Json
                i Bytes
            }
        `);
        expect(result).toMatchObject({ status: 'fulfilled' });
    });

    it('Unsupported type valid arg', async () => {
        const result = await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                a Unsupported('foo')
            }
        `);

        expect(result).toMatchObject({ status: 'fulfilled' });
    });

    it('Unsupported type invalid arg', async () => {
        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                a Unsupported(123)
            }
        `)
        ).toMatchObject(errorLike('Unsupported type argument must be a string literal'));
    });

    it('Unsupported type used in expression', async () => {
        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                a Unsupported('a')
                @@allow('all', a == 'a')
            }
        `)
        ).toMatchObject(errorLike('Field of "Unsupported" type cannot be used in expressions'));
    });

    it('Using `this` in collection predicate', async () => {
        expect(
            await safelyLoadModel(`
            ${prelude}
            model User {
                id String @id
                members User[]
                @@allow('all', members?[this == auth()])
            }
        `)
        ).toBeTruthy();

        expect(
            await loadModel(`
        model User {
            id String @id
            members User[]
            @@allow('all', members?[id == auth().id])
        }
        `)
        ).toBeTruthy();
    });

    it('mix array and optional', async () => {
        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                x Int[]?
            }
        `)
        ).toMatchObject(errorLike('Optional lists are not supported. Use either `Type[]` or `Type?`'));
    });

    it('unresolved field type', async () => {
        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                x Integer
            }
        `)
        ).toMatchObject(errorLike(`Could not resolve reference to TypeDeclaration named 'Integer'.`));

        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                x Integer[]
            }
        `)
        ).toMatchObject(errorLike(`Could not resolve reference to TypeDeclaration named 'Integer'.`));

        expect(
            await safelyLoadModel(`
            ${prelude}
            model M {
                id String @id
                x Integer?
            }
        `)
        ).toMatchObject(errorLike(`Could not resolve reference to TypeDeclaration named 'Integer'.`));
    });

    describe('id field', () => {
        const err =
            'Model must have at least one unique criteria. Either mark a single field with `@id`, `@unique` or add a multi field criterion with `@@id([])` or `@@unique([])` to the model.';

        it('should error when there are no unique fields', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int
                    @@allow('all', x > 0)
                }
            `);
            expect(result).toMatchObject(errorLike(err));
        });

        it('should should use @unique when there is no @id', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    id Int @unique
                    x Int
                    @@allow('all', x > 0)
                }
            `);
            expect(result).toMatchObject({ status: 'fulfilled' });
        });

        // @@unique used as id
        it('should suceed when @@unique used as id', async () => {
            const result = await safelyLoadModel(`
               ${prelude}
               model M {
                   x Int
                   @@unique([x])
                   @@allow('all', x > 0)
               }
           `);
            expect(result).toMatchObject({ status: 'fulfilled' });
        });

        it('should succeed when @id is an enum type', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                enum E {
                    A
                    B
                }
                model M {
                    id E @id
                }
            `);
            expect(result).toMatchObject({ status: 'fulfilled' });
        });

        it('should succeed when @@id is an enum type', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                enum E {
                    A
                    B
                }
                model M {
                    x Int
                    y E
                    @@id([x, y])
                }
            `);
            expect(result).toMatchObject({ status: 'fulfilled' });
        });

        it('should error when there are no id fields, even when denying access', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int
                    @@deny('all', x <= 0)
                }
            `);

            expect(result).toMatchObject(errorLike(err));
        });

        it('should error when there are not id fields, without access restrictions', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int @gt(0)
                }
            `);

            expect(result).toMatchObject(errorLike(err));
        });

        it('should error when there is more than one field marked as @id', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int @id
                    y Int @id
                }
            `);
            expect(result).toMatchObject(errorLike(`Model can include at most one field with @id attribute`));
        });

        it('should error when both @id and @@id are used', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int @id
                    y Int
                    @@id([x, y])
                }
            `);
            expect(result).toMatchObject(
                errorLike(`Model cannot have both field-level @id and model-level @@id attributes`)
            );
        });

        it('should error when @id used on optional field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int? @id
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must not be optional`));
        });

        it('should error when @@id used on optional field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int?
                    @@id([x])
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must not be optional`));
        });

        it('should error when @id used on list field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int[] @id
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });

        it('should error when @@id used on list field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Int[]
                    @@id([x])
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });

        it('should error when @id used on a Json field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Json @id
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });

        it('should error when @@id used on a Json field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model M {
                    x Json
                    @@id([x])
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });

        it('should error when @id used on a reference field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model Id {
                    id String @id
                }
                model M {
                    myId Id @id
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });

        it('should error when @@id used on a reference field', async () => {
            const result = await safelyLoadModel(`
                ${prelude}
                model Id {
                    id String @id
                }
                model M {
                    myId Id
                    @@id([myId])
                }
            `);
            expect(result).toMatchObject(errorLike(`Field with @id attribute must be of scalar or enum type`));
        });
    });

    it('relation', async () => {
        // one-to-one
        await loadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [foreignId], references: [id], onUpdate: Cascade, onDelete: Cascade)
                foreignId String @unique
            }
        `);

        // one-to-many
        await loadModel(`
            ${prelude}
            model A {
                id String @id
                b B[]
            }

            model B {
                id String @id
                a A @relation(fields: [foreignId], references: [id])
                foreignId String
            }
        `);

        // many-to-many implicit
        //https://www.prisma.io/docs/concepts/components/prisma-schema/relations/many-to-many-relations#implicit-many-to-many-relations
        await loadModel(`
        ${prelude}
        model Post {
            id         Int        @id @default(autoincrement())
            title      String
            categories Category[]
          }
          
          model Category {
            id    Int    @id @default(autoincrement())
            name  String
            posts Post[]
          }
        `);

        // one-to-one incomplete
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
            }
        `)
        ).toMatchObject(
            errorLike(`The relation field "b" on model "A" is missing an opposite relation field on model "B"`)
        );

        // one-to-one ambiguous
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A
                a1 A
            }
        `)
        ).toMatchObject(errorLike(`Fields "a", "a1" on model "B" refer to the same relation to model "A"`));

        // fields or references missing
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [aId])
                aId String
            }
        `)
        ).toMatchObject(errorLike(`Both "fields" and "references" must be provided`));

        // one-to-one inconsistent attribute
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B? @relation(references: [id])
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
                aId String
            }
        `)
        ).toMatchObject(errorLike(`"fields" and "references" must be provided only on one side of relation field`));

        // references mismatch
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                myId Int @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
                aId String @unique
            }
        `)
        ).toMatchObject(errorLike(`values of "references" and "fields" must have the same type`));

        // "fields" and "references" typing consistency
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id Int @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
                aId String @unique
            }
        `)
        ).toMatchObject(errorLike(`values of "references" and "fields" must have the same type`));

        // one-to-one missing @unique
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
                aId String
            }
        `)
        ).toMatchObject(
            errorLike(
                `Field "aId" on model "B" is part of a one-to-one relation and must be marked as @unique or be part of a model-level @@unique attribute`
            )
        );

        // missing @relation
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A
            }
        `)
        ).toMatchObject(
            errorLike(
                `Field for one side of relation must carry @relation attribute with both "fields" and "references" fields`
            )
        );

        // wrong relation owner field type
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
                aId String
            }
        `)
        ).toMatchObject(errorLike(`Relation field needs to be list or optional`));

        // unresolved field
        expect(
            await safelyLoadModel(`
            ${prelude}
            model A {
                id String @id
                b B?
            }

            model B {
                id String @id
                a A @relation(fields: [aId], references: [id])
            }
        `)
        ).toMatchObject(errorLike(`Could not resolve reference to ReferenceTarget named 'aId'.`));

        // enum as foreign key
        await loadModel(`
            ${prelude}

            enum Role {
                ADMIN
                USER
            }
            
            model A {
                id String @id
                role Role @unique
                bs B[]
            }

            model B {
                id String @id
                a A @relation(fields: [aRole], references: [role])
                aRole Role
            }
        `);
    });

    it('self relation', async () => {
        // one-to-one
        // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations#one-to-one-self-relations
        await loadModel(`
            ${prelude}
            model User {
                id          Int     @id @default(autoincrement())
                name        String?
                successorId Int?    @unique
                successor   User?   @relation("BlogOwnerHistory", fields: [successorId], references: [id])
                predecessor User?   @relation("BlogOwnerHistory")
            }
        `);

        // one-to-many
        // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations#one-to-many-self-relations
        await loadModel(`
            ${prelude}
            model User {
                id        Int     @id @default(autoincrement())
                name      String?
                teacherId Int?
                teacher   User?   @relation("TeacherStudents", fields: [teacherId], references: [id])
                students  User[]  @relation("TeacherStudents")
            }
        `);

        // many-to-many
        // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations#many-to-many-self-relations
        await loadModel(`
            ${prelude}
            model User {
                id         Int     @id @default(autoincrement())
                name       String?
                followedBy User[]  @relation("UserFollows")
                following  User[]  @relation("UserFollows")
            }
        `);

        // many-to-many explicit
        // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations#many-to-many-self-relations
        await loadModel(`
            ${prelude}
            model User {
                id         Int       @id @default(autoincrement())
                name       String?
                followedBy Follows[] @relation("following")
                following  Follows[] @relation("follower")
            }

            model Follows {
                follower    User @relation("follower", fields: [followerId], references: [id])
                followerId  Int
                following   User @relation("following", fields: [followingId], references: [id])
                followingId Int

                @@id([followerId, followingId])
            }
        `);

        await loadModel(`
            ${prelude}
            model User {
                id         Int       @id
                eventTypes EventType[] @relation("user_eventtype")
            }

            model EventType {
                id         Int       @id
                users User[] @relation("user_eventtype")
            }
        `);

        // multiple self relations
        // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations#defining-multiple-self-relations-on-the-same-model
        await loadModel(`
            ${prelude}
            model User {
                id         Int     @id @default(autoincrement())
                name       String?
                teacherId  Int?
                teacher    User?   @relation("TeacherStudents", fields: [teacherId], references: [id])
                students   User[]  @relation("TeacherStudents")
                followedBy User[]  @relation("UserFollows")
                following  User[]  @relation("UserFollows")
            }
        `);
    });

    it('abstract base type', async () => {
        const errors = await safelyLoadModel(`
                    ${prelude}

                    abstract model Base {
                        id String @id
                    }

                    model A {
                        a String
                    }
        
                    model B extends Base,A {
                        b String
                    }
                `);

        expect(errors).toMatchObject(
            errorLike(`Model A cannot be extended because it's neither abstract nor marked as "@@delegate"`)
        );

        // relation incomplete from multiple level inheritance
        expect(
            await safelyLoadModel(`
                ${prelude}
                  model User {
                    id Int @id @default(autoincrement())
                  }
                  
                  abstract model Base {
                    id Int @id @default(autoincrement())
                    user User @relation(fields: [userId], references: [id])
                    userId Int
                  }
                  
                  abstract model Base1 extends Base {
                    isPublic Boolean @default(false)
                  }
                  
                  model A extends Base1 {
                    a String
                  }
            `)
        ).toMatchObject(
            errorLike(`The relation field "user" on model "A" is missing an opposite relation field on model "User"`)
        );

        // one-to-one relation field and @@unique defined in different models
        await loadModel(`
                    ${prelude}

                    abstract model Base {
                        id String @id
                        a A @relation(fields: [aId], references: [id])
                        aId String
                    }

                    model A {
                        id String @id
                        b B?
                    }
        
                    model B extends Base{
                        @@unique([aId])
                    }
                `);
    });

    it('delegate base type', async () => {
        const errors = await safelyLoadModel(`
                    ${prelude}

                    model Base1 {
                        id String @id
                        type String
                        @@delegate(type)
                    }

                    model Base2 {
                        id String @id
                        type String
                        @@delegate(type)
                    }

                    model A extends Base1,Base2 {
                        a String
                    }
                `);

        expect(errors).toMatchObject(errorLike(`Extending from multiple delegate models is not supported`));
    });
});
