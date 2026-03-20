import base from '@zenstackhq/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(base, defineConfig({}));
