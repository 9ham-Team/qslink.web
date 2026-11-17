import { createImageTools } from './lib/image-upload.js';
const { convert } = createImageTools();
self.onmessage = async event => {
  try { self.postMessage({ result: await convert(event.data) }); }
  catch (err) { self.postMessage({ error: err.message || '图片处理失败，请重新选择' }); }
};
