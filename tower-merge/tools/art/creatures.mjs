// Generates enemy_*.svg (128x128) and boss_*.svg (320x320) into public/assets/sprites/.
// Style: docs/ART_STYLE.md. Run: node tools/art/creatures.mjs [id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Art, OUT, ell, rr, poly, star, shade, light, mix } from './creatures-lib.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'sprites');
const WOOD = '#a8673a', STONE = '#8d8fa8', GOLD = '#f5c542', STEEL = '#c3c7da', BONE = '#f2e9d0';
const E = (id) => new Art(id, 128, 128, 4, 5);
const B = (id) => new Art(id, 320, 320, 9, 11);

const enemies = {};
const bosses = {};

// ---------------------------------------------------------------------------------- goblin
enemies.goblin = () => {
  const G = '#4fb36b', A = E('gb');
  A.shadow(62, 114, 34, 7);
  A.cel(rr(45, 94, 15, 18, 6), G);
  A.cel(rr(68, 94, 15, 18, 6), G);
  A.cel(rr(39, 105, 24, 9, 4), '#7a4523');
  A.cel(rr(64, 105, 28, 9, 4), '#7a4523');
  // back arm + tunic
  A.limb('M44 78Q32 84 34 94', G, 9);
  A.cel('M42 74Q40 66 52 65L80 65Q93 67 91 80L89 100Q66 109 44 101Z', '#c0703a');
  A.cel(rr(42, 88, 48, 8, 3), GOLD, { k: 3 });
  A.cel(rr(60, 87, 10, 10, 2), '#ffe58a', { k: 2, sw: 3 });
  // ears + head
  A.cel('M45 45L10 28Q12 48 24 58L46 62Z', G);
  A.cel('M90 42L120 26Q118 46 106 56L90 60Z', G);
  A.cel(ell(68, 50, 28, 25), G);
  A.cel(ell(97, 56, 6, 5), G, { k: 3, sw: 3 });
  A.eye(60, 48, 7, 8.5, { px: 2, sclera: '#fff6b8' });
  A.eye(80, 48, 7, 8.5, { px: 2, sclera: '#fff6b8' });
  A.limb('M49 37L68 44', OUT, 4, { sw: 0, hi: false });
  A.limb('M92 36L74 44', OUT, 4, { sw: 0, hi: false });
  A.flat('M55 62Q74 80 93 60Q74 67 55 62Z', '#5b1d2e', { sw: 3 });
  A.flat('M62 64l5 1-3 7z', '#fff', { sw: 2 });
  A.flat('M80 65l5-2-2 8z', '#fff', { sw: 2 });
  // dagger
  A.cel('M101 80L110 42L118 80Z', STEEL, { k: 3, sw: 3.5 });
  A.cel(rr(95, 78, 29, 7, 3), GOLD, { k: 2, sw: 3.5 });
  A.limb('M86 82L104 90', G, 9);
  A.cel(ell(107, 90, 8, 7), G, { k: 3, sw: 3.5 });
  return A;
};

// ---------------------------------------------------------------------------------- rat
enemies.rat = () => {
  const R = '#9a8272', A = E('rt');
  A.shadow(62, 114, 38, 6);
  // speed lines
  A.stroke('M4 70H20M0 84H16M6 98H18', '#fff', 3, ' opacity=".7"');
  // tail
  A.limb('M36 92Q8 100 14 74Q18 58 34 62', '#e8a2ab', 5, { hi: false });
  // far legs
  A.cel(ell(46, 108, 9, 5), '#e8a2ab', { k: 2, sw: 3.5 });
  A.cel(ell(82, 108, 9, 5), '#e8a2ab', { k: 2, sw: 3.5 });
  // body
  A.cel('M26 90Q22 64 54 62Q86 58 96 78Q98 100 70 104Q36 108 26 90Z', R);
  A.cel('M44 98Q64 106 88 94Q76 106 60 106Z', '#d9c4b3', { k: 2, sw: 0, sh: false, hi: false, line: false });
  A.cel(ell(60, 110, 10, 5.5), '#e8a2ab', { k: 2, sw: 3.5 });
  A.cel(ell(96, 108, 10, 5.5), '#e8a2ab', { k: 2, sw: 3.5 });
  // ears
  A.cel(ell(86, 56, 12, 13), R);
  A.flat(ell(87, 57, 6.5, 8), '#f4a9b8', { sw: 0 });
  A.cel(ell(70, 62, 9, 10), shade(R, 0.15));
  A.flat(ell(70, 63, 4.5, 6), '#f4a9b8', { sw: 0 });
  // head w/ snout
  A.cel('M72 78Q74 56 96 58Q112 62 121 80Q116 96 96 96Q74 96 72 78Z', R);
  A.cel(ell(120, 80, 6, 5.5), '#f4849c', { k: 2, sw: 3.5 });
  A.eye(98, 72, 7.5, 8.5, { px: 2.5 });
  A.limb('M88 62L104 67', OUT, 3.5, { sw: 0, hi: false });
  A.stroke('M104 86L124 90M104 90L122 98', '#fff', 2, ' opacity=".9"');
  A.flat('M104 94l6 0-1 9-5-1z', '#fff', { sw: 2.5 });
  A.flat('M111 94l6 0-1 9-5-1z', '#fff', { sw: 2.5 });
  return A;
};

