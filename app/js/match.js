/* ===== 我的小厨房 · 冰箱食材匹配算法 =====
 * 规则：匹配度 = 命中食材数 ÷ 菜品总食材数，降序排序。
 * 输出：best（最佳匹配大卡）+ list（其余按匹配度排序），并给出「还差 X 样」。
 */
(function (global) {
  'use strict';

  function norm(s) { return (s || '').trim(); }

  /**
   * @param {string[]} selected  已选食材名数组
   * @param {object[]} dishes     全部菜品
   * @returns {{best:object|null, list:object[]}}
   */
  function match(selected, dishes) {
    const sel = new Set((selected || []).map(norm).filter(Boolean));
    const scored = (dishes || []).map((d) => {
      const need = (d.ingredients || []).map(norm).filter(Boolean);
      const total = need.length || 1;
      const hit = need.filter((n) => sel.has(n)).length;
      const missing = need.filter((n) => !sel.has(n));
      const pct = Math.round((hit / total) * 100);
      return { dish: d, hit, total, missing, pct };
    });

    // 只展示至少命中 1 样的菜（避免列出完全无关的菜）
    const useful = scored.filter((x) => x.hit > 0);
    useful.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;       // 匹配度优先
      if (b.hit !== a.hit) return b.hit - a.hit;       // 命中多优先
      return a.missing.length - b.missing.length;      // 缺得少优先
    });

    return {
      best: useful.length ? useful[0] : null,
      list: useful.slice(1)
    };
  }

  function missingLabel(m) {
    if (m.pct >= 100) return '食材齐全，现在就能做 ✅';
    return '还差 ' + m.missing.length + ' 样';
  }

  global.Match = { match, missingLabel };
})(window);
