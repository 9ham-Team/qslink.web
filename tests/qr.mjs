import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ window: { QSL: {} }, TextEncoder });
vm.runInContext(fs.readFileSync(new URL('../public/js/qr.js', import.meta.url), 'utf8'), context);
const qr = context.window.QSL.qr;

// Independent ReportLab QRCode(6, L), explicit QR8bitByte, makeImpl(false, 0).
// These hashes cover all 1681 modules, including format, parity and remainder bits.
const vectors = [
  ['https://qslink.example/s/Ab12Cd', 'e1373573c8efe69c739a6b0a612936c13a40e06db57677faeaacf0481fa3d376'],
  ['http://127.0.0.1:8787/s/Qa0001', '296bc33364758df9200adc32327eeecfe7d986ff4291d9fe207e5b33dcfe80d0'],
  ['x'.repeat(134), 'fcf6199d8b88b33dd28c873089c04a9a165e4d759a090faed11746b70110779b'],
  ['https://例子.测试/s/中文', '9cfde1c9b793a164c97b04d7dfe8f749555ef47bf4e37b8d65ac720ebe2e07b8']
];
test('share QR matches independent version 6-L reference matrices', () => {
  for (const [url, expected] of vectors) {
    const matrix = qr.matrix(url);
    assert.equal(matrix.length, 41);
    const bits = matrix.flat().map(bit => bit ? '1' : '0').join('');
    assert.equal(createHash('sha256').update(bits).digest('hex'), expected);
  }
});
test('share QR rejects input beyond its byte capacity', () => {
  assert.throws(() => qr.matrix('x'.repeat(135)), /链接过长/);
  assert.throws(() => qr.matrix('中'.repeat(45)), /链接过长/);
});
