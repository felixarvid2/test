// Laddar spelmotorn (utan DOM) i Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILES = ['core.js', 'patterns.js', 'relics.js', 'items.js', 'score.js', 'game.js', 'bot.js'];
for (const f of FILES) {
  const p = path.join(__dirname, '..', 'js', f);
  vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = globalThis.R;
