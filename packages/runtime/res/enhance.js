'use strict';
Object.defineProperty(exports, '__esModule', { value: true });

try {
    exports.enhance = require('.zenstack/enhance').enhance;
} catch {
    exports.enhance = function () {
        throw new Error('Generated "enhance" function not found. Please run `zenstack generate` first.');
    };
}
