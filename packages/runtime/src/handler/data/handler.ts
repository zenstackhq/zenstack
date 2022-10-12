import { NextApiRequest, NextApiResponse } from 'next';
import { RequestHandlerOptions } from '../../request-handler';
import { QueryContext, Service } from '../../types';
import { RequestHandler } from '../types';
import { QueryProcessor } from './query-processor';

export default class DataHandler<DbClient> implements RequestHandler {
    private readonly queryProcessor: QueryProcessor;

    constructor(
        private readonly service: Service<DbClient>,
        private readonly options: RequestHandlerOptions
    ) {
        this.queryProcessor = new QueryProcessor(service);
    }

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
        const processedArgs = await this.queryProcessor.processQueryArgs(
            model,
            args,
            'read',
            context
        );

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
            if (!r) {
                res.status(404).send({ error: `${model} not found` });
                return;
            }
        } else {
            r = await db.findMany(processedArgs);
        }

        await this.queryProcessor.postProcess(
            model,
            processedArgs,
            r,
            'read',
            context
        );

        res.status(200).send(r);
    }

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
