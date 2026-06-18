/* ===== 我的小厨房 · 本地数据层（IndexedDB） =====
 * 纯前端、离线优先、无后端、无账号。
 * 四张表：dishes（菜品）/ ingredients（食材库）/ tutorials（教程）/ wishlist（想做的）
 * 对外暴露全局对象 DB，所有方法返回 Promise。
 */
(function (global) {
  'use strict';

  const DB_NAME = 'my-kitchen';
  const DB_VER = 1;
  const STORES = ['dishes', 'ingredients', 'tutorials', 'wishlist', 'meta'];

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('dishes'))
          db.createObjectStore('dishes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('ingredients'))
          db.createObjectStore('ingredients', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tutorials'))
          db.createObjectStore('tutorials', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('wishlist'))
          db.createObjectStore('wishlist', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta'))
          db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const DB = {
    // 通用 CRUD
    all(store) { return tx(store, 'readonly').then((s) => reqP(s.getAll())); },
    get(store, id) { return tx(store, 'readonly').then((s) => reqP(s.get(id))); },
    put(store, obj) {
      if (!obj.id) obj.id = uid();
      return tx(store, 'readwrite').then((s) => reqP(s.put(obj))).then(() => obj);
    },
    del(store, id) { return tx(store, 'readwrite').then((s) => reqP(s.delete(id))); },
    clear(store) { return tx(store, 'readwrite').then((s) => reqP(s.clear())); },

    // meta（标记是否已灌过种子数据等）
    getMeta(key) { return this.get('meta', key).then((r) => (r ? r.value : null)); },
    setMeta(key, value) { return this.put('meta', { key, value }); },

    // 首次启动灌入示例数据
    async seedIfEmpty() {
      const seeded = await this.getMeta('seeded');
      if (seeded) return;
      for (const ing of SEED.ingredients) await this.put('ingredients', ing);
      for (const d of SEED.dishes) await this.put('dishes', d);
      for (const t of SEED.tutorials) await this.put('tutorials', t);
      for (const w of SEED.wishlist) await this.put('wishlist', w);
      await this.setMeta('seeded', true);
    },

    // 重置（开发/测试用）
    async resetAll() {
      for (const s of STORES) await this.clear(s);
      await this.seedIfEmpty();
    }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  DB.uid = uid;

  // ===== 示例种子数据（复用定稿设计稿的本地素材） =====
  const IMG = (f) => 'icons/' + f;

  const SEED = {
    // 食材库：name 唯一，icon 为本地贴纸
    ingredients: [
      { id: 'i_tomato',   name: '番茄',   icon: IMG('ing-tomato.jpg') },
      { id: 'i_egg',      name: '鸡蛋',   icon: IMG('ing-egg.jpg') },
      { id: 'i_veg',      name: '青菜',   icon: IMG('ing-veg.jpg') },
      { id: 'i_garlic',   name: '蒜',     icon: IMG('ing-garlic.jpg') },
      { id: 'i_pork',     name: '五花肉', icon: IMG('ing-pork.jpg') },
      { id: 'i_scallion', name: '葱',     icon: IMG('ing-scallion.jpg') },
      { id: 'i_broccoli', name: '西兰花', icon: IMG('ing-veg.jpg') },
      { id: 'i_seaweed',  name: '紫菜',   icon: IMG('ing-veg.jpg') },
      { id: 'i_rib',      name: '排骨',   icon: IMG('ing-pork.jpg') },
      { id: 'i_sugar',    name: '冰糖',   icon: '' },
      { id: 'i_vinegar',  name: '醋',     icon: '' },
      { id: 'i_wine',     name: '料酒',   icon: '' }
    ],

    // 菜品：category ∈ 主食/肉/青菜/海鲜/汤/凉菜沙拉/饮料
    dishes: [
      {
        id: 'd_fanqie', name: '番茄炒蛋', category: '青菜', cover: IMG('dish-fanqie.jpg'),
        tags: ['最近常做', '超下饭'], madeIt: true,
        ingredients: ['番茄', '鸡蛋', '葱'],
        steps: ['鸡蛋打散，番茄切块。', '热油先炒蛋盛出。', '炒番茄出汁，倒回鸡蛋翻匀，撒葱花出锅。'],
        note: '番茄选熟一点的更出汁，最后加一点点糖提味。',
        tutorialId: '', createdAt: Date.now() - 86400000 * 2
      },
      {
        id: 'd_hongshao', name: '红烧肉', category: '肉', cover: IMG('dish-hongshao.jpg'),
        tags: ['宴客必做'], madeIt: true,
        ingredients: ['五花肉', '蒜', '葱', '料酒', '冰糖'],
        steps: ['五花肉切块冷水下锅焯一下，捞出沥干。', '小火炒糖色，下肉块翻炒上色。', '加葱蒜料酒和热水，小火炖 40 分钟收汁。'],
        note: '上次冰糖放多了点，下次减半；炖的时候记得别收太干。',
        tutorialId: 't_hongshao', createdAt: Date.now() - 86400000 * 5
      },
      {
        id: 'd_xilanhua', name: '蒜蓉西兰花', category: '青菜', cover: IMG('dish-xilanhua.jpg'),
        tags: ['快手菜'], madeIt: true,
        ingredients: ['西兰花', '蒜'],
        steps: ['西兰花掰小朵，焯水 1 分钟过凉。', '蒜末爆香，下西兰花大火快炒，加盐调味。'],
        note: '焯水时加点盐和油，颜色更翠绿。',
        tutorialId: '', createdAt: Date.now() - 86400000 * 8
      },
      {
        id: 'd_zicai', name: '紫菜蛋花汤', category: '汤', cover: IMG('dish-zicai.jpg'),
        tags: [], madeIt: true,
        ingredients: ['紫菜', '鸡蛋', '葱'],
        steps: ['水烧开下紫菜。', '蛋液缓缓倒入划出蛋花，撒葱花、加盐香油即可。'],
        note: '',
        tutorialId: '', createdAt: Date.now() - 86400000 * 10
      },
      {
        id: 'd_tangcu', name: '糖醋排骨', category: '肉', cover: IMG('dish-hongshao.jpg'),
        tags: ['超下饭'], madeIt: true,
        ingredients: ['排骨', '醋', '冰糖'],
        steps: ['排骨焯水洗净。', '炒糖色裹排骨，加醋、生抽和水。', '小火炖入味后大火收汁。'],
        note: '糖醋比例 1:1，最后可点几滴香醋提香。',
        tutorialId: '', createdAt: Date.now() - 86400000 * 14
      }
    ],

    // 教程收藏：state ∈ auto(已解析) / half(半自动) / manual(手动)
    tutorials: [
      {
        id: 't_hongshao', title: '30 秒学会零失败红烧肉', source: '收藏的视频教程',
        state: 'auto', cover: IMG('dish-hongshao.jpg'), link: '',
        ingredients: ['五花肉', '冰糖', '料酒', '生抽'],
        steps: ['焯水', '炒糖色', '炖煮收汁'],
        createdAt: Date.now() - 86400000 * 5
      }
    ],

    // 想做的（心愿清单）
    wishlist: [
      { id: 'w_mapo', name: '麻婆豆腐', category: '肉', cover: IMG('dish-hongshao.jpg'), source: '🌶 川菜 · 收藏自小红书', createdAt: Date.now() - 86400000 },
      { id: 'w_fish', name: '清蒸鲈鱼', category: '海鲜', cover: IMG('dish-xilanhua.jpg'), source: '🦐 海鲜 · 收藏自视频', createdAt: Date.now() - 86400000 * 2 },
      { id: 'w_rice', name: '蛋炒饭', category: '主食', cover: IMG('dish-fanqie.jpg'), source: '🍚 主食 · 手动添加', createdAt: Date.now() - 86400000 * 3 }
    ]
  };

  DB.SEED = SEED;
  DB.CATEGORIES = ['主食', '肉', '青菜', '海鲜', '汤', '凉菜沙拉', '饮料'];
  global.DB = DB;
})(window);
