# Modeling your app

ZenStack provides an integrated DSL called **ZModel** for defining your data models, relations, and access policies. It may sounds scary to learn yet another new language, but trust me is simple and intuitive.

**ZModel** DSL is extended from the schema language of [Prisma ORM](https://www.prisma.io/docs/concepts/components/prisma-schema ':target=_blank'). Familarity of Prisma will make it very easy to start, but it's not a prerequisite.

## Configuring data source

The very first thing to do is to configure how to connect to your database.

Here's an example for using a PosgreSQL with is connection string read from `DATABASE_URL` environment variable:

```prisma
datasource db {
    provider = "postgresql"
    url = env("DATABASE_URL")
}
```

The generated CRUD services use the data source settings to connect to the database. Also, the migration workflow relies on it to synchronize database schema with the model.

## Adding data models

Data models define the shapes of business entities in your app. A data model consists of fields and attributes (which attach extra behavior to fields).

Here's an example of a blog post model:

```prisma
model Post {
    // @id attribute marks a field as unique identifier,
    // mapped to database table's primary key
    id String @id @default(cuid())

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

Check [here](zmodel-field.md) for more details about defining fields.

## Adding relations

An app is usually made up of a bunch of interconnected data models. You can define their relations with the special `@relation` attibute.

Here are some examples:

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

Check [here](zmodel-relation.md) for more details about defining relations.

## Adding access policies

It's great to see our app's business model is in place now, but it's still missing an important aspect: **access policy**, i.e., who can take what action to which data.

Access policies are defined using `@@allow` and `@@deny` attributes. _NOTE_ attributes with `@@` prefix are to be used at model level.

A few quick notes before diving into examples:

-   Access kinds include `create`, `read`, `update` and `delete`, and you can use `all` to abbreviate full grant.

-   By default, all access kinds are denied for a model. You can use arbitrary number of `@@allow` and `@@deny` rules in a model. See [here](zmodel-access-policy.md#combining-multiple-rules) for the semantic of combining them.

-   You can access current login user with the builtin `auth()` function. See [here](integrating-authentication.md) for how authentication is integrated.

Let's look at a few examples now:

```prisma
model User {
    id String @id
    posts Post[]
    ...

    // User can be created unconditionally (sign-up)
    @@allow("create", true)
}

model Post {
    id String @id
    author User @relation(fields: [authorId], references: [id])
    authorId String
    published Boolean @default(false)
    ...

    // deny all unauthenticated write access
    @@deny("create,update,delete", auth() == null)

    // published posts can be read by all
    @@allow("read", published)

    // grant full access to author
    @@allow("all", auth() == author)
}
```

You can find more details about access policy [TBD here](). Also, check out the [Collaborative Todo App](https://github.com/zenstackhq/todo-demo-sqlite) sample for a more sophisticated policy design.

Now you've got a fairly complete model for the app. Let's go ahead with [generating code](code-generation.md) from it then.
