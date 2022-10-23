import { ResolvedType } from '@lang/types';

declare module 'langium' {
    export interface AstNode {
        $resolvedType?: ResolvedType;
    }
}
