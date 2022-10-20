export function and(condition1: any, condition2: any) {
    if (condition1 && condition2) {
        return { AND: [condition1, condition2] };
    } else {
        return condition1 ?? condition2;
    }
}
