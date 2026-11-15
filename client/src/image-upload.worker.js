import '../../public/js/image-upload.js';
self.onmessage = async event => {
  try { self.postMessage({ result: await self.QSL.imageUpload.convert(event.data) }); }
  catch (err) { self.postMessage({ error: err.message || '图片处理失败，请重新选择' }); }
};
