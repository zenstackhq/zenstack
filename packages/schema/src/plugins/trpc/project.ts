import { Project, ScriptTarget, ModuleKind, CompilerOptions } from 'ts-morph';

const compilerOptions: CompilerOptions = {
  target: ScriptTarget.ES2019,
  module: ModuleKind.CommonJS,
  emitDecoratorMetadata: true,
  experimentalDecorators: true,
  esModuleInterop: true,
};

export const project = new Project({
  compilerOptions: {
    ...compilerOptions,
  },
});
