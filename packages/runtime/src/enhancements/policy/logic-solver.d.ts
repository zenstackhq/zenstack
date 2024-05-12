/**
 * Type definitions for the `logic-solver` npm package.
 */
declare module 'logic-solver' {
    /**
     * A boolean formula.
     */
    interface Formula {}

    /**
     * The `TRUE` formula.
     */
    const TRUE: Formula;

    /**
     * The `FALSE` formula.
     */
    const FALSE: Formula;

    /**
     * Boolean equivalence.
     */
    export function equiv(operand1: Formula, operand2: Formula): Formula;

    /**
     * Bits equality.
     */
    export function equalBits(bits1: Formula, bits2: Formula): Formula;

    /**
     * Bits greater-than.
     */
    export function greaterThan(bits1: Formula, bits2: Formula): Formula;

    /**
     * Bits greater-than-or-equal.
     */
    export function greaterThanOrEqual(bits1: Formula, bits2: Formula): Formula;

    /**
     * Bits less-than.
     */
    export function lessThan(bits1: Formula, bits2: Formula): Formula;

    /**
     * Bits less-than-or-equal.
     */
    export function lessThanOrEqual(bits1: Formula, bits2: Formula): Formula;

    /**
     * Logical AND.
     */
    export function and(...args: Formula[]): Formula;

    /**
     * Logical OR.
     */
    export function or(...args: Formula[]): Formula;

    /**
     * Logical NOT.
     */
    export function not(arg: Formula): Formula;

    /**
     * Creates a bits variable with the given name and bit length.
     */
    export function variableBits(baseName: string, N: number): Formula;

    /**
     * Creates a constant bits formula from the given whole number.
     */
    export function constantBits(wholeNumber: number): Formula;

    /**
     * A solution to a constraint.
     */
    interface Solution {
        /**
         * Returns a map of variable assignments.
         */
        getMap(): object;

        /**
         * Evaluates the given formula against the solution.
         */
        evaluate(formula: Formula): unknown;
    }

    /**
     * A constraint solver.
     */
    class Solver {
        /**
         * Adds constraints to the solver.
         */
        require(...args: Formula[]): void;

        /**
         * Adds negated constraints from the solver.
         */
        forbid(...args: Formula[]): void;

        /**
         * Solves the constraints.
         */
        solve(): Solution;
    }
}
