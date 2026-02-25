import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2378', () => {
    it('deep nested include should not generate alias names exceeding 63 bytes', async () => {
        const db = await createTestClient(
            `
model RepositoryCases {
    id         Int       @id @default(autoincrement())
    templateId Int
    template   Templates @relation(fields: [templateId], references: [id])
}

model Templates {
    id         Int                      @id @default(autoincrement())
    cases      RepositoryCases[]
    caseFields TemplateCaseAssignment[]
}

model TemplateCaseAssignment {
    id          Int        @id @default(autoincrement())
    templateId  Int
    template    Templates  @relation(fields: [templateId], references: [id])
    caseFieldId Int
    caseField   CaseFields @relation(fields: [caseFieldId], references: [id])
}

model CaseFields {
    id           Int                      @id @default(autoincrement())
    assignments  TemplateCaseAssignment[]
    fieldOptions CaseFieldAssignment[]
}

model CaseFieldAssignment {
    id            Int          @id @default(autoincrement())
    caseFieldId   Int
    caseField     CaseFields   @relation(fields: [caseFieldId], references: [id])
    fieldOptionId Int
    fieldOption   FieldOptions @relation(fields: [fieldOptionId], references: [id])
}

model FieldOptions {
    id          Int                   @id @default(autoincrement())
    value       String
    assignments CaseFieldAssignment[]
}
            `,
        );

        // seed data: RepositoryCases -> Templates -> TemplateCaseAssignment -> CaseFields -> CaseFieldAssignment -> FieldOptions
        await db.repositoryCases.create({
            data: {
                template: {
                    create: {
                        caseFields: {
                            create: {
                                caseField: {
                                    create: {
                                        fieldOptions: {
                                            create: {
                                                fieldOption: {
                                                    create: { value: 'option1' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // 5-level deep include that previously generated aliases exceeding 63 bytes
        const result = await db.repositoryCases.findFirst({
            where: { id: 1 },
            include: {
                template: {
                    include: {
                        caseFields: {
                            include: {
                                caseField: {
                                    include: {
                                        fieldOptions: {
                                            include: {
                                                fieldOption: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(result).toBeTruthy();
        expect(result.template.caseFields).toHaveLength(1);
        expect(result.template.caseFields[0].caseField.fieldOptions).toHaveLength(1);
        expect(result.template.caseFields[0].caseField.fieldOptions[0].fieldOption.value).toBe('option1');
    });
});
