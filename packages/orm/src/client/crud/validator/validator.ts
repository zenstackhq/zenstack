import { invariant } from '@zenstackhq/common-helpers';
import { match } from 'ts-pattern';
import { ZodType } from 'zod';
import { type GetModels, type ProcedureDef, type SchemaDef } from '../../../schema';
import { formatError } from '../../../utils/zod-utils';
import type { ClientContract } from '../../contract';
import {
    type AggregateArgs,
    type CountArgs,
    type CreateArgs,
    type CreateManyAndReturnArgs,
    type CreateManyArgs,
    type DeleteArgs,
    type DeleteManyArgs,
    type ExistsArgs,
    type FindArgs,
    type GroupByArgs,
    type UpdateArgs,
    type UpdateManyAndReturnArgs,
    type UpdateManyArgs,
    type UpsertArgs,
} from '../../crud-types';
import { createInvalidInputError } from '../../errors';
import { ZodSchemaFactory } from '../../zod/factory';

type GetSchemaFunc<Schema extends SchemaDef> = (model: GetModels<Schema>) => ZodType;

export class InputValidator<Schema extends SchemaDef> {
    readonly zodFactory: ZodSchemaFactory<Schema>;

    constructor(private readonly client: ClientContract<Schema>) {
        this.zodFactory = new ZodSchemaFactory(client);
    }

    // #region Entry points

    validateFindArgs(
        model: GetModels<Schema>,
        args: unknown,
        operation: 'findFirst' | 'findUnique' | 'findMany',
    ): FindArgs<Schema, GetModels<Schema>, any, true> | undefined {
        return this.validate<FindArgs<Schema, GetModels<Schema>, any, true> | undefined>(
            model,
            operation,
            (model) =>
                match(operation)
                    .with('findFirst', () => this.zodFactory.makeFindFirstSchema(model))
                    .with('findUnique', () => this.zodFactory.makeFindUniqueSchema(model))
                    .with('findMany', () => this.zodFactory.makeFindManySchema(model))
                    .exhaustive(),
            args,
        );
    }

    validateExistsArgs(
        model: GetModels<Schema>,
        args: unknown,
    ): ExistsArgs<Schema, GetModels<Schema>, any> | undefined {
        return this.validate<ExistsArgs<Schema, GetModels<Schema>, any> | undefined>(
            model,
            'exists',
            (model) => this.zodFactory.makeExistsSchema(model),
            args,
        );
    }

    validateCreateArgs(model: GetModels<Schema>, args: unknown): CreateArgs<Schema, GetModels<Schema>, any> {
        return this.validate<CreateArgs<Schema, GetModels<Schema>, any>>(
            model,
            'create',
            (model) => this.zodFactory.makeCreateSchema(model),
            args,
        );
    }

    validateCreateManyArgs(model: GetModels<Schema>, args: unknown): CreateManyArgs<Schema, GetModels<Schema>> {
        return this.validate<CreateManyArgs<Schema, GetModels<Schema>>>(
            model,
            'createMany',
            (model) => this.zodFactory.makeCreateManySchema(model),
            args,
        );
    }

    validateCreateManyAndReturnArgs(
        model: GetModels<Schema>,
        args: unknown,
    ): CreateManyAndReturnArgs<Schema, GetModels<Schema>, any> | undefined {
        return this.validate<CreateManyAndReturnArgs<Schema, GetModels<Schema>, any> | undefined>(
            model,
            'createManyAndReturn',
            (model) => this.zodFactory.makeCreateManyAndReturnSchema(model),
            args,
        );
    }

    validateUpdateArgs(model: GetModels<Schema>, args: unknown): UpdateArgs<Schema, GetModels<Schema>, any> {
        return this.validate<UpdateArgs<Schema, GetModels<Schema>, any>>(
            model,
            'update',
            (model) => this.zodFactory.makeUpdateSchema(model),
            args,
        );
    }

    validateUpdateManyArgs(model: GetModels<Schema>, args: unknown): UpdateManyArgs<Schema, GetModels<Schema>, any> {
        return this.validate<UpdateManyArgs<Schema, GetModels<Schema>, any>>(
            model,
            'updateMany',
            (model) => this.zodFactory.makeUpdateManySchema(model),
            args,
        );
    }

    validateUpdateManyAndReturnArgs(
        model: GetModels<Schema>,
        args: unknown,
    ): UpdateManyAndReturnArgs<Schema, GetModels<Schema>, any> {
        return this.validate<UpdateManyAndReturnArgs<Schema, GetModels<Schema>, any>>(
            model,
            'updateManyAndReturn',
            (model) => this.zodFactory.makeUpdateManyAndReturnSchema(model),
            args,
        );
    }

    validateUpsertArgs(model: GetModels<Schema>, args: unknown): UpsertArgs<Schema, GetModels<Schema>, any> {
        return this.validate<UpsertArgs<Schema, GetModels<Schema>, any>>(
            model,
            'upsert',
            (model) => this.zodFactory.makeUpsertSchema(model),
            args,
        );
    }

