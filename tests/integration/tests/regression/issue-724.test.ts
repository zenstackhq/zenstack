import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 724', () => {
    it('regression', async () => {
        await loadSchema(
            `
        generator client {
            provider = "prisma-client-js"
        }
          
        datasource db {
            provider = "sqlserver"
            url      = env("DATABASE_URL")
        }
          
        plugin trpc {
            provider = '@zenstackhq/trpc'
            output = 'src/server/routers/generated'
        }
          
        model LastLocation {
            LastLocationID       String    @id(map: "PK_LastLocation") @db.UniqueIdentifier
            UserID                   String    @db.UniqueIdentifier
            JobID                      String?   @db.UniqueIdentifier
            Timestamp          DateTime? @db.DateTime
            Latitude                 String?   @db.VarChar(Max)
            Longitude                String?   @db.NVarChar(Max)
            MostRecentTimestamp DateTime? @db.DateTime
            CreatedDate               DateTime                    @default(now(), map: "DF_Address_CreatedDate") @db.DateTime
          
            @@index([UserID], map: "IX_UserID")
        }
        `,
            { addPrelude: false, pushDb: false }
        );
    });
});
