let schemas;
try {
    schemas = require('.zenstack/zod/models');
} catch {}

module.exports = schemas && {
    ...schemas,
};
