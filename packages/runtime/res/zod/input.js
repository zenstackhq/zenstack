let schemas;
try {
    schemas = require('.zenstack/zod/input/index');
} catch {}

module.exports = schemas && {
    ...schemas,
};
