/* eslint-disable @typescript-eslint/no-explicit-any */
import deepcopy from 'deepcopy';
import { FieldInfo, ModelInfo, getIdFields } from '../cross';
import { DbClientContract, DbOperations } from '../types';
import { EnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, makeProxy } from './proxy';
import { prismaClientValidationError } from './utils';

export function withDelegate<DbClient extends object>(prisma: DbClient, options: EnhancementOptions): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new DelegateProxyHandler(_prisma as DbClientContract, model, options),
        'delegate'
    );
}

export class DelegateProxyHandler extends DefaultPrismaProxyHandler {
    private readonly delegateModels: Record<string, ModelInfo> = {};
    private readonly concreteModels: Record<string, ModelInfo[]> = {};

    constructor(prisma: DbClientContract, model: string, options: EnhancementOptions) {
        super(prisma, model, options);

        Object.entries(this.options.modelMeta.models).forEach(([model, info]) => {
            if (info.attributes?.some((attr) => attr.name === '@@delegate')) {
                this.delegateModels[model] = info;
            } else {
                if (info.baseTypes && info.baseTypes.length > 0) {
                    this.concreteModels[model] = info.baseTypes.map((base) => this.options.modelMeta.models[base]);
                }
            }
        });
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

        if (this.model in this.delegateModels) {
            throw prismaClientValidationError(
                this.prisma,
                this.options.prismaModule,
                `Model ${this.model} is a delegate and cannot be created directly`
            );
        }

        if (this.model in this.concreteModels) {
            // deal with creating base models
            return this.transaction((tx) => {
                const selectInclude = this.extractSelectInclude(args);
                return this.createHierarchy(tx, this.model, args.data, selectInclude);
            });
        }

        return super.create(args);
    }

    private extractSelectInclude(args: any) {
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
        const bases = this.concreteModels[model];
        if (!bases || bases.length === 0) {
            return tx[model].create(data);
        }
        if (bases.length > 1) {
            throw new Error('Multi-inheritance is not supported');
        }

        const thisData = deepcopy(data);
        let thisSelectInclude: any = undefined;
        const baseData: any = {};
        let baseSelectInclude: any = undefined;

        const base = bases[0];
        Object.entries(data).forEach(([field, value]) => {
            if (field in base.fields) {
                baseData[field] = value;
                delete thisData[field];
            }
        });

        if (selectInclude) {
            thisSelectInclude = deepcopy(selectInclude);
            baseSelectInclude = {};
            const key = 'select' in selectInclude ? 'select' : 'include';
            Object.entries(selectInclude[key]).forEach(([field, value]) => {
                if (field in base.fields) {
                    baseSelectInclude[key] = { ...baseSelectInclude[key], field: value };
                    delete thisSelectInclude[key][field];
                }
            });
        }

        const baseEntity = await this.createHierarchy(tx, base.name, baseData, baseSelectInclude);

        const idFields = this.getIdFields(base.name);
        idFields.forEach((f) => (thisData[f.name] = baseEntity[f.name]));
        const thisEntity = await tx[model].create({ data: thisData, ...selectInclude });

        return { ...baseEntity, ...thisEntity };
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
        const baseNames = this.options.modelMeta.models[model].baseTypes;
        if (!baseNames) {
            return undefined;
        }
        if (baseNames.length > 1) {
            throw new Error('Multi-inheritance is not supported');
        }
        return this.options.modelMeta.models[baseNames[0]];
    }
}
