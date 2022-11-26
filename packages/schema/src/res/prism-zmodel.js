(function (Prism) {
    Prism.languages.zmodel = Prism.languages.extend('clike', {
        keyword: /\b(?:datasource|enum|generator|model|attribute|function)\b/,
        'type-class-name': /(\b()\s+)[\w.\\]+/,
    });

    Prism.languages.javascript['class-name'][0].pattern =
        /(\b(?:model|datasource|enum|generator)\s+)[\w.\\]+/;

    Prism.languages.insertBefore('zmodel', 'function', {
        annotation: {
            pattern: /@+\w+/,
            lookbehind: true,
            alias: 'punctuation',
        },
    });

    Prism.languages.insertBefore('zmodel', 'punctuation', {
        'type-args': /\b(?:references|fields|onDelete|onUpdate):/,
    });

    Prism.languages.json5 = Prism.languages.js;
})(Prism);
