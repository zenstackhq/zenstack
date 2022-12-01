import service, { QueryContext } from '@zenstackhq/runtime/server';

export async function getSpaceBySlug(queryContext: QueryContext, slug: string) {
    const spaces = await service.space.find(queryContext, {
        where: { slug },
    });
    if (spaces.length === 0) {
        throw new Error('Space not found: ' + slug);
    }
    return spaces[0];
}
