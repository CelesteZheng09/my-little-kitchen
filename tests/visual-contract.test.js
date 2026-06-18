const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('app/index.html');
const css = read('app/css/app.css');
const app = read('app/js/app.js');

function includes(file, haystack, needle) {
  assert.ok(haystack.includes(needle), `${file} should include ${needle}`);
}

includes('index.html', html, 'id="homeCollage"');
includes('index.html', html, 'class="collage"');
includes('app.js', app, 'renderHomeCollage');
includes('app.js', app, 'class="cut d');
includes('app.css', css, '.cut.d1');
includes('app.css', css, '.cut.d5');
includes('app.css', css, '.wishhead');
includes('app.js', app, 'FRIDGE_ANCHORS');
includes('app.js', app, 'class="fridgeWorld"');
includes('app.css', css, '.canvas{position:relative;height:330px;margin:6px 12px 0;flex:none;overflow:auto');
includes('app.css', css, '.inputbar{width:calc(100% - 32px)');

assert.ok(!app.includes('tagmini'), 'home collage should not render dish mini tags');
assert.ok(!app.includes('scribble'), 'home collage should not render extra handwritten mini labels');
assert.ok(!css.includes('tagmini'), 'home collage should not style dish mini tags');
assert.ok(!app.includes("left: '"), 'fridge anchors should use absolute px slots instead of overlapping percentage slots');
assert.ok(!app.includes('cols = 4'), 'fridge ingredients should not use a regular 4-column grid');
assert.ok(!app.includes("label: '教程'"), 'tutorial should not be a bottom tab');
assert.ok(!html.includes('fridgeHint'), 'fridge should not render the middle hint text');
assert.ok(!app.includes('fridgeHint'), 'fridge should not update removed middle hint text');
includes('app.js', app, 'class="wcard ghost" data-nav="tutorial"');

for (const file of ['db.js', 'match.js', 'parser.js', 'app.js']) {
  new Function(read(`app/js/${file}`));
}

console.log('visual contract ok');
