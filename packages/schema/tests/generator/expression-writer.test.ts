import { Project, VariableDeclarationKind } from 'ts-morph';
import {
    DataModel,
    Expression,
    isDataModel,
} from '../../src/language-server/generated/ast';
import { loadModel } from '../utils';
import * as tmp from 'tmp';
import expressionWriter from '../../src/generator/server/expression-writer';

async function check(
    schema: string,
    getExpr: (model: DataModel) => Expression
) {
    const model = await loadModel(schema);
    const expr = getExpr(
        model.declarations.find(
            (d) => isDataModel(d) && d.name === 'Test'
        ) as DataModel
    );

    const project = new Project();

    const { name: sourcePath } = tmp.fileSync({ postfix: '.ts' });
    const sf = project.createSourceFile(sourcePath, undefined, {
        overwrite: true,
    });
    console.log(`Generated source: ${sourcePath}`);

    sf.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [{ name: 'user', initializer: '{ id: "user1" }' }],
    });

    sf.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: 'expr',
                initializer: (writer) =>
                    new expressionWriter(writer).write(expr),
            },
        ],
    });
    sf.formatText();

    await project.save();

    if (project.getPreEmitDiagnostics().length > 0) {
        for (const d of project.getPreEmitDiagnostics()) {
            console.warn(`${d.getLineNumber()}: ${d.getMessageText()}`);
        }
        throw new Error('Compilation errors occurred');
    }

    const outExpr = sf.getVariableDeclaration('expr');
    console.log('Generated expr:\n', outExpr?.getText());
    return outExpr?.getInitializer();
}

describe('Expression Writer Tests', () => {
    it('boolean literal', async () => {
        await check(
            `
            model Test {
                @@allow('all', true)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                @@allow('all', false)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });

    it('boolean field', async () => {
        await check(
            `
            model Test {
                flag Boolean
                @@allow('all', flag)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                flag Boolean
                @@allow('all', !flag)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });

    it('field against literal', async () => {
        await check(
            `
            model Test {
                count Int
                @@allow('all', count > 0)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                label String
                @@allow('all', label == 'thing')
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });

    it('logical', async () => {
        await check(
            `
            model Test {
                count Int
                @@allow('all', count > 0 && count > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                count Int
                @@allow('all', count > 0 || count > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                count Int
                @@allow('all', count > 0 && count > 1 || count > 2)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model Test {
                count Int
                @@allow('all', !(count > 0 && count > 1 || !count > 2))
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });

    it('to-one relation query', async () => {
        await check(
            `
            model Foo {
                count Int
            }

            model Test {
                foo Foo
                @@deny(foo.count <= 0)
            }
            `,
            (model) => model.attributes[0].args[0].value
        );

        await check(
            `
            model Foo {
                count Int
            }

            model Test {
                foo Foo
                @@deny(!(foo.count > 0))
            }
            `,
            (model) => model.attributes[0].args[0].value
        );
    });

    it('auth check', async () => {
        await check(
            `
            model Test {
                @@deny(auth() == null)
            }
            `,
            (model) => model.attributes[0].args[0].value
        );

        await check(
            `
            model Test {
                @@allow('all', auth() != null)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });

    it('auth check against field', async () => {
        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                owner User
                @@allow('all', auth() == owner)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );

        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                owner User
                @@deny(auth() != owner)
            }
            `,
            (model) => model.attributes[0].args[0].value
        );

        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                owner User
                @@allow('all', auth().id == owner.id)
            }
            `,
            (model) => model.attributes[0].args[1].value
        );
    });
});
