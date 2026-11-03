/* Local upload preparation; shared by the page and its dedicated worker. */
(function (scope) {
  'use strict';
  const QSL = scope.QSL || (scope.QSL = {});
  const MAX_EDGE = 3840;

  function exifOrientation(view, start) {
    try {
      const little = view.getUint16(start) === 0x4949;
      if (![0x4949, 0x4d4d].includes(view.getUint16(start)) || view.getUint16(start + 2, little) !== 42) return 1;
      const ifd = start + view.getUint32(start + 4, little);
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
    } catch (err) { /* Missing or malformed optional EXIF. */ }
    return 1;
  }

  // Read dimensions without constructing a full-size decoded image or DOM preview.
  async function dimensions(file) {
    const view = new DataView(await file.arrayBuffer());
    const text = (offset, length) => {
      let result = '';
      for (let i = 0; i < length; i++) result += String.fromCharCode(view.getUint8(offset + i));
      return result;
    };
    let width, height, orientation = 1;
    if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && text(12, 4) === 'IHDR') {
      width = view.getUint32(16);
      height = view.getUint32(20);
    } else if (view.byteLength >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      for (let offset = 12; offset + 8 <= view.byteLength;) {
        const type = text(offset, 4);
        const size = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (start + size > view.byteLength) break;
        if (type === 'VP8X' && size >= 10) {
          width = 1 + (view.getUint32(start + 4, true) & 0xffffff);
          height = 1 + (view.getUint32(start + 6, true) >>> 8);
        } else if (type === 'VP8 ' && size >= 10 && !width) {
          width = view.getUint16(start + 6, true) & 0x3fff;
          height = view.getUint16(start + 8, true) & 0x3fff;
        } else if (type === 'VP8L' && size >= 5 && !width) {
          const bits = view.getUint32(start + 1, true);
          width = 1 + (bits & 0x3fff);
          height = 1 + ((bits >>> 14) & 0x3fff);
        } else if (type === 'EXIF' && size >= 8) {
          orientation = exifOrientation(view, text(start, 4) === 'Exif' ? start + 6 : start);
        }
        offset = start + size + (size % 2);
      }
    } else if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
      let offset = 2;
      while (offset + 4 <= view.byteLength) {
        if (view.getUint8(offset++) !== 0xff) break;
        while (view.getUint8(offset) === 0xff) offset++;
        const marker = view.getUint8(offset++);
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const size = view.getUint16(offset);
        if (size < 2 || offset + size > view.byteLength) break;
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          height = view.getUint16(offset + 3);
          width = view.getUint16(offset + 5);
        } else if (marker === 0xe1 && size >= 16 && text(offset + 2, 4) === 'Exif') {
          orientation = exifOrientation(view, offset + 8);
        }
        offset += size;
      }
    }
    if (!width || !height) throw new Error('图片格式无效或无法读取分辨率，请重新选择');
    if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
    return { width, height };
  }

  async function convert(file) {
    const original = await dimensions(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(original.width, original.height));
    const width = Math.max(1, Math.round(original.width * scale));
    const height = Math.max(1, Math.round(original.height * scale));
    let bitmap, canvas;
    try {
      bitmap = await scope.createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'from-image' });
      canvas = typeof scope.OffscreenCanvas === 'function' ? new scope.OffscreenCanvas(width, height) : scope.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法处理图片，请更换浏览器后重试');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
        : await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob || blob.type !== 'image/webp') throw new Error('浏览器不支持 WebP 转换，请更换浏览器后重试');
      if (blob.size > 8 * 1024 * 1024) throw new Error('处理后的图片超过 8MB，请选择其他图片');
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
        reader.readAsDataURL(blob);
      });
      return { src, width: original.width, height: original.height };
    } finally {
      if (bitmap) bitmap.close();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }

  function createProcessor() {
    let worker = null, stopped = false, rejectActive = null;
    let queue = Promise.resolve();
    const aborted = () => new DOMException('图片处理已取消', 'AbortError');
    function process(file) {
      const job = queue.then(() => {
        if (stopped) throw aborted();
        if (typeof scope.Worker !== 'function' || typeof scope.OffscreenCanvas !== 'function') return convert(file);
        return new Promise((resolve, reject) => {
          rejectActive = reject;
          worker = new scope.Worker('/js/image-upload-worker.js');
          const finish = () => { worker.terminate(); worker = null; rejectActive = null; };
          worker.onmessage = event => {
            finish();
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.result);
          };
          worker.onerror = () => { finish(); reject(new Error('图片处理失败，请重新选择或更换浏览器')); };
          worker.postMessage(file);
        });
      });
      queue = job.catch(() => {});
      return job;
    }
    function destroy() {
      stopped = true;
      if (worker) { worker.terminate(); worker = null; }
      if (rejectActive) { rejectActive(aborted()); rejectActive = null; }
    }
    return { process, destroy };
  }

  QSL.imageUpload = { dimensions, convert, createProcessor };
})(typeof window === 'undefined' ? self : window);
