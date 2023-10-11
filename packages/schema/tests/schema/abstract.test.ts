import * as fs from 'fs';
import path from 'path';
import { loadModel } from '@zenstackhq/testtools';

describe('Abstract Schema Tests', () => {
    it('model loading', async () => {
        const content = fs.readFileSync(path.join(__dirname, './abstract.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });

    it('empty inheritance', async () => {
        await loadModel(`
        datasource db {
            provider = 'postgresql'
            url = env('DATABASE_URL')
        }
        
        generator js {
            provider = 'prisma-client-js'
        }
        
        abstract model Base {
            id Int @id @default(autoincrement())
        }

        model Foo extends Base {}
        `);
    });
});
