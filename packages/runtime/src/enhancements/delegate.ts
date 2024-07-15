/* eslint-disable @typescript-eslint/no-explicit-any */
import deepmerge, { type ArrayMergeOptions } from 'deepmerge';
import { isPlainObject } from 'is-plain-object';
import { lowerCaseFirst } from 'lower-case-first';
import { DELEGATE_AUX_RELATION_PREFIX } from '../constants';
import {
    FieldInfo,
    ModelInfo,
    NestedWriteVisitor,
    clone,
    enumerate,
    getIdFields,
    getModelInfo,
    isDelegateModel,
    resolveField,
} from '../cross';
import type { CrudContract, DbClientContract } from '../types';
import type { InternalEnhancementOptions } from './create-enhancement';
import { Logger } from './logger';
import { DefaultPrismaProxyHandler, makeProxy } from './proxy';
import { QueryUtils } from './query-utils';
import { formatObject, prismaClientValidationError } from './utils';

export function withDelegate<DbClient extends object>(prisma: DbClient, options: InternalEnhancementOptions): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new DelegateProxyHandler(_prisma as DbClientContract, model, options),
        'delegate'
    );
}

export class DelegateProxyHandler extends DefaultPrismaProxyHandler {
    private readonly logger: Logger;
    private readonly queryUtils: QueryUtils;

    constructor(prisma: DbClientContract, model: string, options: InternalEnhancementOptions) {
        super(prisma, model, options);
        this.logger = new Logger(prisma);
        this.queryUtils = new QueryUtils(prisma, this.options);
    }

    // #region find

    override findFirst(args: any): Promise<unknown> {
        return this.doFind(this.prisma, this.model, 'findFirst', args);
    }

    override findFirstOrThrow(args: any): Promise<unknown> {
        return this.doFind(this.prisma, this.model, 'findFirstOrThrow', args);
    }

    override findUnique(args: any): Promise<unknown> {
        return this.doFind(this.prisma, this.model, 'findUnique', args);
    }

    override findUniqueOrThrow(args: any): Promise<unknown> {
        return this.doFind(this.prisma, this.model, 'findUniqueOrThrow', args);
    }

    override async findMany(args: any): Promise<unknown[]> {
        return this.doFind(this.prisma, this.model, 'findMany', args);
    }

