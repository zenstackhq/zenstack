import { NextApiRequest, NextApiResponse } from 'next';
import superjson from 'superjson';
import { RequestHandlerOptions } from '../../request-handler';
import { registerSerializers } from '../../serialization-utils';
import {
    DbClientContract,
    QueryContext,
    ServerErrorCode,
    Service,
} from '../../types';
import { CRUDError, RequestHandler } from '../types';
import { CRUD } from './crud';

registerSerializers();

/**
 * Request handler for /data endpoint which processes data CRUD requests.
 */
export default class DataHandler<DbClient extends DbClientContract>
    implements RequestHandler
{
    private readonly crud: CRUD<DbClient>;

    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {
        this.crud = new CRUD(service);
    }

    async handle(
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[]
    ): Promise<void> {
        const [model, id] = path;
        const method = req.method;

        const context = { user: await this.options.getServerUser(req, res) };

        this.service.verbose(`Data request: ${method} ${path}`);
        if (req.body) {
            this.service.verbose(
                `Request body: ${superjson.stringify(req.body)}`
            );
        }

        try {
            switch (method) {
                case 'GET':
                    await this.get(req, res, model, id, context);
                    break;

                case 'POST':
                    await this.post(req, res, model, context);
                    break;

                case 'PUT':
                    await this.put(req, res, model, id, context);
                    break;

                case 'DELETE':
                    await this.del(req, res, model, id, context);
                    break;

                default:
                    this.service.warn(`Unhandled method: ${method}`);
                    res.status(200).send({});
                    break;
            }
        } catch (err: unknown) {
            if (err instanceof CRUDError) {
                this.service.warn(`${method} ${model}: ${err}`);

                // in case of errors thrown directly by ZenStack
                switch (err.code) {
                    case ServerErrorCode.DENIED_BY_POLICY:
                    case ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED:
                        res.status(403).send({
                            code: err.code,
                            message: err.message,
                        });
                        break;

                    case ServerErrorCode.ENTITY_NOT_FOUND:
                        res.status(404).send({
                            code: err.code,
                            message: err.message,
                        });
                        break;

                    case ServerErrorCode.UNKNOWN:
                        res.status(500).send({
                            code: err.code,
                            message: err.message,
                        });
                        break;

                    default:
                        res.status(400).send({
                            code: err.code,
                            message: err.message,
                        });
                }
            }
        }
    }

    private marshal(value: unknown) {
        return JSON.parse(superjson.stringify(value));
    }

    private unmarshal(value: unknown) {
        if (typeof value === 'string') {
            return superjson.parse(value);
        } else {
            return superjson.parse(JSON.stringify(value));
        }
    }

    private async get(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        // parse additional query args from "q" parameter
        const args = req.query.q ? this.unmarshal(req.query.q as string) : {};

        if (id) {
            // GET <model>/:id, make sure "id" is injected
            const result = await this.crud.get(model, id, args, context);
            if (!result) {
                throw new CRUDError(ServerErrorCode.ENTITY_NOT_FOUND);
            }
            res.status(200).send(this.marshal(result));
        } else {
            // GET <model>/, get list
            const result = await this.crud.find(model, args, context);
            res.status(200).send(this.marshal(result));
        }
    }

    private async post(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        context: QueryContext
    ) {
        const result = await this.crud.create(
            model,
            this.unmarshal(req.body),
            context
        );
        res.status(201).send(this.marshal(result));
    }

    private async put(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        if (!id) {
            throw new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'missing "id" parameter'
            );
        }

        const result = await this.crud.update(
            model,
            id,
            this.unmarshal(req.body),
            context
        );
        res.status(200).send(this.marshal(result));
    }

    private async del(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        if (!id) {
            throw new CRUDError(
                ServerErrorCode.INVALID_REQUEST_PARAMS,
                'missing "id" parameter'
            );
        }

        const args = req.query.q ? this.unmarshal(req.query.q as string) : {};
        const result = await this.crud.del(model, id, args, context);
        res.status(200).send(this.marshal(result));
    }
}
