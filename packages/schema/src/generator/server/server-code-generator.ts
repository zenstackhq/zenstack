import { Context } from '../types';
import { Project } from 'ts-morph';

export interface ServerCodeGenerator {
    generate(project: Project, context: Context): void;
}