    private async doFind(
        db: CrudContract,
        model: string,
        method: 'findFirst' | 'findFirstOrThrow' | 'findUnique' | 'findUniqueOrThrow' | 'findMany',
        args: any
    ) {
        if (!this.involvesDelegateModel(model)) {
            return super[method](args);
        }

        args = args ? clone(args) : {};

        this.injectWhereHierarchy(model, args?.where);
        this.injectSelectIncludeHierarchy(model, args);

        if (args.orderBy) {
            // `orderBy` may contain fields from base types
            this.injectWhereHierarchy(this.model, args.orderBy);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`${method}\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const entity = await db[model][method](args);

        if (Array.isArray(entity)) {
            return entity.map((item) => this.assembleHierarchy(model, item));
        } else {
            return this.assembleHierarchy(model, entity);
        }
    }

    private injectWhereHierarchy(model: string, where: any) {
        if (!where || !isPlainObject(where)) {
            return;
        }

        Object.entries(where).forEach(([field, value]) => {
            if (['AND', 'OR', 'NOT'].includes(field)) {
                // recurse into logical group
                enumerate(value).forEach((item) => this.injectWhereHierarchy(model, item));
                return;
            }

            const fieldInfo = resolveField(this.options.modelMeta, model, field);
            if (!fieldInfo?.inheritedFrom) {
                // not an inherited field, inject and continue
                if (fieldInfo?.isDataModel) {
                    this.injectWhereHierarchy(fieldInfo.type, value);
                }
                return;
            }

            let base = this.getBaseModel(model);
            let target = where;

            while (base) {
                const baseRelationName = this.makeAuxRelationName(base);

                // prepare base layer where
                let thisLayer: any;
                if (target[baseRelationName]) {
                    thisLayer = target[baseRelationName];
                } else {
                    thisLayer = target[baseRelationName] = {};
                }

                if (base.name === fieldInfo.inheritedFrom) {
                    if (fieldInfo.isDataModel) {
                        this.injectWhereHierarchy(base.name, value);
                    }
                    thisLayer[field] = value;
                    delete where[field];
                    break;
                } else {
                    target = thisLayer;
                    base = this.getBaseModel(base.name);
                }
            }
        });
    }

    private injectSelectIncludeHierarchy(model: string, args: any) {
        if (!args || typeof args !== 'object') {
            return;
        }

        for (const kind of ['select', 'include'] as const) {
            if (args[kind] && typeof args[kind] === 'object') {
                for (const [field, value] of Object.entries<any>(args[kind])) {
                    const fieldInfo = resolveField(this.options.modelMeta, model, field);
                    if (fieldInfo && value !== undefined) {
                        if (value?.orderBy) {
                            // `orderBy` may contain fields from base types
                            this.injectWhereHierarchy(fieldInfo.type, value.orderBy);
                        }

                        if (this.injectBaseFieldSelect(model, field, value, args, kind)) {
                            delete args[kind][field];
                        } else if (fieldInfo.isDataModel) {
                            let nextValue = value;
                            if (nextValue === true) {
                                // make sure the payload is an object
                                args[kind][field] = nextValue = {};
                            }
                            this.injectSelectIncludeHierarchy(fieldInfo.type, nextValue);
                        }
                    }
                }
            }
        }

        if (!args.select) {
            // include base models upwards
            this.injectBaseIncludeRecursively(model, args);

            // include sub models downwards
            this.injectConcreteIncludeRecursively(model, args);
        }
    }

    private buildSelectIncludeHierarchy(model: string, args: any) {
        args = clone(args);
        const selectInclude: any = this.extractSelectInclude(args) || {};

        if (selectInclude.select && typeof selectInclude.select === 'object') {
            Object.entries(selectInclude.select).forEach(([field, value]) => {
                if (value) {
                    if (this.injectBaseFieldSelect(model, field, value, selectInclude, 'select')) {
                        delete selectInclude.select[field];
                    }
                }
            });
        } else if (selectInclude.include && typeof selectInclude.include === 'object') {
            Object.entries(selectInclude.include).forEach(([field, value]) => {
                if (value) {
                    if (this.injectBaseFieldSelect(model, field, value, selectInclude, 'include')) {
                        delete selectInclude.include[field];
                    }
                }
            });
        }

        if (!selectInclude.select) {
            this.injectBaseIncludeRecursively(model, selectInclude);
            this.injectConcreteIncludeRecursively(model, selectInclude);
        }
        return selectInclude;
    }

    private injectBaseFieldSelect(
        model: string,
        field: string,
        value: any,
        selectInclude: any,
        context: 'select' | 'include'
    ) {
        const fieldInfo = resolveField(this.options.modelMeta, model, field);
        if (!fieldInfo?.inheritedFrom) {
            return false;
        }

        let base = this.getBaseModel(model);
        let target = selectInclude;

        while (base) {
            const baseRelationName = this.makeAuxRelationName(base);

            // prepare base layer select/include
            // let selectOrInclude = 'select';
            let thisLayer: any;
            if (target.include) {
                // selectOrInclude = 'include';
                thisLayer = target.include;
            } else if (target.select) {
                // selectOrInclude = 'select';
                thisLayer = target.select;
            } else {
                // selectInclude = 'include';
                thisLayer = target.select = {};
            }

            if (base.name === fieldInfo.inheritedFrom) {
                if (!thisLayer[baseRelationName]) {
                    thisLayer[baseRelationName] = { [context]: {} };
                }
                thisLayer[baseRelationName][context][field] = value;
                break;
            } else {
                if (!thisLayer[baseRelationName]) {
                    thisLayer[baseRelationName] = { select: {} };
                }
                target = thisLayer[baseRelationName];
                base = this.getBaseModel(base.name);
            }
        }

        return true;
    }

    private injectBaseIncludeRecursively(model: string, selectInclude: any) {
        const base = this.getBaseModel(model);
        if (!base) {
            return;
        }
        const baseRelationName = this.makeAuxRelationName(base);

        if (selectInclude.select) {
            selectInclude.include = { [baseRelationName]: {}, ...selectInclude.select };
            delete selectInclude.select;
        } else {
            selectInclude.include = { [baseRelationName]: {}, ...selectInclude.include };
        }
        this.injectBaseIncludeRecursively(base.name, selectInclude.include[baseRelationName]);
    }

    private injectConcreteIncludeRecursively(model: string, selectInclude: any) {
        const modelInfo = getModelInfo(this.options.modelMeta, model);
        if (!modelInfo) {
            return;
        }

        // get sub models of this model
        const subModels = Object.values(this.options.modelMeta.models).filter((m) =>
            m.baseTypes?.includes(modelInfo.name)
        );

        for (const subModel of subModels) {
            // include sub model relation field
            const subRelationName = this.makeAuxRelationName(subModel);
            if (selectInclude.select) {
                selectInclude.include = { [subRelationName]: {}, ...selectInclude.select };
                delete selectInclude.select;
            } else {
                selectInclude.include = { [subRelationName]: {}, ...selectInclude.include };
            }
            this.injectConcreteIncludeRecursively(subModel.name, selectInclude.include[subRelationName]);
        }
    }

    // #endregion

    // #region create

    override async create(args: any) {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'data field is required in query argument'
            );
        }

        if (isDelegateModel(this.options.modelMeta, this.model)) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                `Model "${this.model}" is a delegate and cannot be created directly`
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.create(args);
        }

        return this.doCreate(this.prisma, this.model, args);
    }

    override createMany(args: { data: any; skipDuplicates?: boolean }): Promise<{ count: number }> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'data field is required in query argument'
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.createMany(args);
        }

        if (this.isDelegateOrDescendantOfDelegate(this.model) && args.skipDuplicates) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                '`createMany` with `skipDuplicates` set to true is not supported for delegated models'
            );
        }

        // `createMany` doesn't support nested create, which is needed for creating entities
        // inheriting a delegate base, so we need to convert it to a regular `create` here.
        // Note that the main difference is `create` doesn't support `skipDuplicates` as
        // `createMany` does.

        return this.queryUtils.transaction(this.prisma, async (tx) => {
            const r = await Promise.all(
                enumerate(args.data).map(async (item) => {
                    return this.doCreate(tx, this.model, { data: item });
                })
            );
            return { count: r.length };
        });
    }

    override createManyAndReturn(args: { data: any; select?: any; skipDuplicates?: boolean }): Promise<unknown[]> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'data field is required in query argument'
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.createManyAndReturn(args);
        }

        if (this.isDelegateOrDescendantOfDelegate(this.model) && args.skipDuplicates) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                '`createManyAndReturn` with `skipDuplicates` set to true is not supported for delegated models'
            );
        }

        // `createManyAndReturn` doesn't support nested create, which is needed for creating entities
        // inheriting a delegate base, so we need to convert it to a regular `create` here.
        // Note that the main difference is `create` doesn't support `skipDuplicates` as
        // `createManyAndReturn` does.

        return this.queryUtils.transaction(this.prisma, async (tx) => {
            const r = await Promise.all(
                enumerate(args.data).map(async (item) => {
                    return this.doCreate(tx, this.model, { data: item, select: args.select });
                })
            );
            return r;
        });
    }

    private async doCreate(db: CrudContract, model: string, args: any) {
        args = clone(args);

        await this.injectCreateHierarchy(model, args);
        this.injectSelectIncludeHierarchy(model, args);

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`create\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].create(args);
        return this.assembleHierarchy(model, result);
    }

