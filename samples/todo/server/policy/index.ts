import type { QueryContext } from "@zenstackhq/runtime";
import { SpaceUserRole } from "@prisma/client";

function Space_create(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                zenstack_guard: true
            }
        ]
    }
        ;
    return r;
}

function Space_update(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                members: {
                    some: {
                        AND:
                            [
                                {
                                    user: {
                                        is: {
                                            id: {
                                                equals: user?.id
                                            }
                                        }
                                    }
                                }
                                ,
                                {
                                    role: {
                                        equals: SpaceUserRole.ADMIN
                                    }
                                }
                            ]
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function Space_read(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                members: {
                    some: {
                        user: {
                            is: {
                                id: {
                                    equals: user?.id
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function Space_delete(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                members: {
                    some: {
                        AND:
                            [
                                {
                                    user: {
                                        is: {
                                            id: {
                                                equals: user?.id
                                            }
                                        }
                                    }
                                }
                                ,
                                {
                                    role: {
                                        equals: SpaceUserRole.ADMIN
                                    }
                                }
                            ]
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function SpaceUser_create(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                space: {
                    is: {
                        members: {
                            some: {
                                AND:
                                    [
                                        {
                                            user: {
                                                is: {
                                                    id: {
                                                        equals: user?.id
                                                    }
                                                }
                                            }
                                        }
                                        ,
                                        {
                                            role: {
                                                equals: SpaceUserRole.ADMIN
                                            }
                                        }
                                    ]
                            }
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function SpaceUser_update(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                space: {
                    is: {
                        members: {
                            some: {
                                AND:
                                    [
                                        {
                                            user: {
                                                is: {
                                                    id: {
                                                        equals: user?.id
                                                    }
                                                }
                                            }
                                        }
                                        ,
                                        {
                                            role: {
                                                equals: SpaceUserRole.ADMIN
                                            }
                                        }
                                    ]
                            }
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function SpaceUser_read(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                space: {
                    is: {
                        members: {
                            some: {
                                user: {
                                    is: {
                                        id: {
                                            equals: user?.id
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function SpaceUser_delete(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                space: {
                    is: {
                        members: {
                            some: {
                                AND:
                                    [
                                        {
                                            user: {
                                                is: {
                                                    id: {
                                                        equals: user?.id
                                                    }
                                                }
                                            }
                                        }
                                        ,
                                        {
                                            role: {
                                                equals: SpaceUserRole.ADMIN
                                            }
                                        }
                                    ]
                            }
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function User_create(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        OR: [{
            zenstack_guard: true
        }
            , {
            id: {
                equals: user?.id
            }
        }
        ]
    };
    return r;
}

function User_update(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        id: {
            equals: user?.id
        }
    };
    return r;
}

function User_read(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        OR: [{
            spaces: {
                some: {
                    space: {
                        is: {
                            members: {
                                some: {
                                    user: {
                                        is: {
                                            id: {
                                                equals: user?.id
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
            , {
            id: {
                equals: user?.id
            }
        }
        ]
    };
    return r;
}

function User_delete(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        id: {
            equals: user?.id
        }
    };
    return r;
}

function List_create(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                AND:
                    [
                        {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                        ,
                        {
                            space: {
                                is: {
                                    members: {
                                        some: {
                                            user: {
                                                is: {
                                                    id: {
                                                        equals: user?.id
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ]
            }
        ]
    }
        ;
    return r;
}

function List_update(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                AND:
                    [
                        {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                        ,
                        {
                            space: {
                                is: {
                                    members: {
                                        some: {
                                            user: {
                                                is: {
                                                    id: {
                                                        equals: user?.id
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ]
            }
        ]
    }
        ;
    return r;
}

function List_read(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                OR:
                    [
                        {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                        ,
                        {
                            AND:
                                [
                                    {
                                        space: {
                                            is: {
                                                members: {
                                                    some: {
                                                        user: {
                                                            is: {
                                                                id: {
                                                                    equals: user?.id
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    ,
                                    {
                                        NOT:
                                        {
                                            private: true
                                        }
                                    }
                                ]
                        }
                    ]
            }
        ]
    }
        ;
    return r;
}

function List_delete(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                owner: {
                    is: {
                        id: {
                            equals: user?.id
                        }
                    }
                }
            }
        ]
    }
        ;
    return r;
}

function Todo_create(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                OR: [{
                    list: {
                        is: {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                    }
                }
                    , {
                    AND:
                        [
                            {
                                list: {
                                    is: {
                                        space: {
                                            is: {
                                                members: {
                                                    some: {
                                                        user: {
                                                            is: {
                                                                id: {
                                                                    equals: user?.id
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            ,
                            {
                                NOT:
                                {
                                    list: {
                                        is: {
                                            private: true
                                        }
                                    }
                                }
                            }
                        ]
                }
                ]
            }
        ]
    }
        ;
    return r;
}

function Todo_update(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                OR: [{
                    list: {
                        is: {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                    }
                }
                    , {
                    AND:
                        [
                            {
                                list: {
                                    is: {
                                        space: {
                                            is: {
                                                members: {
                                                    some: {
                                                        user: {
                                                            is: {
                                                                id: {
                                                                    equals: user?.id
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            ,
                            {
                                NOT:
                                {
                                    list: {
                                        is: {
                                            private: true
                                        }
                                    }
                                }
                            }
                        ]
                }
                ]
            }
        ]
    }
        ;
    return r;
}

function Todo_read(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                OR: [{
                    list: {
                        is: {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                    }
                }
                    , {
                    AND:
                        [
                            {
                                list: {
                                    is: {
                                        space: {
                                            is: {
                                                members: {
                                                    some: {
                                                        user: {
                                                            is: {
                                                                id: {
                                                                    equals: user?.id
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            ,
                            {
                                NOT:
                                {
                                    list: {
                                        is: {
                                            private: true
                                        }
                                    }
                                }
                            }
                        ]
                }
                ]
            }
        ]
    }
        ;
    return r;
}

function Todo_delete(context: QueryContext): any {
    const user = context.user?.id ? context.user : { ...context.user, id: 'zenstack_unknown_user' };
    const r = {
        AND: [
            {
                NOT: {
                    zenstack_guard: user == null
                }
            }
            ,
            {
                OR: [{
                    list: {
                        is: {
                            owner: {
                                is: {
                                    id: {
                                        equals: user?.id
                                    }
                                }
                            }
                        }
                    }
                }
                    , {
                    AND:
                        [
                            {
                                list: {
                                    is: {
                                        space: {
                                            is: {
                                                members: {
                                                    some: {
                                                        user: {
                                                            is: {
                                                                id: {
                                                                    equals: user?.id
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            ,
                            {
                                NOT:
                                {
                                    list: {
                                        is: {
                                            private: true
                                        }
                                    }
                                }
                            }
                        ]
                }
                ]
            }
        ]
    }
        ;
    return r;
}

const policy = {
    fieldMapping: {
        space: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, createdAt: {
                name: "createdAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, updatedAt: {
                name: "updatedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@updatedAt", "args": [] }],
            }, name: {
                name: "name",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@length", "args": [{ "value": 4 }, { "value": 50 }] }],
            }, slug: {
                name: "slug",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@unique", "args": [] }, { "name": "@regex", "args": [{ "value": "^[0-9a-zA-Z]{4,16}$" }] }],
            }, members: {
                name: "members",
                type: "SpaceUser",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            }, lists: {
                name: "lists",
                type: "List",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            },
        }
        , spaceUser: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, createdAt: {
                name: "createdAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, updatedAt: {
                name: "updatedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@updatedAt", "args": [] }],
            }, space: {
                name: "space",
                type: "Space",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, spaceId: {
                name: "spaceId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, user: {
                name: "user",
                type: "User",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, userId: {
                name: "userId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, role: {
                name: "role",
                type: "SpaceUserRole",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            },
        }
        , user: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, createdAt: {
                name: "createdAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, updatedAt: {
                name: "updatedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@updatedAt", "args": [] }],
            }, email: {
                name: "email",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@unique", "args": [] }, { "name": "@email", "args": [] }],
            }, emailVerified: {
                name: "emailVerified",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, password: {
                name: "password",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [{ "name": "@password", "args": [] }, { "name": "@omit", "args": [] }],
            }, name: {
                name: "name",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, spaces: {
                name: "spaces",
                type: "SpaceUser",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            }, image: {
                name: "image",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [{ "name": "@url", "args": [] }],
            }, lists: {
                name: "lists",
                type: "List",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            }, todos: {
                name: "todos",
                type: "Todo",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            }, accounts: {
                name: "accounts",
                type: "Account",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            },
        }
        , list: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, createdAt: {
                name: "createdAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, updatedAt: {
                name: "updatedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@updatedAt", "args": [] }],
            }, space: {
                name: "space",
                type: "Space",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, spaceId: {
                name: "spaceId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, owner: {
                name: "owner",
                type: "User",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, ownerId: {
                name: "ownerId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, title: {
                name: "title",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 100 }] }],
            }, private: {
                name: "private",
                type: "Boolean",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@default", "args": [{ "value": false }] }],
            }, todos: {
                name: "todos",
                type: "Todo",
                isDataModel: true,
                isArray: true,
                isOptional: false,
                attributes: [],
            },
        }
        , todo: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, createdAt: {
                name: "createdAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, updatedAt: {
                name: "updatedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@updatedAt", "args": [] }],
            }, owner: {
                name: "owner",
                type: "User",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, ownerId: {
                name: "ownerId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, list: {
                name: "list",
                type: "List",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, listId: {
                name: "listId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, title: {
                name: "title",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 100 }] }],
            }, completedAt: {
                name: "completedAt",
                type: "DateTime",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            },
        }
        , account: {
            id: {
                name: "id",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [{ "name": "@id", "args": [] }],
            }, userId: {
                name: "userId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, type: {
                name: "type",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, provider: {
                name: "provider",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, providerAccountId: {
                name: "providerAccountId",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: false,
                attributes: [],
            }, refresh_token: {
                name: "refresh_token",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, refresh_token_expires_in: {
                name: "refresh_token_expires_in",
                type: "Int",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, access_token: {
                name: "access_token",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, expires_at: {
                name: "expires_at",
                type: "Int",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, token_type: {
                name: "token_type",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, scope: {
                name: "scope",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, id_token: {
                name: "id_token",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, session_state: {
                name: "session_state",
                type: "String",
                isDataModel: false,
                isArray: false,
                isOptional: true,
                attributes: [],
            }, user: {
                name: "user",
                type: "User",
                isDataModel: true,
                isArray: false,
                isOptional: false,
                attributes: [],
            },
        }
        ,
    }
    , guard: {
        space: {
            create: Space_create, update: Space_update, read: Space_read, delete: Space_delete,
        }
        , spaceUser: {
            create: SpaceUser_create, update: SpaceUser_update, read: SpaceUser_read, delete: SpaceUser_delete,
        }
        , user: {
            create: User_create, update: User_update, read: User_read, delete: User_delete,
        }
        , list: {
            create: List_create, update: List_update, read: List_read, delete: List_delete,
        }
        , todo: {
            create: Todo_create, update: Todo_update, read: Todo_read, delete: Todo_delete,
        }
        , account: {
            denyAll: true,
        }
        ,
    }
};
export default policy
