import Logic, { Formula } from 'logic-solver';
import { match } from 'ts-pattern';
import type { CheckerConstraint, ComparisonTerm, ConstraintVariable } from '../types';

const MAGIC_NULL = 0x7fffffff;

export class ConstraintSolver {
    private stringTable: string[] = [];
    private variables: Map<string, Formula> = new Map<string, Formula>();

    solve(constraint: CheckerConstraint): boolean {
        this.stringTable = [];
        this.variables = new Map<string, Formula>();

        const formula = this.buildFormula(constraint);
        const solver = new Logic.Solver();
        solver.require(formula);
        const solution = solver.solve();
        if (solution) {
            console.log('Solution:');
            this.variables.forEach((v, k) => console.log(`\t${k}=${solution?.evaluate(v)}`));
        } else {
            console.log('No solution');
        }
        return !!solution;
    }

    private buildFormula(constraint: CheckerConstraint): Logic.Formula {
        if ('value' in constraint) {
            if (constraint.value === null) {
                return Logic.constantBits(MAGIC_NULL);
            }

            if (typeof constraint.value === 'boolean') {
                return constraint.value === true ? Logic.TRUE : Logic.FALSE;
            }

            if (typeof constraint.value === 'number') {
                return Logic.constantBits(constraint.value);
            }

            if (typeof constraint.value === 'string') {
                const index = this.stringTable.indexOf(constraint.value);
                if (index === -1) {
                    this.stringTable.push(constraint.value);
                    return Logic.constantBits(this.stringTable.length - 1);
                } else {
                    return Logic.constantBits(index);
                }
            }
        }

        if ('name' in constraint) {
            // variable
            return match(constraint.type)
                .with('boolean', () => this.booleanVariable(constraint))
                .with('number', () => this.intVariable(constraint.name))
                .with('string', () => this.intVariable(constraint.name))
                .exhaustive();
        }

        if ('eq' in constraint) {
            return this.transformEquality(constraint.eq.left, constraint.eq.right);
        }

        if ('gt' in constraint) {
            return this.transformComparison(constraint.gt.left, constraint.gt.right, (l, r) => Logic.greaterThan(l, r));
        }

        if ('gte' in constraint) {
            return this.transformComparison(constraint.gte.left, constraint.gte.right, (l, r) =>
                Logic.greaterThanOrEqual(l, r)
            );
        }

        if ('lt' in constraint) {
            return this.transformComparison(constraint.lt.left, constraint.lt.right, (l, r) => Logic.lessThan(l, r));
        }

        if ('lte' in constraint) {
            return this.transformComparison(constraint.lte.left, constraint.lte.right, (l, r) =>
                Logic.greaterThan(l, r)
            );
        }

        if ('and' in constraint) {
            return Logic.and(...constraint.and.map((c) => this.buildFormula(c)));
        }

        if ('or' in constraint) {
            return Logic.or(...constraint.or.map((c) => this.buildFormula(c)));
        }

        if ('not' in constraint) {
            return Logic.not(this.buildFormula(constraint.not));
        }

        throw new Error(`Unsupported constraint format: ${JSON.stringify(constraint)}`);
    }

    private booleanVariable(constraint: ConstraintVariable): string {
        this.variables.set(constraint.name, constraint.name);
        return constraint.name;
    }

    private intVariable(name: string): string {
        const r = Logic.variableBits(name, 32);
        this.variables.set(name, r);
        return r;
    }

    private transformEquality(left: ComparisonTerm, right: ComparisonTerm) {
        if (left.type !== right.type) {
            throw new Error(`Type mismatch in equality constraint: ${JSON.stringify(left)}, ${JSON.stringify(right)}`);
        }
        const leftConstraint = this.buildFormula(left);
        const rightConstraint = this.buildFormula(right);
        if (left.type === 'boolean' && right.type === 'boolean') {
            return Logic.equiv(leftConstraint, rightConstraint);
        } else {
            return Logic.equalBits(leftConstraint, rightConstraint);
        }
    }

    private transformComparison(
        left: ComparisonTerm,
        right: ComparisonTerm,
        func: (left: Logic.Formula, right: Logic.Formula) => Logic.Formula
    ) {
        const leftConstraint = this.buildFormula(left);
        const rightConstraint = this.buildFormula(right);
        return func(leftConstraint, rightConstraint);
    }
}

