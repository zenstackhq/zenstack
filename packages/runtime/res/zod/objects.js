let schemas;
try {
    schemas = require('.zenstack/zod/objects/index');
} catch {}

module.exports = schemas && {
    ...schemas,
};
