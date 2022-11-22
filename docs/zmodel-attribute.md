# Attribute

Attributes decorate fields and data models and attach extra behaviors or constraints to them.

## Syntax

### Field attribute

Field attribute name is prefixed by a single `@`. Its application takes the following form:

```prisma
id String @[ATTR_NAME](ARGS)?
```

-   **[ATTR_NAME]**

Attribute name. See [below](#built-in-attributes) for a full list of attributes.

-   **[ARGS]**

See [attribute arguments](#attribute-arguments).

### Data model attribute

Field attribute name is prefixed double `@@`. Its application takes the following form:

```prisma
model Model {
    @@[ATTR_NAME](ARGS)?
}
```

-   **[ATTR_NAME]**

Attribute name. See [below](#built-in-attributes) for a full list of attributes.

-   **[ARGS]**

See [attribute arguments](#attribute-arguments).

### Arguments

Attribute can be declared with a list of parameters, and applied with an optional comma-separated list of arguments.

Arguments are mapped to parameters by position or by name. For example, for the `@default` attribute declared as:

```prisma
attribute @default(_ value: ContextType)
```

, the following two ways of applying it are equivalent:

```prisma
published Boolean @default(value: false)
```

```prisma
published Boolean @default(false)
```

## Parameter types

Attribute parameters are typed. The following types are supported:

-   Int

    Integer literal can be passed as argument.

    E.g., declaration:

    ```prisma
    attribute @password(saltLength: Int?, salt: String?)

    ```

    application:

    ```prisma
    password String @password(saltLength: 10)
    ```

-   String

    String literal can be passed as argument.

    E.g., declaration:

    ```prisma
    attribute @id(map: String?)
    ```

    application:

    ```prisma
    id String @id(map: "_id")
    ```

-   Boolean

    Boolean literal or expression can be passed as argument.

    E.g., declaration:

    ```prisma
    attribute @@allow(_ operation: String, _ condition: Boolean)
    ```

    application:

    ```prisma
    @@allow("read", true)
    @@allow("update", auth() != null)
    ```

-   ContextType

    A special type that represents the type of the field onto which the attribute is attached.

    E.g., declaration:

    ```prisma
    attribute @default(_ value: ContextType)
    ```

    application:

    ```prisma
    f1 String @default("hello")
    f2 Int @default(1)
    ```

-   FieldReference

    References to fields defined in the current model.

    E.g., declaration:

    ```prisma
    attribute @relation(
        _ name: String?,
        fields: FieldReference[]?,
        references: FieldReference[]?,
        onDelete: ReferentialAction?,
        onUpdate: ReferentialAction?,
        map: String?)
    ```

    application:

    ```prisma
    model Model {
        // [ownerId] is a list of FieldReference
        owner Owner @relation(fields: [ownerId], references: [id])
        ownerId
    }
    ```

-   Enum

    Attribute parameter can also be typed as predefined enum.

    E.g., declaration:

    ```prisma
    attribute @relation(
        _ name: String?,
        fields: FieldReference[]?,
        references: FieldReference[]?,
        // ReferentialAction is a predefined enum
        onDelete: ReferentialAction?,
        onUpdate: ReferentialAction?,
        map: String?)
    ```

    application:

    ```prisma
    model Model {
        // 'Cascade' is a predefined enum value
        owner Owner @relation(..., onDelete: Cascade)
    }
    ```

An attribute parameter can be typed as any of the above type, a list of the above type, or an optional of the above type.

```prisma
    model Model {
        f1 String
        f2 String
        // a list of FieldReference
        @@unique([f1, f2])
    }
```

## Attribute functions

## Predefined attributes

### Field attributes

### Model attributes

## Predefined attribute functions

## Examples
