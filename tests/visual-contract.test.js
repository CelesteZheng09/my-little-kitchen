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
includes('app.js', app, 'class="scribble');
includes('app.css', css, '.cut.d1');
includes('app.css', css, '.cut.d5');
includes('app.css', css, '.tagmini');
includes('app.css', css, '.wishhead');

for (const file of ['db.js', 'match.js', 'parser.js', 'app.js']) {
  new Function(read(`app/js/${file}`));
}

console.log('visual contract ok');
