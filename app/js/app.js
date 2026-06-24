/* ===== 我的小厨房 · 主逻辑（路由 + 7 个页面渲染 + 交互） ===== */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------- 全局状态 ----------
  const state = {
    activeCat: null,          // null = 首页默认（全部 + 随机）
    homeOrder: null,          // 随机顺序缓存（仅默认态用）
    fridgeSel: new Set(),     // 已选食材名
    editingId: null,          // 正在编辑的菜品 id
    editIngs: [],             // 编辑中食材
    editSteps: [],            // 编辑中步骤
    editCover: ''             // 编辑中封面 dataURL
  };

  const TABS = [
    { view: 'home', ic: '🍳', label: '厨房' },
    { view: 'wish', ic: '📌', label: '想做的' },
    { view: 'fridge', ic: '🧊', label: '冰箱' }
  ];

  const CAT_ICON = {
    '主食': 'icons/cat-staple.jpg', '肉': 'icons/cat-meat.jpg', '青菜': 'icons/cat-veg.jpg',
    '海鲜': 'icons/cat-seafood.jpg', '汤': 'icons/cat-soup.jpg', '凉菜沙拉': 'icons/cat-cold.jpg',
    '饮料': 'icons/cat-drink.jpg'
  };
  const CAT_LABEL = { '凉菜沙拉': '凉菜' };
  const ING_EMOJI = {
    '番茄': '🍅', '西红柿': '🍅', '鸡蛋': '🥚', '青菜': '🥬', '西兰花': '🥦',
    '蒜': '🧄', '大蒜': '🧄', '葱': '🧅', '姜': '🫚', '五花肉': '🥩',
    '猪肉': '🥩', '排骨': '🍖', '紫菜': '🌿', '冰糖': '🟤', '醋': '🍶',
    '料酒': '🍶', '生抽': '🍶', '老抽': '🍶', '豆腐': '◻️', '虾': '🦐',
    '鱼': '🐟', '盐': '🧂'
  };
  const ING_ICON = {
    '番茄': 'icons/ing-tomato.jpg', '西红柿': 'icons/ing-tomato.jpg',
    '鸡蛋': 'icons/ing-egg.jpg',
    '青菜': 'icons/ing-veg.jpg', '西兰花': 'icons/ing-veg.jpg', '紫菜': 'icons/ing-veg.jpg',
    '蒜': 'icons/ing-garlic.jpg', '大蒜': 'icons/ing-garlic.jpg',
    '葱': 'icons/ing-scallion.jpg',
    '五花肉': 'icons/ing-pork.jpg', '猪肉': 'icons/ing-pork.jpg', '排骨': 'icons/ing-pork.jpg'
  };

  // ---------- 工具 ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 1800);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function esc(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function catLabel(c) { return CAT_LABEL[c] || c || ''; }
  function ingredientIconFor(name) { return ING_ICON[name] || ''; }
  function fileToDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  function coverImg(src, cls) {
    if (src) return '<img class="' + (cls || '') + '" src="' + esc(src) + '" loading="lazy" decoding="async">';
    return '<div class="' + (cls || '') + '" style="display:flex;align-items:center;justify-content:center;background:var(--chip);font-size:26px">🍽️</div>';
  }

  // ---------- 路由 ----------
  function go(view, param) {
    location.hash = '#/' + view + (param ? '/' + param : '');
  }
  function back() { history.length > 1 ? history.back() : go('home'); }

  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const view = parts[0] || 'home';
    const param = parts[1] || null;
    $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
    renderTabbars(view);
    const fn = RENDER[view];
    if (fn) fn(param);
    const sb = $('.view[data-view="' + view + '"] .scrollbody'); if (sb) sb.scrollTop = 0;
  }

  function renderTabbars(active) {
    $$('[data-tabbar]').forEach((bar) => {
      bar.innerHTML = TABS.map((t) =>
        '<button class="tab' + (t.view === active ? ' on' : '') + '" data-nav="' + t.view + '">' +
        '<span class="ic">' + t.ic + '</span>' + t.label + '</button>').join('');
    });
  }

  // ---------- ① 首页 ----------
  async function renderHome() {
    const dishes = await DB.all('dishes');
    const made = dishes.filter((d) => d.madeIt !== false);
    $('#homeCount').textContent = '已经会做 ' + made.length + ' 道';

    // 分类条
    const cats = DB.CATEGORIES;
    $('#caticons').innerHTML = cats.map((c) =>
      '<button class="ci' + (state.activeCat === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' +
      '<span class="blob"><img src="' + (CAT_ICON[c] || '') + '" decoding="async"></span>' +
      '<span class="lbl">' + esc(catLabel(c)) + '</span></button>').join('');

    // 列表：默认态（无选中）= 全部 + 随机；选中分类 = 过滤
    let list;
    if (state.activeCat) {
      list = made.filter((d) => d.category === state.activeCat);
    } else {
      if (!state.homeOrder || state.homeOrder.length !== made.length) {
        state.homeOrder = shuffle(made.map((d) => d.id));
      }
      const map = {}; made.forEach((d) => (map[d.id] = d));
      list = state.homeOrder.map((id) => map[id]).filter(Boolean);
    }

    const grid = $('#dishgrid');
    if (!list.length) {
      grid.innerHTML = ''; $('#homeEmpty').style.display = 'block';
    } else {
      $('#homeEmpty').style.display = 'none';
      grid.innerHTML = list.map((d) =>
        '<div class="dishcard" data-nav="dish" data-id="' + d.id + '">' +
        coverImg(d.cover) +
        '<div class="body"><div class="dn">' + esc(d.name) + '</div>' +
        '<div class="mt">' + esc(catLabel(d.category || '')) + (d.tags && d.tags.length ? ' · ' + esc(d.tags[0]) : '') + '</div></div></div>').join('');
    }
  }

  // ---------- ② 详情 ----------
  async function renderDish(id) {
    const d = await DB.get('dishes', id);
    state.editingId = id;
    if (!d) { $('#dishBody').innerHTML = '<div class="empty">菜品不存在</div>'; return; }
    let tut = null;
    if (d.tutorialId) tut = await DB.get('tutorials', d.tutorialId);
    $('#dishBody').innerHTML =
      '<div class="dhero">' + coverImg(d.cover) + '</div>' +
      '<div class="dtitle"><div class="big">' + esc(d.name) + '</div>' +
      '<div class="meta">' + esc(catLabel(d.category || '')) +
      (d.tags && d.tags.length ? '<span class="dot">·</span>' + esc(d.tags[0]) : '') +
      (d.madeIt !== false ? '<span class="dot">·</span>会做啦 ✓' : '') + '</div></div>' +
      sec('🥢 用了这些食材', '<div class="ingchips">' +
        (d.ingredients || []).map((i) => '<span class="ic2">' + esc(i) + '</span>').join('') + '</div>') +
      sec('👩‍🍳 我的做法', '<div class="steps">' +
        (d.steps || []).map((s, i) => '<div class="stp"><div class="n">' + (i + 1) + '</div><div class="tx">' + esc(s) + '</div></div>').join('') + '</div>') +
      (tut ? sec('🔗 关联的教程', '<div class="linkcard" data-tutorial-id="' + esc(tut.id) + '"><div class="thumb">▶️</div>' +
        '<div class="info"><div class="tt">' + esc(tut.title) + '</div><div class="src">来自 · ' + esc(tut.source || '收藏') + '</div></div><div class="arr">›</div></div>') : '') +
      (d.note ? '<div class="sec"><div class="dnote">💛 备注：' + esc(d.note) + '</div></div>' : '') +
      '<div style="height:20px"></div>';
  }
  function sec(h, body) { return '<div class="sec"><div class="h">' + h + '</div>' + body + '</div>'; }

  // ---------- ③ 记菜品 / 编辑 ----------
  async function renderEdit(id) {
    const editing = id && id !== 'new';
    state.editingId = editing ? id : null;
    let d = editing ? await DB.get('dishes', id) : null;
    if (!d) d = { name: '', category: '肉', ingredients: [], steps: [''], note: '', cover: '', tags: [] };
    state.editIngs = (d.ingredients || []).slice();
    state.editSteps = (d.steps && d.steps.length ? d.steps.slice() : ['']);
    state.editCover = d.cover || '';

    $('#editTitle').textContent = editing ? '编辑菜品' : '记一道会做的菜';
    $('#editName').value = d.name || '';
    $('#editNote').value = d.note || '';
    $('#editDel').style.display = editing ? '' : 'none';

    // 封面
    const up = $('#editUpload');
    up.querySelectorAll('img').forEach((n) => n.remove());
    if (state.editCover) { const im = document.createElement('img'); im.src = state.editCover; up.appendChild(im); }

    // 分类
    $('#editCat').innerHTML = DB.CATEGORIES.map((c) =>
      '<span class="cp' + (c === d.category ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</span>').join('');
    $('#editCat').dataset.val = d.category;

    renderEditIngs();
    renderEditSteps();
  }
  function renderEditIngs() {
    $('#editIng').innerHTML = state.editIngs.map((t, i) =>
      '<span class="tg">' + esc(t) + ' <span class="x" data-rming="' + i + '">×</span></span>').join('') +
      '<span class="addtg" data-act="addIng2">＋ 加食材</span>';
  }
  function renderEditSteps() {
    $('#editSteps').innerHTML = state.editSteps.map((s, i) =>
      '<div class="se"><div class="n">' + (i + 1) + '</div>' +
      '<input class="inp" data-step="' + i + '" value="' + esc(s) + '" placeholder="第 ' + (i + 1) + ' 步…">' +
      (state.editSteps.length > 1 ? '<button class="rmstep" data-rmstep="' + i + '" title="删除这一步">×</button>' : '') +
      '</div>').join('');
  }
  function syncEditSteps() {
    const inputs = $$('#editSteps [data-step]');
    if (!inputs.length) return;
    state.editSteps = inputs.map((i) => i.value);
  }

  // ---------- ④ 想做的 ----------
  async function renderWish() {
    const list = (await DB.all('wishlist')).sort((a, b) => b.createdAt - a.createdAt);
    $('#wishSub').textContent = '收藏起来慢慢解锁～ 还有 ' + list.length + ' 道待尝试';
    $('#wishlist').innerHTML = list.map((w) =>
      '<div class="wcard" data-wish="' + w.id + '">' + coverImg(w.cover) +
      '<div class="info"><div class="dn">' + esc(w.name) + '</div><div class="meta">' + esc(w.source || '') + '</div></div>' +
      '<button class="star" data-wishdone="' + w.id + '" title="已做过，移入厨房">★</button></div>').join('') +
      '<button class="wcard ghost" data-nav="tutorial">＋ 再添加一道想做的菜</button>';
  }

  // ---------- ⑤ 冰箱 ----------
  async function renderFridge() {
    const ings = await DB.all('ingredients');
    const layout = layoutFloat(ings);
    $('#fridgeCanvas').innerHTML = '<div class="fridgeWorld" style="width:' + layout.width + 'px;height:' + layout.height + 'px">' + ings.map((ing, i) => {
      const p = layout.points[i];
      const sel = state.fridgeSel.has(ing.name) ? ' sel' : '';
      const iconSrc = ing.icon || ingredientIconFor(ing.name);
      const icon = iconSrc ? '<img src="' + esc(iconSrc) + '" loading="lazy" decoding="async">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px">' + esc(ING_EMOJI[ing.name] || '🥢') + '</div>';
      return '<span class="fe' + sel + '" data-ing="' + esc(ing.name) + '" style="top:' + p.top + 'px;left:' + p.left + 'px">' +
        icon + '<span class="nm">' + esc(ing.name) + '</span></span>';
    }).join('') + '</div>';
    updateFridgeCounts();
    $('#resultArea').innerHTML = '';
  }
  const FRIDGE_ANCHORS = [
    { x: 24, y: 16 }, { x: 150, y: 8 }, { x: 280, y: 32 }, { x: 392, y: 18 },
    { x: 70, y: 132 }, { x: 198, y: 116 }, { x: 326, y: 148 }, { x: 424, y: 128 },
    { x: 18, y: 252 }, { x: 154, y: 232 }, { x: 278, y: 270 }, { x: 406, y: 246 }
  ];
  const FRIDGE_SPACING = { width: 500, batch: 360, minHeight: 340 };

  function layoutFloat(ings) {
    const list = Array.isArray(ings) ? ings : [];
    const points = list.map((ing, i) => {
      const batch = Math.floor(i / FRIDGE_ANCHORS.length);
      const anchor = FRIDGE_ANCHORS[i % FRIDGE_ANCHORS.length];
      if (!batch) return { left: anchor.x, top: anchor.y };
      const seed = hashString((ing && ing.name || '') + ':' + i);
      const driftX = (seed % 19) - 9;
      const driftY = ((seed >> 8) % 17) - 8;
      return { left: anchor.x + driftX, top: anchor.y + batch * FRIDGE_SPACING.batch + driftY };
    });
    const bottom = points.reduce((max, p) => Math.max(max, p.top), 0) + 108;
    return { width: FRIDGE_SPACING.width, height: Math.max(FRIDGE_SPACING.minHeight, bottom), points };
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function updateFridgeCounts() {
    const n = state.fridgeSel.size;
    $('#goCount').textContent = '已选 ' + n + ' 样 →';
    const hint = $('#fridgeHint');
    if (hint) hint.textContent = '';
  }
  async function findDish() {
    if (!state.fridgeSel.size) { toast('先选几样食材吧～'); return; }
    const dishes = await DB.all('dishes');
    const { best, list } = Match.match(Array.from(state.fridgeSel), dishes);
    const area = $('#resultArea');
    if (!best) { area.innerHTML = '<div class="empty">这些食材暂时配不出已会做的菜<br>换几样试试？</div>'; return; }
    const bd = best.dish;
    area.innerHTML =
      '<div class="divider"><span class="ln"></span><span class="tx">用这 ' + state.fridgeSel.size + ' 样 · 能做这些 👇</span><span class="ln"></span></div>' +
      '<div class="result"><div class="topdish" data-nav="dish" data-id="' + bd.id + '">' +
      coverImg(bd.cover, 'ph') +
      '<div class="body"><div class="k">' + (best.pct >= 100 ? '现在最能做 🍳' : '最接近的一道 ✨') + '</div>' +
      '<div class="dn">' + esc(bd.name) + '</div>' +
      '<div class="mt"><span class="pct">' + best.pct + '%</span><span class="lab">' + Match.missingLabel(best) + '</span></div>' +
      '<div class="progress"><i style="width:' + best.pct + '%"></i></div></div></div>' +
      '<div class="morelist">' + list.map((m) =>
        '<div class="mrow' + (m.pct < 60 ? ' low' : '') + '" data-nav="dish" data-id="' + m.dish.id + '">' +
        coverImg(m.dish.cover) +
        '<div class="info"><div class="dn">' + esc(m.dish.name) + '</div><div class="progress"><i style="width:' + m.pct + '%"></i></div></div>' +
        '<div class="right"><div class="pct">' + m.pct + '%</div><div class="lab">' + Match.missingLabel(m) + '</div></div></div>').join('') +
      '</div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- ⑥ 教程 ----------
  async function renderTutorial() {
    const list = (await DB.all('tutorials')).sort((a, b) => b.createdAt - a.createdAt);
    const PILL = { auto: '<span class="statepill ok">已解析</span>', half: '<span class="statepill half">半自动</span>', manual: '<span class="statepill manual">手动</span>' };
    $('#tutlist').innerHTML = list.length ? list.map((t) =>
      '<div class="tcard" data-tut="' + t.id + '"><div class="tt">' + esc(t.title) + '</div>' +
      '<div class="row"><span class="src">' + esc(t.source || (t.link ? '链接收藏' : '本地视频')) + '</span>' + (PILL[t.state] || '') + '</div></div>').join('')
      : '<div class="empty"><div class="ico">📚</div>还没有教程<br>粘贴链接或上传视频试试</div>';
  }

  // ---------- ⑧⑨ 点菜 ----------
  const orderState = { id: null, dishIds: new Set(), extra: [] }; // extra: 临时手动加的菜名

  function fmtDate(ts) {
    const d = new Date(ts);
    const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + wk;
  }

  async function renderOrder() {
    const list = (await DB.all('orders')).sort((a, b) => (a.eatAt || a.createdAt) - (b.eatAt || b.createdAt));
    const el = $('#orderlist');
    if (!list.length) {
      el.innerHTML = '<div class="empty">还没有点菜单<br>点右下角 ＋ 挑几道这周想吃的菜吧</div>';
      return;
    }
    el.innerHTML = list.map((o) => {
      const items = (o.items || []);
      const rows = items.map((it) =>
        '<div class="rcprow"><span>' + esc(it.name) + '</span><span class="qty">×1</span></div>').join('');
      return '<div class="receipt" data-order="' + o.id + '">' +
        '<div class="rcphead"><div class="shop">小厨房点菜单</div>' +
        '<div class="date">' + fmtDate(o.eatAt || o.createdAt) + '</div>' +
        (o.title ? '<div class="note">' + esc(o.title) + '</div>' : '') + '</div>' +
        rows +
        '<div class="rcpfoot"><span class="total">共 ' + items.length + ' 道菜</span>' +
        '<button class="edit" data-orderedit="' + o.id + '">加菜 / 改单</button></div></div>';
    }).join('');
  }

  async function renderOrderNew(id) {
    const editing = id && id !== 'new';
    const dishes = (await DB.all('dishes')).filter((d) => d.madeIt !== false);
    orderState.id = editing ? id : null;
    orderState.dishIds = new Set();
    orderState.extra = [];
    let o = null;
    if (editing) o = await DB.get('orders', id);

    $('#orderEditTitle').textContent = editing ? '改这一单' : '点一单';
    $('#orderDel').style.display = editing ? '' : 'none';

    if (o) {
      (o.items || []).forEach((it) => {
        if (it.dishId && dishes.some((d) => d.id === it.dishId)) orderState.dishIds.add(it.dishId);
        else orderState.extra.push(it.name);
      });
      $('#orderTitle').value = o.title || '';
      $('#orderDate').value = toDateInput(o.eatAt || o.createdAt);
    } else {
      $('#orderTitle').value = '';
      $('#orderDate').value = toDateInput(nextWeekend());
    }

    $('#orderPick').innerHTML = dishes.length ? dishes.map((d) =>
      '<div class="opk' + (orderState.dishIds.has(d.id) ? ' on' : '') + '" data-orderpick="' + d.id + '">' +
      (d.cover ? '<img src="' + esc(d.cover) + '">' : '<div style="height:74px;background:var(--chip);display:flex;align-items:center;justify-content:center;font-size:24px">🍽️</div>') +
      '<div class="nm">' + esc(d.name) + '</div></div>').join('')
      : '<div class="muted2">还没有会做的菜，先去厨房记一道，或在下面手动加菜</div>';

    renderOrderChosen(dishes);
  }

  function toDateInput(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function nextWeekend() {
    const d = new Date(); const dow = d.getDay();
    const add = ((6 - dow) + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
    return d.getTime();
  }

  async function renderOrderChosen(dishesArg) {
    const dishes = dishesArg || (await DB.all('dishes'));
    const map = {}; dishes.forEach((d) => (map[d.id] = d));
    const chips = [];
    orderState.dishIds.forEach((did) => {
      const d = map[did]; if (d) chips.push('<span class="tg">' + esc(d.name) + ' <span class="x" data-orderunpick="' + did + '">×</span></span>');
    });
    orderState.extra.forEach((nm, i) =>
      chips.push('<span class="tg">' + esc(nm) + ' <span class="x" data-orderunextra="' + i + '">×</span></span>'));
    const el = $('#orderChosen');
    el.innerHTML = chips.length ? chips.join('') : '<div class="empty2">还没选菜～ 上面勾几道，或手动加一道</div>';
    $('#pickCount').textContent = '已选 ' + (orderState.dishIds.size + orderState.extra.length);
  }

  async function saveOrder() {
    const dishes = await DB.all('dishes');
    const map = {}; dishes.forEach((d) => (map[d.id] = d));
    const items = [];
    orderState.dishIds.forEach((did) => { const d = map[did]; if (d) items.push({ dishId: did, name: d.name, cover: d.cover || '' }); });
    orderState.extra.forEach((nm) => items.push({ dishId: '', name: nm, cover: '' }));
    if (!items.length) { toast('先挑几道菜吧～'); return; }
    const dv = $('#orderDate').value;
    const eatAt = dv ? new Date(dv + 'T12:00:00').getTime() : Date.now();
    const obj = {
      id: orderState.id || DB.uid(),
      title: $('#orderTitle').value.trim(),
      eatAt, items,
      createdAt: orderState.id ? ((await DB.get('orders', orderState.id)) || {}).createdAt || Date.now() : Date.now()
    };
    await DB.put('orders', obj);
    toast(orderState.id ? '已更新点菜单' : '点菜单已生成 🧾');
    go('order');
  }
  async function delOrder() {
    if (!orderState.id) return;
    await DB.del('orders', orderState.id);
    toast('已删除'); go('order');
  }
  function addOrderExtra() {
    const inp = $('#orderAddName'); const nm = inp.value.trim();
    if (!nm) { toast('写个菜名吧'); return; }
    orderState.extra.push(nm); inp.value = ''; renderOrderChosen();
  }

  // ---------- 教程解析交互 ----------
  function parseStatusHTML(text, spin) {
    return '<div class="parsing"><div class="pr1">' + (spin ? '<span class="sp"></span>' : '✅ ') + esc(text) + '</div>' +
      (spin ? '<div class="pr2">本地处理中，请稍候…首次会下载语音模型</div>' : '') + '</div>';
  }
  async function handleVideoFile(file) {
    $('#parseStatus').innerHTML = parseStatusHTML('准备解析视频…', true);
    const stageText = { loading_model: '加载语音模型…', decoding: '解码音频…', transcribing: '语音转文字中…', done: '解析完成' };
    let res;
    try {
      res = await Parser.parseVideoFile(file, (stage, detail) => {
        if (stage === 'model_progress' && detail && detail.progress != null) {
          $('#parseStatus').innerHTML = parseStatusHTML('下载模型 ' + Math.round(detail.progress) + '%', true);
        } else if (stageText[stage]) {
          $('#parseStatus').innerHTML = parseStatusHTML(stageText[stage], stage !== 'done');
        }
      });
    } catch (e) {
      $('#parseStatus').innerHTML = parseStatusHTML('解析失败，请手动填写', false);
      res = { title: file.name, state: 'manual', ingredients: [], steps: [] };
    }
    res.kind = 'video';
    $('#parseStatus').innerHTML = parseStatusHTML(
      res.state === 'auto' ? '自动解析成功，已提取食材与步骤' :
      res.state === 'half' ? '语音已转写，请补全食材/步骤' : '已保存，请手动补全内容', false);
    openTutorialEditor(res);
  }
  async function handleLink(link) {
    $('#parseStatus').innerHTML = parseStatusHTML('解析链接…', true);
    let res;
    try { res = await Parser.parseLink(link); }
    catch (e) { toast('请输入有效链接'); $('#parseStatus').innerHTML = ''; return; }
    res.kind = 'link';
    $('#parseStatus').innerHTML = parseStatusHTML(
      res.reason === 'share_text' ? '已从分享文案自动抽取内容' :
      res.reason === 'no_proxy' ? '当前未连接解析服务，已转手动补全' :
      res.reason === 'proxy_failed' ? '解析服务暂时不可用，已转手动补全' : '链接解析完成', false);
    openTutorialEditor(res);
  }
  function openTutorialEditor(res) {
    openSheet('<h3>保存教程</h3>' +
      '<input class="inp" id="tutT" placeholder="教程标题" value="' + esc(res.title || '') + '">' +
      '<input class="inp" id="tutIng" placeholder="食材（逗号分隔）" value="' + esc((res.ingredients || []).join('，')) + '">' +
      '<textarea class="inp" id="tutSteps" placeholder="步骤（每行一步）" style="min-height:90px">' + esc((res.steps || []).join('\n')) + '</textarea>' +
      '<button class="confirm" id="tutSave">保存到教程收藏</button>');
    $('#tutSave').onclick = async () => {
      const t = {
        id: DB.uid(), title: $('#tutT').value.trim() || '未命名教程',
        source: res.kind === 'video' ? '本地视频' : (res.link ? '链接收藏' : '文本解析'), state: res.state || 'manual',
        cover: res.cover || '', link: res.link || '',
        ingredients: $('#tutIng').value.split(/[，,]/).map((s) => s.trim()).filter(Boolean),
        steps: $('#tutSteps').value.split('\n').map((s) => s.trim()).filter(Boolean),
        createdAt: Date.now()
      };
      await DB.put('tutorials', t);
      closeSheet(); $('#parseStatus').innerHTML = ''; toast('已保存教程'); renderTutorial();
    };
  }

  // ---------- 底部弹窗 ----------
  function openSheet(html) { $('#sheetBody').innerHTML = html; $('#modal').classList.add('show'); }
  function closeSheet() { $('#modal').classList.remove('show'); }

  async function openAddIngSheet() {
    const ings = await DB.all('ingredients');
    openSheet('<h3>添加食材到冰箱</h3>' +
      '<input class="inp" id="newIng" placeholder="输入食材名，回车添加">' +
      '<div class="picklist" id="pickList">' + ings.map((i) =>
        '<span class="pk' + (state.fridgeSel.has(i.name) ? ' on' : '') + '" data-pick="' + esc(i.name) + '">' + esc(i.name) + '</span>').join('') + '</div>' +
      '<button class="confirm" id="ingDone">完成</button>');
    const savePendingIngredient = async () => {
      const name = $('#newIng').value.trim();
      if (!name) return false;
      const icon = ingredientIconFor(name);
      const exist = (await DB.all('ingredients')).find((x) => x.name === name);
      if (!exist) await DB.put('ingredients', { id: DB.uid(), name, icon });
      else if (!exist.icon && icon) await DB.put('ingredients', { ...exist, icon });
      state.fridgeSel.add(name);
      $('#newIng').value = '';
      return true;
    };
    $('#newIng').addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        await savePendingIngredient();
        openAddIngSheet();
      }
    });
    $('#ingDone').onclick = async () => { await savePendingIngredient(); closeSheet(); await renderFridge(); };
    $('#pickList').onclick = (e) => {
      const pk = e.target.closest('[data-pick]'); if (!pk) return;
      const n = pk.dataset.pick;
      state.fridgeSel.has(n) ? state.fridgeSel.delete(n) : state.fridgeSel.add(n);
      pk.classList.toggle('on');
    };
  }

  function openAddWishSheet() {
    openSheet('<h3>添加想做的菜</h3>' +
      '<input class="inp" id="wName" placeholder="菜名">' +
      '<input class="inp" id="wSrc" placeholder="来源备注（可选），如 收藏自小红书">' +
      '<button class="confirm" id="wSave">添加</button>');
    $('#wSave').onclick = async () => {
      const name = $('#wName').value.trim(); if (!name) { toast('写个菜名吧'); return; }
      await DB.put('wishlist', { id: DB.uid(), name, source: $('#wSrc').value.trim() || '手动添加', cover: '', createdAt: Date.now() });
      closeSheet(); toast('已加入想做的'); renderWish();
    };
  }

  // ---------- 保存菜品 ----------
  async function saveDish() {
    const name = $('#editName').value.trim();
    if (!name) { toast('给这道菜起个名字吧'); return; }
    // 收集步骤
    state.editSteps = $$('#editSteps [data-step]').map((i) => i.value.trim()).filter(Boolean);
    const obj = {
      id: state.editingId || DB.uid(),
      name, category: $('#editCat').dataset.val || '肉',
      cover: state.editCover || '',
      ingredients: state.editIngs.slice(),
      steps: state.editSteps.slice(),
      note: $('#editNote').value.trim(),
      madeIt: true,
      tags: [],
      tutorialId: '',
      createdAt: Date.now()
    };
    if (state.editingId) { const old = await DB.get('dishes', state.editingId); if (old) { obj.tags = old.tags || []; obj.tutorialId = old.tutorialId || ''; obj.createdAt = old.createdAt; } }
    await DB.put('dishes', obj);
    state.homeOrder = null; // 重新随机
    toast('已存进小厨房 ✓');
    go('dish', obj.id);
  }
  async function delDish() {
    if (!state.editingId) return;
    await DB.del('dishes', state.editingId);
    state.homeOrder = null; toast('已删除'); go('home');
  }

  // ---------- 事件委托 ----------
  document.addEventListener('click', async (e) => {
    const t = e.target;

    const tutorialLink = t.closest('[data-tutorial-id]');
    if (tutorialLink) {
      const tt = await DB.get('tutorials', tutorialLink.dataset.tutorialId);
      if (tt) {
        go('tutorial');
        setTimeout(() => showTutorialDetail(tt), 0);
      }
      return;
    }

    // 导航
    const nav = t.closest('[data-nav]');
    if (nav) { go(nav.dataset.nav, nav.dataset.id || ''); return; }
    if (t.closest('[data-back]')) { back(); return; }

    // 首页分类
    const ci = t.closest('.ci[data-cat]');
    if (ci) { const c = ci.dataset.cat; state.activeCat = (state.activeCat === c) ? null : c; renderHome(); return; }

    // 详情→编辑
    if (t.closest('[data-act="editCurrent"]')) { go('edit', state.editingId); return; }

    // 编辑页
    if (t.closest('[data-act="addStep"]')) { syncEditSteps(); state.editSteps.push(''); renderEditSteps(); return; }
    const rmStep = t.closest('[data-rmstep]');
    if (rmStep) {
      syncEditSteps();
      state.editSteps.splice(+rmStep.dataset.rmstep, 1);
      if (!state.editSteps.length) state.editSteps = [''];
      renderEditSteps();
      return;
    }
    if (t.closest('[data-act="saveDish"]')) { saveDish(); return; }
    if (t.closest('[data-act="delDish"]')) { delDish(); return; }
    const cp = t.closest('#editCat .cp');
    if (cp) { $$('#editCat .cp').forEach((x) => x.classList.remove('on')); cp.classList.add('on'); $('#editCat').dataset.val = cp.dataset.cat; return; }
    const rmIng = t.closest('[data-rming]');
    if (rmIng) { state.editIngs.splice(+rmIng.dataset.rming, 1); renderEditIngs(); return; }
    if (t.closest('[data-act="addIng2"]')) {
      openSheet('<h3>加食材</h3><input class="inp" id="qi" placeholder="食材名，回车添加"><button class="confirm" id="qiDone">完成</button>');
      $('#qi').focus();
      $('#qi').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.value.trim()) { state.editIngs.push(ev.target.value.trim()); ev.target.value = ''; renderEditIngs(); } });
      $('#qiDone').onclick = closeSheet; return;
    }

    // 想做的
    if (t.closest('[data-act="addWish"]')) { openAddWishSheet(); return; }
    const wd = t.closest('[data-wishdone]');
    if (wd) {
      const w = await DB.get('wishlist', wd.dataset.wishdone);
      if (w) { await DB.put('dishes', { id: DB.uid(), name: w.name, category: w.category || '肉', cover: w.cover || '', ingredients: [], steps: [], note: '', madeIt: true, tags: [], createdAt: Date.now() }); await DB.del('wishlist', w.id); state.homeOrder = null; toast('已移入厨房，去补全做法吧'); renderWish(); }
      return;
    }

    // 冰箱
    const fe = t.closest('.fe[data-ing]');
    if (fe) { const n = fe.dataset.ing; state.fridgeSel.has(n) ? state.fridgeSel.delete(n) : state.fridgeSel.add(n); fe.classList.toggle('sel'); updateFridgeCounts(); return; }
    if (t.closest('[data-act="addIng"]')) { openAddIngSheet(); return; }
    if (t.closest('[data-act="clearFridge"]')) { await DB.clear('ingredients'); state.fridgeSel.clear(); await renderFridge(); toast('冰箱已清空'); return; }
    if (t.closest('[data-act="findDish"]')) { findDish(); return; }

    // 教程
    if (t.closest('[data-act="parseLink"]')) { const v = $('#tutLink').value.trim(); if (!v) { toast('先粘贴一个链接'); return; } handleLink(v); return; }
    const tut = t.closest('.tcard[data-tut]');
    if (tut) { const tt = await DB.get('tutorials', tut.dataset.tut); if (tt) showTutorialDetail(tt); return; }

    // 点菜
    const opk = t.closest('.opk[data-orderpick]');
    if (opk) { const did = opk.dataset.orderpick; orderState.dishIds.has(did) ? orderState.dishIds.delete(did) : orderState.dishIds.add(did); opk.classList.toggle('on'); renderOrderChosen(); return; }
    const oun = t.closest('[data-orderunpick]');
    if (oun) { orderState.dishIds.delete(oun.dataset.orderunpick); const card = $('.opk[data-orderpick="' + oun.dataset.orderunpick + '"]'); if (card) card.classList.remove('on'); renderOrderChosen(); return; }
    const oux = t.closest('[data-orderunextra]');
    if (oux) { orderState.extra.splice(+oux.dataset.orderunextra, 1); renderOrderChosen(); return; }
    if (t.closest('[data-act="orderAddDish"]')) { addOrderExtra(); return; }
    if (t.closest('[data-act="saveOrder"]')) { saveOrder(); return; }
    if (t.closest('[data-act="delOrder"]')) { delOrder(); return; }
    const oedit = t.closest('[data-orderedit]');
    if (oedit) { go('ordernew', oedit.dataset.orderedit); return; }

    // 重置
    if (t.closest('[data-act="reseed"]')) {
      openSheet('<h3>重置示例数据？</h3><p style="color:var(--gray);font-family:var(--kai);margin-bottom:14px">会清空当前所有菜品/教程/想做的，恢复初始示例。</p><button class="confirm" id="doReset">确认重置</button>');
      $('#doReset').onclick = async () => { await DB.resetAll(); state.homeOrder = null; state.fridgeSel.clear(); closeSheet(); toast('已重置'); route(); };
      return;
    }

    // 关闭弹窗（点遮罩）
    if (t.id === 'modal') closeSheet();
  });

  function showTutorialDetail(t) {
    openSheet('<h3>' + esc(t.title) + '</h3>' +
      (t.ingredients && t.ingredients.length ? '<div class="ingchips" style="margin-bottom:12px">' + t.ingredients.map((i) => '<span class="ic2">' + esc(i) + '</span>').join('') + '</div>' : '') +
      (t.steps && t.steps.length ? '<div class="steps" style="margin-bottom:14px">' + t.steps.map((s, i) => '<div class="stp"><div class="n">' + (i + 1) + '</div><div class="tx">' + esc(s) + '</div></div>').join('') + '</div>' : '<p style="color:var(--gray);font-family:var(--kai)">暂无解析内容</p>') +
      (t.link ? '<a class="confirm" href="' + esc(t.link) + '" target="_blank" style="display:block;text-decoration:none;margin-bottom:10px">打开原链接</a>' : '') +
      '<button class="del" id="tutDel" style="width:100%;border-radius:18px;padding:13px">删除这条教程</button>');
    $('#tutDel').onclick = async () => { await DB.del('tutorials', t.id); closeSheet(); toast('已删除'); renderTutorial(); };
  }

  // change 事件（文件选择）
  document.addEventListener('change', async (e) => {
    if ((e.target.id === 'editCover' || e.target.id === 'editCoverLib') && e.target.files[0]) {
      const file = e.target.files[0]; e.target.value = '';
      runStickerGen(file);
    }
    if (e.target.id === 'tutFile' && e.target.files[0]) { handleVideoFile(e.target.files[0]); e.target.value = ''; }
    if (e.target.id === 'editSteps') {}
  });

  // 点菜：回车快速加菜
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'orderAddName' && e.key === 'Enter') { e.preventDefault(); addOrderExtra(); }
  });

  // ---------- 拍照 → 生成贴纸（参考范例 App 交互：识别→抠图→描边贴纸） ----------
  function setEditCover(dataURL) {
    state.editCover = dataURL;
    const up = $('#editUpload');
    up.querySelectorAll('img').forEach((n) => n.remove());
    const im = document.createElement('img'); im.src = dataURL; up.appendChild(im);
  }
  async function runStickerGen(file) {
    const ov = $('#stickerGen'), frame = $('.sg-frame'), txt = $('#sgText'), bar = $('#sgBar');
    const raw = $('#sgRaw'), out = $('#sgOut'), useBtn = $('#sgUse'), retryBtn = $('#sgRetry');
    const rawURL = await fileToDataURL(file);
    raw.src = rawURL; out.src = '';
    frame.classList.remove('reveal'); frame.classList.add('scanning');
    useBtn.style.display = 'none'; retryBtn.style.display = 'none';
    bar.style.width = '8%'; txt.textContent = '正在识别菜品…';
    ov.classList.add('show');

    const stageText = {
      loading_model: '加载识别模型…', segmenting: '找到菜品啦，正在抠图…',
      compositing: '生成贴纸描边…', repainting: '画风渲染中…', done: '完成'
    };
    let result;
    try {
      result = await Sticker.fromImage(rawURL, (stage, detail) => {
        if (stage === 'model_progress' && detail && detail.progress != null) {
          txt.textContent = '下载识别模型 ' + Math.round(detail.progress) + '%';
          bar.style.width = (10 + detail.progress * 0.5) + '%';
        } else if (stageText[stage]) {
          txt.textContent = stageText[stage];
          bar.style.width = ({ loading_model: 62, segmenting: 78, compositing: 90, repainting: 95, done: 100 }[stage] || 50) + '%';
        }
      });
    } catch (e) {
      result = { dataURL: rawURL, state: 'fallback' };
    }
    bar.style.width = '100%';
    out.src = result.dataURL;
    frame.classList.remove('scanning');
    setTimeout(() => frame.classList.add('reveal'), 60);
    txt.textContent = result.state === 'auto'
      ? (result.usedAI ? '贴纸做好啦 ✨' : '贴纸做好啦，自动抠图描边 ✨')
      : '已生成（未联网识别，用了裁切贴纸）';
    useBtn.style.display = ''; retryBtn.style.display = '';

    useBtn.onclick = () => { setEditCover(result.dataURL); ov.classList.remove('show'); };
    retryBtn.onclick = () => { ov.classList.remove('show'); $('#editCover').click(); };
  }


  const RENDER = { home: renderHome, dish: renderDish, edit: renderEdit, wish: renderWish, fridge: renderFridge, tutorial: renderTutorial, order: renderOrder, ordernew: renderOrderNew };

  // ---------- 启动 ----------
  window.addEventListener('hashchange', route);
  (async function init() {
    await DB.seedIfEmpty();
    if (!location.hash) location.hash = '#/home';
    route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  })();
})();
