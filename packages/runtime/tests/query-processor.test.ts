import {
    FieldInfo,
    PolicyOperationKind,
    QueryContext,
    type Service,
} from '../src/types';
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

    buildQueryGuard(
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        return { [`${model}_${operation}`]: true };
    }
}

describe('Query Processor Tests', () => {
    it('arg processor', async () => {
        const svc = new MockService({
            List: {
                todos: {
                    type: 'Todo',
                    isArray: true,
                },
            },
            Todo: {
                list: {
                    type: 'List',
                    isArray: false,
                },
            },
        });

        const processor = new QueryProcessor(svc);

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

        // select to-one, no processing
        r = await processor.processQueryArgs(
            'Todo',
            { select: { list: true } },
            'read',
            {}
        );
        expect(r).toEqual(expect.objectContaining({ select: { list: true } }));
    });
});
