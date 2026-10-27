/* Local QR encoder: ISO/IEC 18004 byte mode, version 6-L (134 UTF-8 bytes).
 * Two blocks of 68 data + 18 Reed–Solomon bytes; mask 0; four-module quiet zone.
 * Fixed sizing keeps the short share URL readable without external services. */
(function () {
  'use strict';
  function multiply(a, b) {
    let value = 0;
    for (let i = 7; i >= 0; i--) {
      value = (value << 1) ^ ((value >>> 7) * 0x11d);
      value ^= ((b >>> i) & 1) * a;
    }
    return value;
  }
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 134) throw new Error('分享链接过长，无法生成二维码');
    const bits = [];
    function append(value, count) {
      for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    append(4, 4);
    append(bytes.length, 8);
    bytes.forEach(value => append(value, 8));
    append(0, Math.min(4, 1088 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    }
    for (let pad = 0; data.length < 136; pad++) data.push(pad % 2 ? 0x11 : 0xec);
    const divisor = Array(18).fill(0);
    divisor[17] = 1;
    let root = 1;
    for (let i = 0; i < 18; i++) {
      for (let j = 0; j < 18; j++) {
        divisor[j] = multiply(divisor[j], root) ^ (j < 17 ? divisor[j + 1] : 0);
      }
      root = multiply(root, 2);
    }
    const blocks = [data.slice(0, 68), data.slice(68)];
    const checks = blocks.map(block => {
      const result = Array(18).fill(0);
      block.forEach(value => {
        const factor = value ^ result.shift();
        result.push(0);
        for (let i = 0; i < 18; i++) result[i] ^= multiply(divisor[i], factor);
      });
      return result;
    });
    const stream = [];
    for (let i = 0; i < 68; i++) blocks.forEach(block => stream.push(block[i]));
    for (let i = 0; i < 18; i++) checks.forEach(block => stream.push(block[i]));
    const size = 41;
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    function set(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      matrix[y][x] = !!dark;
      reserved[y][x] = true;
    }
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [37, 3], [3, 37]].forEach(([cx, cy]) => {
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        set(cx + x, cy + y, distance !== 2 && distance !== 4);
      }
    });
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      set(34 + x, 34 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
    // L = 01, mask = 000; BCH(15,5) plus the mandated format XOR.
    let remainder = 8;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const format = ((8 << 10) | remainder) ^ 0x5412;
    const bit = i => ((format >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (reserved[y][x]) continue;
          const dark = index < stream.length * 8 && ((stream[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
          matrix[y][x] = dark !== ((x + y) % 2 === 0);
          index++;
        }
      }
    }
    return matrix;
  }
  window.QSL.qr = {
    matrix: encode,
    canvas: function (text, scale) {
      const matrix = encode(text);
      const unit = scale || 5;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 49 * unit;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#102b32';
      matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) context.fillRect((x + 4) * unit, (y + 4) * unit, unit, unit);
      }));
      return canvas;
    }
  };
})();
