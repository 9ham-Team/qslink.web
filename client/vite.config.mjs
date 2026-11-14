import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig({
  root,
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: 'dist-public',
    emptyOutDir: false,
    target: ['chrome109', 'safari16.4', 'firefox115'],
    sourcemap: false,
    rollupOptions: {
      input: 'client/src/entry.ts',
      output: {
        entryFileNames: 'build/entry.js',
        chunkFileNames: 'build/[name]-[hash].js',
        assetFileNames: 'build/[name]-[hash][extname]',
      },
    },
  },
});
