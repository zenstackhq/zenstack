import service from '.zenstack/lib';

export type {
    FieldInfo,
    PolicyKind,
    PolicyOperationKind,
    RuntimeAttribute,
    QueryContext,
    Service,
    DbClientContract,
} from '../lib/types';

export {
    requestHandler,
    type RequestHandlerOptions,
} from '../lib/request-handler';

export default service;
