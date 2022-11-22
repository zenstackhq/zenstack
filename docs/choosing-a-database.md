# Choosing a database

ZenStack is agnostic about where and how you deploy your web app, but hosting on serverless platforms like [Vercel](https://vercel.com/) is definitely a popular choice.

Serverless architecture has some implications on how you should care about your database hosting. Different from traditional architecture where you have a fixed number of long-running Node.js servers, in a serverless environment, a new Node.js context can potentially be created for each user request, and if traffic volume is high, this can quickly exhaust your database's connection limit, if you connect to the database directly without a proxy.

You'll likely be OK if your app has a low number of concurrent users, otherwise you should consider using a proxy in front of your database server. Here's a number of (incomplete) solutions you can consider:

-   [Prisma Data Proxy](https://www.prisma.io/data-platform/proxy)
-   [Supabase](https://supabase.com/)'s [connection pool](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pool)
-   [Deploy pgbouncer with Postgres on Heroku](https://devcenter.heroku.com/articles/postgres-connection-pooling)
