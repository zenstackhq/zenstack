/* eslint-disable @typescript-eslint/no-explicit-any */
import deepcopy from 'deepcopy';
import { lowerCaseFirst } from 'lower-case-first';
import { DELEGATE_AUX_RELATION_PREFIX } from '../constants';
import {
    FieldInfo,
    ModelInfo,
    enumerate,
    getIdFields,
    getModelInfo,
    getUniqueConstraints,
    isDelegateModel,
    resolveField,
} from '../cross';
import { DbClientContract, DbOperations } from '../types';
import { EnhancementOptions } from './create-enhancement';
import { Logger } from './logger';
import { DefaultPrismaProxyHandler, makeProxy } from './proxy';
import { formatObject, prismaClientValidationError } from './utils';

export function withDelegate<DbClient extends object>(prisma: DbClient, options: EnhancementOptions): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new DelegateProxyHandler(_prisma as DbClientContract, model, options),
        'delegate'
    );
}

export class DelegateProxyHandler extends DefaultPrismaProxyHandler {
    private readonly logger: Logger;

    constructor(prisma: DbClientContract, model: string, options: EnhancementOptions) {
        super(prisma, model, options);
        this.logger = new Logger(prisma);
    }

    // #region create

    override create(args: any): Promise<unknown> {
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
                `Model ${this.model} is a delegate and cannot be created directly`
            );
        }

        if (!this.hasBaseModel(this.model)) {
            return super.create(args);
        }

        args = deepcopy(args);
        const selectInclude = this.buildSelectIncludeHierarchy(args);
        const dataHierarchy = this.makeCreateUpdateHierarchy(this.model, args.data, 'create');

        return this.doCreate(this.prisma, this.model, { ...args, data: dataHierarchy, ...selectInclude });
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

        if (!this.hasBaseModel(this.model)) {
            return super.createMany(args);
        }

        // note that we can't call `createMany` directly because it doesn't support
        // nested created, which is needed for creating base entities
        return this.transaction(async (tx) => {
            const r = await Promise.all(
                enumerate(args.data).map(async (item) => {
                    if (args.skipDuplicates) {
                        if (await this.checkUniqueConstraintExistence(tx, this.model, item)) {
                            return undefined;
                        }
                    }
                    const dataHierarchy = this.makeCreateUpdateHierarchy(this.model, item, 'create');
                    return this.doCreate(tx, this.model, { ...item, ...dataHierarchy });
                })
            );

            // filter out undefined value (due to skipping duplicates)
            return { count: r.filter((item) => !!item).length };
        });
    }

    private async checkUniqueConstraintExistence(db: Record<string, DbOperations>, model: string, item: any) {
        const uniqueConstraints = getUniqueConstraints(this.options.modelMeta, model);
        if (uniqueConstraints) {
            for (const constraint of Object.values(uniqueConstraints)) {
                if (constraint.fields.every((f) => item[f] !== undefined)) {
                    const uniqueFilter = constraint.fields.reduce((acc, f) => ({ ...acc, [f]: item[f] }), {});

                    if (this.options.logPrismaQuery) {
                        this.logger.info(
                            `[delegate] checking ${model} existence: \`findUnique\`:\n${formatObject(uniqueFilter)}`
                        );
                    }
                    const existing = await db[model].findUnique(uniqueFilter);
                    if (existing) {
                        if (this.options.logPrismaQuery) {
                            this.logger.info(`[delegate] skipping duplicate ${formatObject(item)}`);
                        }
                        return undefined;
                    }
                }
            }
        }
    }

    private async doCreate(db: Record<string, DbOperations>, model: string, args: any) {
        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`create\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].create(args);
        return this.assembleHierarchy(model, result);
    }

    private makeCreateUpdateHierarchy(model: string, data: any, mode: 'create' | 'update') {
        const result: any = {};

        for (const [field, value] of Object.entries(data)) {
            const fieldInfo = resolveField(this.options.modelMeta, model, field);
            if (!fieldInfo?.inheritedFrom) {
                result[field] = value;
                continue;
            }
            this.injectBaseFieldData(fieldInfo, value, result, mode);
        }

        return result;
    }

    private injectBaseFieldData(fieldInfo: FieldInfo, value: unknown, result: any, mode: 'create' | 'update') {
        let base = this.getBaseModel(this.model);
        let sub = this.getModelInfo(this.model);
        let curr = result;
        while (base) {
            if (base.discriminator === fieldInfo.name) {
                throw prismaClientValidationError(
                    this.prisma,
                    this.options.prismaModule,
                    `fields "${fieldInfo.name}" is a discriminator and cannot be set directly`
                );
            }

            const baseRelationName = this.makeBaseRelationName(base);

            if (!curr[baseRelationName]) {
                curr[baseRelationName] = {};
            }
            if (!curr[baseRelationName][mode]) {
                curr[baseRelationName][mode] = {};
                if (mode === 'create' && base.discriminator) {
                    // set discriminator field
                    curr[baseRelationName][mode][base.discriminator] = sub.name;
                }
            }
            curr = curr[baseRelationName][mode];

            if (fieldInfo.inheritedFrom === base.name) {
                curr[fieldInfo.name] = value;
                break;
            }

            sub = base;
            base = this.getBaseModel(base.name);
        }
    }

    // #endregion

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
        db: Record<string, DbOperations>,
        model: string,
        method: 'findFirst' | 'findFirstOrThrow' | 'findUnique' | 'findUniqueOrThrow' | 'findMany',
        args: any
    ) {
        if (!this.hasBaseModel(model)) {
            return super[method](args);
        }

        const where = this.buildWhereHierarchy(args?.where);
        const selectInclude = this.buildSelectIncludeHierarchy(args);
        const findArgs = { ...args, where, ...selectInclude };

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`${method}\` ${this.getModelName(model)}: ${formatObject(findArgs)}`);
        }
        const entity = await db[model][method](findArgs);

        for (const item of enumerate(entity)) {
            this.assembleHierarchy(model, item);
        }

        return entity;
    }

    private buildWhereHierarchy(where: any) {
        if (!where) {
            return undefined;
        }

        where = deepcopy(where);
        Object.entries(where).forEach(([field, value]) => {
            const fieldInfo = resolveField(this.options.modelMeta, this.model, field);
            if (!fieldInfo?.inheritedFrom) {
                return;
            }

            let base = this.getBaseModel(this.model);
            let target = where;

            while (base) {
                const baseRelationName = this.makeBaseRelationName(base);

                // prepare base layer where
                let thisLayer: any;
                if (target[baseRelationName]) {
                    thisLayer = target[baseRelationName];
                } else {
                    thisLayer = target[baseRelationName] = {};
                }

                if (base.name === fieldInfo.inheritedFrom) {
                    thisLayer[field] = value;
                    delete where[field];
                    break;
                } else {
                    target = thisLayer;
                    base = this.getBaseModel(base.name);
                }
            }
        });

        return where;
    }

    private buildSelectIncludeHierarchy(args: any) {
        args = deepcopy(args);
        const selectInclude: any = this.extractSelectInclude(args) || {};

        if (selectInclude.select && typeof selectInclude.select === 'object') {
            Object.entries(selectInclude.select).forEach(([field, value]) => {
                if (value) {
                    if (this.injectBaseFieldSelect(this.model, field, value, selectInclude, 'select')) {
                        delete selectInclude.select[field];
                    }
                }
            });
        } else if (selectInclude.include && typeof selectInclude.include === 'object') {
            Object.entries(selectInclude.include).forEach(([field, value]) => {
                if (value) {
                    if (this.injectBaseFieldSelect(this.model, field, value, selectInclude, 'include')) {
                        delete selectInclude.include[field];
                    }
                }
            });
        }

        if (!selectInclude.select) {
            this.injectBaseIncludeRecursively(this.model, selectInclude);
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
            const baseRelationName = this.makeBaseRelationName(base);

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
        const baseRelationName = this.makeBaseRelationName(base);

        if (selectInclude.select) {
            selectInclude.include = { [baseRelationName]: {}, ...selectInclude.select };
            delete selectInclude.select;
        } else {
            selectInclude.include = { [baseRelationName]: {}, ...selectInclude.include };
        }
        this.injectBaseIncludeRecursively(base.name, selectInclude.include[baseRelationName]);
    }

    // #endregion

    // #region

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

        if (!this.hasBaseModel(this.model)) {
            return super.update(args);
        }

        const selectInclude = this.buildSelectIncludeHierarchy(args);
        const dataHierarchy = this.makeCreateUpdateHierarchy(this.model, args.data, 'update');

        return this.doUpdate(this.prisma, this.model, { ...args, data: dataHierarchy, ...selectInclude });
    }

    override updateMany(args: any): Promise<{ count: number }> {
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

        if (!this.hasBaseModel(this.model)) {
            return super.updateMany(args);
        }

        return this.transaction(async (tx) => {
            const r = await Promise.all(
                enumerate(args.data).map(async (item) => {
                    const dataHierarchy = this.makeCreateUpdateHierarchy(this.model, item, 'update');
                    return this.doUpdate(tx, this.model, { ...item, ...dataHierarchy });
                })
            );

            return { count: r.length };
        });
    }

    private async doUpdate(db: Record<string, DbOperations>, model: string, args: any): Promise<unknown> {
        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`update\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].update(args);
        return this.assembleHierarchy(model, result);
    }

    // #endregion

    // #region delete

    override delete(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }

        if (!this.hasBaseModel(this.model)) {
            return super.delete(args);
        }

        return this.prisma.$transaction(async (tx) => {
            const selectInclude = this.buildSelectIncludeHierarchy(args);

            // make sure id fields are selected
            const idFields = this.getIdFields(this.model);
            for (const idField of idFields) {
                if (selectInclude?.select && !(idField.name in selectInclude.select)) {
                    selectInclude.select[idField.name] = true;
                }
            }

            const entity: any = await this.doDelete(tx, this.model, { ...args, ...selectInclude });
            const idValues = idFields.reduce((acc, f) => ({ ...acc, [f.name]: entity[f.name] }), {});

            // recursively delete base entities (they all have the same id values)
            await this.deleteBaseRecursively(tx, idValues);

            return entity;
        });
    }

    override deleteMany(args: any): Promise<{ count: number }> {
        if (!this.hasBaseModel(this.model)) {
            return super.deleteMany(args);
        }

        return this.prisma.$transaction(async (tx) => {
            const idFields = this.getIdFields(this.model);
            // build id field selection
            const idSelection = Object.assign({}, ...idFields.map((f) => ({ [f.name]: true })));
            // query existing entities with id
            const entities = await tx[this.model].findMany({ where: args?.where, select: idSelection });

            // recursively delete base entities (they all have the same id values)
            await Promise.all(
                entities.map((entity) => {
                    const idValues = idFields.reduce((acc, f) => ({ ...acc, [f.name]: entity[f.name] }), {});
                    return this.deleteBaseRecursively(tx, idValues);
                })
            );

            return { count: entities.length };
        });
    }

    private async deleteBaseRecursively(db: Record<string, DbOperations>, idValues: any) {
        let base = this.getBaseModel(this.model);
        while (base) {
            await this.doDelete(db, base.name, { where: idValues });
            base = this.getBaseModel(base.name);
        }
    }

    private async doDelete(db: Record<string, DbOperations>, model: string, args: any): Promise<unknown> {
        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`delete\` ${this.getModelName(model)}: ${formatObject(args)}`);
        }
        const result = await db[model].delete(args);
        return this.assembleHierarchy(model, result);
    }

    // #endregion

    // #region aggregation

    override aggregate(args: any): Promise<unknown> {
        if (!args) {
            throw prismaClientValidationError(this.prisma, this.options.prismaModule, 'query argument is required');
        }
        if (!this.hasBaseModel(this.model)) {
            return super.aggregate(args);
        }

        // check if any aggregation operator is using fields from base
        this.checkAggregationArgs('aggregate', args);

        args = deepcopy(args);

        if (args.cursor) {
            args.cursor = this.buildWhereHierarchy(args.cursor);
        }

        if (args.orderBy) {
            args.orderBy = this.buildWhereHierarchy(args.orderBy);
        }

        if (args.where) {
            args.where = this.buildWhereHierarchy(args.where);
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`aggregate\` ${this.getModelName(this.model)}: ${formatObject(args)}`);
        }
        return super.aggregate(args);
    }

    override count(args: any): Promise<unknown> {
        if (!this.hasBaseModel(this.model)) {
            return super.count(args);
        }

        // check if count select is using fields from base
        this.checkAggregationArgs('count', args);

        args = deepcopy(args);

        if (args?.cursor) {
            args.cursor = this.buildWhereHierarchy(args.cursor);
        }

        if (args?.where) {
            args.where = this.buildWhereHierarchy(args.where);
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
        if (!this.hasBaseModel(this.model)) {
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

        args = deepcopy(args);

        if (args.where) {
            args.where = this.buildWhereHierarchy(args.where);
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
        args = deepcopy(args);
        return 'select' in args
            ? { select: args['select'] }
            : 'include' in args
            ? { include: args['include'] }
            : undefined;
    }

    private makeBaseRelationName(base: ModelInfo) {
        return `${DELEGATE_AUX_RELATION_PREFIX}_${lowerCaseFirst(base.name)}`;
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

    private hasBaseModel(model: string) {
        const baseTypes = getModelInfo(this.options.modelMeta, model, true).baseTypes;
        return !!(
            baseTypes &&
            baseTypes.length > 0 &&
            baseTypes.some((base) => isDelegateModel(this.options.modelMeta, base))
        );
    }

    private isUnsafeMutate(model: string, args: any) {
        if (!args) {
            return false;
        }
        for (const k of Object.keys(args)) {
            const field = resolveField(this.options.modelMeta, model, k);
            if (field?.isId || field?.isForeignKey) {
                return true;
            }
        }
        return false;
    }

    private assembleHierarchy(model: string, entity: any) {
        if (!entity) {
            return;
        }

        const base = this.getBaseModel(model);
        if (!base) {
            return;
        }

        const baseRelationName = this.makeBaseRelationName(base);
        const baseData = entity[baseRelationName];
        if (baseData && typeof baseData === 'object') {
            this.assembleHierarchy(base.name, baseData);
            Object.entries(baseData).forEach(([field, value]) => {
                if (!(field in entity)) {
                    entity[field] = value;
                }
            });
        }

        delete entity[baseRelationName];

        return entity;
    }

    // #endregion

    // #region backup

    private async _createHierarchy(
        tx: Record<string, DbOperations>,
        model: string,
        data: any,
        selectInclude: any
    ): Promise<any> {
        const base = this.getBaseModel(model);
        if (!base) {
            return tx[model].create({ data, ...selectInclude });
        }

        const thisData = deepcopy(data);
        let thisSelectInclude: any = undefined;
        const baseData: any = {};
        let baseSelectInclude: any = undefined;

        Object.entries(data).forEach(([field, value]) => {
            if (field in base.fields) {
                baseData[field] = value;
                delete thisData[field];
            }
        });
        if (base.discriminator) {
            baseData[base.discriminator] = this.getModelName(model);
        }

        const idFields = this.getIdFields(base.name);

        if (selectInclude) {
            thisSelectInclude = deepcopy(selectInclude);
            baseSelectInclude = {};
            const key = 'select' in selectInclude ? 'select' : 'include';
            Object.entries(selectInclude[key]).forEach(([field, value]) => {
                if (field in base.fields) {
                    baseSelectInclude[key] = { ...baseSelectInclude[key], [field]: value };
                    delete thisSelectInclude[key][field];
                }
            });

            if (baseSelectInclude.select) {
                // make sure id fields are selected
                idFields.forEach((f) => (baseSelectInclude.select[f.name] = true));
            }
        }

        const baseEntity = await this._createHierarchy(tx, base.name, baseData, baseSelectInclude);
        if (this.isUnsafeMutate(model, thisData)) {
            // insert fk fields
            idFields.forEach((f) => {
                thisData[f.name] = baseEntity[f.name];
            });
        } else {
            // insert base connect
            const baseIdValues: any = {};
            idFields.forEach((f) => (baseIdValues[f.name] = baseEntity[f.name]));
            const baseRelationName = this.makeBaseRelationName(base);
            thisData[baseRelationName] = { connect: baseIdValues };
        }

        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`create\` ${this.model}: ${formatObject(thisData)}`);
        }
        const thisEntity = await tx[model].create({ data: thisData, ...thisSelectInclude });

        return { ...baseEntity, ...thisEntity };
    }

    // #endregion
}
