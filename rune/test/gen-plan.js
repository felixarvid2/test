// Skriver relik-listan i docs/plan.md från spelets data: node rune/test/gen-plan.js
const fs = require('fs');
const path = require('path');
const R = require('./load.js');
const file = path.join(__dirname, '..', 'docs', 'plan.md');
let out = '\n';
let n = 0;
R.RELIC_CATS.forEach((cat) => {
  const list = R.RELICS.filter((d) => d.cat === cat);
  out += '### ' + cat + ' (' + list.length + ')\n\n| # | Relik | Sällsynthet | Pris | Effekt | Balatro |\n|---|---|---|---|---|---|\n';
  list.forEach((d) => {
    n++;
    out += '| ' + n + ' | ' + d.i + ' **' + d.n + '** | ' + R.RARITY[d.r].name + ' | $' + d.c + ' | ' + d.d.replace(/\|/g, '\\|') + ' | ' + d.a + ' |\n';
  });
  out += '\n';
});
const src = fs.readFileSync(file, 'utf8');
const res = src.replace(/<!-- RELIKER:START -->[\s\S]*<!-- RELIKER:END -->/, '<!-- RELIKER:START -->' + out + '<!-- RELIKER:END -->');
fs.writeFileSync(file, res);
console.log('Skrev', n, 'reliker till', file);
