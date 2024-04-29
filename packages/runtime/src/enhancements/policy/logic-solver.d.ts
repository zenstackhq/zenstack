declare module 'logic-solver' {
    type Term = string;

    type Formula = Term;

    const TRUE: Term;

    const FALSE: Term;

    export function equiv(operand1: Formula, operand2: Formula): Formula;

    export function equalBits(bits1: Formula, bits2: Formula): Formula;

    export function greaterThan(bits1: Formula, bits2: Formula): Formula;

    export function greaterThanOrEqual(bits1: Formula, bits2: Formula): Formula;

    export function lessThan(bits1: Formula, bits2: Formula): Formula;

    export function lessThanOrEqual(bits1: Formula, bits2: Formula): Formula;

    export function and(...args: Formula[]): Formula;

    export function or(...args: Formula[]): Formula;

    export function not(arg: Formula): Formula;

    export function variableBits(baseName: string, N: number): Formula;

    export function constantBits(wholeNumber: number): Formula;

    interface Solution {
        getMap(): object;

        evaluate(formula: Formula): unknown;
    }

    class Solver {
        require(...args: Formula[]): void;

        forbid(...args: Formula[]): void;

        solve(): Solution;
    }
}
