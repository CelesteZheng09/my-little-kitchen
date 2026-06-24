const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('app/index.html');
const css = read('app/css/app.css');
const app = read('app/js/app.js');
const config = read('app/config.js');

function includes(file, haystack, needle) {
  assert.ok(haystack.includes(needle), `${file} should include ${needle}`);
}

includes('index.html', html, 'id="dishgrid"');
includes('app.css', css, '.dishgrid');
includes('app.css', css, '.dishcard');
includes('index.html', html, 'data-view="order"');
includes('index.html', html, 'data-view="ordernew"');
includes('app.js', app, 'renderOrder');
includes('app.js', app, 'renderOrderNew');
includes('app/js/sticker.js', read('app/js/sticker.js'), 'window.Sticker');
includes('app.js', app, 'FRIDGE_ANCHORS');
includes('app.js', app, 'class="fridgeWorld"');
includes('app.js', app, "'饮料': 'icons/cat-drink.jpg'");
includes('app.js', app, "DB.clear('ingredients')");
includes('app.js', app, 'savePendingIngredient');
includes('app.js', app, 'ingredientIconFor');
includes('app.js', app, "'青菜': 'icons/ing-veg.jpg'");
includes('app.css', css, '.canvas{position:relative;height:330px;margin:6px 12px 0;flex:none;overflow:auto');
includes('app.css', css, '.stepedit .se .rmstep');
includes('config.js', config, 'my-little-kitchen-parser.celestezheng09.workers.dev');
includes('index.html', html, 'config.js?v=20260624-v7a');

assert.ok(!app.includes('tagmini'), 'home collage should not render dish mini tags');
assert.ok(!app.includes('scribble'), 'home collage should not render extra handwritten mini labels');
assert.ok(!css.includes('tagmini'), 'home collage should not style dish mini tags');
assert.ok(!app.includes("left: '"), 'fridge anchors should use absolute px slots instead of overlapping percentage slots');
assert.ok(!app.includes('cols = 4'), 'fridge ingredients should not use a regular 4-column grid');
assert.ok(!app.includes("label: '教程'"), 'tutorial should not be a bottom tab');
includes('index.html', html, 'id="fridgeHint" hidden');
assert.ok(!app.includes('还没选食材'), 'fridge should not restore middle hint copy');
includes('app.js', app, 'class="wcard ghost" data-nav="tutorial"');

for (const file of ['db.js', 'match.js', 'parser.js', 'sticker.js', 'app.js']) {
  new Function(read(`app/js/${file}`));
}

console.log('visual contract ok');
