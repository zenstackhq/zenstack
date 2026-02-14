import type { GetProcedureNames, GetSlicedProcedures, ClientOptions } from '@zenstackhq/orm';
import type { schema as proceduresSchema } from '../schemas/procedures/schema';

// Check what GetProcedureNames returns
type AllProcedures = GetProcedureNames<typeof proceduresSchema>;
// Hover over this to see: should be 'getUser' | 'listUsers' | 'signUp' | 'setAdmin' | 'getOverview' | 'createMultiple'
const _test1: AllProcedures = 'getUser';

// Define options with excluded procedures
type Options = ClientOptions<typeof proceduresSchema> & {
    readonly slicing: {
        readonly excludedProcedures: readonly ['signUp', 'setAdmin', 'createMultiple'];
    };
};

// Check what GetSlicedProcedures returns
type SlicedProcedures = GetSlicedProcedures<typeof proceduresSchema, Options>;
// Hover over this to see what it actually is
const _test2: SlicedProcedures = 'getUser';
const _test3: SlicedProcedures = 'signUp'; // This should be an error but probably isn't
