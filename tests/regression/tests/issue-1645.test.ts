import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1645', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
        model Product {
            id                        String      @id @default(cuid())
            name                      String
            slug                      String
            description               String?
            sku                       String
            price                     Int
            onSale                    Boolean     @default(false)
            salePrice                 Int         @default(0)
            saleStartDateTime         DateTime?
            saleEndDateTime           DateTime?
            scheduledAvailability     Boolean     @default(false)
            availabilityStartDateTime DateTime?
            availabilityEndDateTime   DateTime?
            type                      String @default('VARIABLE')
            image                     String
            orderItems                OrderItem[]
            createdAt                 DateTime    @default(now())
            updatedAt                 DateTime    @updatedAt
        
            @@unique([slug])
        
            @@allow('all', true)
        }
        
        model BaseOrder {
            id                String          @id @default(cuid())
            orderNumber       String          @unique @default(nanoid(16))
            lineItems         OrderItem[]
            status            String          @default('PENDING')
            type              String          @default('PARENT')
            userType          String?
            billingAddress    BillingAddress  @relation(fields: [billingAddressId], references: [id])
            billingAddressId  String          @map("billing_address_id")
            shippingAddress   ShippingAddress @relation(fields: [shippingAddressId], references: [id])
            shippingAddressId String          @map("shipping_address_id")
            notes             String?         @default('')
            createdAt         DateTime        @default(now())
            updatedAt         DateTime        @updatedAt
        
            @@allow('all', true)
            @@delegate(userType)
        }
        
        model Order extends BaseOrder {
            parentId      String? @map("parent_id")
            parent        Order?  @relation("OrderToParent", fields: [parentId], references: [id])
            groupedOrders Order[] @relation("OrderToParent")
            user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
            userId        String  @map("user_id")
        }
        
        model User {
            id                String            @id @default(cuid())
            name              String?
            email             String?           @unique
            emailVerified     DateTime?
            image             String?
            orders            Order[]
            billingAddresses  BillingAddress[]
            shippingAddresses ShippingAddress[]
        
            @@allow('create,read', true)
            @@allow('update,delete', auth().id == this.id)
        }
        
        model GuestUser {
            id        String       @id @default(cuid())
            name      String?
            email     String       @unique
            orders    GuestOrder[]
            createdAt DateTime     @default(now())
            updatedAt DateTime     @updatedAt
        
            @@auth
            @@allow('all', true)
        }
        
        model GuestOrder extends BaseOrder {
            guestUser     GuestUser    @relation(fields: [guestUserId], references: [id], onDelete: Cascade)
            guestUserId   String       @map("guest_user_id")
            parentId      String?      @map("parent_id")
            parent        GuestOrder?  @relation("OrderToParent", fields: [parentId], references: [id])
            groupedOrders GuestOrder[] @relation("OrderToParent")
        }
        
        model OrderItem {
            id        String    @id @default(cuid())
            order     BaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
            orderId   String    @map("order_id")
            product   Product   @relation(fields: [productId], references: [id])
            productId String    @map("product_id")
            quantity  Int
            createdAt DateTime  @default(now())
            updatedAt DateTime  @updatedAt
        
            @@allow('all', true)
        }
        
        model OrderAddress {
            id         String   @id @default(cuid())
            firstName  String
            lastName   String
            address1   String
            address2   String?
            city       String
            state      String
            postalCode String
            country    String
            email      String
            phone      String
            type       String
            createdAt  DateTime @default(now())
            updatedAt  DateTime @updatedAt
        
            @@allow('all', true)
            @@delegate(type)
        }
        
        model BillingAddress extends OrderAddress {
            user   User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
            userId String?     @map("user_id")
            order  BaseOrder[]
        }
        
        model ShippingAddress extends OrderAddress {
            user   User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
            userId String?     @map("user_id")
            order  BaseOrder[]
        }
            `
        );

        const db = enhance();

        await db.user.create({ data: { id: '1', name: 'John', email: 'john@example.com' } });

        const shipping = await db.shippingAddress.create({
            data: {
                id: '1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Anytown',
                state: 'CA',
                postalCode: '12345',
                country: 'US',
                email: 'john@example.com',
                phone: '123-456-7890',
                user: { connect: { id: '1' } },
            },
        });

        const billing = await db.billingAddress.create({
            data: {
                id: '2',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Anytown',
                state: 'CA',
                postalCode: '12345',
                country: 'US',
                email: 'john@example.com',
                phone: '123-456-7890',
                user: { connect: { id: '1' } },
            },
        });

        await db.order.create({
            data: {
                id: '1',
                orderNumber: '1',
                status: 'PENDING',
                type: 'PARENT',
                shippingAddress: { connect: { id: '1' } },
                billingAddress: { connect: { id: '2' } },
                user: { connect: { id: '1' } },
            },
        });

        const updated = await db.order.update({
            where: { id: '1' },
            include: {
                lineItems: true,
                billingAddress: true,
                shippingAddress: true,
            },
            data: {
                type: 'CAMPAIGN',
            },
        });

        console.log(updated);
        expect(updated.shippingAddress).toEqual(shipping);
        expect(updated.billingAddress).toEqual(billing);
    });
});