// ---------------------------------------------------------------------------------- orc
enemies.orc = () => {
  const S = '#5f9a3c', IRON = '#7d8099', A = E('oc');
  A.shadow(62, 115, 40, 7);
  // axe behind
  A.limb('M104 112L100 22', '#7a4523', 8, { hi: false });
  A.cel('M98 16Q122 14 124 36Q112 52 98 46Q106 30 98 16Z', STEEL);
  A.cel('M98 16Q88 22 90 32Q92 42 98 46Q102 30 98 16Z', '#8d8fa8', { k: 3, sw: 3.5 });
  // legs
  A.cel(rr(36, 92, 20, 22, 7), S);
  A.cel(rr(66, 92, 20, 22, 7), S);
  A.cel(rr(30, 104, 30, 11, 4), '#5a4a5c');
  A.cel(rr(62, 104, 34, 11, 4), '#5a4a5c');
  // body
  A.cel('M30 70Q30 58 48 56L80 56Q98 58 96 74L90 100Q62 110 36 100Z', S);
  A.cel('M36 64Q64 58 92 66L88 98Q62 106 40 98Z', IRON);
  A.cel(rr(34, 90, 56, 9, 3), '#a8673a', { k: 3, sw: 3.5 });
  A.dot(48, 77, 2.6, '#2b1d3a'); A.dot(76, 77, 2.6, '#2b1d3a');
  A.stroke('M62 62V92', OUT, 3);
  A.dot(46, 76, 1.6, '#e0e3f5'); A.dot(74, 76, 1.6, '#e0e3f5');
  // arms + pauldrons
  A.limb('M30 76Q20 90 26 100', S, 13);
  A.cel(ell(98, 62, 14, 12), IRON);
  A.cel(ell(30, 62, 14, 12), IRON);
  A.dot(98, 58, 3, '#e0e3f5'); A.dot(30, 58, 3, '#e0e3f5');
  A.limb('M94 70Q104 82 104 96', S, 13);
  A.cel(ell(104, 98, 9, 8), S, { k: 3 });
  // head
  A.cel(ell(64, 38, 24, 20), S);
  A.cel('M42 38Q42 14 64 14Q88 14 86 38Q64 28 42 38Z', IRON);
  A.cel('M64 8L58 20L70 20Z', IRON, { k: 2, sw: 3 });
  A.cel('M46 22L36 12L52 18Z', STEEL, { k: 2, sw: 3 });
  A.cel('M82 22L92 12L76 18Z', STEEL, { k: 2, sw: 3 });
  A.cel('M50 46Q64 62 80 46Q80 56 64 62Q50 56 50 46Z', S, { k: 3 });
  A.eye(55, 37, 6, 6, { px: 1.5, pupil: '#c8281e', sclera: '#fff3b0' });
  A.eye(74, 37, 6, 6, { px: 1.5, pupil: '#c8281e', sclera: '#fff3b0' });
  A.limb('M46 30L60 36', OUT, 4, { sw: 0, hi: false });
  A.limb('M82 30L68 36', OUT, 4, { sw: 0, hi: false });
  A.flat('M52 48l-4-12 8 8z', BONE, { sw: 3 });
  A.flat('M76 48l4-12-8 8z', BONE, { sw: 3 });
  return A;
};

