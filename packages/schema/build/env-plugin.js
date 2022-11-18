// from: https://github.com/rw3iss/esbuild-envfile-plugin

const path = require('path');
const fs = require('fs');

const ENV = process.env.NODE_ENV || 'development';

module.exports = {
    name: 'env',

    setup(build) {
        function _findEnvFile(dir) {
            if (!fs.existsSync(dir)) return undefined;

            if (fs.existsSync(`${dir}/.env.${ENV}`)) {
                return `${dir}/.env.${ENV}`;
            } else if (fs.existsSync(`${dir}/.env`)) {
                return `${dir}/.env`;
            } else {
                const next = path.resolve(dir, '../');
                if (next === dir) {
                    // at root now, exit
                    return undefined;
                } else {
                    return _findEnvFile(next);
                }
            }
        }

        build.onResolve({ filter: /^env$/ }, async (args) => {
            const envPath = _findEnvFile(args.resolveDir);
            return {
                path: args.path,
                namespace: 'env-ns',
                pluginData: {
                    ...args.pluginData,
                    envPath,
                },
            };
        });

        build.onLoad({ filter: /.*/, namespace: 'env-ns' }, async (args) => {
            // read in .env file contents and combine with regular .env:
            let config = {};
            if (args.pluginData && args.pluginData.envPath) {
                let data = await fs.promises.readFile(
                    args.pluginData.envPath,
                    'utf8'
                );
                const buf = Buffer.from(data);
                config = require('dotenv').parse(buf);
            }

            return {
                contents: JSON.stringify({ ...config, ...process.env }),
                loader: 'json',
            };
        });
    },
};
