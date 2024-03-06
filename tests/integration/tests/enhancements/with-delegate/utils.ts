export const POLYMORPHIC_SCHEMA = `
model User {
    id Int @id @default(autoincrement())
    level Int @default(0)
    assets Asset[]
    ratedVideos RatedVideo[] @relation('direct')

    @@allow('all', true)
}

model Asset {
    id Int @id @default(autoincrement())
    createdAt DateTime @default(now())
    viewCount Int @default(0)
    owner User? @relation(fields: [ownerId], references: [id])
    ownerId Int?
    assetType String
    
    @@delegate(assetType)
    @@allow('all', true)
}

model Video extends Asset {
    duration Int
    url String
    videoType String

    @@delegate(videoType)
}

model RatedVideo extends Video {
    rating Int
    user User? @relation(name: 'direct', fields: [userId], references: [id])
    userId Int?
}

model Image extends Asset {
    format String
    gallery Gallery? @relation(fields: [galleryId], references: [id])
    galleryId Int?
}

model Gallery {
    id Int @id @default(autoincrement())
    images Image[]
}
`;
