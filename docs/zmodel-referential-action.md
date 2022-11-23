# Referential action

## Overview

When defining a relation, you can use referential action to control what happens when one side of a relation is updated or deleted, by setting the `onDelete` and `onUpdate` parameters in the `@relation` attribute.

```prisma
    attribute @relation(
        _ name: String?,
        fields: FieldReference[]?,
        references: FieldReference[]?,
        onDelete: ReferentialAction?,
        onUpdate: ReferentialAction?,
        map: String?)
```

The `ReferentialAction` enum is defined as:

```prisma
enum ReferentialAction {
    Cascade
    Restrict
    NoAction
    SetNull
    SetDefault
}
```

-   `Cascade`

    -   **onDelete**: deleting a referenced record will trigger the deletion of referencing record.

    -   **onUpdate**: updates the relation scalar fields if the referenced scalar fields of the dependent record are updated.

-   `Restrict`

    -   **onDelete**: prevents the deletion if any referencing records exist.
    -   **onUpdate**: prevents the identifier of a referenced record from being changed.

-   `NoAction`

    Similar to 'Restrict', the difference between the two is dependent on the database being used.

    See details [here](https://www.prisma.io/docs/concepts/components/prisma-schema/relations/referential-actions#noaction ':target=blank')

-   `SetNull`

    -   **onDelete**: the scalar field of the referencing object will be set to NULL.
    -   **onUpdate**: when updating the identifier of a referenced object, the scalar fields of the referencing objects will be set to NULL.

-   `SetDefault`
    -   **onDelete**: the scalar field of the referencing object will be set to the fields default value.
    -   **onUpdate**: the scalar field of the referencing object will be set to the fields default value.

## Example

```prisma
model User {
    id String @id
    profile Profile?
}

model Profile {
    id String @id
    user @relation(fields: [userId], references: [id], onUpdate: Cascade, onDelete: Cascade)
    userId String @unique
}
```
