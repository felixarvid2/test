'use strict';
// Skriver ut en genererad bana som ASCII: node tools/gen-preview.js <biom> [seed] [djup] [flaggor]
//   biom: dungeon | caves | graveyard | forest | courtyard | boss | boss:hall | boss:graveyard | boss:cave | boss:forest | random
//   flaggor: --shop  --weapon=g  --sky (visa himmelmasken)  --floor (visa golvmasken)  --n=3 (flera seeds i följd)
// Golv visas efter floorMask: . = floors[0], , = floors[1], ; = floors[2], : = floors[3]
// Exempel: node tools/gen-preview.js forest 123 3 --shop
const fs = require('fs');
const path = require('path');
global.window = global;
for (const f of ['rng.js', 'gen.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));

const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const flag = k => { const f = flags.find(a => a === '--' + k || a.startsWith('--' + k + '=')); return f ? (f.includes('=') ? f.split('=')[1] : true) : undefined; };
const biome = pos[0] || 'random';
const seed0 = pos[1] === undefined ? 1 : (/^\d+$/.test(pos[1]) ? +pos[1] : pos[1]);
const depth = +(pos[2] || 1);
const n = +(flag('n') || 1);

for (let k = 0; k < n; k++) {
  const seed = typeof seed0 === 'number' ? seed0 + k : seed0 + (k ? '-' + k : '');
  const t0 = process.hrtime.bigint();
  const lv = biome.startsWith('boss') ? Gen.boss(seed, { arena: biome.split(':')[1] })
    : Gen.floor(seed, depth, { biome: biome === 'random' ? undefined : biome, shop: !!flag('shop'), weapon: flag('weapon') });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const H = lv.map.length, W = lv.map[0].length;
  const types = {}; for (const r of lv.rooms) types[r.type] = (types[r.type] || 0) + 1;
  console.log(`${lv.name} [${lv.biome}${lv.arena ? ':' + lv.arena : ''}] seed ${seed} djup ${lv.depth} ${W}x${H} ${ms.toFixed(1)} ms ambient ${lv.ambient} fog ${lv.fog} golv ${lv.floors.join(',')} tak ${lv.ceil}`);
  console.log('områden: ' + Object.entries(types).map(([t, c]) => t + '=' + c).join(' '));
  const errs = Gen.validate(lv);
  if (errs.length) console.log('VALIDERINGSFEL:\n  ' + errs.slice(0, 10).join('\n  '));
  const show = flag('sky') ? lv.sky : flag('floor') ? lv.floorMask : null;
  for (let y = 0; y < H; y++) {
    let s = '';
    for (let x = 0; x < W; x++) {
      const c = lv.map[y][x];
      // väggar visas som # (utom specialväggarna) så att strukturen syns
      s += show ? (c >= '1' && c <= '9' ? '#' : (show[y] ? show[y][x] : '?')) : (c === '.' ? '.,;:'[lv.floorMask ? +lv.floorMask[y][x] : 0] : c);
    }
    console.log(s);
  }
  console.log('');
}
