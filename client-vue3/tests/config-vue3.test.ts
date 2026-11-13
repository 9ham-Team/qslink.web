import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readConfig } = require('../../server/lib/config.js');
const base = { DATABASE_URL: 'postgresql://isolated:unused@127.0.0.1:1/unused', NODE_ENV: 'test' };
it('preserves the legacy static default and opts into an isolated Vue3 build — vue3', () => {
  expect(readConfig(base).publicDir).toBe(path.resolve('public'));
  expect(readConfig({ ...base, QSL_PUBLIC_DIR_VUE3: 'dist-public-vue3' }).publicDir).toBe(path.resolve('dist-public-vue3'));
  expect(() => readConfig({ ...base, QSL_PUBLIC_DIR_VUE3: 'dist-public-vue3', QSL_DATA_DIR: path.resolve('dist-public-vue3/data') })).toThrow('数据目录不能位于 public 内');
  expect(() => readConfig({ ...base, QSL_PUBLIC_DIR_VUE3: 'dist-public-vue3', QSL_DATA_DIR: path.resolve('public/data') })).toThrow('数据目录不能位于 public 内');
});
