import { Project, VariableDeclarationKind } from 'ts-morph';
import {
    DataModel,
    Expression,
    isDataModel,
} from '../../src/language-server/generated/ast';
import { loadModel } from '../utils';
import * as tmp from 'tmp';
import expressionWriter from '../../src/generator/server/data/expression-writer';

async function check(
    schema: string,
    getExpr: (model: DataModel) => Expression,
    expected: string
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
        console.log(`Generated source: ${sourcePath}`);
        throw new Error('Compilation errors occurred');
    }

    const outExpr = sf.getVariableDeclaration('expr');
    // console.log('Generated expr:\n', outExpr?.getText());

    if (expected) {
        const generatedExpr = outExpr!.getInitializer()!.getText();
        expect(generatedExpr.replace(/\s+/g, '')).toBe(
            expected.replace(/\s+/g, '')
        );
    }
}

describe('Expression Writer Tests', () => {
    it('boolean literal', async () => {
        await check(
            `
            model Test {
                @@allow('all', true)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ zenstack_guard: true }`
        );

        await check(
            `
            model Test {
                @@allow('all', false)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ zenstack_guard: false }`
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
            (model) => model.attributes[0].args[1].value,
            `{ flag: true }`
        );

        await check(
            `
            model Test {
                flag Boolean
                @@allow('all', !flag)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ NOT: { flag: true } }`
        );
    });

    it('field against literal', async () => {
        await check(
            `
            model Test {
                x Int
                @@allow('all', x > 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                x: {
                    gt: 0
                }
            }`
        );

        await check(
            `
            model Test {
                label String
                @@allow('all', label == 'thing')
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                label: {
                    equals: 'thing'
                }
            }`
        );
    });

    it('logical', async () => {
        await check(
            `
            model Test {
                x  Int
                @@allow('all', x  > 0 && x  > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                AND:
                    [
                        {
                            x : {
                                gt: 0
                            }
                        }
                        ,
                        {
                            x : {
                                gt: 1
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                x  Int
                @@allow('all', x  > 0 || x  > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                OR:
                    [
                        {
                            x : {
                                gt: 0
                            }
                        }
                        ,
                        {
                            x : {
                                gt: 1
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                x  Int
                @@allow('all', x  > 0 && x  > 1 || x  > 2)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                OR:
                    [
                        {
                            AND:
                                [
                                    {
                                        x : {
                                            gt: 0
                                        }
                                    }
                                    ,
                                    {
                                        x : {
                                            gt: 1
                                        }
                                    }
                                ]
                        }
                        ,
                        {
                            x : {
                                gt: 2
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                x  Int
                @@allow('all', !(x  > 0 && x  > 1 || !x  > 2))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT:
                {
                    OR:
                        [
                            {
                                AND:
                                    [
                                        {
                                            x : {
                                                gt: 0
                                            }
                                        }
                                        ,
                                        {
                                            x : {
                                                gt: 1
                                            }
                                        }
                                    ]
                            }
                            ,
                            {
                                NOT:
                                {
                                    x : {
                                        gt: 2
                                    }
                                }
                            }
                        ]
                }
            }`
        );
    });

    it('to-one relation query', async () => {
        await check(
            `
            model Foo {
                x  Int
            }

            model Test {
                foo Foo
                @@deny('all', foo.x  <= 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    is: {
                        x : {
                            le: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                x  Int
            }

            model Test {
                foo Foo
                @@deny('all', !(foo.x  > 0))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT:
                {
                    foo: {
                        is: {
                            x : {
                                gt: 0
                            }
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                x  Boolean
            }

            model Test {
                foo Foo
                @@deny('all', !foo.x)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT: {
                    foo: {
                        is: {
                            x: true
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                bar Bar
            }

            model Bar {
                x  Int
            }

            model Test {
                foo Foo
                @@deny('all', foo.bar.x  <= 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    is: {
                        bar: {
                            is: {
                                x : {
                                    le: 0
                                }
                            }
                        }
                    }
                }
            }`
        );
    });

    it('to-many relation query', async () => {
        await check(
            `
            model Foo {
                x Int
            }

            model Test {
                foos Foo[]
                @@deny('all', foos?[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    some: {
                        x: {
                            le: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                x Int
            }

            model Test {
                foos Foo[]
                @@deny('all', foos![x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    every: {
                        x: {
                            le: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                x Int
            }

            model Test {
                foos Foo[]
                @@deny('all', foos^[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    none: {
                        x: {
                            le: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                bars Bar[]
            }
            
            model Bar {
                x Int
            }

            model Test {
                foo Foo
                @@deny('all', foo.bars?[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    is: {
                        bars: {
                            some: {
                                x: {
                                    le: 0
                                }
                            }
                        }
                    }
                }
            }`
        );
    });

    it('auth check', async () => {
        await check(
            `
            model Test {
                @@deny('all', auth() == null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ zenstack_guard: user == null }`
        );

        await check(
            `
            model Test {
                @@allow('all', auth() != null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ zenstack_guard: user != null }`
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
            (model) => model.attributes[0].args[1].value,
            `{
                owner: {
                    is: {
                        id: {
                            equals: user?.id
                        }
                    }
                }
            }`
        );

        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                owner User
                @@deny('all', auth() != owner)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                owner: {
                    is: {
                        id: {
                            not: {
                                equals: user?.id
                            }
                        }
                    }
                }
            }`
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
            (model) => model.attributes[0].args[1].value,
            `{
                owner: {
                    is: {
                        id: {
                            equals: user?.id
                        }
                    }
                }
            }`
        );
    });
});
