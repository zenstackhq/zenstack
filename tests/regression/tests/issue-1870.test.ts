import { loadModel, loadSchema } from '@zenstackhq/testtools';

describe('issue 1870', () => {
    it('regression', async () => {
        await loadModel(
            `
        model Polygon {
            id      Int      @id @default(autoincrement())
            geometry    Unsupported("geometry(MultiPolygon, 4326)")
            @@index([geometry], name: "parcel_polygon_idx", type: Gist)
        }
            `
        );
    });
});
