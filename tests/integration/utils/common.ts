export const MODEL_PRELUDE = `
datasource db {
    provider = 'sqlite'
    url = 'file:./operations.db'
}

generator js {
    provider = 'prisma-client-js'
    output = '../.prisma'
}

plugin policy {
    provider = '@zenstack/access-policy'
    output = 'policy'
}
`;
