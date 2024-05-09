import { FILE_SPLITTER, loadSchema } from '@zenstackhq/testtools';

describe('issue 1388', () => {
    it('regression', async () => {
        await loadSchema(
            `schema.zmodel
            import './auth'
            import './post'

            ${FILE_SPLITTER}auth.zmodel
            model User {
              id   String @id @default(cuid())
              role String
            }
            
            ${FILE_SPLITTER}post.zmodel
            model Post {
              id        String  @id @default(nanoid(6))
              title String
              @@deny('all', auth() == null)
              @@allow('all', auth().id == 'user1')
            }
            `
        );
    });
});
