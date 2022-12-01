import service from '.zenstack/lib';

export type {
    FieldInfo,
    PolicyKind,
    PolicyOperationKind,
    RuntimeAttribute,
    QueryContext,
} from '../lib/types';

export {
    requestHandler,
    type RequestHandlerOptions,
} from '../lib/request-handler';

export default service;
