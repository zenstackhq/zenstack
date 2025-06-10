import { AdapterBaseOptions } from "../../types";

export interface ApiHandlerOptions extends AdapterBaseOptions {
    /**
     * The base URL for the API handler. This is used to determine the base path for the API requests.
     * If you are using the ApiHandlerService in a route with a prefix, you should set this to the prefix.
     * 
     * e.g.
     * without baseUrl(API handler default route):
     * - RPC API handler: [model]/findMany
     * - RESTful API handler: /:type
     * 
     * with baseUrl(/api/crud):
     * - RPC API handler: /api/crud/[model]/findMany
     * - RESTful API handler: /api/crud/:type
     */
    baseUrl?: string;
}
