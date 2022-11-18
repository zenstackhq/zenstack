// from: https://github.com/rw3iss/esbuild-envfile-plugin

const path = require('path');
const fs = require('fs');

const ENV = process.env.NODE_ENV || 'development';

module.exports = {
    name: 'env',

    setup(build) {
        function _findEnvFile(dir) {
            if (!fs.existsSync(dir)) return false;
            return fs.existsSync(`${dir}/.env.${ENV}`)
                ? `${dir}/.env.${ENV}`
                : fs.existsSync(`${dir}/.env`)
                ? `${dir}/.env`
                : _findEnvFile(path.resolve(dir, '../'));
        }

        build.onResolve({ filter: /^env$/ }, async (args) => {
            return {
                path: _findEnvFile(args.resolveDir),
                namespace: 'env-ns',
            };
        });

        build.onLoad({ filter: /.*/, namespace: 'env-ns' }, async (args) => {
            // read in .env file contents and combine with regular .env:
            let data = await fs.promises.readFile(args.path, 'utf8');
            const buf = Buffer.from(data);
            const config = require('dotenv').parse(buf);

            return {
                contents: JSON.stringify({ ...process.env, ...config }),
                loader: 'json',
            };
        });
    },
};
