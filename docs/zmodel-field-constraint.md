# Field constraint

## Overview

Field constraints are used for attaching constraints to field values. Unlike access policies, field constraints only apply on individual fields, and are only checked for 'create' and 'update' operations.

Internally ZenStack uses [zod](https://github.com/colinhacks/zod ':target=blank') for validation. The checks are run in both the server-side CURD services and the clent-side React hooks. For the server side, upon validation error, HTTP 400 is returned with a body containing a `message` field for details. For the client side, a `ValidationError` is thrown.

## Constraint attributes

The following attributes can be used to attach field constraints:

### String

-   `@length(_ min: Int?, _ max: Int?)`

    Validates length of a string field.

-   `@startsWith(_ text: String)`

    Validates a string field value starts with the given text.

-   `@endsWith(_ text: String)`

    Validates a string field value ends with the given text.

-   `@email()`

    Validates a string field value is a valid email address.

-   `@url()`

    Validates a string field value is a valid url.

-   `@datetime()`

    Validates a string field value is a valid ISO datetime.

-   `@regex(_ regex: String)`

    Validates a string field value matches a regex.

### Number

-   `@gt(_ value: Int)`

    Validates a number field is greater than the given value.

-   `@gte(_ value: Int)`

    Validates a number field is greater than or equal to the given value.

-   `@lt(_ value: Int)`

    Validates a number field is less than the given value.

-   `@lte(_ value: Int)`

    Validates a number field is less than or equal to the given value.

## Example

```prisma
model User {
    id String @id
    handle String @regex("^[0-9a-zA-Z]{4,16}$")
    email String @email @endsWith("@myorg.com")
    profileImage String? @url
    age Int @gt(0)
}
```
