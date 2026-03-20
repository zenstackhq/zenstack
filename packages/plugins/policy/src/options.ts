export type PolicyPluginOptions = {
    /**
     * Dangerously bypasses access-policy enforcement for raw SQL queries.
     * Raw queries remain in the current transaction, but the policy plugin will
     * not inspect or reject them.
     */
    dangerouslyAllowRawSql?: boolean;
};
