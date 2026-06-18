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
    { view: 'fridge', ic: '🧊', label: '冰箱' },
    { view: 'tutorial', ic: '📚', label: '教程' }
  ];

  const CAT_ICON = {
    '主食': 'icons/cat-staple.jpg', '肉': 'icons/cat-meat.jpg', '青菜': 'icons/cat-veg.jpg',
    '海鲜': 'icons/cat-seafood.jpg', '汤': 'icons/cat-soup.jpg', '凉菜沙拉': 'icons/cat-cold.jpg',
    '饮料': 'icons/cat-cold.jpg'
  };
  const CAT_LABEL = { '肉': '肉肉', '凉菜沙拉': '凉菜' };
  const ING_EMOJI = {
    '番茄': '🍅', '西红柿': '🍅', '鸡蛋': '🥚', '青菜': '🥬', '西兰花': '🥦',
    '蒜': '🧄', '大蒜': '🧄', '葱': '🧅', '姜': '🫚', '五花肉': '🥩',
    '猪肉': '🥩', '排骨': '🍖', '紫菜': '🌿', '冰糖': '🟤', '醋': '🍶',
    '料酒': '🍶', '生抽': '🍶', '老抽': '🍶', '豆腐': '◻️', '虾': '🦐',
    '鱼': '🐟', '盐': '🧂'
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
  function fileToDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  function coverImg(src, cls) {
    if (src) return '<img class="' + (cls || '') + '" src="' + esc(src) + '">';
    return '<div class="' + (cls || '') + '" style="display:flex;align-items:center;justify-content:center;background:var(--chip);font-size:26px">🍽️</div>';
  }
  function catLabel(c) { return CAT_LABEL[c] || c || ''; }
  function ingLabel(name) { return '<span class="em">' + esc(ING_EMOJI[name] || '🥢') + '</span>' + esc(name); }

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
      '<span class="blob"><img src="' + (CAT_ICON[c] || '') + '"></span>' +
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

    const collage = $('#homeCollage');
    if (!list.length) {
      collage.innerHTML = ''; $('#homeEmpty').style.display = 'block';
    } else {
      $('#homeEmpty').style.display = 'none';
      collage.innerHTML = renderHomeCollage(list);
      const rows = Math.max(1, Math.ceil(list.length / 5));
      collage.style.height = (530 + (rows - 1) * 500) + 'px';
    }
  }

  function renderHomeCollage(list) {
    const cards = list.map((d, i) => {
      const slot = (i % 5) + 1;
      const row = Math.floor(i / 5);
      const tag = d.tags && d.tags.length ? d.tags[0] : '';
      const cover = d.cover
        ? '<img src="' + esc(d.cover) + '" alt="' + esc(d.name) + '">'
        : '<div class="phdish">🍽️</div>';
      return '<button class="cut d' + slot + '" style="--row-offset:' + (row * 500) + 'px" data-nav="dish" data-id="' + esc(d.id) + '">' +
        '<span class="pic">' + cover + '</span>' +
        '<span class="lbl">' + esc(d.name) + '</span>' +
        (tag ? '<span class="tagmini">' + esc(tag) + ' ✦</span>' : '') +
        '</button>';
    }).join('');
    return cards +
      '<span class="scribble s1">最近常做~</span>' +
      '<span class="scribble s2">超下饭！</span>';
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
        (d.ingredients || []).map((i) => '<span class="ic2">' + ingLabel(i) + '</span>').join('') + '</div>') +
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
      '<span class="tg">' + ingLabel(t) + ' <span class="x" data-rming="' + i + '">×</span></span>').join('') +
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
      '<button class="wcard ghost" data-act="addWish">＋ 再添加一道想做的菜</button>';
  }

  // ---------- ⑤ 冰箱 ----------
  async function renderFridge() {
    const ings = await DB.all('ingredients');
    const positioned = layoutFloat(ings.length);
    $('#fridgeCanvas').innerHTML = ings.map((ing, i) => {
      const p = positioned[i];
      const sel = state.fridgeSel.has(ing.name) ? ' sel' : '';
      const icon = ing.icon ? '<img src="' + esc(ing.icon) + '">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px">🧂</div>';
      return '<span class="fe' + sel + '" data-ing="' + esc(ing.name) + '" style="top:' + p.top + 'px;left:' + p.left + 'px">' +
        icon + '<span class="nm">' + esc(ing.name) + '</span></span>';
    }).join('');
    updateFridgeCounts();
    $('#resultArea').innerHTML = '';
  }
  function layoutFloat(n) {
    // 在画布内规则散布，避免重叠
    const cols = 4, cw = 86, rh = 92, ox = 14, oy = 12;
    const res = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const jitter = (r % 2) * 18;
      res.push({ left: ox + c * cw + jitter, top: oy + r * rh });
    }
    return res;
  }
  function updateFridgeCounts() {
    const n = state.fridgeSel.size;
    $('#goCount').textContent = '已选 ' + n + ' 样 →';
    $('#fridgeHint').innerHTML = n ? ('已选 <b>' + n + '</b> 样食材<br>点下面「找找能做什么」') : '还没选食材<br>点上面的食材或 ＋ 添加';
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
    $('#parseStatus').innerHTML = parseStatusHTML(
      res.reason === 'no_proxy' ? '当前未连接解析服务，已转手动补全' : '链接解析完成', false);
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
        source: res.link ? '链接收藏' : '本地视频', state: res.state || 'manual',
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
    $('#newIng').addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const name = e.target.value.trim();
        let exist = (await DB.all('ingredients')).find((x) => x.name === name);
        if (!exist) await DB.put('ingredients', { id: DB.uid(), name, icon: '' });
        state.fridgeSel.add(name); e.target.value = ''; openAddIngSheet();
      }
    });
    $('#ingDone').onclick = () => { closeSheet(); renderFridge(); };
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
    if (t.closest('[data-act="clearFridge"]')) { state.fridgeSel.clear(); renderFridge(); return; }
    if (t.closest('[data-act="findDish"]')) { findDish(); return; }

    // 教程
    if (t.closest('[data-act="parseLink"]')) { const v = $('#tutLink').value.trim(); if (!v) { toast('先粘贴一个链接'); return; } handleLink(v); return; }
    const tut = t.closest('.tcard[data-tut]');
    if (tut) { const tt = await DB.get('tutorials', tut.dataset.tut); if (tt) showTutorialDetail(tt); return; }

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
      (t.ingredients && t.ingredients.length ? '<div class="ingchips" style="margin-bottom:12px">' + t.ingredients.map((i) => '<span class="ic2">' + ingLabel(i) + '</span>').join('') + '</div>' : '') +
      (t.steps && t.steps.length ? '<div class="steps" style="margin-bottom:14px">' + t.steps.map((s, i) => '<div class="stp"><div class="n">' + (i + 1) + '</div><div class="tx">' + esc(s) + '</div></div>').join('') + '</div>' : '<p style="color:var(--gray);font-family:var(--kai)">暂无解析内容</p>') +
      (t.link ? '<a class="confirm" href="' + esc(t.link) + '" target="_blank" style="display:block;text-decoration:none;margin-bottom:10px">打开原链接</a>' : '') +
      '<button class="del" id="tutDel" style="width:100%;border-radius:18px;padding:13px">删除这条教程</button>');
    $('#tutDel').onclick = async () => { await DB.del('tutorials', t.id); closeSheet(); toast('已删除'); renderTutorial(); };
  }

  // change 事件（文件选择）
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'editCover' && e.target.files[0]) { state.editCover = await fileToDataURL(e.target.files[0]); const up = $('#editUpload'); up.querySelectorAll('img').forEach((n) => n.remove()); const im = document.createElement('img'); im.src = state.editCover; up.appendChild(im); }
    if (e.target.id === 'tutFile' && e.target.files[0]) { handleVideoFile(e.target.files[0]); e.target.value = ''; }
    if (e.target.id === 'editSteps') {}
  });

  const RENDER = { home: renderHome, dish: renderDish, edit: renderEdit, wish: renderWish, fridge: renderFridge, tutorial: renderTutorial };

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
