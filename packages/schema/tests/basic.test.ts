import { parse } from './utils';

describe('Basic Tests', () => {
    it('functions', async () => {
        const content = `
            function userInSpace(user, space) {
                exists(SpaceUser, $.space == space && $.user == user)
            }
        `;
        await parse(content);
    });

    it('feature coverage', async () => {
        const content = `
            datasource {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }

            fragment CommonFields {
                id String @id
                createdBy User @createdBy
                updatedBy User @updatedBy
                createdAt DateTime @createdAt
                updatedAt DateTime @updatedAt
            }

            model Space 
            @deny('all', auth() == null)
            @allow('create', true)
            @allow('read', userInSpace(auth(), $this))
            @allow('update,delete', userIsSpaceAdmin(auth(), $this)) {
                ...CommonFields
                name String
                slug String @unique
                members SpaceUser[] @cascade
                todoLists TodoList[] @cascade
            }
            
            enum SpaceUserRole {
                USER
                ADMIN
            }

            model SpaceUser
            @deny('all', auth() == null)
            @allow('create,update,delete', userIsSpaceAdmin(auth(), $this.space))
            @allow('read', userInSpace(auth(), $this.space)) {
                ...CommonFields
                space Space
                user User
                role SpaceUserRole
            }
            
            model User
            @deny('all', auth() == null)
            @allow('create', true)
            @allow('read', userInAnySpace(auth(), spaces))
            @allow('update,delete', auth() == $this) {
                ...CommonFields
                email String @unique
                name String?
                todoList TodoList[]
                spaces SpaceUser[] @cascade
                profile Profile? @cascade
            }

            model Profile
            @deny('all', auth() == null)
            @allow('read', userInAnySpace(auth(), $this.user.spaces))
            @allow('create,update,delete', $this.user == auth()) {
                ...CommonFields
                user User @unique
                avatar String?
            }

            model TodoList
            @deny('all', auth() == null)
            @allow('read', $this.owner == auth() || (userInSpace(auth(), $this.space) && !$this.private))
            @allow('create,update,delete', $this.owner == auth() && userInSpace(auth(), $this.space)) {
                ...CommonFields
                space Space
                owner User
                title String
                content String
                private Boolean @default(true)
                todos Todo[] @cascade
            }

            model Todo 
            @deny('all', auth() == null)
            @allow('all', $this.todoList.owner == auth() || (userInSpace(auth(), $this.todoList.space) && !$this.todoList.private)) {
                ...CommonFields
                owner User
                todoList TodoList
                title String
                completedAt DateTime?
            }

            function userInSpace(user, space) {
                exists(SpaceUser, $.space == space && $.user == user)
            }

            function userIsSpaceAdmin(user, space) {
                exists(SpaceUser, $.space == space && $.user == user && $.role == ADMIN)
            }

            function userInAnySpace(user, spaces) {
                find(spaces, $.user == user)
            }
        `;

        const model = await parse(content);

        console.log('Dump AST:', model);
    });
});
