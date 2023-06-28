let schemas;
try {
    schemas = require('.zenstack/zod/models/index');
} catch {}

module.exports = schemas && {
    ...schemas,
};
