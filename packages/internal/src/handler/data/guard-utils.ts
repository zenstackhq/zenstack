/**
 * Utility for creating a conjunction of two query conditions
 */
export function and(condition1: unknown, condition2: unknown): unknown {
    if (condition1 && condition2) {
        return { AND: [condition1, condition2] };
    } else {
        return condition1 ?? condition2;
    }
}
