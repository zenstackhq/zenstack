import { NextApiRequest, NextApiResponse } from 'next';
import { RequestHandlerOptions } from '../request-handler';
import { PolicyOperationKind, QueryContext, Service } from '../types';
import deepcopy from 'deepcopy';

export default class DataHandler<DbClient> {
    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {}

    async handle(req: NextApiRequest, res: NextApiResponse, path: string[]) {
        const [model, id] = path;
        const method = req.method;

        const context = { user: await this.options.getServerUser(req, res) };

        switch (method) {
            case 'GET':
                this.get(req, res, model, id, context);
                break;

            case 'POST':
                this.post(req, res, model, context);
                break;

            case 'PUT':
                this.put(req, res, model, id, context);
                break;

            case 'DELETE':
                this.del(req, res, model, id, context);
                break;
        }
    }

    private async get(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        const db = (this.service.db as any)[model];
        const args = req.query.q ? JSON.parse(req.query.q as string) : {};
        const processedArgs = this.processDbArgs(model, args, 'read', context);

        let r;
        if (id) {
            if (processedArgs.where) {
                processedArgs.where = {
                    AND: [args.where, { id }],
                };
            } else {
                processedArgs.where = { id };
            }
            r = await db.findFirst(processedArgs);
        } else {
            r = await db.findMany(processedArgs);
        }

        this.postProcess(r);

        res.status(200).send(r);
    }

    private processDbArgs(
        model: string,
        args: any,
        action: PolicyOperationKind,
        context: QueryContext
    ) {
        const r = deepcopy(args);
        const guard = this.service.buildQueryGuard(model, action, context);
        if (guard) {
            if (!r.where) {
                r.where = guard;
            } else {
                r.where = {
                    AND: [guard, r.where],
                };
            }
        }
        return r;
    }

    private async postProcess(r: any) {}

    private post(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        context: QueryContext
    ) {
        throw new Error('Function not implemented.');
    }

    private put(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        throw new Error('Function not implemented.');
    }

    private del(
        req: NextApiRequest,
        res: NextApiResponse,
        model: string,
        id: string,
        context: QueryContext
    ) {
        throw new Error('Function not implemented.');
    }
}
