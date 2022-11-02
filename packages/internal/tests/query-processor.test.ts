import { FieldInfo, PolicyOperationKind, type Service } from '../src/types';
import { QueryProcessor } from '../src/handler/data/query-processor';

class MockService implements Service {
    constructor(
        private readonly fieldMapping: Record<string, Record<string, FieldInfo>>
    ) {}

    get db(): any {
        throw new Error('Method not implemented.');
    }

    async resolveField(model: string, field: string) {
        return this.fieldMapping[model]?.[field];
    }

    async buildQueryGuard(model: string, operation: PolicyOperationKind) {
        return { [`${model}_${operation}`]: true };
    }
}

describe('Query Processor Tests', () => {
    const svc = new MockService({
        User: {
            password: {
                name: 'password',
                type: 'String',
                isArray: false,
                isOptional: false,
                isDataModel: false,
                attributes: [],
            },
        },
        List: {
            todos: {
                name: 'todos',
                type: 'Todo',
                isArray: true,
                isOptional: false,
                isDataModel: true,
                attributes: [],
            },
        },
        Todo: {
            list: {
                name: 'list',
                type: 'List',
                isArray: false,
                isOptional: false,
                isDataModel: true,
                attributes: [],
            },
        },
    });

    const processor = new QueryProcessor(svc);

    it('process query args', async () => {
        // empty args
        let r = await processor.processQueryArgs('List', {}, 'read', {});
        expect(r).toEqual(
            expect.objectContaining({ where: { List_read: true } })
        );

        // simple condition
        r = await processor.processQueryArgs(
            'List',
            { where: { private: false } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({
                where: {
                    AND: expect.arrayContaining([
                        { private: false },
                        { List_read: true },
                    ]),
                },
            })
        );

        // include to-many
        r = await processor.processQueryArgs(
            'List',
            { include: { todos: true } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({
                include: { todos: { where: { Todo_read: true } } },
            })
        );

        // include to-many with condition
        r = await processor.processQueryArgs(
            'List',
            { include: { haha: true, todos: { where: { private: false } } } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({
                include: {
                    haha: true,
                    todos: {
                        where: {
                            AND: expect.arrayContaining([
                                { private: false },
                                { Todo_read: true },
                            ]),
                        },
                    },
                },
            })
        );

        // select to-many
        r = await processor.processQueryArgs(
            'List',
            { select: { haha: true, todos: true } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({
                select: {
                    haha: true,
                    todos: {
                        where: {
                            Todo_read: true,
                        },
                    },
                },
            })
        );

        // select to-many with condition
        r = await processor.processQueryArgs(
            'List',
            { select: { todos: { where: { private: false } } } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({
                select: {
                    todos: {
                        where: {
                            AND: expect.arrayContaining([
                                { private: false },
                                { Todo_read: true },
                            ]),
                        },
                    },
                },
            })
        );

        // include to-one, no processing
        r = await processor.processQueryArgs(
            'Todo',
            { include: { list: true } },
            'read',
            {}
        );
        expect(r).toEqual(expect.objectContaining({ include: { list: true } }));

        // select to-one, "id" is injected
        r = await processor.processQueryArgs(
            'Todo',
            { select: { list: true } },
            'read',
            {}
        );
        expect(r).toEqual(
            expect.objectContaining({ select: { id: true, list: true } })
        );
    });

    it('process write args', async () => {
        const { preWriteGuard } = await processor.processQueryArgsForWrite(
            'List',
            { data: {} },
            'create',
            {},
            ''
        );

        expect(preWriteGuard).toEqual(
            expect.objectContaining({
                where: { List_create: true },
            })
        );
    });
});
