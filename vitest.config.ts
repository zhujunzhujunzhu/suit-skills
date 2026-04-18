import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    globals: true,
    testTimeout: 10_000,
  },
});