    validateDeleteArgs(model: GetModels<Schema>, args: unknown): DeleteArgs<Schema, GetModels<Schema>, any> {
        return this.validate<DeleteArgs<Schema, GetModels<Schema>, any>>(
            model,
            'delete',
            (model) => this.zodFactory.makeDeleteSchema(model),
            args,
        );
    }

    validateDeleteManyArgs(
        model: GetModels<Schema>,
        args: unknown,
    ): DeleteManyArgs<Schema, GetModels<Schema>, any> | undefined {
        return this.validate<DeleteManyArgs<Schema, GetModels<Schema>, any> | undefined>(
            model,
            'deleteMany',
            (model) => this.zodFactory.makeDeleteManySchema(model),
            args,
        );
    }

    validateCountArgs(model: GetModels<Schema>, args: unknown): CountArgs<Schema, GetModels<Schema>, any> | undefined {
        return this.validate<CountArgs<Schema, GetModels<Schema>, any> | undefined>(
            model,
            'count',
            (model) => this.zodFactory.makeCountSchema(model),
            args,
        );
    }

    validateAggregateArgs(model: GetModels<Schema>, args: unknown): AggregateArgs<Schema, GetModels<Schema>, any> {
        return this.validate<AggregateArgs<Schema, GetModels<Schema>, any>>(
            model,
            'aggregate',
            (model) => this.zodFactory.makeAggregateSchema(model),
            args,
        );
    }

    validateGroupByArgs(model: GetModels<Schema>, args: unknown): GroupByArgs<Schema, GetModels<Schema>, any> {
        return this.validate<GroupByArgs<Schema, GetModels<Schema>, any>>(
            model,
            'groupBy',
            (model) => this.zodFactory.makeGroupBySchema(model),
            args,
        );
    }

    // TODO: turn it into a Zod schema and cache
    validateProcedureInput(proc: string, input: unknown): unknown {
        const procDef = (this.client.$schema.procedures ?? {})[proc] as ProcedureDef | undefined;
        invariant(procDef, `Procedure "${proc}" not found in schema`);

        const params = Object.values(procDef.params ?? {});

        // For procedures where every parameter is optional, allow omitting the input entirely.
        if (typeof input === 'undefined') {
            if (params.length === 0) {
                return undefined;
            }
            if (params.every((p) => p.optional)) {
                return undefined;
            }
            throw createInvalidInputError('Missing procedure arguments', `$procs.${proc}`);
        }

        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            throw createInvalidInputError('Procedure input must be an object', `$procs.${proc}`);
        }

        const envelope = input as Record<string, unknown>;
        const argsPayload = Object.prototype.hasOwnProperty.call(envelope, 'args') ? (envelope as any).args : undefined;

        if (params.length === 0) {
            if (typeof argsPayload === 'undefined') {
                return input;
            }
            if (!argsPayload || typeof argsPayload !== 'object' || Array.isArray(argsPayload)) {
                throw createInvalidInputError('Procedure `args` must be an object', `$procs.${proc}`);
            }
            if (Object.keys(argsPayload as any).length === 0) {
                return input;
            }
            throw createInvalidInputError('Procedure does not accept arguments', `$procs.${proc}`);
        }

        if (typeof argsPayload === 'undefined') {
            if (params.every((p) => p.optional)) {
                return input;
            }
            throw createInvalidInputError('Missing procedure arguments', `$procs.${proc}`);
        }

        if (!argsPayload || typeof argsPayload !== 'object' || Array.isArray(argsPayload)) {
            throw createInvalidInputError('Procedure `args` must be an object', `$procs.${proc}`);
        }

        const obj = argsPayload as Record<string, unknown>;

        for (const param of params) {
            const value = (obj as any)[param.name];

            if (!Object.prototype.hasOwnProperty.call(obj, param.name)) {
                if (param.optional) {
                    continue;
                }
                throw createInvalidInputError(`Missing procedure argument: ${param.name}`, `$procs.${proc}`);
            }

            if (typeof value === 'undefined') {
                if (param.optional) {
                    continue;
                }
                throw createInvalidInputError(
                    `Invalid procedure argument: ${param.name} is required`,
                    `$procs.${proc}`,
                );
            }

            const schema = this.zodFactory.makeProcedureParamSchema(param);
            const parsed = schema.safeParse(value);
            if (!parsed.success) {
                throw createInvalidInputError(
                    `Invalid procedure argument: ${param.name}: ${formatError(parsed.error)}`,
                    `$procs.${proc}`,
                );
            }
        }

        return input;
    }

    // #endregion

    // #region Validation helpers

    private validate<T>(model: GetModels<Schema>, operation: string, getSchema: GetSchemaFunc<Schema>, args: unknown) {
        const schema = getSchema(model);
        const { error, data } = schema.safeParse(args);
        if (error) {
            throw createInvalidInputError(
                `Invalid ${operation} args for model "${model}": ${formatError(error)}`,
                model,
                {
                    cause: error,
                },
            );
        }
        return data as T;
    }

    // #endregion
}
