1. `update` and `delete` policy rejection throws `NotFoundError`
1. `check()` ORM api has been removed
1. non-optional to-one relation doesn't automatically filter parent read when evaluating access policies
1. `@omit` and `@password` attributes have been removed
1. SWR plugin is removed
1. `makeModelSchema()` no longer includes relation fields by default — use `include` or `select` options to opt in, mirroring ORM behaviour
1. ORM entity mutation catch-all hooks should now be registered under `onEntityMutation.$all` (the previous shape still works but emits a deprecation warning); entities passed to per-model hooks are typed as raw database rows (same as `$qb` results)