// ---------------------------------------------------------------------------------- skeleton
enemies.skeleton = () => {
  const A = E('sk');
  A.shadow(62, 114, 32, 6.5);
  // legs
  A.limb('M52 90V106', BONE, 7);
  A.limb('M72 90V106', BONE, 7);
  A.cel(rr(42, 104, 20, 9, 4), BONE, { k: 3 });
  A.cel(rr(64, 104, 24, 9, 4), BONE, { k: 3 });
  // pelvis + ribcage
  A.cel(rr(46, 84, 34, 10, 4), BONE, { k: 3 });
  A.limb('M63 58V86', BONE, 7);
  A.cel('M40 62Q40 54 62 54Q86 54 84 64Q86 80 62 82Q40 80 40 62Z', BONE);
  A.stroke('M46 63H80M47 70H79M52 77H74', OUT, 3);
  // back arm (sword)
  A.limb('M44 62Q30 70 28 84', BONE, 7);
  A.cel('M20 84L24 56L32 84Z', STEEL, { k: 3, sw: 3.5 });
  A.cel(rr(16, 82, 20, 6, 3), '#7a4523', { k: 2, sw: 3.5 });
  // skull
  A.cel('M36 36Q36 12 62 12Q88 12 88 36Q88 46 80 50L80 56L44 56L44 50Q36 46 36 36Z', BONE);
  A.cel(ell(50, 36, 10, 11), '#3b2a4a', { sh: false, hi: false, sw: 3 });
  A.cel(ell(74, 36, 10, 11), '#3b2a4a', { sh: false, hi: false, sw: 3 });
  A.dot(53, 37, 4.2, '#ff9a3b'); A.dot(77, 37, 4.2, '#ff9a3b');
  A.dot(54, 35.5, 1.4, '#fff3b0'); A.dot(78, 35.5, 1.4, '#fff3b0');
  A.flat('M62 44l-4 8h8z', '#3b2a4a', { sw: 2.5 });
  A.flat('M46 53H80V58H46z', BONE, { sw: 3 });
  A.stroke('M54 54V58M62 54V58M70 54V58', OUT, 2.5);
  // shield in front
  A.cel(ell(88, 76, 27, 28), WOOD);
  A.cel(ell(88, 76, 21, 22), '#cf8c55', { sw: 3 });
  A.stroke('M88 54V98M66 76H110', '#7a4523', 4);
  A.cel(ell(88, 76, 8, 8), GOLD, { k: 3, sw: 3.5 });
  A.stroke(ell(88, 76, 27, 28), STEEL, 3.5, ' stroke-dasharray="6 5"');
  // hand
  A.cel(ell(66, 72, 7, 6), BONE, { k: 2, sw: 3.5 });
  return A;
};

// ---------------------------------------------------------------------------------- bat
enemies.bat = () => {
  const P = '#8b5fcc', M = '#5e3aa0', A = E('bt');
  A.shadow(64, 118, 20, 3.5, 0.14);
  // wings
  const wing = (s) => {
    const X = (x) => 64 + s * (x - 64);
    return `M${X(54)} 58Q${X(30)} 26 ${X(4)} 30Q${X(10)} 44 ${X(8)} 52Q${X(16)} 56 ${X(18)} 68Q${X(28)} 68 ${X(34)} 82Q${X(44)} 76 ${X(50)} 84Z`;
  };
  A.cel(wing(-1), M);
  A.cel(wing(1), M);
  const bones = (s) => { const X = (x) => 64 + s * (x - 64); return `M${X(54)} 62L${X(6)} 32M${X(54)} 64L${X(18)} 68M${X(54)} 66L${X(36)} 82`; };
  A.stroke(bones(-1), shade(M, 0.45), 3);
  A.stroke(bones(1), shade(M, 0.45), 3);
  // ears
  A.cel('M50 36L46 14L62 28Z', P, { k: 3 });
  A.cel('M74 28L86 14L84 38Z', P, { k: 3 });
  // body + head
  A.cel(ell(64, 76, 17, 20), P);
  A.cel(ell(64, 78, 10, 13), '#c9a6f2', { k: 3, sw: 0, line: false });
  A.cel(ell(66, 52, 21, 19), P);
  A.eye(58, 50, 7, 8.5, { px: 2, sclera: '#fff3a0', pupil: '#c8281e' });
  A.eye(76, 50, 7, 8.5, { px: 2, sclera: '#fff3a0', pupil: '#c8281e' });
  A.limb('M48 42L63 48', OUT, 4, { sw: 0, hi: false });
  A.limb('M82 42L69 48', OUT, 4, { sw: 0, hi: false });
  A.flat('M58 62Q66 68 76 62Q66 66 58 62Z', '#5b1d2e', { sw: 3 });
  A.flat('M60 64l3 0-1.5 6z', '#fff', { sw: 2 });
  A.flat('M72 64l3 0-1.5 6z', '#fff', { sw: 2 });
  // feet
  A.limb('M58 94V100M70 94V100', '#c9a6f2', 5, { hi: false });
  return A;
};

