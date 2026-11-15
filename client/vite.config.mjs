import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { publicAssetsPlugin } from '../tools/asset-plugin.mjs';
const root = fileURLToPath(new URL('./', import.meta.url));
export default defineConfig({
  root, publicDir:false,
  plugins:[publicAssetsPlugin(fileURLToPath(new URL('../public/',import.meta.url))),vue()],
  build:{
    outDir:'../dist-public',emptyOutDir:false,assetsInlineLimit:0,
    target:['chrome109','safari16.4','firefox115'],sourcemap:false,
    rollupOptions:{
      input:fileURLToPath(new URL('./index.html',import.meta.url)),
      output:{entryFileNames:'build/[name]-[hash].js',chunkFileNames:'build/[name]-[hash].js',assetFileNames:'build/[name]-[hash][extname]'},
    },
  },
  worker:{format:'es',rollupOptions:{output:{entryFileNames:'build/[name]-[hash].js',chunkFileNames:'build/[name]-[hash].js',assetFileNames:'build/[name]-[hash][extname]'}}},
});
