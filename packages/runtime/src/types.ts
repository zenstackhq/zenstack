export interface DbOperations {
    findMany(args: any): Promise<any[]>;
    findFirst(args: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    delete(args: any): Promise<any>;
}

export type PolicyKind = 'allow' | 'deny';

export type PolicyOperationKind = 'create' | 'update' | 'read' | 'delete';

export type AuthUser = { id: string } & Record<string, any>;

export type QueryContext = {
    user?: AuthUser;
};

export interface Service<DbClient> {
    get db(): DbClient;

    buildQueryGuard(
        model: string,
        spec: PolicyOperationKind,
        context: QueryContext
    ): any;
}
