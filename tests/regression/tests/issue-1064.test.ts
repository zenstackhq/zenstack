import { loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1064', () => {
    it('test', async () => {
        const schema = `
        model Account {
          id                String  @id @default(cuid())
          userId            String
          type              String
          provider          String
          providerAccountId String
          refresh_token     String? // @db.Text
          access_token      String? // @db.Text
          expires_at        Int?
          token_type        String?
          scope             String?
          id_token          String? // @db.Text
          session_state     String?
          user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
          @@allow('all', auth().id == userId)
          @@unique([provider, providerAccountId])
        }
        
        model Session {
          id           String   @id @default(cuid())
          sessionToken String   @unique
          userId       String
          expires      DateTime
          user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
          @@allow('all', auth().id == userId)
        }
        
        model VerificationToken {
          identifier String
          token      String   @unique
          expires    DateTime
          
          @@allow('all', true)
          @@unique([identifier, token])
        }
        
        model User {
          id            String    @id @default(cuid())
          name          String?
          email         String?   @unique
          emailVerified DateTime?
          image         String
          accounts      Account[]
          sessions      Session[]
        
          username    String    @unique @length(min: 4, max: 20)
          about       String?   @length(max: 500)
          location    String?   @length(max: 100)
        
          role        String @default("USER") @deny(operation: "update", auth().role != "ADMIN")
        
          inserted_at DateTime   @default(now())
          updated_at  DateTime   @updatedAt() @default(now())
        
          editComments  EditComment[]
        
          posts       Post[]
          rankings                UserRanking[]
          ratings                 UserRating[]
          favorites               UserFavorite[]
        
          people        Person[]
          studios       Studio[]
          edits         Edit[]
          attachments Attachment[]
          galleries Gallery[]
        
          uploads UserUpload[]
        
          maxUploadsPerDay Int @default(10)
          maxEditsPerDay Int @default(10)
        
          // everyone can signup, and user profile is also publicly readable
          @@allow('create,read', true)
          // only the user can update or delete their own profile
          @@allow('update,delete', auth() == this)
        }
        
        abstract model UserEntityRelation {
          entityId      String?
          entity        Entity?        @relation(fields: [entityId], references: [id], onUpdate: NoAction)
          userId   String
          user     User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
        
        
          // everyone can read
          @@allow('read', true)
          @@allow('create,update,delete', auth().id == this.userId)
        
          @@unique([userId,entityId])
        }
        
        model UserUpload {
          timestamp DateTime @default(now())
          
          key String @id
          url String @unique
          size Int
        
          userId String  
          user   User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
        
          @@allow('create', auth().id == userId)
          @@allow('all', auth().role == "ADMIN")
        }
        
        model Post {
          id      Int    @id @default(autoincrement())
          title    String @length(max: 100)
          body     String @length(max: 1000)
          createdAt DateTime @default(now())
        
          authorId String  
          author   User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: NoAction)
          
          @@allow('read', true)
          @@allow('create,update,delete', auth().id == authorId && auth().role == "ADMIN")
        }
        
        model Edit extends UserEntityRelation {
          id      String          @id @default(cuid())
          status String @default("PENDING") @allow('update', auth().role in ["ADMIN", "MODERATOR"])
          type    String  @allow('update', false)
          timestamp DateTime   @default(now())
          note  String? @length(max: 300)
          // for creates - createPayload & updates - data before diff is applied
          data String?
          // for updates
          diff String?
        
          comments EditComment[]
        }
        
        model EditComment {
          id      Int          @id @default(autoincrement())
          timestamp DateTime @default(now())
          content  String  @length(max: 300)
          editId  String
          edit Edit @relation(fields: [editId], references: [id], onUpdate: Cascade)
          authorId  String
          author    User @relation(fields: [authorId], references: [id], onUpdate: Cascade)
        
          // everyone can read
          @@allow('read', true)
          @@allow('create,update,delete', auth().id == this.authorId || auth().role in ["ADMIN", "MODERATOR"])
        }
        
        model MetadataIdentifier {
          id  Int @default(autoincrement()) @id
          
          identifier String
        
          metadataSource String
          MetadataSource MetadataSource @relation(fields: [metadataSource], references: [slug], onUpdate: Cascade)
        
          entities Entity[]
        
          @@unique([identifier, metadataSource])
        
          @@allow('read', true)
          @@allow('create,update,delete', auth().role in ["ADMIN", "MODERATOR"])
        }

        model MetadataSource {
          slug String @id
          name String @unique
          identifierRegex String
          desc   String?
          url    String
          icon   String
          identifiers MetadataIdentifier[]
        
          @@allow('all', auth().role == "ADMIN")
        }
        
        model Attachment extends UserEntityRelation {
          id            String         @id @default(cuid())
          createdAt     DateTime   @default(now())
          key           String         @unique
          url           String          @unique
          galleries     Gallery[]
          @@allow('delete', auth().role in ["ADMIN", "MODERATOR"])
        }
        
        model Entity {
          id      String          @id @default(cuid()) 
          name    String
          desc  String?          
          
          attachments Attachment[]
          createdAt DateTime @default(now())
          updatedAt DateTime @updatedAt @default(now())
          
          type String
        
          status  String @default("PENDING") // PENDING ON INITIAL CREATION
          verified Boolean @default(false)
        
          edits Edit[]  
          userRankings UserRanking[]
          userFavorites UserFavorite[]
          userRatings UserRating[]
          metaIdentifiers MetadataIdentifier[]
        
          @@delegate(type)
         
          @@allow('read', true)
          @@allow('create', auth() != null)
          @@allow('update', auth().role in ["ADMIN", "MODERATOR"])
          @@allow('delete', auth().role == "ADMIN")
        }
        
        model Person extends Entity {
          studios Studio[]
          owners    User[]
          clips     Clip[]
          events Event[]
          galleries Gallery[]
        }
        
        model Studio extends Entity {
          people Person[]
          owners User[]
          clips     Clip[]
          events Event[]
          galleries Gallery[]
        }
        
        model Clip extends Entity {
          url   String?
          people Person[]
          studios Studio[]
          galleries Gallery[]
        }
        
        model UserRanking extends UserEntityRelation {
          id      String       @id @default(cuid()) 
          rank     Int  @gte(1) @lte(100)
          note     String? @length(max: 300)
        }
        
        model UserFavorite extends UserEntityRelation {
          id      String       @id @default(cuid()) 
          favoritedAt DateTime @default(now())
        }
        
        model UserRating  extends UserEntityRelation  {
          id      String @id @default(cuid()) 
          rating    Int @gte(1) @lte(5)
          note     String?  @length(max: 500)  
          ratedAt DateTime @default(now())
        }
        
        model Event {
          id      Int       @id @default(autoincrement()) 
          name    String  @length(max: 100)  
          desc    String?  @length(max: 500)  
          location String?  @length(max: 100) 
          date     DateTime?
          people   Person[]
          studios  Studio[]
        
          @@allow('read', true)
          @@allow('create,update,delete', auth().role == "ADMIN")
        }
        
        model Gallery {
          id      String       @id @default(cuid()) 
          studioId String?  
          personId String?  
          timestamp DateTime  @default(now())
          authorId   String   
          author   User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: NoAction)
          people    Person[]
          studios   Studio[]
          clips     Clip[]
          attachments Attachment[]
        
          @@allow('read', true)
          @@allow('create,update,delete', auth().id == this.authorId && auth().role == "ADMIN")
        }
        `;

        await loadSchema(schema);
    });
});
