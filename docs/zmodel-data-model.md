# Data model

Data models represent business entities of your application.

## Syntax

A data model takes the following form:

```prisma
model [NAME] {
    [FIELD]*
}
```

-   **[NAME]**:

    Name of the data model. Needs to be unique in the entire model. Needs to be a valid identifier matching regular expression `[A-Za-z][a-za-z0-9_]\*`.

-   **[FIELD]**:

    Arbitrary number of fields. See [next section](zmodel-field.md) for details.

## Note

A data model must include a `String` typed field named `id`, marked with `@id` attribute. The `id` field serves as a unique identifier for a model entity, and is mapped to the database table's primary key.

See [here](zmodel-attribute.md) for more details about attributes.

## Example

```prisma
model User {
    id String @id
}
```
