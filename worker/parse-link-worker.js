/* Cloudflare Worker for my-little-kitchen link parsing.
 * Deploy this file, then set app/config.js PARSE_PROXY to the worker URL.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const COMMON_INGREDIENTS = [
  '番茄', '西红柿', '鸡蛋', '青菜', '蒜', '大蒜', '蒜末', '葱', '姜', '五花肉', '猪肉',
  '牛肉', '鸡肉', '排骨', '西兰花', '紫菜', '豆腐', '土豆', '茄子', '辣椒', '青椒',
  '冰糖', '白糖', '醋', '料酒', '生抽', '老抽', '蚝油', '盐', '胡椒', '香油', '淀粉',
  '虾', '鱼', '鲈鱼', '带鱼', '鸡翅', '鸡腿', '牛排', '肉末', '米饭', '面条', '花椒',
  '八角', '香菜', '木耳', '胡萝卜', '黄瓜', '洋葱', '香菇', '豆瓣酱', '辣椒面'
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const input = await readInput(request);
      const result = await parseLink(input.url, input.text || '');
      return json(result);
    } catch (err) {
      return json({
        title: '未能解析链接',
        cover: '',
        ingredients: [],
        steps: [],
        state: 'manual',
        reason: err && err.message || 'parse_failed'
      }, 400);
    }
  }
};

async function readInput(request) {
  const u = new URL(request.url);
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return { url: String(body.url || '').trim(), text: String(body.text || '').trim() };
  }
  return { url: String(u.searchParams.get('url') || '').trim(), text: String(u.searchParams.get('text') || '').trim() };
}

async function parseLink(url, shareText) {
  const target = normalizeTarget(url);
  const resp = await fetch(target, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6'
    }
  });
  if (!resp.ok) throw new Error('fetch_failed_' + resp.status);

  const finalUrl = resp.url || target;
  const html = await resp.text();
  const recipe = extractJsonLdRecipe(html);
  const meta = extractMeta(html);
  const body = htmlToText(html);

  const title = recipe.title || meta.title || inferTitle(shareText || meta.description || body, hostOf(finalUrl));
  const cover = absolutize(recipe.cover || meta.cover || '', finalUrl);
  const sourceText = [shareText, title, meta.description, recipe.text, body].filter(Boolean).join('\n');
  const ingredients = refineIngredients(uniq([...(recipe.ingredients || []), ...extractIngredients(sourceText)]));
  const steps = (recipe.steps && recipe.steps.length ? recipe.steps : extractSteps(sourceText))
    .filter((s) => compactLine(s) !== compactLine(title));

  return {
    title,
    cover,
    ingredients,
    steps,
    state: steps.length ? 'auto' : (ingredients.length ? 'half' : 'manual'),
    link: url,
    finalUrl,
    reason: 'proxy'
  };
}

function normalizeTarget(raw) {
  if (!raw) throw new Error('empty_url');
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('unsupported_protocol');
  if (isBlockedHost(url.hostname)) throw new Error('blocked_host');
  return url.toString();
}

function isBlockedHost(host) {
  const h = host.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function extractMeta(html) {
  const meta = {};
  const pick = (names) => {
    for (const name of names) {
      const re = new RegExp('<meta[^>]+(?:property|name)=["\\\']' + escapeReg(name) + '["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\'][^>]*>', 'i');
      const alt = new RegExp('<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:property|name)=["\\\']' + escapeReg(name) + '["\\\'][^>]*>', 'i');
      const m = html.match(re) || html.match(alt);
      if (m && m[1]) return decodeHtml(m[1]).trim();
    }
    return '';
  };
  meta.title = pick(['og:title', 'twitter:title']) || decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  meta.description = pick(['og:description', 'description', 'twitter:description']);
  meta.cover = pick(['og:image', 'twitter:image']);
  return meta;
}

function extractJsonLdRecipe(html) {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig)).map((m) => decodeHtml(m[1]));
  for (const script of scripts) {
    try {
      const root = JSON.parse(script);
      const recipe = findRecipe(root);
      if (recipe) return recipeToData(recipe);
    } catch (e) {}
  }
  return { title: '', cover: '', ingredients: [], steps: [], text: '' };
}

function findRecipe(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found = findRecipe(item); if (found) return found; }
    return null;
  }
  if (typeof node !== 'object') return null;
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
  if (/Recipe/i.test(type)) return node;
  if (node['@graph']) return findRecipe(node['@graph']);
  for (const key of ['mainEntity', 'mainEntityOfPage', 'about']) {
    const found = findRecipe(node[key]);
    if (found) return found;
  }
  return null;
}

function recipeToData(recipe) {
  const image = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image;
  const steps = normalizeInstructions(recipe.recipeInstructions);
  const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.map(String) : [];
  return {
    title: String(recipe.name || '').trim(),
    cover: typeof image === 'string' ? image : (image && image.url || ''),
    ingredients,
    steps,
    text: [recipe.description, ingredients.join('\n'), steps.join('\n')].filter(Boolean).join('\n')
  };
}

function normalizeInstructions(input) {
  if (!input) return [];
  if (typeof input === 'string') return extractSteps(input);
  if (!Array.isArray(input)) input = [input];
  const out = [];
  for (const item of input) {
    if (!item) continue;
    if (typeof item === 'string') out.push(item);
    else if (Array.isArray(item.itemListElement)) out.push(...normalizeInstructions(item.itemListElement));
    else if (item.text) out.push(String(item.text));
    else if (item.name) out.push(String(item.name));
  }
  return out.map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

function htmlToText(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/ig, ' ')
    .replace(/<style[\s\S]*?<\/style>/ig, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function extractIngredients(text) {
  const found = new Set();
  COMMON_INGREDIENTS.forEach((ing) => { if ((text || '').includes(ing)) found.add(ing); });
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
    .map((s) => s.trim())
    .filter((s) => !metaLine.test(s))
    .filter((s) => action.test(s))
    .filter((s) => !(promoLine.test(s) && !/[，,。.；;：:]/.test(s)))
    .slice(0, 12);
}

function inferTitle(text, host) {
  const lines = (text || '')
    .split(/\n|。|！|!|？|\?/)
    .map((s) => s.replace(/[#@].*$/g, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 36);
  const foodish = lines.find((s) => /菜|饭|面|肉|鱼|虾|蛋|汤|炒|蒸|煮|炖|煎|烤|拌|豆腐|西兰花|番茄|鸡|牛|排骨/.test(s));
  return foodish || lines[0] || ('来自 ' + host + ' 的教程');
}

function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch (e) { return '链接'; }
}

function absolutize(url, base) {
  if (!url) return '';
  try { return new URL(url, base).toString(); } catch (e) { return url; }
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/ig, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)));
}

function compactLine(s) {
  return (s || '').replace(/[^\u4e00-\u9fa5a-z0-9]/ig, '').trim();
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
