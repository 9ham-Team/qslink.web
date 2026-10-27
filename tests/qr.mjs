import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ window: { QSL: {} }, TextEncoder });
vm.runInContext(fs.readFileSync(new URL('../public/js/qr.js', import.meta.url), 'utf8'), context);
const qr = context.window.QSL.qr;

// Verified against independent ReportLab byte-mode matrices for the indicated
// version and mask. Hashes cover format, parity and remainder bits too.
const vectors = [
  ['https://qslink.example/s/AbCdEf', 2, 6, '933c76e501bcb601b8cb555d421e91d50f433689dc4886a88fc4c5055930137c'],
  ['http://43.142.58.20:44380/s/AbCdEf', 3, 5, '37e591fa2237a42d96a86b92bb59937c4c822f26e33eea4ee799d6acb26175c3'],
  ['', 1, 0, '39e30f72074b75ed5dab4e30b60ab996bd0a68d84d2f519574f435e668e3e5a0'],
  ['x'.repeat(17), 1, 0, '40250feb5812e202adb44275633657ba3f9c2e4070aaf6f4973cddbb11d9cd22'],
  ['x'.repeat(18), 2, 0, '32f640bdd5524646d4c6e6389dce00c62cdf1c0cd92c5d59e6180653c792502f'],
  ['x'.repeat(32), 2, 0, '26260318d20d404182db5847ab862a9f2099b5841fa82f061986816dfa573bc8'],
  ['x'.repeat(33), 3, 0, '0e86e60dd9f49cb8a5d75fe62fed510e3d56c45061b31a1f0d675a18d2e09f66'],
  ['x'.repeat(53), 3, 0, '1e81d2b21a86eed550fd87841e334b381da271ea0112d42685e8a2aa4894e87c'],
  ['x'.repeat(54), 4, 0, '2f4e4af8ef6dff69cd579b9241919969480fbc7ec1dc62e98d63142f1d69bdcb'],
  ['x'.repeat(78), 4, 0, 'c39873ccd15e998574e13cae43f0a37abe0d3101a0b3634553e5c0b7b9062cbb'],
  ['x'.repeat(79), 5, 0, '4975828e609516485e88b5d61a59279754cd39a06a848ded11d2aea5566cc337'],
  ['x'.repeat(106), 5, 0, '0bb91879dc71812dfcfa5ca3df4355cd77d133217919c523bea3e7f34a2f0894'],
  ['x'.repeat(107), 6, 0, 'd5a51745207d073ba8d2bb5e0c68462968d62a69a097ec35d13f606b10e5b8fb'],
  ['x'.repeat(134), 6, 0, 'fcf6199d8b88b33dd28c873089c04a9a165e4d759a090faed11746b70110779b'],
  ['https://例子.测试/s/中文', 2, 3, 'b965d72bc4b8da39ed4e83dec77ca76a5ae23d6566bf2a2fd24ba82c2a3f5902']
];
test('share QR selects the smallest version and matches independent reference matrices', () => {
  for (const [url, version, , expected] of vectors) {
    const matrix = qr.matrix(url);
    assert.equal(matrix.length, version * 4 + 17);
    const bits = matrix.flat().map(bit => bit ? '1' : '0').join('');
    assert.equal(createHash('sha256').update(bits).digest('hex'), expected);
  }
});
test('share QR poster rendering uses integer modules within its target and preserves quiet zone', () => {
  const drawn = [];
  context.document = { createElement: () => ({ getContext: () => ({ fillRect: (...args) => drawn.push(args) }) }) };
  for (const [url] of vectors) {
    drawn.length = 0;
    const size = qr.matrix(url).length + 8;
    const unit = Math.floor(245 / size);
    const canvas = qr.canvas(url, 5, 245);
    assert.equal(canvas.width, size * unit);
    assert.ok(canvas.width <= 245);
    drawn.slice(1).forEach(([x, y, w, h]) => {
      assert.equal(w, unit); assert.equal(h, unit);
      assert.ok(x >= unit * 4 && y >= unit * 4);
      assert.ok(x + w <= canvas.width - unit * 4 && y + h <= canvas.height - unit * 4);
      assert.ok(Number.isInteger(x) && Number.isInteger(y));
    });
  }
});
test('share QR rejects input beyond its byte capacity', () => {
  assert.throws(() => qr.matrix('x'.repeat(135)), /链接过长/);
  assert.throws(() => qr.matrix('中'.repeat(45)), /链接过长/);
});
