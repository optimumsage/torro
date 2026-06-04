import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test', CONFIG_PATH: '/nonexistent/.env' },
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
