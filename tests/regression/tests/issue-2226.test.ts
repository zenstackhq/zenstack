import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2226', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
model Registration {
    id String @id
    regType String
    @@delegate(regType)

    replacedRegistrationId String?
    replacedRegistration   Registration?  @relation("ReplacedBy", fields: [replacedRegistrationId], references: [id])
    replacements           Registration[] @relation("ReplacedBy")
}

// Delegated subtype
model RegistrationFramework extends Registration {
}
`,
            { fullZod: true }
        );

        const schema = zodSchemas.objects.RegistrationFrameworkUpdateInputObjectSchema;
        expect(schema).toBeDefined();
        const parsed = schema.safeParse({
            replacedRegistrationId: '123',
        });
        expect(parsed.success).toBe(true);
    });
});
