export type PolicyPluginOptions = {
    /**
     * Dangerously bypasses access-policy enforcement for raw SQL queries.
     * Raw queries remain in the current transaction, but the policy plugin will
     * not inspect or reject them.
     */
    dangerouslyAllowRawSql?: boolean;

    /**
     * Whether to run the diagnostic query to determine which policy rule was violated when
     * a write is rejected. Defaults to `true`. Set to `false` to skip it globally for
     * performance. Can be overridden per-query with the `fetchPolicyCodes` option.
     */
    fetchPolicyCodes?: boolean;
};
