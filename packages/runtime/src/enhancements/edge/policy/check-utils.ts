import { ModelMeta } from '..';
import type { DbClientContract } from '../../../types';
import { PermissionCheckArgs } from '../types';
import { PolicyUtil } from './policy-utils';

export async function checkPermission(
    _model: string,
    _args: PermissionCheckArgs,
    _modelMeta: ModelMeta,
    _policyUtils: PolicyUtil,
    _prisma: DbClientContract,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _prismaModule: any
): Promise<boolean> {
    throw new Error('`check()` API is not supported on edge runtime');
}
