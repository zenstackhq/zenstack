let schemas;
try {
    schemas = require('.zenstack/zod/input');
} catch {}

module.exports = schemas && {
    ...schemas,
};
