import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['client/tests/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    maxWorkers: 4,
  },
});