// export function solve(constraint: CheckerConstraint) {
//     const stringTable: string[] = [];
//     const formula = buildFormula(constraint, stringTable);
//     const solver = new Logic.Solver();
//     solver.require(formula);
//     const solution = solver.solve();
//     console.log('Solution:', solution?.getMap());
//     return !!solution;
// }

// function buildFormula(constraint: CheckerConstraint, stringTable: string[]): Logic.Formula {
//     if ('value' in constraint) {
//         if (constraint.value === null) {
//             return Logic.constantBits(MAGIC_NULL);
//         }

//         if (typeof constraint.value === 'boolean') {
//             return constraint.value === true ? Logic.TRUE : Logic.FALSE;
//         }

//         if (typeof constraint.value === 'number') {
//             return Logic.constantBits(constraint.value);
//         }

//         if (typeof constraint.value === 'string') {
//             const index = stringTable.indexOf(constraint.value);
//             if (index === -1) {
//                 stringTable.push(constraint.value);
//                 return Logic.constantBits(stringTable.length - 1);
//             } else {
//                 return Logic.constantBits(index);
//             }
//         }
//     }

//     if ('name' in constraint) {
//         // variable
//         return match(constraint.type)
//             .with('boolean', () => constraint.name)
//             .with('number', () => Logic.variableBits(constraint.name, 32))
//             .with('string', () => Logic.variableBits(constraint.name, 32))
//             .exhaustive();
//     }

//     if ('eq' in constraint) {
//         return transformEquality(constraint.eq.left, constraint.eq.right, stringTable);
//     }

//     if ('gt' in constraint) {
//         return transformComparison(constraint.gt.left, constraint.gt.right, stringTable, (l, r) =>
//             Logic.greaterThan(l, r)
//         );
//     }

//     if ('gte' in constraint) {
//         return transformComparison(constraint.gte.left, constraint.gte.right, stringTable, (l, r) =>
//             Logic.greaterThanOrEqual(l, r)
//         );
//     }

//     if ('lt' in constraint) {
//         return transformComparison(constraint.lt.left, constraint.lt.right, stringTable, (l, r) =>
//             Logic.lessThan(l, r)
//         );
//     }

//     if ('lte' in constraint) {
//         return transformComparison(constraint.lte.left, constraint.lte.right, stringTable, (l, r) =>
//             Logic.greaterThan(l, r)
//         );
//     }

//     if ('and' in constraint) {
//         return Logic.and(...constraint.and.map((c) => buildFormula(c, stringTable)));
//     }

//     if ('or' in constraint) {
//         return Logic.or(...constraint.or.map((c) => buildFormula(c, stringTable)));
//     }

//     if ('not' in constraint) {
//         return Logic.not(buildFormula(constraint.not, stringTable));
//     }

//     throw new Error(`Unsupported constraint format: ${JSON.stringify(constraint)}`);
// }

// function transformEquality(left: ComparisonTerm, right: ComparisonTerm, stringTable: string[]) {
//     if (left.type !== right.type) {
//         throw new Error(`Type mismatch in equality constraint: ${JSON.stringify(left)}, ${JSON.stringify(right)}`);
//     }
//     const leftConstraint = buildFormula(left, stringTable);
//     const rightConstraint = buildFormula(right, stringTable);
//     if (left.type === 'boolean' && right.type === 'boolean') {
//         return Logic.equiv(leftConstraint, rightConstraint);
//     } else {
//         return Logic.equalBits(leftConstraint, rightConstraint);
//     }
// }

// function transformComparison(
//     left: ComparisonTerm,
//     right: ComparisonTerm,
//     stringTable: string[],
//     func: (left: Logic.Formula, right: Logic.Formula) => Logic.Formula
// ): string {
//     const leftConstraint = buildFormula(left, stringTable);
//     const rightConstraint = buildFormula(right, stringTable);
//     return func(leftConstraint, rightConstraint);
// }

// // export type Constraint = Logic.Formula;

// // export function TRUE(): Constraint {
// //     return Logic.TRUE;
// // }

// // export function FALSE(): Constraint {
// //     return Logic.FALSE;
// // }

// // export function variable(name: string): Constraint {
// //     return name;
// // }

// // export function and(...args: Constraint[]): Constraint {
// //     return Logic.and(...args);
// // }

// // export function or(...args: Constraint[]): Constraint {
// //     return Logic.or(...args);
// // }

// // export function not(arg: Constraint): Constraint {
// //     return Logic.not(arg);
// // }

// // export function checkSat(constraint: Constraint): boolean {
// //     const solver = new Logic.Solver();
// //     solver.require(constraint);
// //     return !!solver.solve();
// // }
