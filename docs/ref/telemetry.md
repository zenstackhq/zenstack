# Telemetry

ZenStack CLI and VSCode extension sends anonymous telemetry for analyzing usage stats and finding bugs.

The information collected includes:

-   OS
-   Node.js version
-   CLI version
-   CLI command and arguments
-   CLI errors
-   Duration of command run
-   Region (based on IP)

We don't collect any telemetry at the runtime of apps using ZenStack.

We appreciate that you keep the telemetry ON so we can keep improving the toolkit. We follow the [Console Do Not Track](https://consoledonottrack.com/) convention, and you can turn off the telemetry by setting environment variable `DO_NOT_TRACK` to `1`:

```bash
DO_NOT_TRACK=1 npx zenstack ...
```
