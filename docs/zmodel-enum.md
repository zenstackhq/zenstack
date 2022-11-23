# Enum

Enums are container declarations for grouping constant identifiers. You can use them to express concepts like user roles, product categories, etc.

## Syntax

Enum declarations take the following form:

```prsima
enum [ENUM_NAME] {
    [FIELD]*
}
```

-   **[ENUM_NAME]**

    Name of the enum. Needs to be unique in the entire model. Needs to be a valid identifier matching regular expression `[A-Za-z][a-za-z0-9_]\*`.

-   **[FIELD]**

    Field identifier. Needs to be unique in the data model. Needs to be a valid identifier matching regular expression `[A-Za-z][a-za-z0-9_]\*`.

## Example

```prisma
enum UserRole {
    USER
    ADMIN
}
```
