# Relation

Relations are connections among data models. There're three types of relations:

-   One-to-one
-   One-to-many
-   Many-to-many

Relations are expressed with a pair of fields and together with the special `@relation` field attribute. One side of the relation field carries the `@relation` attribute to indicate how the connection is established.

## One-to-one relation

The _owner_ side of the relation declares an optional field typed as the data model of the _owned_ side of the relation.

On the _owned_ side, a reference field is declared with `@relation` attribute, together with an **foreign key** field storing the id of the owner entity.

```zmodel
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

## One-to-many relation

The _owner_ side of the relation declares a list field typed as the data model of the _owned_ side of the relation.

On the _owned_ side, a reference field is declared with `@relation` attribute, together with an **foreign key** field storing the id of the owner entity.

```zmodel
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

## Many-to-one relation

A _join model_ is declared to connect the two sides of the relation, using two one-to-one relations.

Each side of the relation then establishes a one-to-many relation with the _join model_.

```zmodel
model Space {
    id String @id
    // one-to-many with the "join-model"
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
    // one-to-many with the "join-model"
    membership Membership[]
}

```

## Referential action

When defining a relation, you can specify what happens when one side of a relation is updated or deleted. See [Referential action](zmodel-referential-action.md) for details.
