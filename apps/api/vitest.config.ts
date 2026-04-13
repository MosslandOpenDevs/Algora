import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Security tests mutate the DB via in-memory SQLite; run serially to keep
    // shared globals (llmService singleton) predictable.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
