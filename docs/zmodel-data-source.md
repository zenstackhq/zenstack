# Data source

Every model needs to include exactly one `datasource` declaration, providing information on how to connect to the underlying database.

## Syntax

A data source declaration takes the following form:

```zmodel
datasource [NAME] {
    provider = [PROVIDER]
    url = [DB_URL]
}
```

-   **[NAME]**:

    Name of the data source. Needs to be a valid identifier matching regular expression `[A-Za-z][a-za-z0-9_]\*`. Name is only informational and serves no other purposes.

-   **[PROVIDER]**:

    Name of database connector. Valid values:

    -   sqlite
    -   postgresql
    -   mysql
    -   sqlserver
    -   cockroachdb

-   **[DB_URL]**:

    Database connection string. Either a plain string or an invocation of `env` function to fetch from an environment variable.

## Examples

```zmodel
datasource db {
    provider = "postgresql"
    url = "postgresql://postgres:abc123@localhost:5432/todo?schema=public"
}
```

It's highly recommended that you don't commit sensitive database connection string into source control. Alternatively, you can load it from an environment variable:

```zmodel
datasource db {
    provider = "postgresql"
    url = env("DATABASE_URL")
}
```

## Supported databases

ZenStack uses [Prisma](https://prisma.io ':target=_blank') to talk to databases, so all relational databases supported by Prisma is supported by ZenStack as well.

Here's a list for your reference:

| Database              | Version |
| --------------------- | ------- |
| PostgreSQL            | 9.6     |
| PostgreSQL            | 10      |
| PostgreSQL            | 11      |
| PostgreSQL            | 12      |
| PostgreSQL            | 13      |
| PostgreSQL            | 14      |
| PostgreSQL            | 15      |
| MySQL                 | 5.6     |
| MySQL                 | 5.7     |
| MySQL                 | 8       |
| MariaDB               | 10      |
| SQLite                | \*      |
| AWS Aurora            | \*      |
| AWS Aurora Serverless | \*      |
| Microsoft SQL Server  | 2022    |
| Microsoft SQL Server  | 2019    |
| Microsoft SQL Server  | 2017    |
| Azure SQL             | \*      |
| CockroachDB           | 21.2.4+ |

You can find the orignal list [here](https://www.prisma.io/docs/reference/database-reference/supported-databases ':target=_blank').
