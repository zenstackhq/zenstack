# Overview

**ZModel**, the modeling DSL of ZenStack, is the main concept that you'll deal with when using this toolkit.

The **ZModel** syntax is extended from the schema language of [Prisma ORM](https://prisma.io). We made that choice based on several reasons:

-   CRUD heavily relies on database operations, however creating a new ORM doesn't add much value to the community, since there're already nice and mature solutions out there; so instead, we decided to extend Prisma - the overall best ORM toolkit for Typescript.

-   Prisma's schema language is simple and intuitive.

-   Extending a popular existing language lowers the learning curve, compared to inventing a new one.

Even so, this section provides detailed descriptions about all aspects of the ZModel language, so you don't need to jump over to Prisma's documentation for extra learnings.
