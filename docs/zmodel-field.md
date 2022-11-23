# Field

Fields are typed members of data models.

## Syntax

A field declaration takes the following form:

```prisma
model Model {
    [FIELD_NAME] [FIELD_TYPE] (FIELD_ATTRIBUTES)?
}
```

-   **[FIELD_NAME]**

    Name of the field. Needs to be unique in the containing data model. Needs to be a valid identifier matching regular expression `[A-Za-z][a-za-z0-9_]\*`.

-   **[FIELD_TYPE]**

    Type of the field. Can be a scalar type or a reference to another data model.

    The following scalar types are supported:

    -   String
    -   Boolean
    -   Int
    -   BigInt
    -   Float
    -   Decimal
    -   Json
    -   Bytes

    A field's type can be any of the scalar or reference type, a list of the aforementioned type (suffixed with `[]`), or an optional of the aforementioned type (suffixed with `?`).

-   **[FIELD_ATTRIBUTES]**

    Field attributes attach extra behaviors or constraints to the field. See [Attribute](zmodel-attribute.md) for more information.

## Example

```prisma
model Post {
    // "id" field is a mandatory unique identifier of this model
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

    // and can reference another data model too
    comments Comment[]
}
```
