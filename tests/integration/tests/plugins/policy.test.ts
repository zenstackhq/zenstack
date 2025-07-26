/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('Policy plugin tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const TRUE = { AND: [] };
    const FALSE = { OR: [] };

    it('short-circuit', async () => {
        const model = `
    model User {
        id String @id @default(cuid())
        value Int
    }

    model M {
        id String @id @default(cuid())
        value Int
        @@allow('read', auth() != null)
        @@allow('create', auth().value > 0)

        @@allow('update', auth() != null)
        @@deny('update', auth().value == null || auth().value <= 0)
    }
            `;

        const { policy } = await loadSchema(model);

        const m = policy.policy.m.modelLevel;

        expect((m.read.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.read.guard as Function)({ user: { id: '1' } })).toEqual(TRUE);

        expect((m.create.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1' } })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect((m.create.guard as Function)({ user: { id: '1', value: 1 } })).toEqual(TRUE);

        expect((m.update.guard as Function)({ user: undefined })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1' } })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1', value: 0 } })).toEqual(FALSE);
        expect((m.update.guard as Function)({ user: { id: '1', value: 1 } })).toEqual(TRUE);
    });

    it('no short-circuit', async () => {
        const model = `
    model User {
        id String @id @default(cuid())
        value Int
    }

    model M {
        id String @id @default(cuid())
        value Int
        @@allow('read', auth() != null && value > 0)
    }
            `;

        const { policy } = await loadSchema(model);

        expect((policy.policy.m.modelLevel.read.guard as Function)({ user: undefined })).toEqual(
            expect.objectContaining({ AND: [{ OR: [] }, { value: { gt: 0 } }] })
        );
        expect((policy.policy.m.modelLevel.read.guard as Function)({ user: { id: '1' } })).toEqual(
            expect.objectContaining({ AND: [{ AND: [] }, { value: { gt: 0 } }] })
        );
    });

    it('auth() multiple level member access', async () => {
        const model = `
             model User {
                id Int @id @default(autoincrement())
                cart Cart?
              }

              model Cart {
                id Int @id @default(autoincrement())
                tasks Task[]
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
              }

              model Task {
                id Int @id @default(autoincrement())
                cart Cart @relation(fields: [cartId], references: [id])
                cartId Int
                value Int
                @@allow('read', auth().cart.tasks?[id == 123] && value >10)
              }
                    `;

        const { policy } = await loadSchema(model);
        expect(
            (policy.policy.task.modelLevel.read.guard as Function)({ user: { cart: { tasks: [{ id: 1 }] } } })
        ).toEqual(expect.objectContaining({ AND: [{ OR: [] }, { value: { gt: 10 } }] }));

        expect(
            (policy.policy.task.modelLevel.read.guard as Function)({ user: { cart: { tasks: [{ id: 123 }] } } })
        ).toEqual(expect.objectContaining({ AND: [{ AND: [] }, { value: { gt: 10 } }] }));
    });

    it('simple alias expressions', async () => {
        const { policy } = await loadSchema(
            `
                alias allowAll() {
                    true
                }

                alias defaultTitle() {
                    'Default Title'
                }

                alias currentUser() {
                    auth().id
                }

                model Post {
                    id          Int      @id @default(autoincrement())
                    title       String   @default(defaultTitle())
                    published   Boolean  @default(allowAll())

                    author   User     @relation(fields: [authorId], references: [id])
                    authorId String   @default(auth().id)

                    @@allow('read', allowAll())
                    @@allow('create,update,delete', currentUser() == authorId && published)
                }

                model User {
                    id            String    @id @default(cuid())
                    name          String?
                    posts         Post[]

                    @@allow('all', allowAll())
                }
            `,
            {
                compile: false,
                generateNoCompile: true,
                output: 'out/',
            }
        );

        // Test allowAll alias used in policy and default
        expect((policy.policy.post.modelLevel.read.guard as Function)({}, undefined)).toEqual({ AND: [] });
        expect((policy.policy.user.modelLevel.read.guard as Function)({}, undefined)).toEqual({ AND: [] });

        // Test currentUser alias used in policy
        expect(
            (policy.policy.post.modelLevel.create.guard as Function)(
                { user: { id: 'u1' }, authorId: 'u1', published: true },
                undefined
            )
        ).toEqual({ AND: [{ authorId: { equals: 'u1' } }, { published: true }] });
        expect(
            (policy.policy.post.modelLevel.create.guard as Function)(
                { user: { id: 'u2' }, authorId: 'u1', published: true },
                undefined
            )
        ).toEqual({ AND: [{ authorId: { equals: 'u2' } }, { published: true }] });
    });

    it('complex alias expressions', async () => {
        const model = `
            enum TaskStatus {
                TODO
                IN_PROGRESS
                DONE
            }

            alias isInProgress() {
                status == IN_PROGRESS
            }

            alias complexAlias() {
               status == IN_PROGRESS && value > 10
            }

            alias memberAccessAlias() {
               cart.tasks?[id == 123]
            }

            alias memberAccess() {
                // new task can be created the cart contains tasks with status TODO...
                cart.tasks?[status == TODO]
            }

             model User {
                id Int @id @default(autoincrement())
                cart Cart?
              }

              model Cart {
                id Int @id @default(autoincrement())
                tasks Task[]
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
              }

              model Task {
                id Int @id @default(autoincrement())
                status TaskStatus @default(TODO)
                cart Cart @relation(fields: [cartId], references: [id])
                cartId Int
                value Int
                @@allow('read', complexAlias())
                @@allow('update', memberAccessAlias())
                @@allow('create', memberAccess())
              }
                    `;

        const { policy } = await loadSchema(model, {
            compile: false,
            generateNoCompile: true,
            output: 'out/',
        });

        // Test simple complex alias for read operation - requires status IN_PROGRESS and value > 10
        expect(
            (policy.policy.task.modelLevel.read.guard as Function)({
                status: 'IN_PROGRESS',
                value: 15,
            })
        ).toEqual(
            expect.objectContaining({
                AND: expect.arrayContaining([{ status: { equals: 'IN_PROGRESS' } }, { value: { gt: 10 } }]),
            })
        );

        // Test member access alias for update operation - requires cart with tasks having id 123
        expect(
            (policy.policy.task.modelLevel.update.guard as Function)({
                user: { cart: { tasks: [{ id: 123 }] } },
            })
        ).toEqual({
            cart: {
                tasks: {
                    some: {
                        id: { equals: 123 },
                    },
                },
            },
        });

        // Test member access alias for create operation - requires cart with tasks having status TODO
        expect(
            (policy.policy.task.modelLevel.create.guard as Function)({
                user: { cart: { tasks: [{ status: 'TODO' }] } },
            })
        ).toEqual({
            cart: {
                tasks: {
                    some: {
                        status: { equals: 'TODO' },
                    },
                },
            },
        });
    });

    it('simple member access in alias', async () => {
        const model = `
            alias memberAccess() {
                cart.tasks?[id == 123]
            }

            model User {
                id Int @id @default(autoincrement())
                cart Cart?
            }

            model Cart {
                id Int @id @default(autoincrement())
                tasks Task[]
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
            }

            model Task {
                id Int @id @default(autoincrement())
                cart Cart @relation(fields: [cartId], references: [id])
                cartId Int
                value Int
                @@allow('create', memberAccess())
            }
            `;

        const { policy } = await loadSchema(model, {
            compile: false,
            generateNoCompile: true,
            output: 'out/',
        });

        // Test that the policy is correctly generated
        expect(policy.policy.task.modelLevel.create.guard).toBeDefined();

        // Test with cart containing matching task
        expect(
            (policy.policy.task.modelLevel.create.guard as Function)({
                user: { cart: { tasks: [{ id: 123 }] } },
            })
        ).toEqual({ cart: { tasks: { some: { id: { equals: 123 } } } } });

        // Test with cart containing non-matching task - policy still generates filter
        expect(
            (policy.policy.task.modelLevel.create.guard as Function)({
                user: { cart: { tasks: [{ id: 456 }] } },
            })
        ).toEqual({ cart: { tasks: { some: { id: { equals: 123 } } } } });

        // Test with empty cart - policy still generates filter
        expect(
            (policy.policy.task.modelLevel.create.guard as Function)({
                user: { cart: { tasks: [] } },
            })
        ).toEqual({ cart: { tasks: { some: { id: { equals: 123 } } } } });
    });

    it('alias field access resolution in policy rules', async () => {
        const model = `
        alias isAdminUser() {
            auth().role == 'admin'
        }

        // TODO: enable parameters in alias
        // alias isInSameDepartment(targetDepartment: String) {
        //     auth().department == targetDepartment
        // }

        alias hasFieldAccess() {
            auth().role != null && auth().department != null
        }

        model User {
            id String @id @default(cuid())
            role String
            department String
        }

        model Document {
            id String @id @default(cuid())
            title String
            department String
            sensitive Boolean @default(false)
            
            // @@allow('read', isAdminUser() || isInSameDepartment(department))
            @@allow('create', hasFieldAccess() && !sensitive)
            @@allow('update', isAdminUser())
        }
        `;

        const { policy } = await loadSchema(model);
        const docPolicy = policy.policy.document.modelLevel;

        // Test admin user access
        const adminUser = { id: '1', role: 'admin', department: 'IT' };
        // expect((docPolicy.read.guard as Function)({ user: adminUser })).toEqual({
        //     OR: [
        //         { AND: [] }, // isAdminUser() resolves to true
        //         { department: { equals: 'IT' } }, // isInSameDepartment() check
        //     ],
        // });

        // // Test same department user access
        // const deptUser = { id: '2', role: 'user', department: 'HR' };
        // expect((docPolicy.read.guard as Function)({ user: deptUser })).toEqual({
        //     OR: [
        //         { OR: [] }, // isAdminUser() resolves to false
        //         { department: { equals: 'HR' } }, // isInSameDepartment() check
        //     ],
        // });

        // Test create policy with field access check
        expect((docPolicy.create.guard as Function)({ user: adminUser })).toEqual({
            AND: [
                {
                    AND: [{ AND: [] }, { AND: [] }],
                },
                {
                    NOT: { sensitive: true },
                },
            ],
        });

        // Test user without proper field access
        const limitedUser = { id: '3', role: null, department: 'Sales' };
        expect((docPolicy.create.guard as Function)({ user: limitedUser })).toEqual({
            AND: [
                {
                    AND: [{ OR: [] }, { AND: [] }],
                },
                {
                    NOT: { sensitive: true },
                },
            ],
        });
    });
});
