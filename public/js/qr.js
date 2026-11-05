/* Local QR encoder: ISO/IEC 18004 byte mode, smallest fitting version 1–6-L.
 * Reed–Solomon parity, scored choice of all eight masks, four-module quiet zone. */
(function () {
  'use strict';
  const QSL = window.QSL;
  const t = QSL.t || (source => source);
  // Version, data bytes per block, error-correction bytes per block.
  const versions = [[1, 19, 7, 1], [2, 34, 10, 1], [3, 55, 15, 1], [4, 80, 20, 1], [5, 108, 26, 1], [6, 68, 18, 2]];
  const masks = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0,
    x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
  ];
  function penalty(matrix) {
    let score = 0, dark = 0;
    const size = matrix.length;
    function line(bits) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && bits[i] === bits[i - 1]) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      const text = bits.map(bit => bit ? '1' : '0').join('');
      for (let i = 0; i <= size - 11; i++) {
        const pattern = text.slice(i, i + 11);
        if (pattern === '00001011101' || pattern === '10111010000') score += 40;
      }
    }
    for (let y = 0; y < size; y++) {
      line(matrix[y]); line(matrix.map(row => row[y]));
      for (let x = 0; x < size; x++) {
        if (matrix[y][x]) dark++;
        if (y && x && matrix[y][x] === matrix[y - 1][x] && matrix[y][x] === matrix[y][x - 1] && matrix[y][x] === matrix[y - 1][x - 1]) score += 3;
      }
    }
    return score + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  }
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
    const spec = versions.find(([, data, , blocks]) => 12 + bytes.length * 8 <= data * blocks * 8);
    if (!spec) throw new Error(t("分享链接过长，无法生成二维码"));
    const [version, blockData, parity, blockCount] = spec;
    const dataLength = blockData * blockCount;
    const bits = [];
    function append(value, count) {
      for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    append(4, 4);
    append(bytes.length, 8);
    bytes.forEach(value => append(value, 8));
    append(0, Math.min(4, dataLength * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    }
    for (let pad = 0; data.length < dataLength; pad++) data.push(pad % 2 ? 0x11 : 0xec);
    const divisor = Array(parity).fill(0);
    divisor[parity - 1] = 1;
    let root = 1;
    for (let i = 0; i < parity; i++) {
      for (let j = 0; j < parity; j++) {
        divisor[j] = multiply(divisor[j], root) ^ (j < parity - 1 ? divisor[j + 1] : 0);
      }
      root = multiply(root, 2);
    }
    const blocks = Array.from({ length: blockCount }, (_, i) => data.slice(i * blockData, (i + 1) * blockData));
    const checks = blocks.map(block => {
      const result = Array(parity).fill(0);
      block.forEach(value => {
        const factor = value ^ result.shift();
        result.push(0);
        for (let i = 0; i < parity; i++) result[i] ^= multiply(divisor[i], factor);
      });
      return result;
    });
    const stream = [];
    for (let i = 0; i < blockData; i++) blocks.forEach(block => stream.push(block[i]));
    for (let i = 0; i < parity; i++) checks.forEach(block => stream.push(block[i]));
    const size = version * 4 + 17;
    let matrix = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    function set(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      matrix[y][x] = !!dark;
      reserved[y][x] = true;
    }
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        set(cx + x, cy + y, distance !== 2 && distance !== 4);
      }
    });
    if (version > 1) {
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        set(size - 7 + x, size - 7 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }
    function formatBits(mask) {
      // L = 01; BCH(15,5) plus the mandated format XOR.
      const formatData = 8 | mask;
      let remainder = formatData;
      for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
      const format = ((formatData << 10) | remainder) ^ 0x5412;
      const bit = i => ((format >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    }
    formatBits(0);
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (reserved[y][x]) continue;
          const dark = index < stream.length * 8 && ((stream[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
          matrix[y][x] = dark;
          index++;
        }
      }
    }
    const raw = matrix;
    let best, lowest = Infinity;
    masks.forEach((mask, index) => {
      matrix = raw.map((row, y) => row.map((dark, x) => reserved[y][x] ? dark : dark !== mask(x, y)));
      formatBits(index);
      const score = penalty(matrix);
      if (score < lowest) { best = matrix; lowest = score; }
    });
    return best;
  }
  window.QSL.qr = {
    matrix: encode,
    canvas: function (text, scale, maxPixels) {
      const matrix = encode(text);
      const unit = maxPixels ? Math.max(1, Math.floor(maxPixels / (matrix.length + 8))) : scale || 5;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = (matrix.length + 8) * unit;
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
