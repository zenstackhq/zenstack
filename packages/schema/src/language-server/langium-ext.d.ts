import { ResolvedType } from '@lang/types';
import { AttributeParam } from './generated/ast';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AttributeArg } from './generated/ast';

declare module 'langium' {
    export interface AstNode {
        /**
         * Resolved type information attached to expressions
         */
        $resolvedType?: ResolvedType;
    }
}

declare module './generated/ast' {
    interface AttributeArg {
        /**
         * Resolved attribute param declaration
         */
        $resolvedParam?: AttributeParam;
    }
}
