# @zenstackhq/orm

The core ZenStack ORM engine, built on top of [Kysely](https://kysely.dev/). Provides a type-safe database client (`ZenStackClient`) with a high-level, [Prisma](https://prisma.io/)-compatible CRUD API and direct access to the underlying Kysely query builder for advanced queries.

## Key Features

- **Type-safe CRUD operations** generated from your ZModel schema
- **Plugin system** for query interception and entity mutation hooks
- **Multi-dialect support** — SQLite (better-sqlite3), PostgreSQL (pg), and MySQL (mysql2)
- **Computed fields** evaluated at the database level
- **Custom procedures** for encapsulating complex queries and mutations

## Installation

```bash
npm install @zenstackhq/orm
```

## Usage

```typescript
import { ZenStackClient } from '@zenstackhq/orm';
import schema from './schema';

const client = new ZenStackClient(schema, {
    /* dialect config */
});

const user = await client.user.findFirst({ where: { email: 'alice@example.com' } });
```

## Polymorphic Models

ZenStack supports polymorphic models (also called *delegate models*) via the `@@delegate` attribute. A delegate model acts as an abstract base that concrete sub-models can extend. Data is stored in sub-model-specific tables, but can be queried uniformly from the base model.

### Schema Definition

Use `@@delegate(field)` to mark a model as a delegate, where `field` is the discriminator column (a `String` field that stores the concrete sub-model name). Sub-models use the `extends` keyword to inherit the base model's fields and relations.

```zmodel
model Asset {
    id        Int      @id @default(autoincrement())
    createdAt DateTime @default(now())
    viewCount Int      @default(0)
    assetType String   // discriminator field

    @@delegate(assetType)
}

// Single-level sub-model
model Image extends Asset {
    format String
}

// Intermediate delegate — also a base for further sub-models
model Video extends Asset {
    duration  Int
    url       String @unique
    videoType String // its own discriminator

    @@delegate(videoType)
}

// Two-level sub-model
model RatedVideo extends Video {
    rating Int
}
```

Key rules:
- The discriminator field is automatically populated on create and cannot be set manually.
- Multi-level hierarchies are supported (e.g., `RatedVideo extends Video extends Asset`).
- Only concrete (non-delegate) sub-models can be created or upserted.

### Creating Records

Only concrete sub-models can be created. Attempting to create a delegate model directly will throw a runtime error.

```typescript
// ✅ Create a concrete sub-model
const rv = await client.ratedVideo.create({
    data: { duration: 100, url: 'https://example.com/v.mp4', rating: 5 },
});
// Result: { id, createdAt, viewCount, assetType: 'Video', videoType: 'RatedVideo', duration, url, rating }

// ✅ createMany is supported
await client.ratedVideo.createMany({
    data: [
        { duration: 100, url: 'v1', rating: 5 },
        { duration: 200, url: 'v2', rating: 4 },
    ],
});

// ❌ Cannot create a delegate model directly
await client.asset.create({ data: { viewCount: 0 } }); // throws: "is a delegate"

// ❌ Cannot set the discriminator field
await client.ratedVideo.create({
    data: {
        duration: 100,
        url: 'v3',
        rating: 5,
        // @ts-expect-error — videoType is read-only
        videoType: 'RatedVideo',
    },
});
```

### Querying Records

You can query from any level of the hierarchy. Querying from a delegate base model returns a **discriminated union** of all concrete sub-model types, using the discriminator field as the type guard.

```typescript
// Query from a concrete sub-model — returns only that type
const ratedVideos = await client.ratedVideo.findMany();
// Type: RatedVideo[]

// Query from an intermediate delegate — returns Video | RatedVideo instances
const videos = await client.video.findMany();

// Query from the base delegate — returns all sub-types as a discriminated union
const assets = await client.asset.findMany();
// Type: (Image | Video | RatedVideo)[] — discriminated on `assetType`

// Type narrowing using the discriminator field
for (const asset of assets) {
    if (asset.assetType === 'Image') {
        console.log(asset.format);    // Image-specific field
    } else if (asset.assetType === 'Video') {
        console.log(asset.duration);  // Video-specific field
        if (asset.videoType === 'RatedVideo') {
            console.log(asset.rating); // RatedVideo-specific field
        }
    }
}

// Fields from every level in the hierarchy are included in results
const rv = await client.ratedVideo.findUnique({ where: { id: 1 } });
// rv.viewCount  — from Asset
// rv.duration   — from Video
// rv.rating     — from RatedVideo
```

### Filtering

All fields—including fields inherited from base models—can be used in `where` clauses at any level.

```typescript
// Filter on a base field from a sub-model query
await client.ratedVideo.findMany({ where: { viewCount: { gt: 0 } } });

// Mix base and sub-model fields
await client.ratedVideo.findMany({ where: { viewCount: { gt: 0 }, rating: 5 } });

// Filter on a relation defined on the base model
await client.video.findFirst({ where: { owner: { email: 'alice@example.com' } } });
```

#### The `$is` Filter

When querying from a delegate base model, use `$is` to filter by sub-model type and/or sub-model-specific fields. Multiple sub-model entries are combined with **OR** semantics.

```typescript
// Return only Video assets (includes RatedVideo since it extends Video)
await client.asset.findMany({
    where: { $is: { Video: {} } },
});

// null value is equivalent to an empty filter — same as above
await client.asset.findMany({
    where: { $is: { Video: null } },
});

// Filter on a sub-model-specific field
await client.asset.findMany({
    where: { $is: { Video: { duration: { gt: 100 } } } },
});

// Combine a base field filter with a sub-model filter (AND)
await client.asset.findMany({
    where: {
        viewCount: { gt: 0 },
        $is: { Video: { duration: { gt: 100 } } },
    },
});

// Multiple sub-models — OR semantics
// Returns: (Videos with duration > 100) OR (Images with format 'png')
await client.asset.findMany({
    where: {
        $is: {
            Video: { duration: { gt: 100 } },
            Image: { format: 'png' },
        },
    },
});

// Nested $is — for multi-level delegate hierarchies
// Asset.$is.Video.$is.RatedVideo
await client.asset.findMany({
    where: {
        $is: {
            Video: { $is: { RatedVideo: { rating: 5 } } },
        },
    },
});

// $is on an intermediate delegate
await client.video.findMany({
    where: { $is: { RatedVideo: { rating: 5 } } },
});
```

### Updating Records

Records can be updated from any level of the hierarchy. The update data type is restricted to fields accessible at the chosen level.

```typescript
// Update sub-model and base fields together
await client.ratedVideo.update({
    where: { id: 1 },
    data: { viewCount: { increment: 1 }, duration: 200, rating: 4 },
});

// Update from an intermediate delegate (only Video + Asset fields)
await client.video.update({
    where: { id: 1 },
    data: { duration: 300 },
});

// Update from the base delegate (only Asset fields)
await client.asset.update({
    where: { id: 1 },
    data: { viewCount: 100 },
});

// ❌ Cannot update the discriminator field
await client.ratedVideo.update({
    where: { id: 1 },
    // @ts-expect-error
    data: { videoType: 'Something' }, // validation error
});

// Note: updateMany with a `limit` option is not supported for polymorphic models
```

### Deleting Records

Delete operations automatically cascade through all tables in the hierarchy.

```typescript
// Delete from a concrete sub-model — removes rows in RatedVideo, Video, and Asset
await client.ratedVideo.delete({ where: { id: 1 } });

// Delete from the base delegate — also cascades through sub-model tables
await client.asset.delete({ where: { id: 1 } });

// deleteMany and nested deletes work the same way
await client.video.deleteMany({ where: { duration: { gt: 100 } } });
```

### Limitations

- Delegate models cannot be created, upserted, or directly mutated — use the concrete sub-model instead.
- `updateMany` with a `limit` option is not supported for polymorphic models.
- `skipDuplicates` is not supported in `createMany` for polymorphic models.
- `createManyAndReturn` is not supported on MySQL for polymorphic models.

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs)
