import { ResolvedType } from './types';
import { AttributeParam } from '@zenstackhq/language/ast';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AttributeArg } from '@zenstackhq/language/ast';

declare module 'langium' {
    export interface AstNode {
        /**
         * Resolved type information attached to expressions
         */
        $resolvedType?: ResolvedType;
    }
}

declare module '@zenstackhq/language/ast' {
    interface AttributeArg {
        /**
         * Resolved attribute param declaration
         */
        $resolvedParam?: AttributeParam;
    }
}
