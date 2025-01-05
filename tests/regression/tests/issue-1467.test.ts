import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1467', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
    model User {
        id   Int    @id @default(autoincrement())
        type String
        @@allow('all', true)
    }

    model Container {
        id    Int    @id @default(autoincrement())
        drink Drink @relation(fields: [drinkId], references: [id])
        drinkId Int
        @@allow('all', true)
    }

    model Drink {
        id                Int   @id @default(autoincrement())
        name              String @unique
        containers        Container[]
        type              String

        @@delegate(type)
        @@allow('all', true)
    }

    model Beer extends Drink {
        @@allow('all', true)
    }
            `
        );

        const db = enhance();

        await db.beer.create({
            data: { id: 1, name: 'Beer1' },
        });

        await db.container.create({ data: { drink: { connect: { id: 1 } } } });
        await db.container.create({ data: { drink: { connect: { id: 1 } } } });

        const beers = await db.beer.findFirst({
            select: { id: true, name: true, _count: { select: { containers: true } } },
            orderBy: { name: 'asc' },
        });
        expect(beers).toMatchObject({ _count: { containers: 2 } });
    });
});
