/* eslint-disable @typescript-eslint/no-explicit-any */
import deepcopy from 'deepcopy';
import { lowerCaseFirst } from 'lower-case-first';
import { upperCaseFirst } from 'upper-case-first';
import { DELEGATE_AUX_RELATION_PREFIX } from '../constants';
import {
    FieldInfo,
    ModelInfo,
    enumerate,
    getIdFields,
    getModelInfo,
    getUniqueConstraints,
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

        if (this.isDelegate(this.model)) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                `Model ${this.model} is a delegate and cannot be created directly`
            );
        }

        if (!this.hasBaseModel(this.model)) {
            return super.create(args);
        }

        // deal with creating base models
        return this.transaction((tx) => {
            const selectInclude = this.extractSelectInclude(args);
            return this.createHierarchy(tx, this.model, args.data, selectInclude);
        });
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

        return this.transaction(async (tx) => {
            const r = await Promise.all(
                enumerate(args.data).map(async (item) => {
                    if (args.skipDuplicates) {
                        const uniqueConstraints = getUniqueConstraints(this.options.modelMeta, this.model);
                        if (uniqueConstraints) {
                            for (const constraint of Object.values(uniqueConstraints)) {
                                if (constraint.fields.every((f) => item[f] !== undefined)) {
                                    const uniqueFilter = constraint.fields.reduce(
                                        (acc, f) => ({ ...acc, [f]: item[f] }),
                                        {}
                                    );

                                    if (this.options.logPrismaQuery) {
                                        this.logger.info(
                                            `[delegate] checking ${
                                                this.model
                                            } existence: \`findUnique\`:\n${formatObject(uniqueFilter)}`
                                        );
                                    }
                                    const existing = await this.prisma[this.model].findUnique(uniqueFilter);
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
                    return this.createHierarchy(tx, this.model, item, undefined);
                })
            );
            return { count: r.length };
        });
    }

    override async findFirst(args: any): Promise<unknown> {
        if (!this.hasBaseModel(this.model)) {
            return super.findFirst(args);
        }

        const selectInclude: any = this.extractSelectInclude(args) || {};
        if (selectInclude.select && typeof selectInclude.select === 'object') {
            Object.entries(selectInclude.select).forEach(([field, value]) => {
                if (value) {
                    if (this.injectBaseFieldSelect(this.model, field, selectInclude)) {
                        delete selectInclude.select[field];
                    }
                }
            });
        } else {
            this.injectBaseInclude(this.model, selectInclude);
        }

        const findArgs = { ...args, ...selectInclude };
        if (this.options.logPrismaQuery) {
            this.logger.info(`[delegate] \`findFirst\` ${this.model}: ${formatObject(findArgs)}`);
        }
        const entity = await this.prisma[this.model].findFirst(findArgs);

        this.assembleHierarchy(this.model, entity);

        return entity;
    }

    private injectBaseFieldSelect(model: string, field: string, selectInclude: any) {
        const fieldInfo = resolveField(this.options.modelMeta, model, field);
        if (!fieldInfo?.inheritedFrom) {
            return false;
        }

        let base = this.getBaseModel(model);
        let target = selectInclude;
        while (base) {
            const baseRelationName = this.makeBaseRelationName(base);

            // prepare base layer select/include
            let selectOrInclude = 'select';
            let thisLayer: any;
            if (target.include) {
                selectOrInclude = 'include';
                thisLayer = target.include;
            } else if (target.select) {
                selectOrInclude = 'select';
                thisLayer = target.select;
            } else {
                selectInclude = 'include';
                thisLayer = target.include = {};
            }

            if (!thisLayer[baseRelationName]) {
                thisLayer[baseRelationName] = { select: {} };
            }

            if (base.name === fieldInfo.inheritedFrom) {
                if (selectOrInclude === 'select') {
                    thisLayer[baseRelationName].select[field] = true;
                }
                break;
            } else {
                target = thisLayer[baseRelationName];
                base = this.getBaseModel(base.name);
            }
        }

        return true;
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
    }

    private injectBaseInclude(model: string, selectInclude: any) {
        const base = this.getBaseModel(model);
        if (!base) {
            return;
        }
        const baseRelationName = this.makeBaseRelationName(base);
        selectInclude.include = { ...selectInclude.include, [baseRelationName]: {} };
        this.injectBaseInclude(base.name, selectInclude.include[baseRelationName]);
    }

    private extractSelectInclude(args: any) {
        if (!args) {
            return undefined;
        }
        return 'select' in args
            ? { select: args['select'] }
            : 'include' in args
            ? { include: args['include'] }
            : undefined;
    }

    private async createHierarchy(
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

        const baseEntity = await this.createHierarchy(tx, base.name, baseData, baseSelectInclude);
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

        // exclude base fk fields
        idFields.forEach((f) => delete thisEntity[`${lowerCaseFirst(base.name)}${upperCaseFirst(f.name)}`]);

        return { ...baseEntity, ...thisEntity };
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
        return !!(baseTypes && baseTypes.length > 0 && baseTypes.some((base) => this.isDelegate(base)));
    }

    private isDelegate(model: string) {
        return !!getModelInfo(this.options.modelMeta, model, true).attributes?.some(
            (attr) => attr.name === '@@delegate'
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
}
