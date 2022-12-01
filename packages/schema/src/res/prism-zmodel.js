// based on: https://github.com/prisma/docs/blob/c72eb087fcf57f3c00d153f86c549ef28b3d0f44/src/components/customMdx/prism/prism-prisma.js

(function (Prism) {
    Prism.languages.zmodel = Prism.languages.extend('clike', {
        keyword:
            /\b(?:datasource|enum|generator|model|attribute|function|null|this)\b/,
        'type-class-name': /(\b()\s+)[\w.\\]+/,
    });

    Prism.languages.javascript['class-name'][0].pattern =
        /(\b(?:model|datasource|enum|generator)\s+)[\w.\\]+/;

    Prism.languages.insertBefore('zmodel', 'function', {
        annotation: {
            pattern: /(^|[^.])@+\w+/,
            lookbehind: true,
            alias: 'punctuation',
        },
    });

    Prism.languages.json5 = Prism.languages.js;
})(Prism);
