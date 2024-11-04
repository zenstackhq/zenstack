/* eslint-disable @typescript-eslint/no-explicit-any */
import { enumerate, getModelFields, resolveField } from '../../cross';
import { DbClientContract } from '../../types';
import { InternalEnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, makeProxy, PrismaProxyActions } from './proxy';
import { QueryUtils } from './query-utils';

/**
 * Gets an enhanced Prisma client that post-processes JSON values.
 *
 * @private
 */
export function withJsonProcessor<DbClient extends object = any>(
    prisma: DbClient,
    options: InternalEnhancementOptions
): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new JsonProcessorHandler(_prisma as DbClientContract, model, options),
        'json-processor'
    );
}

class JsonProcessorHandler extends DefaultPrismaProxyHandler {
    private queryUtils: QueryUtils;

    constructor(prisma: DbClientContract, model: string, options: InternalEnhancementOptions) {
        super(prisma, model, options);
        this.queryUtils = new QueryUtils(prisma, options);
    }

    protected override async processResultEntity<T>(_method: PrismaProxyActions, data: T): Promise<T> {
        for (const value of enumerate(data)) {
            await this.doPostProcess(value, this.model);
        }
        return data;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async doPostProcess(entityData: any, model: string) {
        const realModel = this.queryUtils.getDelegateConcreteModel(model, entityData);

        for (const field of getModelFields(entityData)) {
            const fieldInfo = await resolveField(this.options.modelMeta, realModel, field);
            if (!fieldInfo) {
                continue;
            }

            if (fieldInfo.isTypeDef) {
                this.fixJsonDateFields(entityData[field], fieldInfo.type);
            } else if (fieldInfo.isDataModel) {
                const items =
                    fieldInfo.isArray && Array.isArray(entityData[field]) ? entityData[field] : [entityData[field]];
                for (const item of items) {
                    // recurse
                    await this.doPostProcess(item, fieldInfo.type);
                }
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fixJsonDateFields(entityData: any, typeDef: string) {
        if (typeof entityData !== 'object' && !Array.isArray(entityData)) {
            return;
        }

        enumerate(entityData).forEach((item) => {
            if (!item || typeof item !== 'object') {
                return;
            }

            for (const [key, value] of Object.entries(item)) {
                const fieldInfo = resolveField(this.options.modelMeta, typeDef, key, true);
                if (!fieldInfo) {
                    continue;
                }
                if (fieldInfo.isTypeDef) {
                    // recurse
                    this.fixJsonDateFields(value, fieldInfo.type);
                } else if (fieldInfo.type === 'DateTime' && typeof value === 'string') {
                    // convert to Date
                    const parsed = Date.parse(value);
                    if (!isNaN(parsed)) {
                        item[key] = new Date(parsed);
                    }
                }
            }
        });
    }
}
