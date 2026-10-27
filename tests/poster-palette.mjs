import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: { QSL: {} } });
vm.runInContext(fs.readFileSync(new URL('../public/js/poster-palette.js', import.meta.url), 'utf8'), context);
const { fromPixels, contrast } = context.window.QSL.posterPalette;
const pixels = (...groups) => new Uint8ClampedArray(groups.flatMap(([rgb, count, alpha = 255]) => Array.from({ length: count }, () => [...rgb, alpha]).flat()));

test('poster extraction prefers prevalent hues and ignores white/black and tiny color noise', () => {
  const red = [198, 56, 62], blue = [45, 85, 180];
  const redPalette = fromPixels(pixels([red, 100]));
  const bluePalette = fromPixels(pixels([blue, 100]));
  assert.notEqual(redPalette.backgroundBottom, bluePalette.backgroundBottom);
  assert.equal(fromPixels(pixels([red, 80], [blue, 20])).accent, redPalette.accent);
  assert.equal(fromPixels(pixels([[255, 255, 255], 900], [red, 100], [[0, 255, 0], 1])).accent, redPalette.accent);
  assert.equal(fromPixels(pixels([[0, 0, 0], 900], [blue, 100])).accent, bluePalette.accent);
});

test('poster palettes handle neutral/transparent cards deterministically', () => {
  const neutral = fromPixels(pixels([[0, 0, 0], 30], [[128, 128, 128], 50], [[255, 255, 255], 20]));
  Object.entries(neutral).filter(([key]) => key !== 'shadow').forEach(([, hex]) => {
    assert.equal(hex.slice(1, 3), hex.slice(3, 5)); assert.equal(hex.slice(3, 5), hex.slice(5, 7));
  });
  const blue = [40, 80, 190];
  assert.equal(fromPixels(pixels([blue, 100], [[255, 0, 0], 1000, 0])).accent, fromPixels(pixels([blue, 100])).accent);
  assert.deepEqual(fromPixels(pixels([[255, 0, 0], 20, 0])), fromPixels(new Uint8ClampedArray()));
});

test('poster text and white-on-accent meet WCAG AA across the palette gamut', () => {
  for (const r of [0, 64, 128, 192, 255]) for (const g of [0, 64, 128, 192, 255]) for (const b of [0, 64, 128, 192, 255]) {
    const palette = fromPixels(pixels([[r, g, b], 10]));
    Object.entries(palette).filter(([key]) => key !== 'shadow').forEach(([, hex]) => assert.match(hex, /^#[a-f0-9]{6}$/));
    for (const foreground of [palette.ink, palette.muted, palette.accent]) {
      for (const background of [palette.backgroundTop, palette.backgroundBottom, palette.surface, palette.inset, '#ffffff']) {
        assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
      }
    }
    assert.ok(contrast('#ffffff', palette.accent) >= 4.5);
  }
  assert.equal(contrast('#000000', '#ffffff'), 21);
});
