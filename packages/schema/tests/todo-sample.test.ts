import { parse } from './utils';

describe('Basic Tests', () => {
    it('sample todo schema', async () => {
        const content = `
            /*
            * A sample model for a collaborative Todo app
            */
        
            // Datasource
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }
        
            enum SpaceUserRole {
                USER
                ADMIN
            }
        
            model Space {
                id String @id
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
                name String @length(1, 100)
                slug String @unique @length(1, 20)
                members SpaceUser[]
        
                // require login
                @@deny('all', auth() == null)       
                // everyone can create a space
                @@allow('create', true)

                // any user in the space can read the space
                @@allow('read', members?[user == auth()])

                // space admin can update and delete
                @@allow('update,delete', members?[user == auth() && role == ADMIN])
            }
        
            model SpaceUser {
                id String @id
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
                space Space @cascade
                user User @cascade
                role SpaceUserRole
                todoLists TodoList[]
                
                @@unique([user, space])
        
                // require login
                @@deny('all', auth() == null)
        
                // space admin can create/update/delete
                @@allow('create,update,delete', space.members?[user == auth() && role == ADMIN])
        
                // user can read entries for spaces which he's a member of
                @@allow('read', space.members?[user == auth()])
            }
        
            model User {
                id String @id
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
                email String @unique @email
                name String? @length(1, 100)
                spaces SpaceUser[]
                image String? @url
                todoLists TodoList[]
        
                // can be created by anyone, even not logged in
                @@allow('create', true)
        
                // can be read by users sharing any space
                @@allow('read', spaces?[auth() == user])
        
                // can only be updated and deleted by himeself
                @@allow('update,delete', auth() == this) 
            }

            model TodoList {
                id String @id
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
                space Space @cascade
                owner User
                title String @length(1, 20)
                private Boolean @default(false)
                todos Todo[]
        
                // require login
                @@deny('all', auth() == null)
        
                // can be read by owner or space members (only if not private) 
                @@allow('read', owner == auth() || (space.members?[user == auth()] && !private))
        
                // can be created/updated/deleted by owner
                @@allow('create,update,delete', owner == auth() && space.members?[user == auth()]) 
            }
        
            model Todo {
                id String @id
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
                owner User
                todoList TodoList @cascade
                title String
                completedAt DateTime?
        
                // require login
                @@deny('all', auth() == null)
        
                // owner has full access, also space members have full access (if the parent TodoList is not private)
                @@allow('all', todoList.owner == auth() || (todoList.space.members?[user == auth()] && !todoList.private))
            }
        `;
        await parse(content);
    });
});
