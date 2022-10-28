# Learning the ZModel Language

ZModel is a declarative language for defining data models, relations and access policies.
ZModel is a superset of [Prisma's Schema Language](https://www.prisma.io/docs/concepts/components/prisma-schema), so if you're already familar with Prisma, feel free to jump directly to the [Access Policies](#access-policies) section. Otherwise, don't worry, the syntax is intuitive and easy to learn.

## Data source

Every model needs to include exactly one `datasource` declaration, providing information on how to connect to the underlying databases.

The recommended way is to load connection string from an environment variable, like:

```prisma
datasource db {
    provider = "postgresql"
    url = env("DATABASE_URL")
}
```

Do not commit the `DATABASE_URL` value in source code, instead configure it in your deployment as an environment variable.

## Data models

Data models define shapes of entities in your application domain. They include fields and attributes for attaching additional metadata. Data models are mapped to your database schema, also used for generating CRUD services and front-end library code.

Here's an example of a `Post` model:

```prisma
model Post {
    // the mandatory primary key of this model with a default UUID value
    id String @id @default(uuid())

    // fields can be DateTime
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    // or string
    title String

    // or integer
    viewCount Int @default(0)

    // and optional
    content String?

    // and a list too
    tags String[]
}
```

As you can see, fields are typed, and can be a list or optional. Default values can be attached with the `@default` attribute. You can find all built-in types [here](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#model-field-scalar-types).

Model's fields can also be typed as other Models. We'll cover this in the [Relations](#relations) section.

## Attributes

Attributes attach additional metadata to models and fields. Some attributes take input parameters, and you can provide values by giving either literal expressions or calling attribute functions.

Attributes attached to fields are prefixed with '@', and those to models are prefixed with '@@'.

Here're some examples for commonly used attributes:

```prisma
model Post {
    // @id is field attribute, marking the field as a primary key
    // @default is another field attribute for specifying a default value for the field if it's not given at creation time
    // uuid() is a function for generating a UUID
    id String @id @default(uuid())

    // now() is a function that returns current time
    createdAt DateTime @default(now())

    // @updatedAt is a field attibute indicating its value should be updated to current time whenever the model entity is updated
    updatedAt DateTime @updatedAt

    // @unique adds uniqueness constraint to field
    slug String @unique

    // @map can be used to give a different column name in database
    title String @map("my_title")

    // @@map can be used to give a different table name in database
    @@map("posts")

    // uniqueness constraint can also be expressed via @@unique model attribute, and you can combine multiple fields here
    @@unique([slug])

    // use @@index to specify fields to create database index for
    @@index([slug])
}
```

For an exaustive list of attributes and functions, please refer to [Prisma's documentation](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#attributes).

## Relations

Relations are expressed by the special @relation attribute. Here're some examples.

-   One-to-one

```prisma
model User {
    id String @id
    profile Profile?
}

model Profile {
    id String @id
    user @relation(fields: [userId], references: [id])
    userId String @unique
}
```

-   One-to-many

```prisma
model User {
    id String @id
    posts Post[]
}

model Post {
    id String @id
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}
```

-   Many-to-many

```prisma
model Space {
    id String @id
    members Membership[]
}

// Membership is the "join-model" between User and Space
model Membership {
    id String @id()

    // one-to-many from Space
    space Space @relation(fields: [spaceId], references: [id])
    spaceId String

    // one-to-many from User
    user User @relation(fields: [userId], references: [id])
    userId String

    // a user can be member of a space for only once
    @@unique([userId, spaceId])
}

model User {
    id String @id
    membership Membership[]
}

```

## Access policies

Access policies use `@@allow` and `@@deny` rules to specify eligibility of an operation over a model entity. The signature of the attbutes are:

```
@@allow(operation, condition)
@@deny(operation, condition)
```

, where `operation` can be of: "all", "read", "create", "update" and "delete" (or comma-separated string of multiple values, like "create,update"), and `condition` must be a boolean expression.

The logic of permitting/rejecting an operation is:

-   By default, all operations are rejected if there isn't any @@allow rule in a model
-   The operation is rejected if any of the conditions in @@deny rules evaluates to `true`
-   Otherwise, the operation is permitted if any of the conditions in @@allow rules evaluates to `true`
-   Otherwise, the operation is rejected

### A simple example with Post model

```prisma
model Post {
    // reject all operations if user's not logged in
    @@deny('all', auth() == null)

    // allow all operations if the entity's owner matches current user
    @@allow('all', auth() == owner)

    // posts are readable to anyone
    @allow('read', true)
}
```

### A more complex example with multi-user spaces

```prisma
model Space {
    id String @id
    members Membership[]
    owner User @relation(fields: [ownerId], references: [id])
    ownerId String

    // require login
    @@deny('all', auth() == null)

    // everyone can create a space
    @@allow('create', true)

    // owner can do everything
    @@allow('all', auth() == owner)

    // any user in the space can read the space
    //
    // Here the <collection>?[condition] syntax is called
    // "Collection Predicate", used to check if any element
    // in the "collection" matches the "condition"
    @@allow('read', members?[user == auth()])
}

// Membership is the "join-model" between User and Space
model Membership {
    id String @id()

    // one-to-many from Space
    space Space @relation(fields: [spaceId], references: [id])
    spaceId String

    // one-to-many from User
    user User @relation(fields: [userId], references: [id])
    userId String

    // a user can be member of a space for only once
    @@unique([userId, spaceId])

    // require login
    @@deny('all', auth() == null)

    // space owner can create/update/delete
    @@allow('create,update,delete', space.owner == auth())

    // user can read entries for spaces which he's a member of
    @@allow('read', space.members?[user == auth()])
}

model User {
    id String @id
    email String @unique
    membership Membership[]
    ownedSpaces Space[]

    // allow signup
    @@allow('create', true)

    // user can do everything to herself, note that "this" represents
    // current entity
    @@allow('all', auth() == this)

    // can be read by users sharing a space
    @@allow('read', membership?[space.members?[user == auth()]])
}

```

### Accessing relation fields in policy

As you've seen in the examples above, in policy expressions you can access fields from relations. For example, to express "a user can be read by any user sharing a space" in the `User` model, you can directly read into its `membership` field.

```prisma
    @@allow('read', membership?[space.members?[user == auth()]])
```

In most cases when you use a "to-many" relation in policy rule, you'll use "Collection Predicate" to expression a condition. See [next section](#collection-predicate-expressions) for details.

### Collection predicate expressions

Collection predicate are boolean expressions used to express condition over a list. It's mainly designed for building policy rules for "to-many" relations. It has three forms of syntaxes:

1. <collection>?[condition]
   Any element in `collection` matches `condition`
2. <collection>![condition]
   All elements in `collection` match `condition`
3. <collection>^[condition]
   None element in `collection` matches `condition`

The `condition` expression has direct access to fields defined in the model of `collection`. E.g.:

```prisma
    @@allow('read', members?[user == auth()])
```

, in condition `user == auth()`, `user` refers to the `user` field in model `Membership`, because the collection `members` is resolved to `Membership` model.

Also, collection predicates can be nested to express complex condition involving multi-level relation lookup. E.g.:

```prisma
    @@allow('read', membership?[space.members?[user == auth()]])
```

In this example, `user` refers to `user` field of `Membership` model because `space.members` is resolved to `Membership` model.

## Summary

This document serves as a quick overview for starting with the ZModel language. For more thorough explainations about data modeling, please checkout [Prisma's schema references](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference).
