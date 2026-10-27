/* Dependency-free Monet-style wallpaper colors: quantization, population/chroma
 * scoring and perceptual tonal palettes. OKLCH supplies tones and gamut mapping;
 * this is not Google's CAM16/HCT implementation. Only poster colors are changed. */
(function () {
  'use strict';
  const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  const gamma = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
  function lab(rgb) {
    const [r, g, b] = rgb.map(value => linear(value / 255));
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
    const bb = .0259040371 * l + .7827717662 * m - .808675766 * s;
    return { l: .2104542553 * l + .793617785 * m - .0040720468 * s,
      c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
  }
  function rgbAt(l, c, h) {
    const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
    const ll = (l + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (l - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (l - .0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * ll - 3.3077115913 * m + .2309699292 * s,
      -1.2684380046 * ll + 2.6097574011 * m - .3413193965 * s,
      -.0041960863 * ll - .7034186147 * m + 1.707614701 * s];
  }
  function tone(l, c, h) {
    let low = 0, high = c;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (rgbAt(l, mid, h).every(value => value >= 0 && value <= 1)) low = mid;
      else high = mid;
    }
    return '#' + rgbAt(l, low, h).map(value => Math.round(Math.max(0, Math.min(1, gamma(value))) * 255).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const rgb = [1, 3, 5].map(index => linear(parseInt(hex.slice(index, index + 2), 16) / 255));
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  }
  function contrast(a, b) {
    const aa = luminance(a), bb = luminance(b);
    return (Math.max(aa, bb) + .05) / (Math.min(aa, bb) + .05);
  }
  function palette(seed) {
    const h = seed.h, c = Math.min(seed.c, .14), neutral = Math.min(c * .2, .022);
    const result = {
      backgroundTop: tone(.975, neutral * .65, h), backgroundBottom: tone(.94, neutral, h),
      surface: tone(.994, neutral * .18, h), inset: tone(.96, neutral * .8, h),
      line: tone(.81, neutral * 1.4, h),
    };
    const backgrounds = [result.backgroundTop, result.backgroundBottom, result.surface, result.inset, '#ffffff'];
    function text(start, chroma) {
      for (let lightness = start; lightness >= .1; lightness -= .015) {
        const color = tone(lightness, chroma, h);
        if (backgrounds.every(background => contrast(color, background) >= 4.5)) return color;
      }
      return '#000000';
    }
    result.ink = text(.26, Math.min(c, .035));
    result.muted = text(.45, Math.min(c, .03));
    result.accent = text(.4, c);
    result.shadow = result.ink + '29';
    return result;
  }
  const fallback = () => palette(lab([12, 101, 89]));
  function fromPixels(pixels) {
    const bins = new Map();
    let total = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const alpha = pixels[i + 3] / 255;
      const rgb = [0, 1, 2].map(offset => Math.round(pixels[i + offset] * alpha + 255 * (1 - alpha)));
      const key = (rgb[0] >> 3) << 10 | (rgb[1] >> 3) << 5 | rgb[2] >> 3;
      const bin = bins.get(key) || { count: 0, sums: [0, 0, 0] };
      bin.count++; rgb.forEach((value, index) => { bin.sums[index] += value; });
      bins.set(key, bin); total++;
    }
    if (!total) return fallback();
    const candidates = Array.from(bins.values(), bin => ({ ...lab(bin.sums.map(value => value / bin.count)), count: bin.count }))
      .filter(color => color.c >= .035 && color.l > .12 && color.l < .94);
    const hues = Array(360).fill(0);
    candidates.forEach(color => { hues[Math.floor(color.h)] += color.count; });
    const populations = hues.map((count, hue) => {
      let sum = 0;
      for (let offset = -15; offset <= 15; offset++) sum += hues[(hue + offset + 360) % 360];
      return sum / total;
    });
    let best = null, bestScore = -1;
    for (const candidate of candidates) {
      // Excited hue population joins nearby colors split across quantization bins.
      const population = populations[Math.floor(candidate.h)];
      if (population < .01) continue;
      const score = population * 70 + Math.min(candidate.c, .3) / .3 * 30;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    // Achromatic cards get a neutral palette rather than a fabricated saturated hue.
    return palette(best || { h: 0, c: 0 });
  }
  function fromImage(img) {
    if (!img) return fallback();
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 64, 64);
      return fromPixels(ctx.getImageData(0, 0, 64, 64).data);
    } catch { return fallback(); }
  }
  window.QSL.posterPalette = { fromImage, fromPixels, contrast };
})();
