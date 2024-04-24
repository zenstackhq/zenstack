import { getObjectLiteral } from '@zenstackhq/sdk';
import { Plugin, PluginField, isPlugin } from '@zenstackhq/sdk/ast';
import { loadModel } from '@zenstackhq/testtools';

describe('Regression: issue 744', () => {
    it('regression', async () => {
        const model = await loadModel(
            `
        generator client {
            provider = "prisma-client-js"
        }
            
        datasource db {
            provider = "postgresql"
            url      = env("DATABASE_URL")
        }
                    
        plugin zod {
            provider = '@core/zod'
            settings = {
                '200': { status: 'ok' },
                'x-y-z': 200,
                foo: 'bar'
            }
        }

        model Foo {
            id String @id @default(cuid())
        }
        `
        );

        const plugin = model.declarations.find((d): d is Plugin => isPlugin(d));
        const settings = plugin?.fields.find((f): f is PluginField => f.name === 'settings');
        const value: any = getObjectLiteral(settings?.value);
        expect(value['200']).toMatchObject({ status: 'ok' });
        expect(value['x-y-z']).toBe(200);
        expect(value.foo).toBe('bar');
    });
});
