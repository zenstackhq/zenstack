// https://github.com/sindresorhus/indent-string

export default function indentString(string: string, count = 4) {
    const indent = ' ';
    return string.replace(/^(?!\s*$)/gm, indent.repeat(count));
}
