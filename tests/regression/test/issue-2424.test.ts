import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2424', () => {
    it('deep nested include with PolicyPlugin works with non-compact alias mode', async () => {
        const db = await createPolicyTestClient(
            `
model Store {
    id                  String @id
    customerOrders      CustomerOrder[]
    productCatalogItems ProductCatalogItem[]
    @@allow('all', true)
}

model CustomerOrder {
    id                          String @id
    storeId                     String
    store                       Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
    customerOrderPaymentSummary CustomerOrderPaymentSummary[]
    @@allow('all', true)
}

model CustomerOrderPaymentSummary {
    id                              String @id
    customerOrderId                 String
    customerOrder                   CustomerOrder @relation(fields: [customerOrderId], references: [id], onDelete: Cascade)
    customerOrderPaymentSummaryLine CustomerOrderPaymentSummaryLine[]
    @@allow('all', true)
}

model PaymentTransaction {
    id                              String @id
    customerOrderPaymentSummaryLine CustomerOrderPaymentSummaryLine[]
    paymentTransactionLineItem      PaymentTransactionLineItem[]
    @@allow('all', true)
}

model CustomerOrderPaymentSummaryLine {
    customerOrderPaymentSummaryId String
    lineIndex                    Int
    paymentTransactionId         String
    customerOrderPaymentSummary  CustomerOrderPaymentSummary @relation(fields: [customerOrderPaymentSummaryId], references: [id], onDelete: Cascade)
    paymentTransaction           PaymentTransaction @relation(fields: [paymentTransactionId], references: [id], onDelete: Cascade)
    @@id([customerOrderPaymentSummaryId, lineIndex])
    @@allow('all', true)
}

model ProductCatalogItem {
    storeId                    String
    sku                        String
    store                      Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
    paymentTransactionLineItem PaymentTransactionLineItem[]
    @@id([storeId, sku])
    @@allow('all', true)
}

model InventoryReservation {
    id                         String @id
    paymentTransactionLineItem PaymentTransactionLineItem[]
    @@allow('all', true)
}

model PaymentTransactionLineItem {
    paymentTransactionId   String
    lineNumber             Int
    storeId                String
    productSku             String
    inventoryReservationId String?
    paymentTransaction     PaymentTransaction @relation(fields: [paymentTransactionId], references: [id], onDelete: Cascade)
    productCatalogItem     ProductCatalogItem @relation(fields: [storeId, productSku], references: [storeId, sku])
    inventoryReservation   InventoryReservation? @relation(fields: [inventoryReservationId], references: [id], onDelete: SetNull)
    @@id([paymentTransactionId, lineNumber])
    @@allow('all', true)
}
            `,
            { provider: 'postgresql', useCompactAliasNames: false },
        );

        const rawDb = db.$unuseAll();

        await rawDb.store.create({ data: { id: 'store_1' } });
        await rawDb.customerOrder.create({ data: { id: 'order_1', storeId: 'store_1' } });
        await rawDb.customerOrderPaymentSummary.create({ data: { id: 'summary_1', customerOrderId: 'order_1' } });
        await rawDb.paymentTransaction.create({ data: { id: 'payment_1' } });
        await rawDb.customerOrderPaymentSummaryLine.create({
            data: {
                customerOrderPaymentSummaryId: 'summary_1',
                lineIndex: 0,
                paymentTransactionId: 'payment_1',
            },
        });
        await rawDb.productCatalogItem.create({ data: { storeId: 'store_1', sku: 'sku_1' } });
        await rawDb.inventoryReservation.create({ data: { id: 'reservation_1' } });
        await rawDb.paymentTransactionLineItem.create({
            data: {
                paymentTransactionId: 'payment_1',
                lineNumber: 0,
                storeId: 'store_1',
                productSku: 'sku_1',
                inventoryReservationId: 'reservation_1',
            },
        });

        const result = await db.customerOrderPaymentSummary.findUnique({
            where: { id: 'summary_1' },
            include: {
                customerOrder: true,
                customerOrderPaymentSummaryLine: {
                    include: {
                        paymentTransaction: {
                            include: {
                                paymentTransactionLineItem: {
                                    include: {
                                        productCatalogItem: true,
                                        inventoryReservation: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(result).toMatchObject({
            id: 'summary_1',
            customerOrder: {
                id: 'order_1',
                storeId: 'store_1',
            },
            customerOrderPaymentSummaryLine: [
                {
                    customerOrderPaymentSummaryId: 'summary_1',
                    lineIndex: 0,
                    paymentTransactionId: 'payment_1',
                    paymentTransaction: {
                        id: 'payment_1',
                        paymentTransactionLineItem: [
                            {
                                paymentTransactionId: 'payment_1',
                                lineNumber: 0,
                                storeId: 'store_1',
                                productSku: 'sku_1',
                                inventoryReservationId: 'reservation_1',
                                productCatalogItem: {
                                    storeId: 'store_1',
                                    sku: 'sku_1',
                                },
                                inventoryReservation: {
                                    id: 'reservation_1',
                                },
                            },
                        ],
                    },
                },
            ],
        });

        await db.$disconnect();
    });
});
