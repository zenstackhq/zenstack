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

export type FieldInfo = { type: string; isArray: boolean };

export interface Service<DbClient = any> {
    get db(): DbClient;

    resolveField(model: string, field: string): Promise<FieldInfo | undefined>;

    buildQueryGuard(
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ): any;
}

export enum ServerErrorCode {
    ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
    INVALID_REQUEST_PARAMS = 'INVALID_REQUEST_PARAMS',
    DENIED_BY_POLICY = 'DENIED_BY_POLICY',
    UNIQUE_CONSTRAINT_VIOLATION = 'UNIQUE_CONSTRAINT_VIOLATION',
    REFERENCE_CONSTRAINT_VIOLATION = 'REFERENCE_CONSTRAINT_VIOLATION',
    UNKNOWN = 'UNKNOWN',
}
