import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/finplan_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      APP_TIMEZONE: 'America/Sao_Paulo',
      INITIAL_ADMIN_USERNAME: 'mlf',
      INITIAL_ADMIN_PASSWORD: '0080',
    },
  },
});
