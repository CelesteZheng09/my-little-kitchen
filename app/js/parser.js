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

  // 若部署了解析代理，在 app/config.js 里填入 PARSE_PROXY 即可启用「链接全自动」。
  // 留空 => 优先从分享文案中抽取，无法抽取时再降级手动。
  const PARSE_PROXY = (global.MLK_CONFIG && global.MLK_CONFIG.PARSE_PROXY || '').replace(/\/$/, '');

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
    '虾', '鱼', '鲈鱼', '带鱼', '鸡翅', '鸡腿', '牛排', '肉末', '米饭', '面条', '花椒',
    '八角', '香菜', '木耳', '胡萝卜', '黄瓜', '洋葱', '香菇', '豆瓣酱', '辣椒面'
  ];

  function extractIngredients(text) {
    const found = new Set();
    COMMON_INGREDIENTS.forEach((ing) => { if (text.indexOf(ing) >= 0) found.add(ing); });
    return refineIngredients(Array.from(found));
  }

  function refineIngredients(list) {
    const set = new Set(list);
    if (set.has('鱼') && list.some((x) => x !== '鱼' && /鱼$/.test(x))) set.delete('鱼');
    if (set.has('猪肉') && (set.has('五花肉') || set.has('排骨'))) set.delete('猪肉');
    if (set.has('大蒜') && set.has('蒜')) set.delete('大蒜');
    return Array.from(set);
  }

  function extractSteps(text) {
    const clean = (text || '').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
    let parts = clean
      .split(/\n+|(?:^|[。！!？?；;])\s*(?=(?:\d+[\.、)]|第[一二三四五六七八九十]+步|先|然后|接着|再|最后))/)
      .map((s) => s.replace(/^\s*(?:\d+[\.、)]|第[一二三四五六七八九十]+步[:：、.]?)\s*/, '').trim())
      .filter((s) => s.length >= 4);
    if (parts.length <= 1) {
      parts = clean.split(/然后|接着|再|最后|首先|之后/).map((s) => s.trim()).filter((s) => s.length >= 4);
    }
    const action = /切|洗|焯|腌|煎|炒|炸|蒸|煮|炖|拌|倒|加入|加|撒|收汁|出锅|装盘/;
    const metaLine = /^(食材|材料|调料|配料|标题|来源)[:：]/;
    const promoLine = /超简单|教程|分享|收藏|链接|主页|笔记|小红书|抖音/;
    return parts
      .map((s) => s.replace(/[#@].*$/g, '').trim())
      .filter((s) => !metaLine.test(s))
      .filter((s) => action.test(s))
      .filter((s) => !(promoLine.test(s) && !/[，,。.；;：:]/.test(s)))
      .slice(0, 12);
  }

  function extractFirstUrl(input) {
    const m = (input || '').match(/https?:\/\/[^\s"'<>，。；、）)]+/i);
    return m ? m[0].replace(/[.,;!?，。！？；]+$/, '') : '';
  }

  function hostOf(link) {
    try { return new URL(link).hostname.replace(/^www\./, ''); } catch (e) { return '链接'; }
  }

  function cleanShareText(input, link) {
    return (input || '')
      .replace(link || '', ' ')
      .replace(/https?:\/\/[^\s"'<>，。；、）)]+/ig, ' ')
      .replace(/(复制|復制|打开|打開|看看|快来|快來|点击链接|點擊連結|小红书|小紅書|抖音|Douyin|RedNote|http)/ig, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function inferTitle(text, host) {
    const lines = (text || '')
      .split(/\n|。|！|!|？|\?/)
      .map((s) => s.replace(/[#@].*$/g, '').trim())
      .filter((s) => s.length >= 2 && s.length <= 36);
    const foodish = lines.find((s) => /菜|饭|面|肉|鱼|虾|蛋|汤|炒|蒸|煮|炖|煎|烤|拌|豆腐|西兰花|番茄|鸡|牛|排骨/.test(s));
    return foodish || lines[0] || ('来自 ' + host + ' 的教程');
  }

  function parseTextFallback(input, link) {
    const text = cleanShareText(input, link);
    const title = inferTitle(text, hostOf(link));
    const ingredients = extractIngredients(text);
    const steps = extractSteps(text).filter((s) => compactLine(s) !== compactLine(title));
    return {
      title,
      cover: '',
      state: steps.length ? 'auto' : (ingredients.length ? 'half' : 'manual'),
      ingredients,
      steps,
      link,
      text
    };
  }

  function compactLine(s) {
    return (s || '').replace(/[^\u4e00-\u9fa5a-z0-9]/ig, '').trim();
  }

  async function fetchProxy(link, shareText) {
    const payload = { url: link, text: shareText || '' };
    try {
      const resp = await fetch(PARSE_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) return resp.json();
    } catch (e) {}

    const qs = '?url=' + encodeURIComponent(link) + (shareText ? '&text=' + encodeURIComponent(shareText) : '');
    const resp = await fetch(PARSE_PROXY + qs);
    if (!resp.ok) throw new Error('PROXY_FAILED');
    return resp.json();
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
    const raw = (link || '').trim();
    if (!raw) throw new Error('EMPTY_LINK');

    const foundUrl = extractFirstUrl(raw);
    link = foundUrl || (/^https?:\/\//i.test(raw) ? raw : '');
    const shareText = cleanShareText(raw, link);

    // 部署代理后启用「链接全自动」
    if (PARSE_PROXY && link) {
      try {
        const data = await fetchProxy(link, shareText);
        const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
        const steps = Array.isArray(data.steps) ? data.steps : [];
        return {
          title: data.title || inferTitle(shareText, hostOf(link)),
          cover: data.cover || '',
          state: data.state || (steps.length ? 'auto' : (ingredients.length ? 'half' : 'manual')),
          ingredients,
          steps,
          link: data.link || link,
          reason: data.reason || 'proxy'
        };
      } catch (e) { /* 落到下面的降级 */ }
    }

    // 无代理 / 抓取失败 → 先从分享文案抽取。若只粘贴短链接，才手动补全。
    const local = parseTextFallback(raw, link);
    if (local.ingredients.length || local.steps.length) {
      return { ...local, reason: 'share_text' };
    }

    return {
      title: '来自 ' + hostOf(link) + ' 的教程',
      cover: '',
      state: 'manual',
      ingredients: [],
      steps: [],
      link,
      reason: PARSE_PROXY ? 'proxy_failed' : 'no_proxy'
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
