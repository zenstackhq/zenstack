import { CodeBlockWriter, SourceFile } from 'ts-morph';
import {
    generateProcedureTyping as generateProcedureTypingForReact,
    generateRouterTypingImports as generateRouterTypingImportsForReact,
} from './react';

export function generateRouterTypingImports(sourceFile: SourceFile, version: string) {
    // next shares the same typing imports as react
    generateRouterTypingImportsForReact(sourceFile, version);
}

export function generateProcedureTyping(
    writer: CodeBlockWriter,
    opType: string,
    modelName: string,
    baseOpType: string,
    version: string
) {
    // next shares the same procedure typing as react
    generateProcedureTypingForReact(writer, opType, modelName, baseOpType, version);
}
