# Access policy

Access policies use `@@allow` and `@@deny` rules to specify the eligibility of an operation over a model entity. The signatures of the attributes are:

-   `@@allow`

    ```zmodel
        attribute @@allow(_ operation: String, _ condition: Boolean)
    ```

    _Params_:

    | Name      | Description                                                                                                                                                              |
    | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | operation | Comma separated list of operations to control, including `"create"`, `"read"`, `"update"`, and `"delete"`. Pass` "all"` as an abbriviation for including all operations. |
    | condition | Boolean expression indicating if the operations should be allowed                                                                                                        |

-   `@@deny`

    ```zmodel
        attribute @@deny(_ operation: String, _ condition: Boolean)
    ```

    _Params_:

    | Name      | Description                                                                                                                                                              |
    | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | operation | Comma separated list of operations to control, including `"create"`, `"read"`, `"update"`, and `"delete"`. Pass` "all"` as an abbriviation for including all operations. |
    | condition | Boolean expression indicating if the operations should be denied                                                                                                         |

## Using authentication in policy rules

It's very common to use the current login user to verdict if an operation should be permitted. Therefore, ZenStack provides a built-in `auth()` attribute function that evaluates to the `User` entity corresponding to the current user. To use the function, your ZModel file must define a `User` data model.

You can use `auth()` to:

-   Check if a user is logged in

    ```zmodel
    @@deny('all', auth() == null)
    ```

-   Access user's fields

    ```zmodel
    @@allow('update', auth().role == 'ADMIN')
    ```

-   Compare user identity

    ```zmodel
    // owner is a relation field to User model
    @@allow('update', auth() == owner)
    ```

## Accessing relation fields in policy

As you've seen in the examples above, you can access fields from relations in policy expressions. For example, to express "a user can be read by any user sharing a space" in the `User` model, you can directly read into its `membership` field.

```zmodel
    @@allow('read', membership?[space.members?[user == auth()]])
```

In most cases, when you use a "to-many" relation in a policy rule, you'll use "Collection Predicate" to express a condition. See [next section](#collection-predicate-expressions) for details.

## Collection predicate expressions

Collection predicate expressions are boolean expressions used to express conditions over a list. It's mainly designed for building policy rules for "to-many" relations. It has three forms of syntaxes:

-   Any

    ```
    <collection>?[condition]
    ```

    Any element in `collection` matches `condition`

-   All

    ```
    <collection>![condition]
    ```

    All elements in `collection` match `condition`

-   None

    ```
    <collection>^[condition]
    ```

    None element in `collection` matches `condition`

The `condition` expression has direct access to fields defined in the model of `collection`. E.g.:

```zmodel
    @@allow('read', members?[user == auth()])
```

, in condition `user == auth()`, `user` refers to the `user` field in model `Membership`, because the collection `members` is resolved to `Membership` model.

Also, collection predicates can be nested to express complex conditions involving multi-level relation lookup. E.g.:

```zmodel
    @@allow('read', membership?[space.members?[user == auth()]])
```

In this example, `user` refers to `user` field of `Membership` model because `space.members` is resolved to `Membership` model.

## Combining multiple rules

A data model can contain arbitrary number of policy rules. The logic of combining them is as follows:

-   The operation is rejected if any of the conditions in `@@deny` rules evaluate to `true`
-   Otherwise, the operation is permitted if any of the conditions in `@@allow` rules evaluate to `true`
-   Otherwise, the operation is rejected

## Example

### A simple example with Post model

```zmodel
model Post {
    // reject all operations if user's not logged in
    @@deny('all', auth() == null)

    // allow all operations if the entity's owner matches the current user
    @@allow('all', auth() == owner)

    // posts are readable to anyone
    @allow('read', true)
}
```

### A more complex example with multi-user spaces

```zmodel
model Space {
    id String @id
    members Membership[]
    owner User @relation(fields: [ownerId], references: [id])
    ownerId String

    // require login
    @@deny('all', auth() == null)

    // everyone can create a space
    @@allow('create', true)

    // owner can do everything
    @@allow('all', auth() == owner)

    // any user in the space can read the space
    //
    // Here the <collection>?[condition] syntax is called
    // "Collection Predicate", used to check if any element
    // in the "collection" matches the "condition"
    @@allow('read', members?[user == auth()])
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

    // require login
    @@deny('all', auth() == null)

    // space owner can create/update/delete
    @@allow('create,update,delete', space.owner == auth())

    // user can read entries for spaces which he's a member of
    @@allow('read', space.members?[user == auth()])
}

model User {
    id String @id
    email String @unique
    membership Membership[]
    ownedSpaces Space[]

    // allow signup
    @@allow('create', true)

    // user can do everything to herself; note that "this" represents
    // the current entity
    @@allow('all', auth() == this)

    // can be read by users sharing a space
    @@allow('read', membership?[space.members?[user == auth()]])
}

```
