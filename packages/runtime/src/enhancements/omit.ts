/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { DbClientContract } from '../types';
import { getDefaultModelMeta, resolveField } from './model-meta';
import { DefaultPrismaProxyHandler, makeProxy } from './proxy';
import { ModelMeta } from './types';
import { ensureArray, getModelFields } from './utils';

export function withOmit<DbClient extends object>(prisma: DbClient, modelMeta?: ModelMeta): DbClient {
    return makeProxy(
        prisma,
        (_prisma, model) => new OmitHandler(_prisma as DbClientContract, model, modelMeta ?? getDefaultModelMeta())
    );
}

class OmitHandler extends DefaultPrismaProxyHandler {
    constructor(prisma: DbClientContract, model: string, private readonly modelMeta: ModelMeta) {
        super(prisma, model);
    }

    // base override
    protected async processResultEntity<T>(data: T): Promise<T> {
        if (data) {
            for (const value of ensureArray(data)) {
                await this.doPostProcess(value, this.model);
            }
        }
        return data;
    }

    private async doPostProcess(entityData: any, model: string) {
        for (const field of getModelFields(entityData)) {
            const fieldInfo = await resolveField(this.modelMeta, model, field);
            if (!fieldInfo) {
                continue;
            }

            if (fieldInfo.attributes.find((attr) => attr.name === '@omit')) {
                delete entityData[field];
            } else if (fieldInfo.isDataModel) {
                // recurse
                await this.doPostProcess(entityData[field], fieldInfo.type);
            }
        }
    }
}
