/* eslint-disable @typescript-eslint/no-explicit-any */
import { PolicyUtil } from '../../src/enhancements/policy/policy-utils';

describe('Prisma query reduction tests', () => {
    function reduce(query: any) {
        const util = new PolicyUtil({} as any, {} as any);
        return util['reduce'](query);
    }

    const TRUE = { AND: [] };
    const FALSE = { OR: [] };

    it('should keep regular queries unchanged', () => {
        expect(reduce(null)).toEqual(null);
        expect(reduce({ x: 1, y: 'hello' })).toEqual({ x: 1, y: 'hello' });
        const d = new Date();
        expect(reduce({ x: d })).toEqual({ x: d });
    });

    it('should keep regular logical queries unchanged', () => {
        expect(reduce({ AND: [{ x: 1 }, { y: 'hello' }] })).toEqual({ AND: [{ x: 1 }, { y: 'hello' }] });
        expect(reduce({ OR: [{ x: 1 }, { y: 'hello' }] })).toEqual({ OR: [{ x: 1 }, { y: 'hello' }] });
        expect(reduce({ NOT: [{ x: 1 }, { y: 'hello' }] })).toEqual({ NOT: [{ x: 1 }, { y: 'hello' }] });
        expect(reduce({ AND: { x: 1 }, OR: { y: 'hello' }, NOT: { z: 2 } })).toEqual({
            AND: { x: 1 },
            OR: { y: 'hello' },
            NOT: { z: 2 },
        });
        expect(reduce({ AND: { x: 1, OR: { y: 'hello', NOT: [{ z: 2 }] } } })).toEqual({
            AND: { x: 1, OR: { y: 'hello', NOT: [{ z: 2 }] } },
        });
    });

    it('should handle constant true false', () => {
        expect(reduce(undefined)).toEqual(TRUE);
        expect(reduce({})).toEqual(TRUE);
        expect(reduce(TRUE)).toEqual(TRUE);
        expect(reduce(FALSE)).toEqual(FALSE);
    });

    it('should reduce simple true false', () => {
        expect(reduce({ AND: TRUE })).toEqual(TRUE);
        expect(reduce({ AND: FALSE })).toEqual(FALSE);
        expect(reduce({ OR: TRUE })).toEqual(TRUE);
        expect(reduce({ OR: FALSE })).toEqual(FALSE);
        expect(reduce({ NOT: TRUE })).toEqual(FALSE);
        expect(reduce({ NOT: FALSE })).toEqual(TRUE);
    });

    it('should reduce AND queries', () => {
        expect(reduce({ AND: [{ x: 1 }, TRUE, { y: 2 }] })).toEqual({ AND: [{ x: 1 }, { y: 2 }] });
        expect(reduce({ AND: [{ x: 1 }, FALSE, { y: 2 }] })).toEqual(FALSE);
        expect(reduce({ AND: [{ x: 1 }, TRUE, FALSE, { y: 2 }] })).toEqual(FALSE);
    });

    it('should reduce OR queries', () => {
        expect(reduce({ OR: [{ x: 1 }, TRUE, { y: 2 }] })).toEqual(TRUE);
        expect(reduce({ OR: [{ x: 1 }, FALSE, { y: 2 }] })).toEqual({ OR: [{ x: 1 }, { y: 2 }] });
        expect(reduce({ OR: [{ x: 1 }, TRUE, FALSE, { y: 2 }] })).toEqual(TRUE);
    });

    it('should reduce NOT queries', () => {
        expect(reduce({ NOT: { AND: [FALSE, { x: 1 }] } })).toEqual(TRUE);
        expect(reduce({ NOT: { OR: [TRUE, { x: 1 }] } })).toEqual(FALSE);
    });
});