// ---------------------------------------------------------------------------------- shaman
enemies.shaman = () => {
  const G = '#58bd72', ROBE = '#d0642e', A = E('sh');
  A.shadow(58, 114, 32, 6.5);
  // staff
  A.limb('M104 116L103 34', '#7a4523', 7, { hi: false });
  A.glow(103, 24, 24, '#6ff06a');
  A.cel(ell(103, 24, 11, 11), '#8bf06a', { k: 4, sw: 4 });
  A.dot(99, 20, 3.2, '#fff');
  A.stroke('M92 34Q103 42 114 34', GOLD, 4);
  // feathers on staff
  A.cel('M92 38Q80 44 82 58Q92 54 96 40Z', '#e05a3a', { k: 3, sw: 3 });
  A.cel('M114 38Q124 46 122 58Q112 54 110 40Z', '#35b8c8', { k: 3, sw: 3 });
  // robe (bell)
  A.cel(rr(42, 106, 14, 8, 3), '#7a4523', { k: 2 });
  A.cel(rr(62, 106, 18, 8, 3), '#7a4523', { k: 2 });
  A.cel('M40 74Q38 64 54 62L74 62Q88 64 84 76L92 108Q60 118 30 108Z', ROBE);
  A.stroke('M40 96Q60 104 86 96', GOLD, 4);
  A.flat('M50 82l6 8-6 8-6-8z', '#ffe58a', { sw: 2.5 });
  A.limb('M82 76L100 70', G, 9);
  A.cel(ell(103, 68, 7, 7), G, { k: 3, sw: 3.5 });
  // ears + head
  A.cel('M40 46L8 36Q12 52 24 58L42 60Z', G);
  A.cel('M88 44L112 36Q112 50 102 56L88 58Z', G);
  A.cel(ell(64, 50, 25, 22), G);
  A.cel(ell(88, 55, 5.5, 4.5), G, { k: 3, sw: 3 });
  A.eye(57, 49, 6.5, 7.5, { px: 2, sclera: '#fff6b8' });
  A.eye(75, 49, 6.5, 7.5, { px: 2, sclera: '#fff6b8' });
  A.limb('M47 40L63 45', OUT, 3.5, { sw: 0, hi: false });
  A.limb('M84 40L69 45', OUT, 3.5, { sw: 0, hi: false });
  A.flat('M56 62Q70 72 84 60Q70 66 56 62Z', '#5b1d2e', { sw: 3 });
  // feather headdress
  A.cel('M50 32Q42 14 52 9Q58 20 60 30Z', '#e05a3a', { k: 3, sw: 3.5 });
  A.cel('M60 28Q58 9 70 5Q74 16 70 28Z', GOLD, { k: 3, sw: 3.5 });
  A.cel('M72 30Q76 12 90 12Q86 24 80 34Z', '#35b8c8', { k: 3, sw: 3.5 });
  A.cel(rr(48, 28, 40, 8, 4), '#a8673a', { k: 3, sw: 3.5 });
  return A;
};

// ---------------------------------------------------------------------------------- summoner
enemies.summoner = () => {
  const C = '#5a3792', A = E('su');
  A.shadow(58, 115, 34, 6.5);
  // portal swirl behind book
  A.glow(100, 66, 26, '#e05ad6', 0.8);
  A.stroke(ell(100, 68, 15, 21), '#ff9af0', 4);
  A.stroke('M100 52Q108 62 100 70Q92 76 100 86', '#ffe0fb', 3);
  // cloak
  A.cel('M64 8Q36 10 34 40Q30 60 22 100Q22 116 64 116Q100 116 96 100Q90 60 92 40Q90 10 64 8Z', C);
  A.cel('M64 20Q78 26 80 44Q64 36 48 44Q50 26 64 20Z', shade(C, 0.5), { sh: false, hi: false, sw: 0, line: false });
  A.stroke('M32 104Q64 112 92 104', '#e05ad6', 4);
  // face void + eyes
  A.cel(ell(64, 44, 20, 17), '#1d1230', { sh: false, hi: false, sw: 3.5 });
  A.add('<circle cx="57" cy="44" r="8.5" fill="#5ef0ff" opacity=".28"/><circle cx="73" cy="44" r="8.5" fill="#5ef0ff" opacity=".28"/>');
  A.dot(57, 44, 4.6, '#5ef0ff'); A.dot(73, 44, 4.6, '#5ef0ff');
  A.dot(57, 44, 4.2, '#c9fbff'); A.dot(73, 44, 4.2, '#c9fbff');
  A.limb('M47 34L60 40', OUT, 3.5, { sw: 0, hi: false });
  A.limb('M81 34L68 40', OUT, 3.5, { sw: 0, hi: false });
  // hood rim
  A.stroke('M44 34Q64 12 84 34', light(C, 0.35), 3.5);
  // sleeve + hand
  A.limb('M82 80L92 74', C, 12);
  // tome
  A.cel('M80 70L102 64L102 94L80 100Z', '#8a2c4a', { k: 3, sw: 3.5 });
  A.cel('M84 70L100 66L100 90L84 95Z', '#fff2cf', { k: 2, sw: 3 });
  A.stroke('M87 76L97 73M87 82L97 79M87 88L97 85', '#b25ab0', 2);
  A.cel(ell(80, 99, 6, 5.5), '#7a5ab2', { k: 2, sw: 3.5 });
  // belt
  A.cel(rr(42, 82, 44, 7, 3), GOLD, { k: 3, sw: 3.5 });
  return A;
};

