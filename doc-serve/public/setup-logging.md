# Set up logging

ZenStack uses the following levels to control server-side logging:

-   `error`

    Error level logging

-   `warn`

    Warning level logging

-   `info`

    Info level logging

-   `verbose`

    Verbose level logging

-   `query`

    Detailed database query logging

By default, ZenStack prints `error` and `warn` level of logging with `console.error` and `console.log`, respectively. You can also control the logging behavior by providing a `zenstack.config.json` file at the root of your project.

You can turn log levels on and off in `zenstack.config.json`:

```json
{
    "log": ["verbose", "info"]
}
```

The settings shown above is an shorthand for:

```json
{
    "log": [
        {
            "level": "verbose",
            "emit": "stdout"
        },
        {
            "level": "info",
            "emit": "stdout"
        }
    ]
}
```

You can also configure ZenStack to emit log as event instead of dumping to stdout, like:

```json
{
    "log": [
        {
            "level": "info",
            "emit": "event"
        }
    ]
}
```

To consume the events:

```ts
import service from '@zenstackhq/runtime';

service.$on('info', (event) => {
    console.log(event.timestamp, event.message);
});
```

You can also mix and match stdout output with event emitting, like:

```json
{
    "log": [
        {
            "level": "info",
            "emit": "stdout"
        },
        {
            "level": "info",
            "emit": "event"
        }
    ]
}
```

The settings in `zenstack.config.json` controls logging of both ZenStack and the underlying Prisma instance.
