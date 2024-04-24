import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1167', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model FileAsset {
                id String @id @default(cuid())
                delegate_type String
                @@delegate(delegate_type)
                @@map("file_assets")
            }
            
            model ImageAsset extends FileAsset {
              @@map("image_assets")
            }
            `
        );
    });
});
