/* ===== 我的小厨房 · 拍照生成贴纸（离线抠图 + 贴纸合成） =====
   设计目标（参考用户提供的范例 App 交互）：
     1) 用户拍照/选图  2) 自动识别菜品主体并抠出  3) 裁剪 + 加白色贴纸描边/投影 → 生成贴纸
   全程浏览器内运行、离线优先：
     - 抠图：复用 @xenova/transformers 的 RMBG-1.4（首次需联网下载模型，之后缓存离线）
     - 合成：纯 Canvas（白描边 + 柔和投影 + 自动裁切到主体外接框）
   可选增强（B 层）：把抠好的主体发给自建的 AI 重绘服务，得到「更有意思的画风」贴纸；
     未配置 STICKER_API 时自动跳过，仅用 A 层离线贴纸。
*/
window.Sticker = (function () {
  'use strict';

  // 留空 = 不启用 AI 重绘，仅离线抠图贴纸（自用最稳）。
  // 若要画风化，可部署一个接收 {imageDataURL} 返回 {imageDataURL} 的服务并把地址填这里。
  const STICKER_API = '';

  const TJS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
  const RMBG_MODEL = 'briaai/RMBG-1.4';

  let _seg = null; // { model, processor }

  function hasAI() { return !!STICKER_API; }

  // 懒加载抠图模型（与 parser.js 的 Whisper 各自独立缓存）
  async function ensureSegmenter(onProgress) {
    if (_seg) return _seg;
    let tjs;
    try {
      tjs = await import(/* @vite-ignore */ TJS_URL);
    } catch (e) {
      throw new Error('OFFLINE_MODEL');
    }
    const { AutoModel, AutoProcessor, env } = tjs;
    if (env) { env.allowLocalModels = false; } // 走 CDN/HF
    const opts = {};
    if (typeof onProgress === 'function') {
      opts.progress_callback = (p) => {
        if (p && p.status === 'progress' && p.progress != null) onProgress(p.progress);
      };
    }
    const model = await AutoModel.from_pretrained(RMBG_MODEL, { quantized: true, ...opts });
    const processor = await AutoProcessor.from_pretrained(RMBG_MODEL, opts);
    _seg = { model, processor, RawImage: tjs.RawImage };
    return _seg;
  }

  // 把 File/Blob/dataURL 读成 HTMLImageElement
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      if (typeof src === 'string') img.src = src;
      else img.src = URL.createObjectURL(src);
    });
  }

  // 用 RMBG 生成 alpha 蒙版（值 0~255 的单通道，尺寸与模型输出一致）
  async function runSegment(img, onProgress) {
    const seg = await ensureSegmenter(onProgress);
    const raw = await seg.RawImage.fromURL(img.src);
    const { pixel_values } = await seg.processor(raw);
    const { output } = await seg.model({ input: pixel_values });
    // output: [1,1,H,W]，sigmoid 后的前景概率
    const mask = await seg.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(img.naturalWidth, img.naturalHeight);
    return mask; // RawImage，单通道
  }

  // 计算 alpha 的外接框（用于自动裁切到主体）
  function bbox(alpha, w, h, thr) {
    thr = thr || 24;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha[y * w + x] > thr) {
          found = true;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (!found) return { x: 0, y: 0, w, h };
    const padX = Math.round((x1 - x0) * 0.06), padY = Math.round((y1 - y0) * 0.06);
    x0 = Math.max(0, x0 - padX); y0 = Math.max(0, y0 - padY);
    x1 = Math.min(w - 1, x1 + padX); y1 = Math.min(h - 1, y1 + padY);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // 把原图 + alpha 合成「抠图 PNG」（透明背景）
  function composeCutout(img, maskData, mw, mh) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const px = id.data;
    // maskData 已 resize 到 w*h 单通道
    for (let i = 0; i < w * h; i++) px[i * 4 + 3] = maskData[i];
    ctx.putImageData(id, 0, 0);
    return { canvas: c, alpha: maskData, w, h };
  }

  // 贴纸化：裁到主体外接框 + 白色描边 + 柔和投影，输出方形贴纸 dataURL
  function makeSticker(cutout, size) {
    size = size || 640;
    const box = bbox(cutout.alpha, cutout.w, cutout.h);
    // 目标画布（方形，主体居中，留白边）
    const out = document.createElement('canvas'); out.width = size; out.height = size;
    const ctx = out.getContext('2d');
    const pad = Math.round(size * 0.12);
    const avail = size - pad * 2;
    const scale = Math.min(avail / box.w, avail / box.h);
    const dw = box.w * scale, dh = box.h * scale;
    const dx = (size - dw) / 2, dy = (size - dh) / 2;

    // 先画一层「白色描边」：把主体放大几圈、画成纯白，再叠原图，形成贴纸白边
    const stroke = Math.max(6, Math.round(size * 0.012));
    const tmp = document.createElement('canvas'); tmp.width = size; tmp.height = size;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(cutout.canvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
    // 用阴影技巧生成白色外扩描边
    const silo = document.createElement('canvas'); silo.width = size; silo.height = size;
    const sctx = silo.getContext('2d');
    sctx.drawImage(tmp, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, size, size); // 主体纯白剪影

    // 柔和投影
    ctx.save();
    ctx.shadowColor = 'rgba(30,30,40,.22)';
    ctx.shadowBlur = Math.round(size * 0.05);
    ctx.shadowOffsetY = Math.round(size * 0.02);
    // 多方向偏移画白色剪影 → 形成均匀白描边
    for (let a = 0; a < 360; a += 30) {
      const rad = a * Math.PI / 180;
      ctx.drawImage(silo, Math.cos(rad) * stroke, Math.sin(rad) * stroke);
    }
    ctx.restore();
    // 再覆盖一次纯白填底，避免描边内部出现投影脏边
    ctx.save();
    for (let a = 0; a < 360; a += 30) {
      const rad = a * Math.PI / 180;
      ctx.drawImage(silo, Math.cos(rad) * stroke, Math.sin(rad) * stroke);
    }
    ctx.restore();
    // 叠原始抠图主体
    ctx.drawImage(tmp, 0, 0);
    return out.toDataURL('image/png');
  }

  // 兜底：模型不可用时，仅做「方形居中裁切 + 贴纸边框」，仍可离线产出可用封面
  async function fallbackSticker(src, size) {
    size = size || 640;
    const img = await loadImage(src);
    const out = document.createElement('canvas'); out.width = size; out.height = size;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
    const pad = Math.round(size * 0.06), inner = size - pad * 2, r = Math.round(size * 0.12);
    ctx.save();
    roundRect(ctx, pad, pad, inner, inner, r); ctx.clip();
    ctx.drawImage(img, sx, sy, s, s, pad, pad, inner, inner);
    ctx.restore();
    return out.toDataURL('image/jpeg', 0.9);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 可选 B 层：把抠好的主体发给自建 AI 服务做画风重绘
  async function aiRepaint(dataURL) {
    if (!STICKER_API) return null;
    try {
      const r = await fetch(STICKER_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataURL: dataURL })
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j.imageDataURL || null;
    } catch (e) { return null; }
  }

  /* 主入口：从图片生成贴纸
     onStage(stage, detail)：
       'loading_model' | 'model_progress'(detail.progress) | 'segmenting'
       | 'compositing' | 'repainting' | 'done'
     返回 { dataURL, state:'auto'|'fallback', usedAI:Boolean } */
  async function fromImage(src, onStage) {
    const stage = (s, d) => { if (typeof onStage === 'function') onStage(s, d); };
    let img;
    try { img = await loadImage(src); } catch (e) { throw new Error('IMG_LOAD_FAIL'); }

    let result;
    try {
      stage('loading_model');
      const mask = await runSegment(img, (p) => stage('model_progress', { progress: p }));
      stage('segmenting');
      const cutout = composeCutout(img, mask.data, mask.width, mask.height);
      stage('compositing');
      let dataURL = makeSticker(cutout, 640);
      let usedAI = false;
      if (STICKER_API) {
        stage('repainting');
        const re = await aiRepaint(dataURL);
        if (re) { dataURL = re; usedAI = true; }
      }
      result = { dataURL, state: 'auto', usedAI };
    } catch (e) {
      // 模型不可用 / 解码失败 → 兜底方形贴纸，仍可用
      const dataURL = await fallbackSticker(typeof src === 'string' ? src : img.src, 640);
      result = { dataURL, state: 'fallback', usedAI: false };
    }
    stage('done');
    return result;
  }

  return { fromImage, hasAI, STICKER_API };
})();