// ---------------------------------------------------------------------------------- troll
enemies.troll = () => {
  const T = '#6c8db0', A = E('tr');
  A.shadow(60, 116, 48, 7);
  // club
  A.limb('M100 112L97 46', '#8a5230', 14, { hi: true });
  A.cel('M84 54Q80 16 100 12Q118 16 114 54Q100 64 84 54Z', '#a8673a');
  A.cel('M88 20L80 12L92 16Z', STEEL, { k: 2, sw: 3 });
  A.cel('M110 18L120 12L114 26Z', STEEL, { k: 2, sw: 3 });
  A.cel('M84 42L75 42L84 50Z', STEEL, { k: 2, sw: 3 });
  A.cel('M114 44L122 46L112 54Z', STEEL, { k: 2, sw: 3 });
  // legs
  A.cel(rr(24, 88, 32, 26, 10), T);
  A.cel(rr(60, 88, 32, 26, 10), T);
  A.cel(ell(40, 112, 17, 6), shade(T, 0.2), { k: 2, sw: 3.5 });
  A.cel(ell(80, 112, 19, 6), shade(T, 0.2), { k: 2, sw: 3.5 });
  // belly
  A.cel('M14 66Q14 40 54 38Q98 38 98 70Q98 104 56 104Q14 100 14 66Z', T);
  A.cel(ell(52, 78, 24, 18), light(T, 0.3), { k: 4, sw: 0, line: false });
  A.cel('M16 88Q56 108 96 88L98 98Q56 118 14 98Z', '#8a5a30', { k: 3, sw: 4 });
  // far arm, near arm gripping club
  A.limb('M24 56Q6 74 14 94', T, 17);
  A.limb('M88 56Q100 70 100 90', T, 17);
  A.cel(ell(100, 92, 11, 10), T, { k: 4 });
  // head (small, forward)
  A.cel(ell(58, 36, 24, 20), T);
  A.cel('M36 26Q36 12 56 12Q78 12 80 26Q58 18 36 26Z', '#4a8a4a', { k: 3, sw: 3.5 });
  A.cel('M44 44Q58 64 76 44Q70 58 58 60Q46 56 44 44Z', shade(T, 0.1), { k: 3, sw: 3.5 });
  A.eye(51, 36, 6.5, 6, { px: 1.5, pupil: '#d03a2a', sclera: '#fff3b0' });
  A.eye(68, 36, 6.5, 6, { px: 1.5, pupil: '#d03a2a', sclera: '#fff3b0' });
  A.limb('M40 28L56 34', OUT, 5, { sw: 0, hi: false });
  A.limb('M78 28L63 34', OUT, 5, { sw: 0, hi: false });
  A.cel(ell(60, 46, 4, 3), shade(T, 0.3), { sh: false, hi: false, sw: 2.5 });
  A.flat('M48 52l-3-10 7 6z', BONE, { sw: 3 });
  A.flat('M72 52l3-10-7 6z', BONE, { sw: 3 });
  // ears
  A.cel(ell(34, 38, 6, 8), T, { k: 2, sw: 3.5 });
  A.cel(ell(82, 38, 6, 8), T, { k: 2, sw: 3.5 });
  return A;
};

// ---------------------------------------------------------------------------------- stoneling
enemies.stoneling = () => {
  const R = '#9a9bb3', A = E('st');
  A.shadow(62, 114, 38, 7);
  // legs
  A.cel(rr(40, 92, 20, 22, 7), '#7a7c96');
  A.cel(rr(68, 92, 20, 22, 7), '#7a7c96');
  // arms
  A.cel('M26 66L10 76L12 96L28 98L34 82Z', R, { k: 4 });
  A.cel('M98 66L118 74L116 96L98 98L94 82Z', R, { k: 4 });
  // body rock
  A.cel('M26 70L32 40L52 24L78 22L98 38L104 66L100 98L78 106L44 106L26 94Z', R);
  A.cel('M32 40L52 24L56 40L44 52Z', '#c4c5d9', { sh: false, hi: false, sw: 0, line: false });
  A.cel('M46 64L56 56L68 62L66 76L52 78Z', '#b3b4cb', { sh: false, hi: false, sw: 0, line: false });
  A.stroke('M44 24L50 40L40 52M96 60L84 72L90 90M54 106L58 94', '#5d5f7a', 3);
  // moss
  A.cel('M32 40L46 28L60 30L50 40L40 46Z', '#6aa83f', { k: 3, sw: 3.5 });
  // eyes (glowing)
  A.cel(ell(54, 62, 11, 11), '#2b1d3a', { sh: false, hi: false, sw: 3 });
  A.cel(ell(80, 62, 11, 11), '#2b1d3a', { sh: false, hi: false, sw: 3 });
  A.glow(54, 62, 12, '#5ef0ff'); A.glow(80, 62, 12, '#5ef0ff');
  A.dot(56, 62, 5, '#c9fbff'); A.dot(82, 62, 5, '#c9fbff');
  A.limb('M42 49L62 55', OUT, 4.5, { sw: 0, hi: false });
  A.limb('M92 49L74 55', OUT, 4.5, { sw: 0, hi: false });
  A.stroke('M56 82Q68 88 80 80', OUT, 4);
  // rune
  A.stroke('M66 92V100M60 96H72', '#5ef0ff', 3);
  return A;
};

