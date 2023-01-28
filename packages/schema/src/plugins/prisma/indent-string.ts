// https://github.com/sindresorhus/indent-string

/**
 * Utility for indenting strings
 */
export default function indentString(string: string, count = 4): string {
    const indent = ' ';
    return string.replace(/^(?!\s*$)/gm, indent.repeat(count));
}
