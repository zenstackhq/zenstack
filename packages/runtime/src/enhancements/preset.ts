import { withOmit } from './omit';
import { withPassword } from './password';

export function withPresets<DbClient extends object>(prisma: DbClient) {
    return withOmit(withPassword(prisma));
}