// ---------------------------------------------------------------------------------- imp
enemies.imp = () => {
  const R = '#e8523a', M = '#a22f48', A = E('im');
  A.shadow(64, 118, 18, 3.5, 0.14);
  // wings
  A.cel('M52 62Q30 30 6 36Q14 48 12 56Q22 58 24 70Q36 66 40 78Q50 74 54 80Z', M, { k: 4 });
  A.cel('M76 56Q92 30 112 30Q108 42 110 50Q104 54 100 62Q92 58 90 70Q80 70 78 76Z', M, { k: 4 });
  // tail
  A.limb('M50 92Q30 108 18 94', R, 6, { hi: false });
  A.cel('M12 96L8 82L24 90Z', R, { k: 2, sw: 3.5 });
  // legs
  A.cel(ell(56, 102, 8, 12), R, { k: 3 });
  A.cel(ell(76, 102, 8, 12), R, { k: 3 });
  A.cel(rr(50, 108, 14, 7, 3), '#6a2a3a', { k: 2, sw: 3 });
  A.cel(rr(72, 108, 16, 7, 3), '#6a2a3a', { k: 2, sw: 3 });
  // body
  A.cel(ell(66, 82, 20, 22), R);
  A.cel(ell(68, 86, 11, 14), '#ffb27a', { k: 3, sw: 0, line: false });
  A.limb('M82 80L98 70', R, 8);
  A.cel(ell(100, 68, 6.5, 6.5), R, { k: 3, sw: 3.5 });
  // horns
  A.cel('M50 36L42 12L64 28Z', '#f4e2b0', { k: 3, sw: 3.5 });
  A.cel('M76 28L92 12L90 40Z', '#f4e2b0', { k: 3, sw: 3.5 });
  // head
  A.cel(ell(68, 52, 24, 21), R);
  A.eye(60, 50, 7, 8, { px: 2, sclera: '#fff3a0', pupil: '#2b1d3a' });
  A.eye(78, 50, 7, 8, { px: 2, sclera: '#fff3a0', pupil: '#2b1d3a' });
  A.limb('M50 40L65 47', OUT, 4, { sw: 0, hi: false });
  A.limb('M88 40L73 47', OUT, 4, { sw: 0, hi: false });
  A.flat('M56 63Q70 78 86 62Q70 68 56 63Z', '#5b1d2e', { sw: 3 });
  A.flat('M60 65l4 1-2 5z', '#fff', { sw: 2 });
  A.flat('M76 66l4-1-2 6z', '#fff', { sw: 2 });
  return A;
};

// ==================================================================================== bosses
bosses.goblinKing = () => {
  const G = '#4fb36b', CAPE = '#b52f4a', A = B('gk');
  A.shadow(160, 298, 124, 16);
  // cape
  A.cel('M104 100Q50 150 28 292Q110 306 196 292L200 140Z', CAPE, { k: 14 });
  A.stroke('M34 276Q110 292 192 278', '#ffe58a', 8);
  // legs
  A.cel(rr(108, 244, 44, 48, 18), G, { k: 10 });
  A.cel(rr(176, 244, 44, 48, 18), G, { k: 10 });
  A.cel(rr(96, 276, 62, 20, 10), '#7a4523', { k: 6 });
  A.cel(rr(172, 276, 70, 20, 10), '#7a4523', { k: 6 });
  // belly
  A.cel('M92 170Q90 120 160 116Q236 118 236 176Q238 262 164 266Q94 264 92 170Z', G, { k: 14 });
  A.cel(ell(164, 202, 52, 46), light(G, 0.28), { k: 10, sw: 0, line: false });
  A.cel('M96 224Q164 252 232 222L234 246Q164 278 94 248Z', '#7a4523', { k: 8, sw: 8 });
  A.cel(rr(144, 226, 40, 32, 6), GOLD, { k: 6, sw: 6 });
  A.cel(rr(156, 236, 16, 14, 3), '#ffe58a', { k: 4, sw: 5 });
  // fur collar
  A.cel('M96 130Q130 160 164 150Q200 160 232 130Q232 118 214 112L110 114Q96 120 96 130Z', '#e8dcc0', { k: 8 });
  // far arm
  A.limb('M104 150Q70 190 90 230', G, 36);
  // ears + head
  A.cel('M96 82L16 56Q20 106 62 126L100 118Z', G, { k: 10 });
  A.cel('M222 84L284 70Q284 108 252 124L216 116Z', G, { k: 10 });
  A.cel('M90 88L36 70Q40 96 66 110Z', '#f4a9b8', { sh: false, hi: false, sw: 0, line: false });
  A.cel(ell(162, 98, 70, 56), G, { k: 12 });
  A.cel(ell(216, 114, 14, 11), G, { k: 6, sw: 7 });
  A.eye(138, 92, 15, 18, { px: 5, sclera: '#fff6b8', sw: 6 });
  A.eye(188, 92, 15, 18, { px: 5, sclera: '#fff6b8', sw: 6 });
  A.limb('M112 70L150 86', OUT, 11, { sw: 0, hi: false });
  A.limb('M214 70L176 86', OUT, 11, { sw: 0, hi: false });
  A.flat('M122 128Q166 168 214 124Q166 140 122 128Z', '#5b1d2e', { sw: 7 });
  A.flat('M134 135l-6-22 18 18z', '#fff', { sw: 6 });
  A.flat('M200 133l8-24-20 16z', '#fff', { sw: 6 });
  // crown
  A.cel('M112 62L106 20L136 40L162 6L188 40L218 20L212 62Q162 74 112 62Z', GOLD, { k: 9 });
  A.cel(rr(112, 54, 100, 16, 6), '#ffe58a', { k: 5, sw: 7 });
  A.cel(ell(162, 36, 9, 9), '#e0394f', { k: 4, sw: 5 });
  A.cel(ell(134, 54, 6, 6), '#35b8c8', { k: 3, sw: 4 });
  A.cel(ell(190, 54, 6, 6), '#35b8c8', { k: 3, sw: 4 });
  // spiked mace (in front of the ear), then the gripping arm
  A.limb('M266 300L270 118', '#7a4523', 22, { hi: true });
  A.cel('M236 98L246 66L262 76L274 44L288 74L308 70L302 98L316 116L296 128L298 154L272 140L246 156L248 128L230 118Z', '#6a6f88', { k: 11 });
  A.cel(ell(270, 106, 24, 24), '#8d8fa8', { k: 7, sw: 7 });
  A.cel(ell(262, 98, 7, 7), '#c9ccdd', { sh: false, hi: false, sw: 0, line: false });
  A.limb('M222 160Q252 170 262 206', G, 36);
  A.cel(ell(268, 212, 25, 23), G, { k: 8 });
  return A;
};

