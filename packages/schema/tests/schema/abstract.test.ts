import * as fs from 'fs';
import path from 'path';
import { loadModel } from '../utils';

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

    it('multiple level inheritance', async () => {
        await loadModel(`
        datasource db {
            provider = 'postgresql'
            url = env('DATABASE_URL')
        }
        
        generator js {
            provider = 'prisma-client-js'
        }
        
        abstract model Base1 {
            id    String @id @default(cuid())
        }
          
        abstract model Base2 extends Base1 {
            fieldA String
        }
          
        model A extends Base2 {
            field String
            b B[]
        }

        model B {
            id    String @id @default(cuid())
            a  A @relation(fields: [aId], references: [id])
            aId String
          }
          
        `);
    });
});
