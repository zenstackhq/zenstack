module.exports = {
    presets: [
        ['@babel/preset-typescript'],
        [
            '@babel/preset-env',
            {
                targets: { node: '14' },
            },
        ],
    ],
    plugins: ['inline-dotenv'],
    ignore: ['src/extension.ts'],
    sourceMaps: true,
};
