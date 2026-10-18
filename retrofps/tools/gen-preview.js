'use strict';
// Skriver ut en genererad bana som ASCII: node tools/gen-preview.js <biom> [seed] [djup] [flaggor]
//   biom: dungeon | caves | graveyard | forest | courtyard | swamp | boss | boss:hall | boss:graveyard | boss:cave | boss:forest
//         | boss:swamp | random   (eller --biome=swamp)
//   flaggor: --biome=swamp  --shop  --weapon=g  --guardian=demon (vaktare på vanliga våningar)  --boss=ghost (bossens tema i arenan)
//            --sky (visa himmelmasken)  --floor (visa golvmasken)  --mask (visa rumsmasken)  --rooms (lista rummen med rumstyp)
//            --legend (teckenförklaring)  --n=3 (flera seeds i följd)  --stats (bara statistik över n banor: nya saker, fiendemix)
// Golv visas som . (alla golvtexturer), vaktarens/bossens golv som ` så att salen syns (--floor visar golvmasken).
// Exempel: node tools/gen-preview.js forest 123 3 --shop --rooms
//          node tools/gen-preview.js --biome=swamp 7 3 --legend
//          node tools/gen-preview.js caves 1 --stats --n=200
const fs = require('fs');
const path = require('path');
global.window = global;
for (const f of ['rng.js', 'gen.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));

const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const flag = k => { const f = flags.find(a => a === '--' + k || a.startsWith('--' + k + '=')); return f ? (f.includes('=') ? f.split('=')[1] : true) : undefined; };
if (flag('biome') && flag('biome') !== true) pos.unshift(flag('biome'));
const biome = pos[0] || 'random';
const seed0 = pos[1] === undefined ? 1 : (/^\d+$/.test(pos[1]) ? +pos[1] : pos[1]);
const depth = +(pos[2] || 1);
const n = +(flag('n') || 1);
const LEGEND = [
  'väggar: 1-5 sten  6 skogsbryn  7 kyrkogårdsmur  8 grottberg  9 timmer  # demon  % best  ~ mardröm  & ogre  = vålnad',
  'D dörr  G grind  * hemlig vägg  P start  x utgång  B boss  Z vaktare  Q mimic  E elit  S K V I L N O R W fiender',
  'h hälsa  a ammo  A rustning  $ guld  C kista  M köpman  g r m d b s p vapen  f eldfat  o kruka  t träd  n gravsten',
  'c kandelaber  k likkista  j benhög  q bokhylla  u staty  v bur  w helande brunn  y förbannat altare  z spikfälla',
  'e explosiv tunna  i kristall  F svamp  H vapenställ  J bord  T trälåda   golv: ` vaktarens/bossens golv',
  'nya väggar: 0 träskvägg (vass/dött snår)',
  'nya fiender: U spindel  X fladdermus  Y helveteshund  ! bombskelett  @ sköldbärare  ^ svampman  + levande rustning (vilande)',
  'farliga golv: _ lava  - vatten  : is  " spindelväv      fällor: < pilplatta  > gasventil',
  'interaktiva (blockerar): ( städ  ) spåaltare  [ fångbur  ? utmaningsaltare  ; offerskål  / spak',
  'grindar/lås: | järngrind (öppnas med spaken)  ] låst dörr (öppnas med nyckeln)  { sprucken vägg (sprängs)',
  "föremål: , granatknippe  ' skattkarta  } nyckel",
];
const OLD_EN = 'SKVILNORW', NEW_EN = 'UXY!@^+';
const FEAT = { anvil: '(', fortune: ')', prisoner: '[', challenge: '?', offering: ';', lever: '/', locked: ']', cracked: '{', arrows: '<', gas: '>', lava: '_', water: '-', ice: ':', webs: '"' };
const makeLevel = (seed, d, shop) => (biome.startsWith('boss') ? Gen.boss(seed, { arena: biome.split(':')[1], boss: flag('boss') })
  : Gen.floor(seed, d, { biome: biome === 'random' ? undefined : biome, shop, weapon: flag('weapon'), guardian: flag('guardian') }));
if (flag('stats')) {
  // statistik över n banor (djupet roterar 1-5 om inget djup anges)
  const F = {}, FN = {}, EN = {}, T = {}; let ms = 0;
  for (let k = 0; k < n; k++) {
    const seed = typeof seed0 === 'number' ? seed0 + k : seed0 + '-' + k, t0 = process.hrtime.bigint();
    const lv = makeLevel(seed, pos[2] ? depth : 1 + (k % 5), flag('shop') ? true : k % 2 === 0);
    ms += Number(process.hrtime.bigint() - t0) / 1e6;
    for (const key in lv.features) { F[key] = (F[key] || 0) + (lv.features[key] ? 1 : 0); FN[key] = (FN[key] || 0) + lv.features[key]; }
    for (const r of lv.map) for (const c of r) if ((OLD_EN + NEW_EN).includes(c)) EN[c] = (EN[c] || 0) + 1;
    for (const r of lv.rooms) if (r.arch) T[r.arch] = (T[r.arch] || 0) + 1;
  }
  const tot = Object.values(EN).reduce((a, b) => a + b, 0) || 1;
  console.log(`${biome}: ${n} banor, snitt ${(ms / n).toFixed(1)} ms`);
  console.log('nya saker (andel banor %, snitt antal): ' + Object.keys(FEAT).map(k => `${k}=${(100 * (F[k] || 0) / n).toFixed(0)}%/${((FN[k] || 0) / n).toFixed(1)}`).join(' '));
  console.log('fiendemix %: ' + [...OLD_EN + NEW_EN].filter(c => EN[c]).map(c => `${c}=${(100 * EN[c] / tot).toFixed(0)}`).join(' '));
  console.log('rumstyper: ' + Object.entries(T).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(0);
}
if (flag('legend')) console.log(LEGEND.join('\n') + '\n');

for (let k = 0; k < n; k++) {
  const seed = typeof seed0 === 'number' ? seed0 + k : seed0 + (k ? '-' + k : '');
  const t0 = process.hrtime.bigint();
  const lv = makeLevel(seed, depth, !!flag('shop'));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const H = lv.map.length, W = lv.map[0].length;
  const types = {}; for (const r of lv.rooms) types[r.type] = (types[r.type] || 0) + 1;
  console.log(`${lv.name} [${lv.biome}${lv.arena ? ':' + lv.arena : ''}] seed ${seed} djup ${lv.depth} ${W}x${H} ${ms.toFixed(1)} ms ambient ${lv.ambient} fog ${lv.fog} tak ${lv.ceil}` +
    (lv.guardian ? ` vaktare ${lv.guardian}` : '') + (lv.boss ? ` boss ${lv.boss}` : ''));
  console.log('golv: ' + lv.floors.map((f, i) => i + '=' + f).join(' '));
  console.log('områden: ' + Object.entries(types).map(([t, c]) => t + '=' + c).join(' '));
  if (lv.features) console.log('nya saker: ' + Object.entries(lv.features).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join(' '));
  const errs = Gen.validate(lv);
  if (errs.length) console.log('VALIDERINGSFEL:\n  ' + errs.slice(0, 10).join('\n  '));
  const bossF = lv.floors.findIndex(f => f.startsWith('floor_boss_'));
  const show = flag('sky') ? lv.sky : flag('floor') ? lv.floorMask : flag('mask') ? lv.roomMask : null;
  for (let y = 0; y < H; y++) {
    let s = '';
    for (let x = 0; x < W; x++) {
      const c = lv.map[y][x];
      if (show) { s += (c >= '0' && c <= '9') || '#%~&='.includes(c) ? '#' : (show[y] ? show[y][x] : '?'); continue; }
      if (c !== '.') { s += c; continue; }
      const fi = lv.floorMask ? +lv.floorMask[y][x] : 0;
      s += fi === bossF ? '`' : '.';
    }
    console.log(s);
  }
  if (flag('rooms')) {
    // per rum: typ, rumstyp, ruta, antal fiender och rekvisita (räknat via rumsmasken när den finns)
    const ENEMY = 'SKVILNORWEQ' + NEW_EN, PROPS = 'ckjquvwyzeiFHJT()[?;/';
    lv.rooms.forEach((r, i) => {
      let en = 0, pr = 0, items = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const inside = lv.roomMask ? lv.roomMask[y].charCodeAt(x) - 48 === i : (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
        if (!inside) continue;
        const c = lv.map[y][x];
        if (ENEMY.includes(c)) en++; else if (PROPS.includes(c)) pr++;
        if ("ZhaA$CMwy,'}".includes(c)) items += c;
      }
      console.log(`  ${String(i).padStart(2)} ${String.fromCharCode(48 + i)} ${r.type.padEnd(9)} ${(r.arch || '').padEnd(12)} ${(r.tag || r.shape || '').padEnd(9)} ${r.x},${r.y} ${r.w}x${r.h}  fiender ${en}  rekvisita ${pr}  ${items}` + (r.guardian ? '  vaktare ' + r.guardian : '') + (r.lock ? '  lås ' + r.lock : ''));
    });
  }
  console.log('');
}
