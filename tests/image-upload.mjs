import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';

const source = await fs.readFile(new URL('../public/js/image-upload.js', import.meta.url), 'utf8');
function load(window = {}, extras = {}) {
  vm.runInNewContext(source, { window, DOMException, ...extras });
  return window.QSL.imageUpload;
}
const image = (width, height) => sharp({ create: { width, height, channels: 4, background: '#18b59b80' } });

test('upload metadata reads PNG, JPEG, WebP variants and EXIF orientation without decoding', async () => {
  const api = load();
  const samples = [
    [await image(37, 19).png().toBuffer(), 37, 19],
    [await image(37, 19).jpeg().toBuffer(), 37, 19],
    [await image(37, 19).jpeg().withMetadata({ orientation: 6 }).toBuffer(), 19, 37],
    [await image(37, 19).removeAlpha().webp().toBuffer(), 37, 19],
    [await image(37, 19).webp().toBuffer(), 37, 19],
    [await image(37, 19).webp({ lossless: true }).toBuffer(), 37, 19],
  ];
  for (const [buffer, width, height] of samples) {
    const actual = await api.dimensions(new Blob([buffer]));
    assert.equal(actual.width, width);
    assert.equal(actual.height, height);
  }
  await assert.rejects(api.dimensions(new Blob(['broken image'])));
});

test('browser conversion requests bounded decoding and releases bitmap/canvas while retaining original dimensions', async () => {
  let closed = 0, canvas;
  const calls = [];
  const api = load({
    async createImageBitmap(file, options) {
      calls.push(options);
      return { close() { closed++; } };
    },
    OffscreenCanvas: class {
      constructor(width, height) { this.width = width; this.height = height; canvas = this; }
      getContext() { return { drawImage() {} }; }
      async convertToBlob(options) {
        assert.equal(options.type, 'image/webp');
        return new Blob(['converted'], { type: 'image/webp' });
      }
    },
  }, {
    FileReader: class {
      readAsDataURL(blob) { this.result = 'data:' + blob.type + ';base64,Y29udmVydGVk'; this.onload(); }
    },
  });
  // Only the header is needed for this test; no full-size decoded allocation.
  const huge = await image(37, 19).png().toBuffer();
  huge.writeUInt32BE(21317, 16);
  huge.writeUInt32BE(13760, 20);
  const result = await api.convert(new Blob([huge]));
  assert.equal(result.width, 21317);
  assert.equal(result.height, 13760);
  assert.match(result.src, /^data:image\/webp;/);
  assert.equal(calls[0].resizeWidth, 3840);
  assert.equal(calls[0].resizeHeight, 2479);
  await api.convert(new Blob([await image(32, 16).png().toBuffer()]));
  assert.equal(calls[1].resizeWidth, 32);
  assert.equal(calls[1].resizeHeight, 16);
  assert.equal(closed, 2);
  assert.equal(canvas.width, 1);
});

test('upload processor serializes front/back jobs, continues after errors and cancels on leaving', async () => {
  const workers = [];
  const api = load({
    OffscreenCanvas: class {},
    Worker: class {
      constructor() { workers.push(this); }
      postMessage(file) { this.file = file; }
      terminate() { this.terminated = true; }
    },
  });
  const processor = api.createProcessor();
  const front = processor.process('front');
  const back = processor.process('back');
  await Promise.resolve();
  assert.equal(workers.length, 1);
  workers[0].onmessage({ data: { result: { src: 'front-webp' } } });
  assert.equal((await front).src, 'front-webp');
  await Promise.resolve();
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  const rejected = assert.rejects(back, /bad image/);
  workers[1].onmessage({ data: { error: 'bad image' } });
  await rejected;
  const active = processor.process('retry');
  const queued = processor.process('next');
  const canceled = [active, queued].map(job => assert.rejects(job, { name: 'AbortError' }));
  await Promise.resolve();
  processor.destroy();
  await Promise.all(canceled);
  assert.equal(workers.length, 3);
  assert.equal(workers[2].terminated, true);
});
