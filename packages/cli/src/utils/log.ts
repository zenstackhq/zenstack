import colors from 'colors';

/** Logs a green success/status message. */
export function logSuccess(message: string): void {
    console.log(colors.green(message));
}

/** Logs a yellow warning message (to stderr). */
export function logWarning(message: string): void {
    console.warn(colors.yellow(message));
}

/** Logs a red error message (to stderr). */
export function logError(message: string): void {
    console.error(colors.red(message));
}

/** Logs a plain, uncolored informational message. */
export function logInfo(message: string): void {
    console.log(message);
}
