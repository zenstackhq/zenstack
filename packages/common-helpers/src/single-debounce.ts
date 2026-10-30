export function singleDebounce(
    cb: () => void | PromiseLike<void>,
    debounceMc: number,
    reRunOnInProgressCall: boolean = false,
) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let inProgress = false;
    let pendingInProgress = false;

    const run = async () => {
        if (inProgress) {
            if (reRunOnInProgressCall) {
                pendingInProgress = true;
            }

            return;
        }

        inProgress = true;
        pendingInProgress = false;

        try {
            await cb();
        } finally {
            inProgress = false;

            if (pendingInProgress) {
                await run();
            }
        }
    };

    return () => {
        clearTimeout(timeout);

        timeout = setTimeout(run, debounceMc);
    };
}
