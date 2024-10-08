import path from 'path';

/**
 * Gets the relative path from `from` to `to` and normalizes it to start it with `./`
 */
export function normalizedRelative(from: string, to: string) {
    const result = path.relative(from, to);
    return result.startsWith('.') ? result : `./${result}`;
}
