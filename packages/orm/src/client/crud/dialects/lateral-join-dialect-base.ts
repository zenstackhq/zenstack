import { invariant } from '@zenstackhq/common-helpers';
import { type AliasableExpression, type Expression, type ExpressionBuilder, type SelectQueryBuilder } from 'kysely';
import type { FieldDef, GetModels, SchemaDef } from '../../../schema';
import { DELEGATE_JOINED_FIELD_PREFIX } from '../../constants';
import type { FindArgs } from '../../crud-types';
import {
    buildJoinPairs,
    getDelegateDescendantModels,
    getManyToManyRelation,
    isRelationField,
    requireField,
    requireIdFields,
    requireModel,
} from '../../query-utils';
import { BaseCrudDialect } from './base-dialect';

/**
 * Base class for dialects that support lateral joins (MySQL and PostgreSQL).
 * Contains common logic for building relation selections using lateral joins and JSON aggregation.
 */
export abstract class LateralJoinDialectBase<Schema extends SchemaDef> extends BaseCrudDialect<Schema> {
    /**
     * Builds an array aggregation expression.
     */
    protected abstract buildArrayAgg(arg: Expression<any>): AliasableExpression<any>;

    override buildRelationSelection(
        query: SelectQueryBuilder<any, any, any>,
        model: string,
        relationField: string,
        parentAlias: string,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
    ): SelectQueryBuilder<any, any, any> {
        const relationResultName = `${parentAlias}$${relationField}`;
        const joinedQuery = this.buildRelationJSON(
            model,
            query,
            relationField,
            parentAlias,
            payload,
            relationResultName,
        );
        return joinedQuery.select(`${relationResultName}.$data as ${relationField}`);
    }

    private buildRelationJSON(
        model: string,
        qb: SelectQueryBuilder<any, any, any>,
        relationField: string,
        parentAlias: string,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
        resultName: string,
    ) {
        const relationFieldDef = requireField(this.schema, model, relationField);
        const relationModel = relationFieldDef.type as GetModels<Schema>;

        return qb.leftJoinLateral(
            (eb) => {
                const relationSelectName = `${resultName}$sub`;
                const relationModelDef = requireModel(this.schema, relationModel);

                let tbl: SelectQueryBuilder<any, any, any>;

                if (this.canJoinWithoutNestedSelect(relationModelDef, payload)) {
                    // build join directly
                    tbl = this.buildModelSelect(relationModel, relationSelectName, payload, false);

                    // parent join filter
                    tbl = this.buildRelationJoinFilter(
                        tbl,
                        model,
                        relationField,
                        relationModel,
                        relationSelectName,
                        parentAlias,
                    );
                } else {
                    // join with a nested query
                    tbl = eb.selectFrom(() => {
                        let subQuery = this.buildModelSelect(relationModel, `${relationSelectName}$t`, payload, true);

                        // parent join filter
                        subQuery = this.buildRelationJoinFilter(
                            subQuery,
                            model,
                            relationField,
                            relationModel,
                            `${relationSelectName}$t`,
                            parentAlias,
                        );

                        if (typeof payload !== 'object' || payload.take === undefined) {
                            // force adding a limit otherwise the ordering is ignored by some databases
                            // during JSON array aggregation
                            subQuery = subQuery.limit(Number.MAX_SAFE_INTEGER);
                        }

                        return subQuery.as(relationSelectName);
                    });
                }

                // select relation result
                tbl = this.buildRelationObjectSelect(
                    relationModel,
                    relationSelectName,
                    relationFieldDef,
                    tbl,
                    payload,
                    resultName,
                );

                // add nested joins for each relation
                tbl = this.buildRelationJoins(tbl, relationModel, relationSelectName, payload, resultName);

                // alias the join table
                return tbl.as(resultName);
            },
            (join) => join.onTrue(),
        );
    }

    private buildRelationJoinFilter(
        query: SelectQueryBuilder<any, any, {}>,
        model: string,
        relationField: string,
        relationModel: GetModels<Schema>,
        relationModelAlias: string,
        parentAlias: string,
    ) {
        const m2m = getManyToManyRelation(this.schema, model, relationField);
        if (m2m) {
            // many-to-many relation
            const parentIds = requireIdFields(this.schema, model);
            const relationIds = requireIdFields(this.schema, relationModel);
            invariant(parentIds.length === 1, 'many-to-many relation must have exactly one id field');
            invariant(relationIds.length === 1, 'many-to-many relation must have exactly one id field');
            query = query.where((eb) =>
                eb(
                    eb.ref(`${relationModelAlias}.${relationIds[0]}`),
                    'in',
                    eb
                        .selectFrom(m2m.joinTable)
                        .select(`${m2m.joinTable}.${m2m.otherFkName}`)
                        .whereRef(`${parentAlias}.${parentIds[0]}`, '=', `${m2m.joinTable}.${m2m.parentFkName}`),
                ),
            );
        } else {
            const joinPairs = buildJoinPairs(this.schema, model, parentAlias, relationField, relationModelAlias);
            query = query.where((eb) =>
                this.and(...joinPairs.map(([left, right]) => eb(this.eb.ref(left), '=', this.eb.ref(right)))),
            );
        }
        return query;
    }

