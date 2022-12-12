# Server-side rendering

You can use the `service` object to conduct CRUD operations on the server side directly without the overhead of HTTP requests. The `service` object contains members for each of the data model defined.

The server-side CRUD methods are similar signature with client-side hooks, except that they take an extra `queryContext` parameter for passing in the current login user. Like client-side hooks, the CRUD operations are fully protected by access policies defined in ZModel.

These methods are handy for implementing SSR (or custom API endpoints). Here's an example (using Next-Auth for authentication):

```ts
import service from '@zenstackhq/runtime/server';
import { unstable_getServerSession } from 'next-auth';
...

export const getServerSideProps = async ({
    req,
    res,
    params,
}) => {
    const session = await unstable_getServerSession(req, res, authOptions);
    const queryContext = { user: session?.user };
    const posts = await service.post.find(queryContext);
    return {
        props: { posts },
    };
};
```
