import Logic from 'logic-solver';
import { match } from 'ts-pattern';
import type {
    ComparisonConstraint,
    ComparisonTerm,
    LogicalConstraint,
    PermissionCheckerConstraint,
    ValueConstraint,
    VariableConstraint,
} from '../types';

/**
 * A boolean constraint solver based on `logic-solver`. Only boolean and integer types are supported.
 */
export class ConstraintSolver {
    // a table for internalizing string literals
    private stringTable: string[] = [];

    // a map for storing variable names and their corresponding formulas
    private variables: Map<string, Logic.Formula> = new Map<string, Logic.Formula>();

    /**
     * Check the satisfiability of the given constraint.
     */
    checkSat(constraint: PermissionCheckerConstraint): boolean {
        // reset state
        this.stringTable = [];
        this.variables = new Map<string, Logic.Formula>();

        // convert the constraint to a "logic-solver" formula
        const formula = this.buildFormula(constraint);

        // solve the formula
        const solver = new Logic.Solver();
        solver.require(formula);

        // DEBUG:
        // const solution = solver.solve();
        // if (solution) {
        //     console.log('Solution:');
        //     this.variables.forEach((v, k) => console.log(`\t${k}=${solution?.evaluate(v)}`));
        // } else {
        //     console.log('No solution');
        // }

        return !!solver.solve();
    }

    private buildFormula(constraint: PermissionCheckerConstraint): Logic.Formula {
        return match(constraint)
            .when(
                (c): c is ValueConstraint => c.kind === 'value',
                (c) => this.buildValueFormula(c)
            )
            .when(
                (c): c is VariableConstraint => c.kind === 'variable',
                (c) => this.buildVariableFormula(c)
            )
            .when(
                (c): c is ComparisonConstraint => ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(c.kind),
                (c) => this.buildComparisonFormula(c)
            )
            .when(
                (c): c is LogicalConstraint => ['and', 'or', 'not'].includes(c.kind),
                (c) => this.buildLogicalFormula(c)
            )
            .otherwise(() => {
                throw new Error(`Unsupported constraint format: ${JSON.stringify(constraint)}`);
            });
    }

    private buildLogicalFormula(constraint: LogicalConstraint) {
        return match(constraint.kind)
            .with('and', () => this.buildAndFormula(constraint))
            .with('or', () => this.buildOrFormula(constraint))
            .with('not', () => this.buildNotFormula(constraint))
            .exhaustive();
    }

    private buildAndFormula(constraint: LogicalConstraint): Logic.Formula {
        if (constraint.children.some((c) => this.isFalse(c))) {
            // short-circuit
            return Logic.FALSE;
        }
        return Logic.and(...constraint.children.map((c) => this.buildFormula(c)));
    }

    private buildOrFormula(constraint: LogicalConstraint): Logic.Formula {
        if (constraint.children.some((c) => this.isTrue(c))) {
            // short-circuit
            return Logic.TRUE;
        }
        return Logic.or(...constraint.children.map((c) => this.buildFormula(c)));
    }

    private buildNotFormula(constraint: LogicalConstraint) {
        if (constraint.children.length !== 1) {
            throw new Error('"not" constraint must have exactly one child');
        }
        return Logic.not(this.buildFormula(constraint.children[0]));
    }

    private isTrue(constraint: PermissionCheckerConstraint): unknown {
        return constraint.kind === 'value' && constraint.value === true;
    }

    private isFalse(constraint: PermissionCheckerConstraint): unknown {
        return constraint.kind === 'value' && constraint.value === false;
    }

    private buildComparisonFormula(constraint: ComparisonConstraint) {
        if (constraint.left.kind === 'value' && constraint.right.kind === 'value') {
            // constant comparison
            const left: ValueConstraint = constraint.left;
            const right: ValueConstraint = constraint.right;
            return match(constraint.kind)
                .with('eq', () => (left.value === right.value ? Logic.TRUE : Logic.FALSE))
                .with('ne', () => (left.value !== right.value ? Logic.TRUE : Logic.FALSE))
                .with('gt', () => (left.value > right.value ? Logic.TRUE : Logic.FALSE))
                .with('gte', () => (left.value >= right.value ? Logic.TRUE : Logic.FALSE))
                .with('lt', () => (left.value < right.value ? Logic.TRUE : Logic.FALSE))
                .with('lte', () => (left.value <= right.value ? Logic.TRUE : Logic.FALSE))
                .exhaustive();
        }

        return match(constraint.kind)
            .with('eq', () => this.transformEquality(constraint.left, constraint.right))
            .with('ne', () => this.transformInequality(constraint.left, constraint.right))
            .with('gt', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.greaterThan(l, r))
            )
            .with('gte', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.greaterThanOrEqual(l, r))
            )
            .with('lt', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.lessThan(l, r))
            )
            .with('lte', () =>
                this.transformComparison(constraint.left, constraint.right, (l, r) => Logic.lessThanOrEqual(l, r))
            )
            .exhaustive();
    }

    private buildVariableFormula(constraint: VariableConstraint) {
        return (
            match(constraint.type)
                .with('boolean', () => this.booleanVariable(constraint.name))
                .with('number', () => this.intVariable(constraint.name))
                // strings are internalized and represented by their indices
                .with('string', () => this.intVariable(constraint.name))
                .exhaustive()
        );
    }

    private buildValueFormula(constraint: ValueConstraint) {
        return match(constraint.value)
            .when(
                (v): v is boolean => typeof v === 'boolean',
                (v) => (v === true ? Logic.TRUE : Logic.FALSE)
            )
            .when(
                (v): v is number => typeof v === 'number',
                (v) => Logic.constantBits(v)
            )
            .when(
                (v): v is string => typeof v === 'string',
                (v) => {
                    // internalize the string and use its index as formula representation
                    const index = this.stringTable.indexOf(v);
                    if (index === -1) {
                        this.stringTable.push(v);
                        return Logic.constantBits(this.stringTable.length - 1);
                    } else {
                        return Logic.constantBits(index);
                    }
                }
            )
            .exhaustive();
    }

    private booleanVariable(name: string) {
        this.variables.set(name, name);
        return name;
    }

    private intVariable(name: string) {
        const r = Logic.variableBits(name, 32);
        this.variables.set(name, r);
        return r;
    }

    private transformEquality(left: ComparisonTerm, right: ComparisonTerm) {
        if (left.type !== right.type) {
            throw new Error(`Type mismatch in equality constraint: ${JSON.stringify(left)}, ${JSON.stringify(right)}`);
        }

        const leftFormula = this.buildFormula(left);
        const rightFormula = this.buildFormula(right);
        if (left.type === 'boolean' && right.type === 'boolean') {
            // logical equivalence
            return Logic.equiv(leftFormula, rightFormula);
        } else {
            // integer equality
            return Logic.equalBits(leftFormula, rightFormula);
        }
    }

    private transformInequality(left: ComparisonTerm, right: ComparisonTerm) {
        return Logic.not(this.transformEquality(left, right));
    }

    private transformComparison(
        left: ComparisonTerm,
        right: ComparisonTerm,
        func: (left: Logic.Formula, right: Logic.Formula) => Logic.Formula
    ) {
        return func(this.buildFormula(left), this.buildFormula(right));
    }
}