    private buildRelationObjectSelect(
        relationModel: string,
        relationModelAlias: string,
        relationFieldDef: FieldDef,
        qb: SelectQueryBuilder<any, any, any>,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
        parentResultName: string,
    ) {
        qb = qb.select((eb) => {
            const objArgs = this.buildRelationObjectArgs(
                relationModel,
                relationModelAlias,
                eb,
                payload,
                parentResultName,
            );

            if (relationFieldDef.array) {
                return this.buildArrayAgg(this.buildJsonObject(objArgs)).as('$data');
            } else {
                return this.buildJsonObject(objArgs).as('$data');
            }
        });

        return qb;
    }

    private buildRelationObjectArgs(
        relationModel: string,
        relationModelAlias: string,
        eb: ExpressionBuilder<any, any>,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
        parentResultName: string,
    ) {
        const relationModelDef = requireModel(this.schema, relationModel);
        const objArgs: Record<string, Expression<unknown>> = {};

        const descendantModels = getDelegateDescendantModels(this.schema, relationModel);
        if (descendantModels.length > 0) {
            // select all JSONs built from delegate descendants
            Object.assign(
                objArgs,
                ...descendantModels.map((subModel) => ({
                    [`${DELEGATE_JOINED_FIELD_PREFIX}${subModel.name}`]: eb.ref(
                        `${DELEGATE_JOINED_FIELD_PREFIX}${subModel.name}`,
                    ),
                })),
            );
        }

        if (payload === true || !payload.select) {
            // select all scalar fields except for omitted
            const omit = typeof payload === 'object' ? payload.omit : undefined;

            Object.assign(
                objArgs,
                ...Object.entries(relationModelDef.fields)
                    .filter(([, value]) => !value.relation)
                    .filter(([name]) => !this.shouldOmitField(omit, relationModel, name))
                    .map(([field]) => ({
                        [field]: this.fieldRef(relationModel, field, relationModelAlias, false),
                    })),
            );
        } else if (payload.select) {
            // select specific fields
            Object.assign(
                objArgs,
                ...Object.entries<any>(payload.select)
                    .filter(([, value]) => value)
                    .map(([field, value]) => {
                        if (field === '_count') {
                            const subJson = this.buildCountJson(
                                relationModel as GetModels<Schema>,
                                eb,
                                relationModelAlias,
                                value,
                            );
                            return { [field]: subJson };
                        } else {
                            const fieldDef = requireField(this.schema, relationModel, field);
                            const fieldValue = fieldDef.relation
                                ? // reference the synthesized JSON field
                                  eb.ref(`${parentResultName}$${field}.$data`)
                                : // reference a plain field
                                  this.fieldRef(relationModel, field, relationModelAlias, false);
                            return { [field]: fieldValue };
                        }
                    }),
            );
        }

        if (typeof payload === 'object' && payload.include && typeof payload.include === 'object') {
            // include relation fields

            Object.assign(
                objArgs,
                ...Object.entries<any>(payload.include)
                    .filter(([, value]) => value)
                    .map(([field]) => ({
                        [field]: eb.ref(`${parentResultName}$${field}.$data`),
                    })),
            );
        }

        return objArgs;
    }

    private buildRelationJoins(
        query: SelectQueryBuilder<any, any, any>,
        relationModel: string,
        relationModelAlias: string,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
        parentResultName: string,
    ) {
        let result = query;
        if (typeof payload === 'object') {
            const selectInclude = payload.include ?? payload.select;
            if (selectInclude && typeof selectInclude === 'object') {
                Object.entries<any>(selectInclude)
                    .filter(([, value]) => value)
                    .filter(([field]) => isRelationField(this.schema, relationModel, field))
                    .forEach(([field, value]) => {
                        result = this.buildRelationJSON(
                            relationModel,
                            result,
                            field,
                            relationModelAlias,
                            value,
                            `${parentResultName}$${field}`,
                        );
                    });
            }
        }
        return result;
    }
}
