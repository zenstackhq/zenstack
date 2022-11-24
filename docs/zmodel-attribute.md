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
        ...
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
        ...
        f1 String
        f2 String
        // a list of FieldReference
        @@unique([f1, f2])
    }
```

## Attribute functions

Attribute functions are used for providing values for attribute arguments, e.g., current `DateTime`, an autoincrement `Int`, etc. They can be used in place of attribute argument, like:

```prisma
model Model {
    ...
    serial Int @default(autoincrement())
    createdAt DateTime @default(now())
}
```

You can find a list of predefined attribute functions [here](#predefined-attribute-functions).

## Predefined attributes

### Field attributes

-   `@id`

    ```prisma
    attribute @id(map: String?)
    ```

    Defines an ID on the model.

    _Params_:

    | Name | Description                                                       |
    | ---- | ----------------------------------------------------------------- |
    | map  | The name of the underlying primary key constraint in the database |

-   `@default`

    ```prisma
        attribute @default(_ value: ContextType)
    ```

    Defines a default value for a field.

    _Params_:

    | Name  | Description                  |
    | ----- | ---------------------------- |
    | value | The default value expression |

-   `@unique`

    ```prisma
        attribute @unique(map: String?)
    ```

    Defines a unique constraint for this field.

    _Params_:

    | Name | Description                                                       |
    | ---- | ----------------------------------------------------------------- |
    | map  | The name of the underlying primary key constraint in the database |

-   `@relation`

    ```prisma
        attribute @relation(_ name: String?, fields: FieldReference[]?, references: FieldReference[]?, onDelete: ReferentialAction?, onUpdate: ReferentialAction?, map: String?)
    ```

    Defines meta information about a relation.

    _Params_:

    | Name       | Description                                                                             |
    | ---------- | --------------------------------------------------------------------------------------- |
    | name       | The name of the relationship                                                            |
    | fields     | A list of fields defined in the current model                                           |
    | references | A list of fields of the model on the other side of the relation                         |
    | onDelete   | Referential action to take on delete. See details [here](zmodel-referential-action.md). |
    | onUpdate   | Referential action to take on update. See details [here](zmodel-referential-action.md). |

-   `@map`

    ```prisma
        attribute @map(_ name: String)
    ```

    Maps a field name or enum value from the schema to a column with a different name in the database.

    _Params_:

    | Name | Description                                       |
    | ---- | ------------------------------------------------- |
    | map  | The name of the underlying column in the database |

-   `@updatedAt`

    ```prisma
        attribute @updatedAt()
    ```

    Automatically stores the time when a record was last updated.

-   `@password`

    ```prisma
        attribute @password(saltLength: Int?, salt: String?)
    ```

    Indicates that the field is a password field and needs to be hashed before persistence.

    _NOTE_: ZenStack uses `bcryptjs` library to hash password. You can use the `saltLength` parameter to configure the cost of hashing, or use `salt` parameter to provide an explicit salt. By default, salt length of 12 is used. See [bcryptjs](https://www.npmjs.com/package/bcryptjs ':target=blank') for more details.

    _Params_:

    | Name       | Description                                                   |
    | ---------- | ------------------------------------------------------------- |
    | saltLength | The length of salt to use (cost factor for the hash function) |
    | salt       | The salt to use (a pregenerated valid salt)                   |

-   `@omit`

    ```prisma
        attribute @omit()
    ```

    Indicates that the field should be omitted when read from the generated services. Commonly used together with `@password` attribute.

### Model attributes

-   `@@unique`

    ```prisma
        attribute @@unique(_ fields: FieldReference[], name: String?, map: String?)
    ```

    Defines a compound unique constraint for the specified fields.

    _Params_:

    | Name   | Description                                                  |
    | ------ | ------------------------------------------------------------ |
    | fields | A list of fields defined in the current model                |
    | name   | The name of the unique combination of fields                 |
    | map    | The name of the underlying unique constraint in the database |

-   `@@index`

    ```prisma
        attribute @@index(_ fields: FieldReference[], map: String?)
    ```

    Defines an index in the database.

    _Params_:

    | Name   | Description                                      |
    | ------ | ------------------------------------------------ |
    | fields | A list of fields defined in the current model    |
    | map    | The name of the underlying index in the database |

-   `@@map`

    ```prisma
        attribute @@map(_ name: String)
    ```

    Maps the schema model name to a table with a different name, or an enum name to a different underlying enum in the database.

    _Params_:

    | Name | Description                                              |
    | ---- | -------------------------------------------------------- |
    | name | The name of the underlying table or enum in the database |

-   `@@allow`

    ```prisma
        attribute @@allow(_ operation: String, _ condition: Boolean)
    ```

    Defines an access policy that allows a set of operations when the given condition is true.

    _Params_:

    | Name      | Description                                                                                                                                                              |
    | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | operation | Comma separated list of operations to control, including `"create"`, `"read"`, `"update"`, and `"delete"`. Pass` "all"` as an abbriviation for including all operations. |
    | condition | Boolean expression indicating if the operations should be allowed                                                                                                        |

-   `@@deny`

    ```prisma
        attribute @@deny(_ operation: String, _ condition: Boolean)
    ```

    Defines an access policy that denies a set of operations when the given condition is true.

    _Params_:

    | Name      | Description                                                                                                                                                              |
    | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | operation | Comma separated list of operations to control, including `"create"`, `"read"`, `"update"`, and `"delete"`. Pass` "all"` as an abbriviation for including all operations. |
    | condition | Boolean expression indicating if the operations should be denied                                                                                                         |

## Predefined attribute functions

-   `uuid`

    ```prisma
        function uuid(): String {}
    ```

    Generates a globally unique identifier based on the UUID spec.

-   `cuid`

    ```prisma
        function cuid(): String {}
    ```

    Generates a globally unique identifier based on the [CUID](https://github.com/ericelliott/cuid) spec.

-   `now`

    ```prisma
        function now(): DateTime {}
    ```

    Gets current date-time.

-   `autoincrement`

    ```prisma
        function autoincrement(): Int {}
    ```

    Creates a sequence of integers in the underlying database and assign the incremented
    values to the ID values of the created records based on the sequence.

-   `dbgenerated`

    ```prisma
        function dbgenerated(expr: String): Any {}
    ```

    Represents default values that cannot be expressed in the Prisma schema (such as random()).

-   `auth`

    ```prisma
        function auth(): User {}
    ```

    Gets thec current login user. The return type of the function is the `User` data model defined in the current ZModel.

## Examples

Here're some examples on using field and model attributes:

```prisma
model User {
    // unique id field with a default UUID value
    id String @id @default(uuid())

    // require email field to be unique
    email String @unique

    // password is hashed with bcrypt with length of 16, omitted when returned from the CRUD services
    password String @password(saltLength: 16) @omit

    // default to current date-time
    createdAt DateTime @default(now())

    // auto-updated when the entity is modified
    updatedAt DateTime @updatedAt

    // mapping to a different column name in database
    description String @map("desc")

    // mapping to a different table name in database
    @@map("users")

    // use @@index to specify fields to create database index for
    @@index([email])
}
```
