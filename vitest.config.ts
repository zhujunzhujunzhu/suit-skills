import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**', 'tests/e2e/**'],
    globals: true,
    testTimeout: 10_000,
  },
});