bosses.stoneGolem = () => {
  const S = '#8d8fa8', CY = '#5ef0ff', A = B('sg');
  A.shadow(160, 298, 130, 17);
  // legs
  A.cel('M96 220L136 220L144 290L84 290Z', '#74768f', { k: 10 });
  A.cel('M184 220L226 220L238 290L176 290Z', '#74768f', { k: 10 });
  A.cel(rr(72, 276, 78, 20, 8), '#5f617a', { k: 6 });
  A.cel(rr(170, 276, 86, 20, 8), '#5f617a', { k: 6 });
  // far arm
  A.cel('M72 130L30 150L16 230L56 262L100 236L104 150Z', '#7b7d97', { k: 11 });
  // torso
  A.cel('M78 120L104 80L216 80L248 124L240 224L204 250L118 250L84 224Z', S, { k: 14 });
  A.cel('M104 80L216 80L206 100L112 100Z', '#b9bbd1', { sh: false, hi: false, sw: 0, line: false });
  A.cel('M92 224L118 250L100 236Z', '#686a85', { sh: false, hi: false, sw: 0, line: false });
  A.stroke('M110 112L132 140L116 168M230 140L204 158L216 196M150 250L160 224', '#5d5f7a', 6);
  // moss
  A.cel('M96 98L130 80L170 84L150 102L120 112Z', '#6aa83f', { k: 6, sw: 6 });
  A.cel('M214 90L244 118L224 126L206 108Z', '#6aa83f', { k: 6, sw: 6 });
  // chest rune core
  A.glow(162, 170, 62, CY, 0.9);
  A.cel(ell(162, 170, 28, 28), '#16384a', { sh: false, hi: false, sw: 7 });
  A.stroke('M162 148V192M144 160L180 180M180 160L144 180', CY, 6);
  A.stroke(ell(162, 170, 16, 16), '#c9fbff', 4);
  A.stroke('M116 206H146M178 206H208M124 222H140M184 222H200', CY, 6);
  // head
  A.cel('M118 76L124 28L160 12L204 28L208 76L186 88L136 88Z', '#9c9eb6', { k: 11 });
  A.cel('M124 28L160 12L170 30L136 40Z', '#c9cbe0', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(130, 46, 38, 18, 5), '#16384a', { sh: false, hi: false, sw: 6 });
  A.cel(rr(176, 46, 28, 18, 5), '#16384a', { sh: false, hi: false, sw: 6 });
  A.glow(150, 55, 24, CY); A.glow(190, 55, 22, CY);
  A.cel(rr(138, 51, 24, 8, 3), '#c9fbff', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(182, 51, 16, 8, 3), '#c9fbff', { sh: false, hi: false, sw: 0, line: false });
  A.limb('M124 38L168 48', OUT, 8, { sw: 0, hi: false });
  A.stroke('M146 76H190', OUT, 6);
  // near arm (big fist, forward)
  A.cel('M244 128L292 148L308 232L270 270L222 244L214 150Z', S, { k: 12 });
  A.cel('M252 160L286 176L296 220L270 252L236 232Z', '#74768f', { sh: false, hi: false, sw: 0, line: false });
  A.stroke('M250 196H282M258 214H274', CY, 6);
  A.glow(266, 204, 30, CY, 0.5);
  A.stroke('M262 150L272 172L256 188', '#5d5f7a', 5);
  return A;
};

