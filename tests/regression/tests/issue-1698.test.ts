import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1968', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model House {
                id         Int    @id @default(autoincrement())
                doorTypeId Int
                door       Door   @relation(fields: [doorTypeId], references: [id])
                houseType  String
                @@delegate(houseType)
            }

            model PrivateHouse extends House {
                size Int
            }

            model Skyscraper extends House {
                height Int
            }

            model Door {
                id       Int     @id @default(autoincrement())
                color    String
                doorType String
                houses   House[]
                @@delegate(doorType)
            }

            model IronDoor extends Door {
                strength Int
            }

            model WoodenDoor extends Door {
                texture String
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const door1 = await db.ironDoor.create({
            data: { strength: 100, color: 'blue' },
        });
        console.log(door1);

        const door2 = await db.woodenDoor.create({
            data: { texture: 'pine', color: 'red' },
        });
        console.log(door2);

        const house1 = await db.privateHouse.create({
            data: { size: 5000, door: { connect: { id: door1.id } } },
        });
        console.log(house1);

        const house2 = await db.skyscraper.create({
            data: { height: 3000, door: { connect: { id: door2.id } } },
        });
        console.log(house2);

        const r1 = await db.privateHouse.findFirst({ include: { door: true } });
        console.log(r1);
        expect(r1).toMatchObject({
            door: { color: 'blue', strength: 100 },
        });

        const r2 = (await db.skyscraper.findMany({ include: { door: true } }))[0];
        console.log(r2);
        expect(r2).toMatchObject({
            door: { color: 'red', texture: 'pine' },
        });
    });
});
