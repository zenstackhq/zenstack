export function resolveNameCasing(casing: 'pascal' | 'camel' | 'snake' | 'none', originalName: string) {
    let name = originalName;
    const fieldPrefix = /[0-9]/g.test(name.charAt(0)) ? '_' : '';

    switch (casing) {
        case 'pascal':
            name = toPascalCase(originalName);
            break;
        case 'camel':
            name = toCamelCase(originalName);
            break;
        case 'snake':
            name = toSnakeCase(originalName);
            break;
    }

    return {
        modified: name !== originalName || fieldPrefix !== '',
        name: `${fieldPrefix}${name}`,
    };
}

function isAllUpperCase(str: string): boolean {
    return str === str.toUpperCase();
}

export function toPascalCase(str: string): string {
    if (isAllUpperCase(str)) return str;
    return str.replace(/[_\- ]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
}

export function toCamelCase(str: string): string {
    if (isAllUpperCase(str)) return str;
    return str.replace(/[_\- ]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
}

export function toSnakeCase(str: string): string {
    if (isAllUpperCase(str)) return str;
    return str
        .replace(/[- ]+/g, '_')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();
}
