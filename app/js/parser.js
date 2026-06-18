/* ===== 我的小厨房 · 教程解析模块 =====
 * 方案 C（完整自动）：本地视频文件 → transformers.js Whisper 语音转写 → 抽取食材/步骤
 *                      （全程浏览器内运行，离线、不依赖后端）
 * 方案 B（兜底）：粘贴分享链接 → 预留解析接口；无代理时自动降级为「抓标题/封面」或纯手动
 *
 * 设计原则：
 *  - 不在沙箱/页面内起任何后端；链接抓取需要代理时，PARSE_PROXY 留空即自动降级。
 *  - Whisper 模型按需懒加载（首次使用才下载到浏览器缓存）。
 */
(function (global) {
  'use strict';

  // 预留：若用户自行部署了解析代理，把地址填到这里即可启用「链接全自动」。
  // 留空 => 链接走「方案 B 降级 / 手动」。
  const PARSE_PROXY = '';

  // transformers.js CDN（在线时懒加载；离线时方案 C 不可用，UI 会提示）
  const TJS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
  const WHISPER_MODEL = 'Xenova/whisper-tiny';

  let _transcriber = null;
  let _loadingPromise = null;

  // ---------- 食材/步骤抽取（轻量规则，离线可用） ----------
  const COMMON_INGREDIENTS = [
    '番茄', '西红柿', '鸡蛋', '青菜', '蒜', '大蒜', '蒜末', '葱', '姜', '五花肉', '猪肉',
    '牛肉', '鸡肉', '排骨', '西兰花', '紫菜', '豆腐', '土豆', '茄子', '辣椒', '青椒',
    '冰糖', '白糖', '醋', '料酒', '生抽', '老抽', '蚝油', '盐', '胡椒', '香油', '淀粉',
    '虾', '鱼', '花椒', '八角', '香菜', '木耳', '胡萝卜', '黄瓜', '洋葱', '香菇'
  ];

  function extractIngredients(text) {
    const found = new Set();
    COMMON_INGREDIENTS.forEach((ing) => { if (text.indexOf(ing) >= 0) found.add(ing); });
    return Array.from(found);
  }

  function extractSteps(text) {
    // 先按显式分句符切，再按动作连接词补切，过滤太短的碎句
    let parts = text
      .replace(/\s+/g, '')
      .split(/[。！!？?；;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);
    if (parts.length <= 1) {
      parts = text.split(/然后|接着|再|最后|首先|之后/).map((s) => s.trim()).filter((s) => s.length >= 4);
    }
    return parts.slice(0, 12);
  }

  // ---------- 方案 C：本地 Whisper ----------
  async function ensureTranscriber(onProgress) {
    if (_transcriber) return _transcriber;
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = (async () => {
      let tjs;
      try {
        tjs = await import(/* @vite-ignore */ TJS_URL);
      } catch (e) {
        throw new Error('OFFLINE_MODEL'); // 离线或 CDN 不可达
      }
      const { pipeline, env } = tjs;
      env.allowLocalModels = false; // 用远程模型 + 浏览器缓存
      _transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
        progress_callback: onProgress || (() => {})
      });
      return _transcriber;
    })();
    return _loadingPromise;
  }

  // 解码音频文件 → Float32 单声道 16k
  async function decodeAudio(file) {
    const buf = await file.arrayBuffer();
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(buf);
    let data = decoded.getChannelData(0);
    if (decoded.sampleRate !== 16000) {
      const ratio = decoded.sampleRate / 16000;
      const len = Math.floor(data.length / ratio);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) out[i] = data[Math.floor(i * ratio)];
      data = out;
    }
    return data;
  }

  /**
   * 方案 C 主入口：本地视频/音频文件 → 转写 → 抽取
   * @param {File} file
   * @param {(stage:string,detail:any)=>void} onStage
   * @returns {Promise<{title,state,ingredients,steps,transcript}>}
   */
  async function parseVideoFile(file, onStage) {
    onStage && onStage('loading_model', null);
    let transcriber;
    try {
      transcriber = await ensureTranscriber((p) => onStage && onStage('model_progress', p));
    } catch (e) {
      // 模型不可用（离线）→ 降级手动
      return { title: file.name.replace(/\.[^.]+$/, ''), state: 'manual', ingredients: [], steps: [], transcript: '', reason: 'model_unavailable' };
    }

    onStage && onStage('decoding', null);
    let audio;
    try {
      audio = await decodeAudio(file);
    } catch (e) {
      return { title: file.name.replace(/\.[^.]+$/, ''), state: 'manual', ingredients: [], steps: [], transcript: '', reason: 'decode_failed' };
    }

    onStage && onStage('transcribing', null);
    const result = await transcriber(audio, { chunk_length_s: 30, stride_length_s: 5, language: 'chinese', task: 'transcribe' });
    const transcript = (result && result.text || '').trim();

    const ingredients = extractIngredients(transcript);
    const steps = extractSteps(transcript);
    const state = (ingredients.length || steps.length) ? 'auto' : 'half';
    onStage && onStage('done', { state });
    return { title: file.name.replace(/\.[^.]+$/, ''), state, ingredients, steps, transcript };
  }

  // ---------- 方案 B：链接解析（预留接口 + 自动降级） ----------
  /**
   * @param {string} link 分享链接
   * @returns {Promise<{title,cover,state,ingredients,steps,link}>}
   */
  async function parseLink(link) {
    link = (link || '').trim();
    if (!link) throw new Error('EMPTY_LINK');

    // 预留：部署代理后启用「链接全自动（方案 C 远程）」
    if (PARSE_PROXY) {
      try {
        const resp = await fetch(PARSE_PROXY + '?url=' + encodeURIComponent(link));
        if (resp.ok) {
          const data = await resp.json();
          return {
            title: data.title || '未命名教程',
            cover: data.cover || '',
            state: (data.ingredients && data.ingredients.length) ? 'auto' : 'half',
            ingredients: data.ingredients || [],
            steps: data.steps || [],
            link
          };
        }
      } catch (e) { /* 落到下面的降级 */ }
    }

    // 无代理 / 抓取失败 → 方案 B 降级：仅保留链接，标题用域名，转手动补全
    let host = '链接';
    try { host = new URL(link).hostname.replace(/^www\./, ''); } catch (e) {}
    return {
      title: '来自 ' + host + ' 的教程',
      cover: '',
      state: 'manual',
      ingredients: [],
      steps: [],
      link,
      reason: 'no_proxy'
    };
  }

  global.Parser = {
    parseVideoFile,
    parseLink,
    extractIngredients,
    extractSteps,
    hasProxy: () => !!PARSE_PROXY
  };
})(window);
