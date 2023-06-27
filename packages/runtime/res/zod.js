let schemas;
try {
    schemas = require('.zenstack/zod/index');
} catch {}

module.exports = schemas && {
    ...schemas,
};