bosses.dragon = () => {
  const R = '#e04a34', O = '#ff9a3b', BEL = '#ffd98a', A = B('dr');
  A.shadow(160, 306, 70, 9, 0.16);
  // wings (behind the body): far wing darker and offset back
  const wing = (dx, dy) => {
    const P = (x, y) => `${x + dx} ${y + dy}`;
    return `M${P(165, 156)}L${P(122, 28)}Q${P(70, 8)} ${P(16, 28)}Q${P(52, 58)} ${P(14, 104)}Q${P(58, 108)} ${P(66, 150)}Q${P(112, 132)} ${P(166, 164)}Z`;
  };
  const bones = (dx, dy) => `M${122 + dx} ${28 + dy}L${16 + dx} ${28 + dy}M${122 + dx} ${28 + dy}L${14 + dx} ${104 + dy}M${122 + dx} ${28 + dy}L${66 + dx} ${150 + dy}`;
  A.cel(wing(26, -8), '#b22f2a', { k: 11 });
  A.stroke(bones(26, -8), '#6e1c24', 6);
  A.cel(wing(0, 0), O, { k: 12 });
  A.stroke(bones(0, 0), '#b22f2a', 7);
  // tail
  A.limb('M112 206Q50 214 42 250Q40 282 76 286', R, 34);
  A.cel('M52 268L92 262L84 304L50 296L60 282Z', O, { k: 7, sw: 8 });
  // hind leg
  A.cel('M122 220Q104 250 122 276L164 270L158 230Z', R, { k: 9 });
  A.cel('M118 270L168 266L170 290L112 294Z', BEL, { k: 5, sw: 7 });
  // body
  A.cel('M96 176Q100 130 170 128Q226 130 232 180Q226 240 160 244Q98 240 96 176Z', R, { k: 14 });
  A.cel('M130 176Q170 152 218 172Q214 226 160 232Q132 224 130 176Z', BEL, { k: 8, sw: 0, line: false });
  A.stroke('M146 190H208M146 206H204M150 220H196', '#e0a24a', 5);
  // wing arm
  A.limb('M168 156Q154 84 122 30', R, 18);
  A.cel(ell(122, 28, 11, 11), BEL, { k: 4, sw: 6 });
  // front leg
  A.cel('M184 220Q176 252 196 270L232 262L214 226Z', R, { k: 8 });
  A.cel('M194 264L238 258L240 284L190 286Z', BEL, { k: 5, sw: 7 });
  // spikes along back
  A.cel('M112 160L98 128L136 142Z', O, { k: 5, sw: 6 });
  A.cel('M184 134L200 104L214 140Z', O, { k: 5, sw: 6 });
  // neck + head
  A.limb('M200 174Q238 158 244 116', R, 46);
  A.cel('M222 112Q220 68 256 64Q298 66 312 98Q306 124 272 130Q244 142 222 112Z', R, { k: 11 });
  A.cel('M264 114Q296 106 308 108Q304 126 272 130Z', BEL, { sh: false, hi: false, sw: 0, line: false });
  A.cel(ell(300, 94, 6, 5), shade(R, 0.5), { sh: false, hi: false, sw: 4 });
  A.eye(258, 92, 11, 13, { px: 3, sclera: '#fff3a0', pupil: '#2b1d3a', sw: 6 });
  A.limb('M238 76L272 88', OUT, 8, { sw: 0, hi: false });
  A.flat('M272 124l4 12 6-12zM288 120l4 10 5-12z', '#fff', { sw: 5 });
  // horns
  A.cel('M236 74L212 40L252 64Z', '#f4e2b0', { k: 5, sw: 7 });
  A.cel('M254 64L246 28L278 58Z', '#f4e2b0', { k: 5, sw: 7 });
  return A;
};

mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
let total = 0;
for (const [prefix, set] of [['enemy_', enemies], ['boss_', bosses]]) {
  for (const [id, fn] of Object.entries(set)) {
    if (only.length && !only.includes(id)) continue;
    const s = fn().toString();
    writeFileSync(join(out, prefix + id + '.svg'), s);
    total += s.length;
    console.log(prefix + id, (s.length / 1024).toFixed(1) + ' KB');
  }
}
console.log('total', (total / 1024).toFixed(1) + ' KB');
