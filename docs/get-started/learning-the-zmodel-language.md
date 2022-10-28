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
enum UserRole {
    USER
    ADMIN
}

model Space {
    id String @id
    members Membership[]
}

model Membership {
    id String @id()
    space Space @relation(fields: [spaceId], references: [id])
    spaceId String
    user User @relation(fields: [userId], references: [id])
    userId String
    role UserRole
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

Here're some examples:

```prisma

```

## Summary

This document serves as a quick overview for starting with the ZModel language. For more thorough explainations about data modeling, please checkout [Prisma's schema references](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference).
