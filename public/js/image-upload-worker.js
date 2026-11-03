'use strict';
importScripts('/js/image-upload.js');
self.onmessage = async event => {
  try {
    const result = await self.QSL.imageUpload.convert(event.data);
    self.postMessage({ result });
  } catch (err) {
    self.postMessage({ error: err.message || '图片处理失败，请重新选择' });
  }
};