    private async injectCreateHierarchy(model: string, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            create: (model, args, _context) => {
                this.doProcessCreatePayload(model, args);
            },

            createMany: (model, args, context) => {
                // `createMany` doesn't support nested create, which is needed for creating entities
                // inheriting a delegate base, so we need to convert it to a regular `create` here.
                // Note that the main difference is `create` doesn't support `skipDuplicates` as
                // `createMany` does.

                if (this.isDelegateOrDescendantOfDelegate(model)) {
                    if (args.skipDuplicates) {
                        throw prismaClientValidationError(
                            this.prisma,
                            this.options.prismaModule,
                            '`createMany` with `skipDuplicates` set to true is not supported for delegated models'
                        );
                    }

                    // convert to regular `create`
                    let createPayload = context.parent.create ?? [];
                    if (!Array.isArray(createPayload)) {
                        createPayload = [createPayload];
                    }

                    for (const item of enumerate(args.data)) {
                        this.doProcessCreatePayload(model, item);
                        createPayload.push(item);
                    }
                    context.parent.create = createPayload;
                    delete context.parent['createMany'];
                }
            },
        });

        await visitor.visit(model, 'create', args);
    }

    private doProcessCreatePayload(model: string, args: any) {
        if (!args) {
            return;
        }

        this.ensureBaseCreateHierarchy(model, args);

        for (const [field, value] of Object.entries(args)) {
            const fieldInfo = resolveField(this.options.modelMeta, model, field);
            if (fieldInfo?.inheritedFrom) {
                this.injectBaseFieldData(model, fieldInfo, value, args, 'create');
                delete args[field];
            }
        }
    }

    // ensure the full nested "create" structure is created for base types
    private ensureBaseCreateHierarchy(model: string, args: any) {
        let curr = args;
        let base = this.getBaseModel(model);
        let sub = this.getModelInfo(model);

        while (base) {
            const baseRelationName = this.makeAuxRelationName(base);

            if (!curr[baseRelationName]) {
                curr[baseRelationName] = {};
            }
            if (!curr[baseRelationName].create) {
                curr[baseRelationName].create = {};
                if (base.discriminator) {
                    // set discriminator field
                    curr[baseRelationName].create[base.discriminator] = sub.name;
                }
            }

            // Look for base id field assignments in the current level, and push
            // them down to the base level
            for (const idField of getIdFields(this.options.modelMeta, base.name)) {
                if (curr[idField.name] !== undefined) {
                    curr[baseRelationName].create[idField.name] = curr[idField.name];
                    delete curr[idField.name];
                }
            }

            curr = curr[baseRelationName].create;
            sub = base;
            base = this.getBaseModel(base.name);
        }
    }

    // inject field data that belongs to base type into proper nesting structure
    private injectBaseFieldData(
        model: string,
        fieldInfo: FieldInfo,
        value: unknown,
        args: any,
        mode: 'create' | 'update'
    ) {
        let base = this.getBaseModel(model);
        let curr = args;

        while (base) {
            if (base.discriminator === fieldInfo.name) {
                throw prismaClientValidationError(
                    this.prisma,
                    this.options.prismaModule,
                    `fields "${fieldInfo.name}" is a discriminator and cannot be set directly`
                );
            }

            const baseRelationName = this.makeAuxRelationName(base);

            if (!curr[baseRelationName]) {
                curr[baseRelationName] = {};
            }
            if (!curr[baseRelationName][mode]) {
                curr[baseRelationName][mode] = {};
            }
            curr = curr[baseRelationName][mode];

            if (fieldInfo.inheritedFrom === base.name) {
                curr[fieldInfo.name] = value;
                break;
            }

            base = this.getBaseModel(base.name);
        }
    }

    // #endregion

    // #region update

    override update(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'data field is required in query argument'
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.update(args);
        }

        return this.queryUtils.transaction(this.prisma, (tx) => this.doUpdate(tx, this.model, args));
    }

    override async updateMany(args: any): Promise<{ count: number }> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.data) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'data field is required in query argument'
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.updateMany(args);
        }

        const simpleUpdateMany = Object.keys(args.data).every((key) => {
            // check if the `data` clause involves base fields
            const fieldInfo = resolveField(this.options.modelMeta, this.model, key);
            return !fieldInfo?.inheritedFrom;
        });

        return this.queryUtils.transaction(this.prisma, (tx) =>
            this.doUpdateMany(tx, this.model, args, simpleUpdateMany)
        );
    }

    override async upsert(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!args.where) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                'where field is required in query argument'
            );
        }

        if (isDelegateModel(this.options.modelMeta, this.model)) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                `Model "${this.model}" is a delegate and doesn't support upsert`
            );
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.upsert(args);
        }

        args = clone(args);
        this.injectWhereHierarchy(this.model, (args as any)?.where);
        this.injectSelectIncludeHierarchy(this.model, args);
        if (args.create) {
            this.doProcessCreatePayload(this.model, args.create);
        }
        if (args.update) {
            this.doProcessUpdatePayload(this.model, args.update);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`upsert\` ${this.getModelName(this.model)}: ${formatObject(args)}`);
        }
        const result = await this.prisma[this.model].upsert(args);
        return this.assembleHierarchy(this.model, result);
    }

    private async doUpdate(db: CrudContract, model: string, args: any): Promise<unknown> {
        args = clone(args);

        await this.injectUpdateHierarchy(db, model, args);
        this.injectSelectIncludeHierarchy(model, args);

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`update\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].update(args);
        return this.assembleHierarchy(model, result);
    }

    private async doUpdateMany(
        db: CrudContract,
        model: string,
        args: any,
        simpleUpdateMany: boolean
    ): Promise<{ count: number }> {
        if (simpleUpdateMany) {
            // do a direct `updateMany`
            args = clone(args);
            await this.injectUpdateHierarchy(db, model, args);

            if (this.options.logPrismaQuery) {
                this.logger.info(`[delegate] \`updateMany\` ${this.getModelName(model)}: ${formatObject(args)}`);
            }
            return db[model].updateMany(args);
        } else {
            // translate to plain `update` for nested write into base fields
            const findArgs = {
                where: clone(args.where),
                select: this.queryUtils.makeIdSelection(model),
            };
            await this.injectUpdateHierarchy(db, model, findArgs);
            if (this.options.logPrismaQuery) {
                this.logger.info(
                    `[delegate] \`updateMany\` find candidates: ${this.getModelName(model)}: ${formatObject(findArgs)}`
                );
            }
            const entities = await db[model].findMany(findArgs);

            const updatePayload = { data: clone(args.data), select: this.queryUtils.makeIdSelection(model) };
            await this.injectUpdateHierarchy(db, model, updatePayload);
            const result = await Promise.all(
                entities.map((entity) => {
                    const updateArgs = {
                        where: entity,
                        ...updatePayload,
                    };
                    if (this.options.logPrismaQuery) {
                        this.logger.info(
                            `[delegate] \`updateMany\` update: ${this.getModelName(model)}: ${formatObject(updateArgs)}`
                        );
                    }
                    return db[model].update(updateArgs);
                })
            );
            return { count: result.length };
        }
    }

    private async injectUpdateHierarchy(db: CrudContract, model: string, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            update: (model, args, _context) => {
                this.injectWhereHierarchy(model, (args as any)?.where);
                this.doProcessUpdatePayload(model, (args as any)?.data);
            },

            updateMany: async (model, args, context) => {
                let simpleUpdateMany = Object.keys(args.data).every((key) => {
                    // check if the `data` clause involves base fields
                    const fieldInfo = resolveField(this.options.modelMeta, model, key);
                    return !fieldInfo?.inheritedFrom;
                });

                if (simpleUpdateMany) {
                    // check if the `where` clause involves base fields
                    simpleUpdateMany = Object.keys(args.where || {}).every((key) => {
                        const fieldInfo = resolveField(this.options.modelMeta, model, key);
                        return !fieldInfo?.inheritedFrom;
                    });
                }

                if (simpleUpdateMany) {
                    this.injectWhereHierarchy(model, (args as any)?.where);
                    this.doProcessUpdatePayload(model, (args as any)?.data);
                } else {
                    const where = this.queryUtils.buildReversedQuery(context, false, false);
                    await this.queryUtils.transaction(db, async (tx) => {
                        await this.doUpdateMany(tx, model, { ...args, where }, simpleUpdateMany);
                    });
                    delete context.parent['updateMany'];
                }
            },

            upsert: (model, args, _context) => {
                this.injectWhereHierarchy(model, (args as any)?.where);
                if (args.create) {
                    this.doProcessCreatePayload(model, (args as any)?.create);
                }
                if (args.update) {
                    this.doProcessUpdatePayload(model, (args as any)?.update);
                }
            },

            create: (model, args, _context) => {
                if (isDelegateModel(this.options.modelMeta, model)) {
                    throw prismaClientValidationError(
                        this.prisma,
                        this.options.prismaModule,
                        `Model "${model}" is a delegate and cannot be created directly`
                    );
                }
                this.doProcessCreatePayload(model, args);
            },

            createMany: (model, args, _context) => {
                if (args.skipDuplicates) {
                    throw prismaClientValidationError(
                        this.prisma,
                        this.options.prismaModule,
                        '`createMany` with `skipDuplicates` set to true is not supported for delegated models'
                    );
                }

                for (const item of enumerate(args?.data)) {
                    this.doProcessCreatePayload(model, item);
                }
            },

            connect: (model, args, _context) => {
                this.injectWhereHierarchy(model, args);
            },

            connectOrCreate: (model, args, _context) => {
                this.injectWhereHierarchy(model, args.where);
                if (args.create) {
                    this.doProcessCreatePayload(model, args.create);
                }
            },

            disconnect: (model, args, _context) => {
                this.injectWhereHierarchy(model, args);
            },

            set: (model, args, _context) => {
                this.injectWhereHierarchy(model, args);
            },

            delete: async (model, _args, context) => {
                const where = this.queryUtils.buildReversedQuery(context, false, false);
                await this.queryUtils.transaction(db, async (tx) => {
                    await this.doDelete(tx, model, { where });
                });
                delete context.parent['delete'];
            },

            deleteMany: async (model, _args, context) => {
                const where = this.queryUtils.buildReversedQuery(context, false, false);
                await this.queryUtils.transaction(db, async (tx) => {
                    await this.doDeleteMany(tx, model, where);
                });
                delete context.parent['deleteMany'];
            },
        });

        await visitor.visit(model, 'update', args);
    }

    private doProcessUpdatePayload(model: string, data: any) {
        if (!data) {
            return;
        }

        for (const [field, value] of Object.entries(data)) {
            const fieldInfo = resolveField(this.options.modelMeta, model, field);
            if (fieldInfo?.inheritedFrom) {
                this.injectBaseFieldData(model, fieldInfo, value, data, 'update');
                delete data[field];
            }
        }
    }

    // #endregion

    // #region delete

    override delete(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }

        if (!this.involvesDelegateModel(this.model)) {
            return super.delete(args);
        }

        return this.queryUtils.transaction(this.prisma, async (tx) => {
            const selectInclude = this.buildSelectIncludeHierarchy(this.model, args);

            // make sure id fields are selected
            const idFields = this.getIdFields(this.model);
            for (const idField of idFields) {
                if (selectInclude?.select && !(idField.name in selectInclude.select)) {
                    selectInclude.select[idField.name] = true;
                }
            }

            const deleteArgs = { ...clone(args), ...selectInclude };
            return this.doDelete(tx, this.model, deleteArgs);
        });
    }

    override deleteMany(args: any): Promise<{ count: number }> {
        if (!this.involvesDelegateModel(this.model)) {
            return super.deleteMany(args);
        }

        return this.queryUtils.transaction(this.prisma, (tx) => this.doDeleteMany(tx, this.model, args?.where));
    }

    private async doDeleteMany(db: CrudContract, model: string, where: any): Promise<{ count: number }> {
        // query existing entities with id
        const idSelection = this.queryUtils.makeIdSelection(model);
        const findArgs = { where: clone(where), select: idSelection };
        this.injectWhereHierarchy(model, findArgs.where);

        if (this.options.logPrismaQuery) {
            this.logger.info(
                `[delegate] \`deleteMany\` find candidates: ${this.getModelName(model)}: ${formatObject(findArgs)}`
            );
        }
        const entities = await db[model].findMany(findArgs);

        // recursively delete base entities (they all have the same id values)
        await Promise.all(entities.map((entity) => this.doDelete(db, model, { where: entity })));

        return { count: entities.length };
    }

    private async deleteBaseRecursively(db: CrudContract, model: string, idValues: any) {
        let base = this.getBaseModel(model);
        while (base) {
            await db[base.name].delete({ where: idValues });
            base = this.getBaseModel(base.name);
        }
    }

    private async doDelete(db: CrudContract, model: string, args: any): Promise<unknown> {
        this.injectWhereHierarchy(model, args.where);

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`delete\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].delete(args);
        const idValues = this.queryUtils.getEntityIds(model, result);

        // recursively delete base entities (they all have the same id values)
        await this.deleteBaseRecursively(db, model, idValues);
        return this.assembleHierarchy(model, result);
    }

    // #endregion

    // #region aggregation

    override aggregate(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!this.involvesDelegateModel(this.model)) {
            return super.aggregate(args);
        }

        // check if any aggregation operator is using fields from base
        this.checkAggregationArgs('aggregate', args);

        args = clone(args);

        if (args.cursor) {
            this.injectWhereHierarchy(this.model, args.cursor);
        }

        if (args.orderBy) {
            this.injectWhereHierarchy(this.model, args.orderBy);
        }

        if (args.where) {
            this.injectWhereHierarchy(this.model, args.where);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`aggregate\` ${this.getModelName(this.model)}: ${formatObject(args)}`);
        }
        return super.aggregate(args);
    }

    override count(args: any): Promise<unknown> {
        if (!this.involvesDelegateModel(this.model)) {
            return super.count(args);
        }

        // check if count select is using fields from base
        this.checkAggregationArgs('count', args);

        args = clone(args);

        if (args?.cursor) {
            this.injectWhereHierarchy(this.model, args.cursor);
        }

        if (args?.where) {
            this.injectWhereHierarchy(this.model, args.where);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`count\` ${this.getModelName(this.model)}: ${formatObject(args)}`);
        }
        return super.count(args);
    }

    override groupBy(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!this.involvesDelegateModel(this.model)) {
            return super.groupBy(args);
        }

        // check if count select is using fields from base
        this.checkAggregationArgs('groupBy', args);

        if (args.by) {
            for (const by of enumerate(args.by)) {
                const fieldInfo = resolveField(this.options.modelMeta, this.model, by);
                if (fieldInfo && fieldInfo.inheritedFrom) {
                    throw prismaClientValidationError(
                        this.prisma,
                        this.options.prismaModule,
                        `groupBy with fields from base type is not supported yet: "${by}"`
                    );
                }
            }
        }

        args = clone(args);

        if (args.where) {
            this.injectWhereHierarchy(this.model, args.where);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`groupBy\` ${this.getModelName(this.model)}: ${formatObject(args)}`);
        }
        return super.groupBy(args);
    }

    private checkAggregationArgs(operation: 'aggregate' | 'count' | 'groupBy', args: any) {
        if (!args) {
            return;
        }

        for (const op of ['_count', '_sum', '_avg', '_min', '_max', 'select', 'having']) {
            if (args[op] && typeof args[op] === 'object') {
                for (const field of Object.keys(args[op])) {
                    const fieldInfo = resolveField(this.options.modelMeta, this.model, field);
                    if (fieldInfo?.inheritedFrom) {
                        throw prismaClientValidationError(
                            this.prisma,
                            this.options.prismaModule,
                            `${operation} with fields from base type is not supported yet: "${field}"`
                        );
                    }
                }
            }
        }
    }

    // #endregion

    // #region utils

    private extractSelectInclude(args: any) {
        if (!args) {
            return undefined;
        }
        args = clone(args);
        return 'select' in args
            ? { select: args['select'] }
            : 'include' in args
            ? { include: args['include'] }
            : undefined;
    }

    private makeAuxRelationName(model: ModelInfo) {
        return `${DELEGATE_AUX_RELATION_PREFIX}_${lowerCaseFirst(model.name)}`;
    }

    private getModelName(model: string) {
        const info = getModelInfo(this.options.modelMeta, model, true);
        return info.name;
    }

    private getIdFields(model: string): FieldInfo[] {
        const idFields = getIdFields(this.options.modelMeta, model);
        if (idFields && idFields.length > 0) {
            return idFields;
        }
        const base = this.getBaseModel(model);
        return base ? this.getIdFields(base.name) : [];
    }

    private getModelInfo(model: string) {
        return getModelInfo(this.options.modelMeta, model, true);
    }

    private getBaseModel(model: string) {
        const baseNames = getModelInfo(this.options.modelMeta, model, true).baseTypes;
        if (!baseNames) {
            return undefined;
        }
        if (baseNames.length > 1) {
            throw new Error('Multi-inheritance is not supported');
        }
        return this.options.modelMeta.models[lowerCaseFirst(baseNames[0])];
    }

    private involvesDelegateModel(model: string, visited?: Set<string>): boolean {
        if (this.isDelegateOrDescendantOfDelegate(model)) {
            return true;
        }

        visited = visited ?? new Set<string>();
        if (visited.has(model)) {
            return false;
        }
        visited.add(model);

        const modelInfo = getModelInfo(this.options.modelMeta, model, true);
        return Object.values(modelInfo.fields).some(
            (field) => field.isDataModel && this.involvesDelegateModel(field.type, visited)
        );
    }

    private isDelegateOrDescendantOfDelegate(model: string): boolean {
        if (isDelegateModel(this.options.modelMeta, model)) {
            return true;
        }
        const baseTypes = getModelInfo(this.options.modelMeta, model)?.baseTypes;
        return !!(
            baseTypes &&
            baseTypes.length > 0 &&
            baseTypes.some((base) => this.isDelegateOrDescendantOfDelegate(base))
        );
    }

    private assembleHierarchy(model: string, entity: any) {
        if (!entity || typeof entity !== 'object') {
            return entity;
        }

        const upMerged = this.assembleUp(model, entity);
        const downMerged = this.assembleDown(model, entity);

        // https://www.npmjs.com/package/deepmerge#arraymerge-example-combine-arrays
        const combineMerge = (target: any[], source: any[], options: ArrayMergeOptions) => {
            const destination = target.slice();
            source.forEach((item, index) => {
                if (typeof destination[index] === 'undefined') {
                    destination[index] = options.cloneUnlessOtherwiseSpecified(item, options);
                } else if (options.isMergeableObject(item)) {
                    destination[index] = deepmerge(target[index], item, options);
                } else if (target.indexOf(item) === -1) {
                    destination.push(item);
                }
            });
            return destination;
        };

        const result = deepmerge(upMerged, downMerged, {
            arrayMerge: combineMerge,
            isMergeableObject: (v) => isPlainObject(v) || Array.isArray(v), // avoid messing with Decimal, Date, etc.
        });
        return result;
    }

    private assembleUp(model: string, entity: any) {
        if (!entity) {
            return entity;
        }

        const result: any = {};
        const base = this.getBaseModel(model);

        if (base) {
            // merge base fields
            const baseRelationName = this.makeAuxRelationName(base);
            const baseData = entity[baseRelationName];
            if (baseData && typeof baseData === 'object') {
                const baseAssembled = this.assembleUp(base.name, baseData);
                Object.assign(result, baseAssembled);
            }
        }

        const modelInfo = getModelInfo(this.options.modelMeta, model, true);

        for (const [key, value] of Object.entries(entity)) {
            if (key.startsWith(DELEGATE_AUX_RELATION_PREFIX)) {
                continue;
            }

            const field = modelInfo.fields[key];
            if (!field) {
                // not a field, could be `_count`, `_sum`, etc.
                result[key] = value;
                continue;
            }

            if (field.inheritedFrom) {
                // already merged from base
                continue;
            }

            if (field.isDataModel) {
                if (Array.isArray(value)) {
                    result[field.name] = value.map((item) => this.assembleUp(field.type, item));
                } else {
                    result[field.name] = this.assembleUp(field.type, value);
                }
            } else {
                result[field.name] = value;
            }
        }

        return result;
    }

    private assembleDown(model: string, entity: any) {
        if (!entity) {
            return entity;
        }

        const result: any = {};
        const modelInfo = getModelInfo(this.options.modelMeta, model, true);

        if (modelInfo.discriminator) {
            // model is a delegate, merge sub model fields
            const subModelName = entity[modelInfo.discriminator];
            if (subModelName) {
                const subModel = getModelInfo(this.options.modelMeta, subModelName, true);
                const subRelationName = this.makeAuxRelationName(subModel);
                const subData = entity[subRelationName];
                if (subData && typeof subData === 'object') {
                    const subAssembled = this.assembleDown(subModel.name, subData);
                    Object.assign(result, subAssembled);
                }
            }
        }

        for (const [key, value] of Object.entries(entity)) {
            if (key.startsWith(DELEGATE_AUX_RELATION_PREFIX)) {
                continue;
            }

            const field = modelInfo.fields[key];
            if (!field) {
                // not a field, could be `_count`, `_sum`, etc.
                result[key] = value;
                continue;
            }

            if (field.isDataModel) {
                if (Array.isArray(value)) {
                    result[field.name] = value.map((item) => this.assembleDown(field.type, item));
                } else {
                    result[field.name] = this.assembleDown(field.type, value);
                }
            } else {
                result[field.name] = value;
            }
        }

        return result;
    }

    // #endregion
}
