let schemas;
try {
    schemas = require('.zenstack/zod/objects');
} catch {}

module.exports = schemas && {
    ...schemas,
};
