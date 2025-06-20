const DEFAULT_SPLIT_REGEXP_1 = /([a-z0-9])([A-Z])/g;
const DEFAULT_SPLIT_REGEXP_2 = /([A-Z])([A-Z][a-z])/g;
const DEFAULT_STRIP_REGEXP = /[^A-Z0-9]+/gi;

export function paramCase(input: string) {
    const result = input
        .replace(DEFAULT_SPLIT_REGEXP_1, "$1\0$2")
        .replace(DEFAULT_SPLIT_REGEXP_2, "$1\0$2")
        .replace(DEFAULT_STRIP_REGEXP, "\0");

    let start = 0;
    let end = result.length;

    while (result.charAt(start) === "\0") start++;
    while (result.charAt(end - 1) === "\0") end--;

    return result.slice(start, end).split("\0").map((str) => str.toLowerCase()).join("-");
}
