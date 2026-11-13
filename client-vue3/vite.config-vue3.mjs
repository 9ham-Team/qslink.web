import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig({
  root,
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: 'dist-public-vue3',
    emptyOutDir: false,
    target: ['chrome109', 'safari16.4', 'firefox115'],
    sourcemap: false,
    rollupOptions: {
      input: 'client-vue3/src/entry-vue3.ts',
      output: {
        entryFileNames: 'build-vue3/entry-vue3.js',
        chunkFileNames: 'build-vue3/[name]-[hash]-vue3.js',
        assetFileNames: 'build-vue3/[name]-[hash]-vue3[extname]',
      },
    },
  },
});
