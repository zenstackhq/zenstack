import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1410', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Drink {
              id                Int   @id @default(autoincrement())
              slug              String @unique
            
              manufacturer_id   Int
              manufacturer      Manufacturer @relation(fields: [manufacturer_id], references: [id])
            
              type              String
            
              name              String @unique
              description       String
              abv               Float
              image             String?
            
              gluten            Boolean
              lactose           Boolean
              organic           Boolean
            
              containers        Container[]
            
              @@delegate(type)
            
              @@allow('all', true)
            }
            
            model Beer extends Drink {
              style_id         Int
              style            BeerStyle @relation(fields: [style_id], references: [id])
            
              ibu              Float?
            
              @@allow('all', true)
            }
            
            model BeerStyle {
              id               Int @id @default(autoincrement())
            
              name             String @unique
              color            String
            
              beers            Beer[]
            
              @@allow('all', true)
            }
            
            model Wine extends Drink {
              style_id         Int
              style            WineStyle @relation(fields: [style_id], references: [id])
            
              heavy_score      Int?
              tannine_score    Int?
              dry_score        Int?
              fresh_score      Int?
              notes            String?
            
              @@allow('all', true)
            }
            
            model WineStyle {
              id               Int @id @default(autoincrement())
            
              name             String @unique
              color            String
            
              wines            Wine[]
            
              @@allow('all', true)
            }
            
            model Soda extends Drink {
              carbonated       Boolean
            
              @@allow('all', true)
            }
            
            model Cocktail extends Drink {
              mix       Boolean
            
              @@allow('all', true)
            }
            
            model Container {
              barcode          String @id
              
              drink_id         Int
              drink            Drink @relation(fields: [drink_id], references: [id])
            
              type             String
              volume           Int
              portions         Int?
            
              inventory        Int @default(0)
            
              @@allow('all', true)
            }
            
            model Manufacturer {
              id               Int   @id @default(autoincrement())
            
              country_id       String
              country          Country @relation(fields: [country_id], references: [code])
            
              name             String @unique
              description      String?
              image            String?
            
              drinks            Drink[]
            
              @@allow('all', true)
            }
            
            model Country {
              code             String @id
              name             String
            
              manufacturers    Manufacturer[]
            
              @@allow('all', true)
            }
            `
        );

        const db = enhance();

        await db.beer.findMany({
            include: { style: true, manufacturer: true },
            where: { NOT: { gluten: true } },
        });

        await db.beer.findMany({
            include: { style: true, manufacturer: true },
            where: { AND: [{ gluten: true }, { abv: { gt: 50 } }] },
        });

        await db.beer.findMany({
            include: { style: true, manufacturer: true },
            where: { OR: [{ AND: [{ NOT: { gluten: true } }] }, { abv: { gt: 50 } }] },
        });
    });
});
