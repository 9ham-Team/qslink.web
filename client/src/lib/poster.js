// Module-scoped implementation; no browser globals are registered.
export function createPosterRenderer(dependencies) {
  function image(src, signal) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only use same-origin uploads so the canvas remains exportable.
      const url = new URL(src, location.origin);
      if (url.origin !== location.origin) return reject(new Error(dependencies.t("无法导出站外图片")));
      if (signal.aborted) return reject(new Error(dependencies.t("已取消生成")));
      function finish(err) {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        signal.removeEventListener('abort', cancel);
        if (err) { img.src = ''; reject(err); } else resolve(img);
      }
      function cancel() { finish(new Error(dependencies.t("已取消生成"))); }
      const timer = setTimeout(() => finish(new Error(dependencies.t("卡片图片加载超时，请重试"))), 15000);
      signal.addEventListener('abort', cancel, { once: true });
      img.onload = () => finish();
      img.onerror = () => finish(new Error(dependencies.t("卡片图片加载失败，请重试")));
      img.src = url.href;
    });
  }

  async function poster(card, url, signal) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1320;
    const ctx = canvas.getContext('2d');
    const img = card.frontImage ? await image(card.frontImage, signal) : null;
    const palette = dependencies.posterPalette.fromImage(img);
    const { ink, muted, accent: green } = palette;
    const sans = '"Microsoft YaHei", "PingFang SC", sans-serif';
    const serif = 'Georgia, "Songti SC", "SimSun", serif';
    const mono = 'Consolas, monospace';
    const owner = card.owner || {};
    const callSign = card.callSign || owner.callSign || '';
    const logo = await image('/assets/logo-mark.svg', signal);
    const background = ctx.createLinearGradient(0, 0, 1080, 1320);
    background.addColorStop(0, palette.backgroundTop); background.addColorStop(1, palette.backgroundBottom);
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1320);
    function rounded(x, y, w, h, radius, fill, shadow) {
      ctx.save();
      if (shadow) { ctx.shadowColor = palette.shadow; ctx.shadowBlur = 26; ctx.shadowOffsetY = 16; }
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    }
    function rule(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function small(text, x, y, color, align) {
      ctx.fillStyle = color || muted; ctx.font = '11px ' + mono;
      ctx.textAlign = align || 'left'; ctx.fillText(text, x, y); ctx.textAlign = 'left';
    }
    function line(text, x, y, width) {
      let value = Array.from(String(text || '')).slice(0, 160).join('');
      if (ctx.measureText(value).width > width) {
        while (value && ctx.measureText(value + '…').width > width) value = Array.from(value).slice(0, -1).join('');
        value += '…';
      }
      ctx.fillText(value, x, y);
    }
    // Stationery header and postmark stay outside the card image.
    ctx.drawImage(logo, 88, 36, 36, 36);
    ctx.fillStyle = green; ctx.font = 'bold 26px ' + sans; ctx.fillText('QSLink', 134, 63);
    ctx.fillStyle = muted; ctx.font = '24px ' + serif; ctx.fillText('/', 228, 63);
    ctx.fillStyle = ink; ctx.font = '14px ' + sans; ctx.fillText(dependencies.t("QSL 卡片交换"), 251, 61);
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
    rule(88, 132, 992, 132);
    for (let row = 0; row < 4; row++) {
      ctx.beginPath();
      for (let x = 800; x <= 882; x++) {
        const y = 60 + row * 12 + Math.sin((x - 800) / 6) * 3;
        if (x === 800) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.save(); ctx.translate(948, 80); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.font = 'italic 22px ' + serif; ctx.fillText('73', 0, 1);
    ctx.font = '8px ' + mono; ctx.fillText('QSL CARD EXCHANGE', 0, 17); ctx.restore();
    // Print corner marks, with no badge or extra subtitle over the card.
    ctx.strokeStyle = palette.line;
    [[30, 30, 1, 1], [1050, 30, -1, 1], [30, 1290, 1, -1], [1050, 1290, -1, -1]].forEach(([x, y, dx, dy]) => {
      rule(x, y, x + dx * 13, y); rule(x, y, x, y + dy * 13);
    });
    ctx.save(); ctx.translate(30, 580); ctx.rotate(Math.PI / 2); small('Q S L   C A R D   E X C H A N G E', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(1045, 610); ctx.rotate(Math.PI / 2); small('P U B L I C   S H A R E  /  7 3', 0, 0); ctx.restore();
    const ratio = img ? img.naturalWidth / img.naturalHeight : Number(card.ratio && card.ratio.w) / Number(card.ratio && card.ratio.h);
    const imageRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5;
    const w = Math.min(858, 572 * imageRatio), h = w / imageRatio;
    const imageX = (1080 - w) / 2, imageY = 181 + (572 - h) / 2;
    rounded(imageX - 23, imageY - 21, w + 46, h + 44, 24, palette.surface, true);
    rounded(imageX - 12, imageY - 11, w + 24, h + 23, 17, palette.inset);
    if (img) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(imageX, imageY, w, h, 9); ctx.clip();
      ctx.drawImage(img, imageX, imageY, w, h); ctx.restore();
    } else {
      ctx.fillStyle = muted; ctx.font = '36px ' + serif; ctx.fillText(dependencies.t("QSL 卡片"), 135, 490);
    }
    ctx.strokeStyle = palette.line; rule(88, 807, 112, 807);
    small(dependencies.t("QSL CARD · FRONT · 正面"), 122, 812);
    small(dependencies.t("PUBLIC SHARE · 公开分享"), 992, 812, muted, 'right');
    ctx.fillStyle = ink; ctx.font = 'bold 50px ' + serif;
    line(card.title || dependencies.t("未命名卡片"), 88, 878, 660);
    ctx.fillStyle = muted; ctx.font = '14px ' + sans; ctx.fillText(dependencies.t("双面 3D 卡片"), 88, 916);
    small(dependencies.t("CALL SIGN · 呼号"), 992, 849, muted, 'right');
    ctx.textAlign = 'right'; ctx.fillStyle = green; ctx.font = 'bold 22px ' + mono;
    line(callSign || '—', 992, 878, 200); ctx.textAlign = 'left';
    // QR modules retain square geometry and a full four-module quiet zone.
    rounded(88, 946, 904, 296, 24, palette.surface, true);
    rounded(112, 972, 246, 246, 18, '#ffffff');
    const qr = dependencies.qr.canvas(url, 5, 245);
    ctx.drawImage(qr, 112 + Math.floor((246 - qr.width) / 2), 972 + Math.floor((246 - qr.height) / 2));
    small('S C A N  T O  V I E W', 384, 1044, green);
    ctx.fillStyle = ink; ctx.font = '28px ' + serif; ctx.fillText(dependencies.t("扫码欣赏双面 3D 卡片"), 384, 1085);
    ctx.fillStyle = muted; ctx.font = '14px ' + sans; ctx.fillText(dependencies.t("申请换卡 · 地址仅在双方同意后可见"), 384, 1118);
    ctx.fillStyle = green; ctx.font = '14px ' + mono; line(new URL(url).host, 384, 1152, 470);
    ctx.strokeStyle = palette.line; ctx.setLineDash([2, 4]); rule(886, 976, 886, 1213); ctx.setLineDash([]);
    small('O P E N', 940, 1066, muted, 'center');
    ctx.save(); ctx.shadowColor = palette.shadow; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    ctx.beginPath(); ctx.arc(940, 1105, 26, 0, Math.PI * 2); ctx.fillStyle = green; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    rule(933, 1105, 947, 1105); rule(942, 1100, 947, 1105); rule(942, 1110, 947, 1105);
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; rule(88, 1275, 992, 1275);
    ctx.fillStyle = muted; ctx.font = '10px ' + mono;
    line('73 DE ' + (callSign || 'QSLink') + ' · QSL CARD EXCHANGE', 88, 1297, 700);
    small('QSLink', 948, 1297, muted, 'right'); ctx.drawImage(logo, 964, 1283, 28, 28);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(dependencies.t("图片生成失败"))), 'image/png'));
  }

  async function contestPoster(card, work, url, signal) {
    const img = card.frontImage ? await image(card.frontImage, signal) : null;
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    const sans = '"Microsoft YaHei", "PingFang SC", sans-serif';
    const serif = '"Songti SC", "STSong", "SimSun", Georgia, serif';
    const palette = dependencies.posterPalette.fromImage(img);
    const background = ctx.createLinearGradient(0, 0, 900, 1440);
    background.addColorStop(0, palette.backgroundTop);
    background.addColorStop(1, palette.backgroundBottom);
    ctx.fillStyle = background; ctx.fillRect(0, 0, 900, 1440);
    function line(value, x, y, size, width, color, align, family, weight) {
      const text = String(value || '');
      let label = Array.from(text).slice(0, 160).join('');
      const font = family || sans;
      ctx.font = (weight || 'normal') + ' ' + size + 'px ' + font;
      while (size > 28 && ctx.measureText(label).width > width) {
        size--; ctx.font = (weight || 'normal') + ' ' + size + 'px ' + font;
      }
      if (label !== text || ctx.measureText(label).width > width) {
        while (label && ctx.measureText(label + '…').width > width) label = Array.from(label).slice(0, -1).join('');
        label += '…';
      }
      ctx.fillStyle = color || palette.ink; ctx.textAlign = align || 'left';
      ctx.fillText(label, x, y);
    }
    const brand = ctx.createLinearGradient(60, 0, 235, 0);
    brand.addColorStop(0, '#0eaf8f'); brand.addColorStop(.5, '#21c7b0'); brand.addColorStop(1, '#38bdf8');
    line('QSLink', 60, 91, 42, 260, brand, 'left', sans, 'bold');
    line(dependencies.t('作品编号：{n}', { n: String(work.number).padStart(3, '0') }), 840, 87, 20, 440, palette.muted, 'right');
    line(dependencies.t('第一届QSLink杯QSL卡片设计大赛'), 60, 179, 44, 780, palette.ink, 'left', serif, 'bold');
    ctx.fillStyle = palette.line; ctx.fillRect(60, 219, 780, 1);
    ctx.fillStyle = palette.accent; ctx.fillRect(60, 217, 64, 4);
    if (img) {
      const scale = Math.min(780 / img.naturalWidth, 640 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const x = (900 - w) / 2, y = 275 + (640 - h) / 2;
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(24, w / 2, h / 2)); ctx.clip();
      ctx.drawImage(img, x, y, w, h); ctx.restore();
    }
    line(card.title || dependencies.t('未命名卡片'), 60, 1009, 42, 780, palette.ink, 'left', serif, 'bold');
    const owner = card.owner || {};
    line([owner.displayName || owner.username, card.callSign || owner.callSign].filter(Boolean).join(' · '), 60, 1057, 22, 780, palette.muted);
    ctx.fillStyle = palette.line; ctx.fillRect(60, 1100, 780, 1);
    line(dependencies.t('扫码投我一票！'), 60, 1210, 34, 460, palette.accent, 'left', serif, 'bold');
    line(new URL(url).host, 60, 1260, 20, 460, palette.muted);
    const qr = dependencies.qr.canvas(url, 6, 240);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(572, 1130, 268, 268, 20); ctx.fill();
    ctx.drawImage(qr, 572 + Math.floor((268 - qr.width) / 2), 1130 + Math.floor((268 - qr.height) / 2));
    if (signal.aborted) throw new Error(dependencies.t('已取消生成'));
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(dependencies.t('图片生成失败'))), 'image/png'));
  }


return {poster,contestPoster};
}
