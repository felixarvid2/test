'use strict';
// Procedurell bangenerator för KRYPTA: fem biomer som delar ett rutnäts-API, en flood fill-pass (connectRegions)
// och en gemensam innehållspass (content: rumstyper, rekvisita, föremål, fiendegrupper, vaktarens sal).
//   Gen.floor(seed, depth, opts)  -> banobjekt (kartsträngar + tema) för djup 1-5
//   Gen.boss(seed, opts)          -> bossarena (opts.arena: 'hall' | 'graveyard' | 'cave' | 'forest', opts.boss: vaktar-id)
//   Gen.validate(level)           -> lista med felsträngar (tom = OK)
//   Gen.THEMES                    -> fängelsehålans teman (väggtecken, golv/tak, dimma, namn)
//   Gen.BIOMES                    -> biomer (id, namn, utomhus, vikt, djup)
//   Gen.GUARDIANS                 -> bossar/vaktare (id -> väggtecken, golvtextur, ljus, dekor)
//   Gen.ARCHES                    -> rumstypernas id
// opts för floor: { biome: id, shop: bool, weapon: ett tecken ur WEAPON_CHARS, theme: id|index (bara dungeon),
//   guardian: 'demon' | 'beast' | 'nightmare' | 'ogre' | 'ghost' (annars väljs den ur seeden) }
//
// Biomer: dungeon (rum i olika former + korridorer), caves (cellautomat), graveyard (öppet fält med prefabs),
//   forest (brusmask + slingrande stig), courtyard (borggård omgiven av byggnadslängor)
// Varje vanlig våning har en vaktares sal (rumstyp 'guardian') med Z i mitten, väggar i vaktarens väggtecken och
//   golv i vaktarens golvtextur. Fält utöver kartan: biome, guardian (vaktar-id), sky (null inomhus, annars '1' öppen
//   himmel / '0' tak per ruta), floors (golvtexturer, [0] = floor, högst 10) + floorMask ('0'-'9' per ruta = index i floors),
//   ceil (tak där sky är '0'), roomMask ('-' utanför rum, annars tecknet 48 + index i rooms), rooms ({x, y, w, h, type,
//   arch, tag?, guardian?}; type: start exit normal elite treasure shop shrine secret guardian)
//
// Tecken:
//  1-5 vägg   6 skogsbryn   7 kyrkogårdsmur   8 grottberg   9 timmervägg
//  # demon (blod-/köttegel)  % best (obsidian med lavasprickor)  ~ mardröm (mörkt järn, blå runor)
//  & ogre (timmerpalissad med ben)  = vålnad (blek spökkapellsten)     (alla fem är väggar)
//  D dörr   G grind   * hemlig vägg   x utgång   P start   S K V I L N O R W fiender   E elitfiende   B boss
//  Z vaktare (våningens miniboss)   Q mimic (ser ut som en kista, är en fiende)
//  h a A $ C föremål (C kortkista), g r m d b s p vapen (se WEAPON_CHARS)   M köpman (blockerar)
//  f eldfat (blockerar, ljuskälla)   t träd, n gravsten (blockerar men är sprites)   o kruka   . golv
//  Rekvisita (sprites), B = blockerar:
//  c kandelaber (ljus)  k kista/likkista (B)  j benhög  q bokhylla (B)  u staty (B)  v bur med skelett (B)
//  w helande brunn (B, högst 1)  y förbannat altare (B, högst 1)  z spikfälla (skadar periodvis, högst 6)
//  e explosiv tunna (B, kan skjutas, 1-4)  i glödande kristall (ljus)  F lysande svamp (ljus)
//  H rustningsställ/vapenställ (B)  J bord (B)  T trälåda (B, går att slå sönder)
(function () {
  // vapen på kartan: g hagelgevär, r gevär, m kpist, d dubbelbössa, b armborst, s signalpistol, p prickskyttegevär
  const WEAPON_CHARS = 'grmdbsp';
  'use strict';

  const RNG = window.RNG;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // 0=Ö 1=S 2=V 3=N
  const RX = [0, 1, 1, 1, 0, -1, -1, -1], RY = [-1, -1, 0, 1, 1, 1, 0, -1]; // ringen runt en ruta: N NÖ Ö SÖ S SV V NV

  // teckentabeller (snabbare än strängsökning i de heta looparna)
  const BLOCK_PROPS = 'tnkquvwyeHJT'; // rekvisita som blockerar spelaren
  const PROP_CHARS = 'ckjquvwyzeiFHJT'; // ny rekvisita (räknas som rummets dekor)
  const T_WALL = new Uint8Array(128), T_BLOCK = new Uint8Array(128), T_GEN = new Uint8Array(128);
  for (const c of '123456789#%~&=') T_WALL[c.charCodeAt(0)] = 1;
  for (const c of '123456789#%~&=fM' + BLOCK_PROPS) T_BLOCK[c.charCodeAt(0)] = 1;
  for (const c of '123456789#%~&=fMo' + BLOCK_PROPS) T_GEN[c.charCodeAt(0)] = 1;
  const isWall = c => T_WALL[c.charCodeAt(0)] === 1;
  const isBlock = c => T_BLOCK[c.charCodeAt(0)] === 1; // blockerar spelaren
  const genBlk = c => T_GEN[c.charCodeAt(0)] === 1; // generatorn räknar även krukor som hinder
  const isDoorCh = c => c === 'D' || c === 'G' || c === '*';
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  // ---------- Biomer ----------
  const BIOMES = [
    { id: 'dungeon', name: 'KATAKOMBER', outdoor: false, weight: 40, depth: [1, 5] },
    { id: 'caves', name: 'GROTTOR', outdoor: false, weight: 20, depth: [1, 5] },
    { id: 'graveyard', name: 'KYRKOGÅRD', outdoor: true, weight: 15, depth: [1, 5] },
    { id: 'forest', name: 'SKOG', outdoor: true, weight: 12, depth: [1, 4] },
    { id: 'courtyard', name: 'BORGGÅRD', outdoor: true, weight: 13, depth: [2, 5] }, // delvis utomhus: gården har himmel
  ];

  // ---------- Vaktare/bossar: väggtecken, golvtextur, ljuskälla och dekor runt salens kanter ----------
  const GUARDIANS = {
    demon: { wall: '#', floor: 'floor_boss_demon', light: 'f', decor: 'jjkk' },
    beast: { wall: '%', floor: 'floor_boss_beast', light: 'f', decor: 'jjju' },
    nightmare: { wall: '~', floor: 'floor_boss_nightmare', light: 'c', decor: 'nnnu' },
    ogre: { wall: '&', floor: 'floor_boss_ogre', light: 'f', decor: 'jjvv' },
    ghost: { wall: '=', floor: 'floor_boss_ghost', light: 'c', decor: 'uukk' },
  };
  const GUARD_IDS = Object.keys(GUARDIANS);

  // ---------- Teman (dungeon) ----------
  const THEMES = [
    { id: 'katakomber', wall: '1', floor: 'floor_stone_pattern', ceil: 'floor_stone', fog: [18, 14, 12], ambient: [0.17, 0.22], depth: [1, 5],
      names: ['KATAKOMBERNA', 'DE DJUPA KATAKOMBERNA', 'GRAVKAMMARNA'] },
    { id: 'blodsal', wall: '2', floor: 'floor_stone', ceil: 'floor_stone_pattern', fog: [26, 8, 8], ambient: [0.15, 0.19], depth: [1, 5],
      names: ['BLODSALEN', 'SLAKTHUSET', 'BLODKAMMARNA'] },
    { id: 'benhus', wall: '3', floor: 'floor_stone', ceil: 'floor_stone', fog: [20, 17, 12], ambient: [0.14, 0.19], depth: [1, 4],
      names: ['BENHUSET', 'BENKAMMARNA', 'SKELETTGROTTAN'] },
    { id: 'valv', wall: '4', floor: 'floor_wood_planks', ceil: 'floor_stone', fog: [10, 10, 22], ambient: [0.13, 0.17], depth: [2, 5],
      names: ['VALVEN', 'VAMPYRENS BORG', 'DE GAMLA VALVEN'] },
    { id: 'kapell', wall: '5', floor: 'floor_tiles_blue', ceil: 'floor_stone', fog: [14, 6, 20], ambient: [0.12, 0.16], depth: [1, 5],
      names: ['KAPELLET', 'KLOSTRET', 'HELGEDOMEN'] },
    { id: 'fangelse', wall: '4', floor: 'floor_stone', ceil: 'floor_wood_planks', fog: [12, 14, 10], ambient: [0.13, 0.18], depth: [1, 5],
      names: ['FANGHALAN', 'FANGELSET', 'TORTYRKAMMARNA'] },
    { id: 'krypta', wall: '3', floor: 'floor_tiles_blue', ceil: 'floor_stone_pattern', fog: [8, 14, 18], ambient: [0.13, 0.18], depth: [2, 5],
      names: ['DEN BLA KRYPTAN', 'ISKRYPTAN', 'DE DRUNKNADES GRAV'] },
  ];
  const BOSS_THEMES = [
    { wall: '4', floor: 'floor_tiles_blue', ceil: 'floor_stone_pattern', fog: [20, 6, 10], ambient: [0.15, 0.2], names: ['TRONSALEN', 'DEN SISTA SALEN', 'HERRSKARENS SAL'] },
    { wall: '2', floor: 'floor_stone_pattern', ceil: 'floor_stone', fog: [28, 6, 6], ambient: [0.15, 0.19], names: ['TRONSALEN', 'BLODTRONEN', 'MORDETS SAL'] },
    { wall: '5', floor: 'floor_wood_planks', ceil: 'floor_stone', fog: [14, 6, 22], ambient: [0.14, 0.18], names: ['TRONSALEN', 'KUNGENS SAL', 'DEN MORKA TRONEN'] },
  ];
  // övriga biomers utseende (byggfunktionerna läggs in längre ned)
  const NIGHT_FOG = rng => [rng.int(10, 14), rng.int(12, 16), rng.int(22, 26)]; // mörkblå natt
  const LOOKS = {
    caves: { wall: '8', floors: ['floor_cave', 'floor_mud'], ceil: 'ceil_cave', ambient: [0.12, 0.17],
      fog: rng => rng.pick([[12, 10, 9], [8, 10, 14], [10, 12, 10], [14, 10, 12]]),
      names: ['GROTTORNA', 'DROPPSTENSGROTTAN', 'DE SJUNGANDE GROTTORNA', 'DJUPGRUVAN', 'MASKGÅNGARNA'] },
    graveyard: { wall: '7', floors: ['floor_grass_dead', 'floor_gravel', 'floor_stone_pattern', 'floor_ground_dirt'], ceil: 'floor_stone', ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['KYRKOGÅRDEN', 'DE GLÖMDAS GRAVFÄLT', 'LIKVAKAN', 'BENÅKERN', 'DE DÖDAS TRÄDGÅRD'] },
    forest: { wall: '6', floors: ['floor_ground_grass', 'floor_ground_dirt', 'floor_mud', 'floor_grass_dead'], ceil: 'floor_wood_planks', ambient: [0.25, 0.32],
      fog: NIGHT_FOG, names: ['DÖDSKOGEN', 'HÄXSKOGEN', 'DIMSKOGEN', 'VARGSKOGEN', 'DE HÄNGDAS LUND'] },
    courtyard: { wall: '1', floors: ['floor_gravel', 'floor_ground_grass', 'floor_stone', 'floor_wood_planks'], ceil: 'floor_wood_planks', ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['BORGGÅRDEN', 'RUINBORGEN', 'KLOSTERGÅRDEN', 'SLOTTSGÅRDEN'] },
  };

  const roundAmb = (rng, a) => Math.max(a[0], Math.min(a[1], Math.round(rng.range(a[0], a[1]) * 100) / 100));
  const mapSize = (rng, depth) => { const base = 30 + (depth - 1) * 3; return [Math.min(44, base + rng.int(0, 2)), Math.min(44, base + rng.int(0, 2))]; };
  const rowsOf = (W, H, a) => { const out = []; for (let y = 0; y < H; y++) { let s = ''; for (let x = 0; x < W; x++) s += a[y * W + x]; out.push(s); } return out; };

  // ---------- Hjälpstrukturer ----------
  function Heap() { // min-heap med (nyckel, värde)
    const k = [], v = [];
    return {
      key: 0,
      get size() { return k.length; },
      push(key, val) {
        let i = k.length; k.push(key); v.push(val);
        while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
        k[i] = key; v[i] = val;
      },
      pop() {
        const top = v[0]; this.key = k[0];
        const lk = k.pop(), lv = v.pop(), n = k.length;
        if (n > 0) {
          let i = 0;
          for (;;) {
            let c = 2 * i + 1; if (c >= n) break;
            if (c + 1 < n && k[c + 1] < k[c]) c++;
            if (k[c] >= lk) break;
            k[i] = k[c]; v[i] = v[c]; i = c;
          }
          k[i] = lk; v[i] = lv;
        }
        return top;
      },
    };
  }

  // ---------- Fiender (delas av alla biomer) ----------
  // vikter per våning: nya sorter dyker upp ju djupare man kommer
  const enemyTypes = depth => [['S', Math.max(4, 10 - depth)], ['K', 3 + 1.2 * depth], ['V', depth >= 2 ? 1.5 + 1.5 * (depth - 1) : 0],
    ['L', 2 + 0.5 * depth], ['I', depth >= 2 ? 1 + depth : 0], ['O', depth >= 2 ? 0.8 + 0.4 * depth : 0],
    ['N', depth >= 3 ? 0.5 + 0.5 * depth : 0], ['R', depth >= 3 ? 1 + 0.5 * depth : 0], ['W', depth >= 3 ? 0.6 + 0.6 * depth : 0]];

  // ---------- Rumstyper (arketyper) ----------
  // mix: fiendesorter som trivs här (vikt x3), floor: golvtextur inomhus (paint: även utomhus/i grottan),
  // min: minsta antal rutor, fill(r, F): möblering med hjälpfunktionerna i content
  const ARCH = {
    // --- inomhus: fängelsehålan och borggårdens längor ---
    library: { mix: 'NKS', floor: 'floor_wood_planks', min: 16, fill(r, F) {
      F.shelves(r, 'q', 3 + Math.floor(r.cells.length / 12));
      F.place(r, 'J', F.int(1, 2), { open: true, center: true, spread: 2 });
      F.place(r, 'c', F.int(1, 2), { wall: true, spread: 4 });
    } },
    storeroom: { mix: 'RLS', floor: 'floor_wood_planks', min: 9, fill(r, F) {
      for (const p of F.place(r, 'T', F.int(1, 2), { corner: true, spread: 3 })) F.place(r, 'T', F.int(1, 2), { near: [p[0], p[1], 1.5] });
      F.place(r, 'T', F.int(0, 2), { wall: true });
      F.place(r, 'o', F.int(1, 2), { wall: true });
      F.chest(r, 0.35);
    } },
    ossuary: { mix: 'SNK', floor: 'floor_stone_pattern', min: 12, fill(r, F) {
      F.place(r, 'j', F.int(4, 7), { spread: 2 });
      F.place(r, 'k', F.int(1, 2), { wall: true, spread: 3 });
      F.place(r, 'c', 1, { wall: true });
    } },
    prison: { mix: 'WOS', min: 12, fill(r, F) {
      F.place(r, 'v', F.int(2, 4), { wall: true, spread: 2 });
      F.place(r, 'z', F.int(1, 2), { strict: true, spread: 3 });
      F.place(r, 'j', F.int(1, 2), {});
    } },
    chapel: { mix: 'VNI', floor: 'floor_tiles_blue', min: 16, fill(r, F) {
      const f = F.focal(r);
      F.place(r, 'c', F.int(2, 3), f ? { near: [f[0], f[1], 2.5] } : { wall: true });
      F.place(r, 'k', F.int(0, 1), { wall: true });
      if (r.cells.length >= 30) F.row(r, 'J', F.int(2, 4), true); // bänkrader
    } },
    dining: { mix: 'WOV', floor: 'floor_wood_planks', min: 20, fill(r, F) {
      F.row(r, 'J', F.int(3, 6));
      F.place(r, 'c', F.int(1, 2), { wall: true, spread: 4 });
      F.place(r, 'o', 1, { wall: true });
    } },
    armory: { mix: 'WSK', min: 12, fill(r, F) {
      F.place(r, 'H', F.int(2, 5), { wall: true, spread: 2 });
      F.place(r, 'T', F.int(1, 2), { corner: true });
      F.place(r, F.chance(0.25) ? 'A' : 'a', 1, { wall: true });
      F.chest(r, 0.2);
    } },
    torture: { mix: 'IVL', floor: 'floor_stone', min: 12, fill(r, F) {
      F.place(r, 'v', F.int(1, 2), { wall: true, spread: 3 });
      F.place(r, 'z', F.int(1, 3), { strict: true, spread: 2 });
      F.place(r, 'j', F.int(2, 3), {});
      F.place(r, 'c', 1, { wall: true });
    } },
    crypt: { mix: 'SKV', floor: 'floor_stone_pattern', min: 9, fill(r, F) {
      if (!F.grid(r, 'k', F.int(2, 6)).length) F.place(r, 'k', F.int(1, 2), { wall: true, spread: 2 });
      F.place(r, 'c', 2, { wall: true, spread: 3 });
      F.place(r, 'j', F.int(1, 2), {});
      F.chest(r, 0.2);
    } },
    // --- grottor ---
    grotto: { mix: 'ILK', min: 12, fill(r, F) { // kristallgrotta: kluster av glödande kristaller längs väggarna
      for (let k = F.int(2, 3); k > 0; k--) {
        const s = F.place(r, 'i', 1, { wall: true, avoid: ['i', 4] })[0];
        if (s) F.place(r, 'i', F.int(1, 3), { near: [s[0], s[1], 1.6] });
      }
    } },
    mushroom: { mix: 'LOS', min: 10, fill(r, F) { // svampgrotta
      for (let k = F.int(2, 3); k > 0; k--) {
        const s = F.place(r, 'F', 1, { avoid: ['F', 3] })[0];
        if (s) F.place(r, 'F', F.int(1, 3), { near: [s[0], s[1], 1.6] });
      }
    } },
    boneden: { mix: 'SWR', min: 10, fill(r, F) { // benlya
      F.place(r, 'j', F.int(4, 8), { spread: 1 });
      F.place(r, 'v', F.int(1, 2), { wall: true, spread: 3 });
      F.place(r, 'k', F.int(0, 1), { wall: true });
    } },
    mudflat: { mix: 'LS', floor: 'floor_mud', paint: true, min: 10, fill(r, F) { // översvämmad lerslätt
      F.place(r, 'j', F.int(1, 2), {});
      F.place(r, 'F', F.int(1, 2), { wall: true, spread: 3 });
    } },
    camp: { mix: 'ROW', min: 12, fill(r, F) { // jägar-/orchläger kring en lägereld
      const f = F.place(r, 'f', 1, { open: true, center: true, jit: 3 })[0];
      F.place(r, 'T', F.int(2, 3), f ? { near: [f[0], f[1], 3.5], spread: 2 } : { wall: true });
      F.place(r, 'J', 1, f ? { near: [f[0], f[1], 3] } : {});
      F.place(r, 'H', F.int(0, 1), { wall: true });
      F.chest(r, 0.25);
    } },
    // --- kyrkogård ---
    graves: { mix: 'SR', min: 12, fill(r, F) { // öppnade gravar med likkistor
      for (const p of F.place(r, 'k', F.int(2, 4), { open: true, spread: 3 })) F.place(r, 'j', 1, { near: [p[0], p[1], 1.5] });
      F.place(r, 'c', F.int(1, 2), { pred: F.nextTo('n') });
    } },
    statues: { mix: 'NK', min: 12, fill(r, F) {
      for (const p of F.place(r, 'u', F.int(2, 4), { open: true, spread: 3 })) if (F.chance(0.5)) F.place(r, 'c', 1, { near: [p[0], p[1], 1.5] });
    } },
    candles: { mix: 'VN', min: 8, fill(r, F) { // levande ljus vid gravarna
      if (F.place(r, 'c', F.int(4, 7), { pred: F.nextTo('n'), spread: 2 }).length < 2) F.place(r, 'c', 2, { spread: 3 });
      F.place(r, 'j', 1, {});
    } },
    bonefield: { mix: 'SW', min: 10, fill(r, F) {
      F.place(r, 'j', F.int(4, 7), { spread: 2 });
      F.place(r, 'v', 1, {});
      F.place(r, 'k', 1, { open: true });
    } },
    // --- skog ---
    mushring: { mix: 'IOL', min: 12, fill(r, F) { // häxring av lysande svampar
      if (F.ring(r, 'F', F.int(2, 3), 8).length < 3) F.place(r, 'F', F.int(3, 5), { spread: 2 });
      F.place(r, 'j', 1, {});
    } },
    boneclear: { mix: 'WS', min: 10, fill(r, F) { // benströdd glänta
      F.place(r, 'j', F.int(4, 8), { spread: 1 });
      F.place(r, 'k', F.int(0, 1), {});
      F.place(r, 'v', F.int(0, 1), {});
    } },
    cages: { mix: 'VS', min: 10, fill(r, F) { // burar med offer
      F.place(r, 'v', F.int(2, 3), { spread: 2 });
      F.place(r, 'j', 2, {});
    } },
    thicket: { mix: 'SLR', fill(r, F) { // stigar och snår
      F.place(r, 'F', F.int(1, 3), { avoid: ['F', 3] });
      F.place(r, 'j', F.int(1, 2), { spread: 3 });
    } },
    hut: { mix: 'RO', fill(r, F) { // jägarstuga
      F.place(r, 'J', 1, { open: true, center: true });
      F.place(r, 'T', F.int(1, 2), { corner: true });
      F.place(r, 'c', 1, { wall: true });
    } },
    // --- borggård ---
    market: { mix: 'RWO', min: 20, fill(r, F) { // marknadsstånd: bord och lådor
      F.stalls(r, F.int(2, 4));
      F.place(r, 'c', 1, { pred: F.nextTo('J') });
    } },
    drill: { mix: 'WS', min: 12, fill(r, F) { // exercisplats med vapenställ
      F.place(r, 'H', F.int(2, 4), { spread: 2 });
      F.place(r, 'T', F.int(1, 2), {});
    } },
    fountain: { mix: 'VK', floor: 'floor_stone', paint: true, fill(r, F) { // gårdens fontän: staty med ljus runt om
      F.putAt(r.cx, r.cy, 'u');
      for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) F.putAt(r.cx + dx, r.cy + dy, 'c');
    } },
    // --- specialrum (inga fiender) ---
    shop: { fill(r, F) {
      F.place(r, 'c', F.int(1, 2), { wall: true, spread: 3 });
      if (F.shopAt) F.place(r, 'J', 1, { near: [F.shopAt[0], F.shopAt[1], 2.5] });
    } },
    shrine: { floor: 'floor_tiles_blue', fill(r, F) { // helgedom med helande brunn (brunnen sätts när rollen väljs)
      const w = F.wellAt || [r.cx, r.cy];
      F.place(r, 'c', F.int(2, 4), { near: [w[0], w[1], 2.5] });
      F.place(r, 'u', F.int(0, 1), { wall: true });
    } },
    vault: { fill(r, F) { // skattkammare
      F.place(r, 'c', F.int(1, 2), { wall: true, spread: 3 });
      if (r.tag === 'crypt') F.place(r, 'k', 1, { wall: true });
      else if (r.tag === 'hut') F.place(r, 'J', 1, { open: true });
      else if (r.indoor) { F.place(r, 'T', F.int(1, 2), { corner: true }); F.place(r, 'H', F.int(0, 1), { wall: true }); }
      else F.place(r, 'j', F.int(1, 2), {});
    } },
    secret: { fill() {} },
    start: { fill() {} },
    guardian: { fill() {} },
  };
  // rumstyper per biom och områdestagg [id, vikt]
  const ARCH_BY = {
    dungeon: { room: [['library', 3], ['storeroom', 3], ['ossuary', 3], ['prison', 2], ['chapel', 2.5], ['dining', 2.5], ['armory', 2.5], ['torture', 2], ['crypt', 3]] },
    caves: { open: [['grotto', 3], ['mushroom', 3], ['boneden', 2], ['mudflat', 2], ['camp', 1.5]] },
    graveyard: { open: [['graves', 3], ['statues', 2], ['candles', 3], ['bonefield', 2]], chapel: [['chapel', 1]], crypt: [['crypt', 1]] },
    forest: { open: [['thicket', 3], ['boneclear', 1], ['mushring', 1]], clearing: [['mushring', 3], ['boneclear', 2], ['camp', 3], ['cages', 2]], hut: [['hut', 1]] },
    courtyard: { room: [['library', 2], ['storeroom', 3], ['dining', 3], ['armory', 3], ['chapel', 1.5], ['prison', 1.5], ['crypt', 1]],
      fountain: [['fountain', 1]], open: [['market', 3], ['drill', 2]] },
  };

  // ---------- Bana ----------
  function pickBiome(rng, depth, opts) {
    if (opts.biome) { const b = BIOMES.find(b => b.id === opts.biome); if (b) return b; }
    if (opts.theme !== undefined && opts.theme !== null) return BIOMES[0]; // teman finns bara i fängelsehålan
    return rng.weighted(BIOMES, b => (depth >= b.depth[0] && depth <= b.depth[1] ? b.weight : 0));
  }
  // vaktaren: opts.guardian, annars deterministiskt ur seeden
  const pickGuardian = (root, opts) => (GUARDIANS[opts.guardian] ? opts.guardian : root.fork('guardian').pick(GUARD_IDS));

  function floor(seed, depth, opts) {
    opts = opts || {};
    depth = Math.max(1, Math.min(5, Math.round(depth || 1)));
    const root = RNG(seed);
    const biome = pickBiome(root.fork('biome'), depth, opts);
    const gid = pickGuardian(root, opts);
    if (biome.id !== 'dungeon') return biomeFloor(root, seed, depth, opts, biome, gid);
    const trng = root.fork('theme');
    let theme;
    if (opts.theme !== undefined && opts.theme !== null) {
      theme = typeof opts.theme === 'number' ? THEMES[opts.theme % THEMES.length] : (THEMES.find(t => t.id === opts.theme) || THEMES[0]);
    } else {
      theme = trng.pick(THEMES.filter(t => depth >= t.depth[0] && depth <= t.depth[1]));
    }
    const name = trng.pick(theme.names);
    const ambient = roundAmb(trng, theme.ambient);
    for (let attempt = 0; attempt < 40; attempt++) {
      const K = { id: gid, wall: GUARDIANS[gid].wall, floor: GUARDIANS[gid].floor };
      const lv = build(root.fork('floor' + attempt), depth, theme, opts, K);
      if (!lv) { floor.stats.retries++; continue; }
      const level = {
        name, biome: 'dungeon', floor: lv.floors[0], floors: lv.floors, floorMask: rowsOf(lv.W, lv.H, lv.fm),
        ceil: theme.ceil, sky: null, secretWall: theme.wall, fog: theme.fog.slice(), ambient,
        map: lv.map, depth, seed, rooms: lv.rooms, roomMask: lv.roomMask, theme: theme.id, guardian: gid,
      };
      if (validate(level).length) { floor.stats.retries++; continue; }
      return level;
    }
    throw new Error('Gen.floor: kunde inte bygga en giltig bana (seed ' + seed + ', djup ' + depth + ')');
  }
  floor.stats = { retries: 0 };

  function biomeFloor(root, seed, depth, opts, biome, gid) {
    const look = LOOKS[biome.id], lrng = root.fork('look');
    const name = lrng.pick(look.names), fog = look.fog(lrng), ambient = roundAmb(lrng, look.ambient);
    for (let attempt = 0; attempt < 40; attempt++) {
      const K = { id: gid, wall: GUARDIANS[gid].wall, floor: GUARDIANS[gid].floor, floors: look.floors.concat([GUARDIANS[gid].floor]), bossIdx: look.floors.length };
      const res = look.build(root.fork(biome.id + attempt), depth, opts, look, K);
      if (!res) { floor.stats.retries++; continue; }
      const G = res.G;
      const level = {
        name, biome: biome.id, floor: res.floors[0], floors: res.floors, floorMask: rowsOf(G.W, G.H, G.fm),
        ceil: look.ceil, sky: biome.outdoor ? rowsOf(G.W, G.H, G.sky) : null, secretWall: look.wall, fog, ambient,
        map: G.g.map(r => r.join('')), depth, seed, rooms: res.rooms, roomMask: res.roomMask, theme: biome.id, guardian: gid,
      };
      if (validate(level).length) { floor.stats.retries++; continue; }
      return level;
    }
    throw new Error('Gen.floor: kunde inte bygga en giltig bana (' + biome.id + ', seed ' + seed + ', djup ' + depth + ')');
  }

  // ---------- Fängelsehålan: rum i olika former + korridorer ----------
  function build(rng, depth, theme, opts, K) {
    const wc = theme.wall;
    const base = 30 + (depth - 1) * 3;
    const W = Math.min(44, base + rng.int(0, 2)), H = Math.min(44, base + rng.int(0, 2));
    const G = Grid(W, H, wc), g = G.g;
    const inb = (x, y) => x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2;

    // ----- 1. Rum: vaktarens sal först (stor), sedan de vanliga -----
    const lo = Math.min(12, 8 + Math.floor((depth - 1) * 1.25)), hi = Math.min(14, lo + 2);
    const target = rng.int(lo, hi);
    const rooms = [];
    const sizeW = [0, 0, 0, 0, 2, 4, 4, 3, 2, 1]; // vikt för storlek 4..9
    const rollSize = cap => rng.weighted([4, 5, 6, 7, 8, 9].filter(s => s <= cap), s => sizeW[s]);
    const gapOK = (a, b, gap) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
    const mk = (x, y, w, h, type) => ({ x, y, w, h, type, cx: x + (w >> 1), cy: y + (h >> 1), open: [], deg: 0, id: rooms.length });
    {
      const gs = () => rng.int(9, Math.min(11, 9 + (depth >> 1)));
      const w = gs(), h = gs();
      rooms.push(mk(rng.int(2, W - 2 - w), rng.int(2, H - 2 - h), w, h, 'guardian'));
    }
    for (let tries = 0; rooms.length < target && tries < 900; tries++) {
      const cap = tries > 450 ? 5 : tries > 150 ? 7 : 9;
      const w = rollSize(cap), h = rollSize(cap);
      const r = mk(rng.int(2, W - 2 - w), rng.int(2, H - 2 - h), w, h, 'normal');
      if (rooms.every(o => gapOK(o, r, 3))) rooms.push(r);
    }
    if (rooms.length < Math.max(7, lo - 2)) return null;
    const n = rooms.length;
    const forb = new Uint8Array(W * H); // rum + väggring: hit får inga korridorer
    for (const r of rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) forb[y * W + x] = 1;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = '.';
    }
    // rumsformer: rektangel, kors, L, rund, mittblock, inre ring (pelarrader sätts efter dörrarna)
    const fillW = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = wc; };
    for (const r of rooms) {
      const { x, y, w, h } = r;
      if (r.type === 'guardian') { // avfasade hörn
        const k = Math.min(w, h) >= 10 ? 2 : 1;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k - dy; dx++) {
          g[y + dy][x + dx] = wc; g[y + dy][x + w - 1 - dx] = wc; g[y + h - 1 - dy][x + dx] = wc; g[y + h - 1 - dy][x + w - 1 - dx] = wc;
        }
        r.shape = 'hall';
      } else {
        const sh = [['rect', 2]];
        if (w >= 7 && h >= 7) sh.push(['cross', 2], ['round', 2], ['block', 1.5]);
        if (w >= 6 && h >= 6) sh.push(['L', 2]);
        if ((w >= 8 && h >= 7) || (h >= 8 && w >= 7)) sh.push(['pillars', 2.5]);
        if (w >= 9 && h >= 9) sh.push(['ring', 2.5]);
        r.shape = rng.weighted(sh, s => s[1])[0];
        if (r.shape === 'cross') { const cw = Math.floor(w / 3), ch = Math.floor(h / 3); fillW(x, y, cw, ch); fillW(x + w - cw, y, cw, ch); fillW(x, y + h - ch, cw, ch); fillW(x + w - cw, y + h - ch, cw, ch); }
        else if (r.shape === 'L') { const qw = w >> 1, qh = h >> 1, c = rng.int(0, 3); fillW(c & 1 ? x + w - qw : x, c & 2 ? y + h - qh : y, qw, qh); }
        else if (r.shape === 'round') {
          const mx = x + (w - 1) / 2, my = y + (h - 1) / 2;
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (((xx - mx) / (w / 2)) ** 2 + ((yy - my) / (h / 2)) ** 2 > 1) g[yy][xx] = wc;
        } else if (r.shape === 'block') { const bw = Math.min(w - 4, rng.int(2, 3)), bh = Math.min(h - 4, rng.int(2, 3)); fillW(x + ((w - bw) >> 1), y + ((h - bh) >> 1), bw, bh); }
        else if (r.shape === 'ring') { // inre ring av vägg med två öppningar mitt emot varandra
          const x0 = x + 2, y0 = y + 2, x1 = x + w - 3, y1 = y + h - 3, hz = rng.chance(0.5);
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (xx === x0 || xx === x1 || yy === y0 || yy === y1) g[yy][xx] = wc;
          if (hz) { g[(y0 + y1) >> 1][x0] = '.'; g[(y0 + y1 + 1) >> 1][x1] = '.'; } else { g[y0][(x0 + x1) >> 1] = '.'; g[y1][(x0 + x1 + 1) >> 1] = '.'; }
        }
      }
      // representativ golvruta (närmast mitten)
      let best = null, bd = 1e9;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy][xx] === '.') { const d = Math.abs(xx - r.cx) + Math.abs(yy - r.cy); if (d < bd) { bd = d; best = [xx, yy]; } }
      if (!best) return null;
      r.rep = best;
    }

    // ----- 2. Förbindelser: minimalt uppspännande träd + några extra; vaktarens sal får 1-2 ingångar -----
    const corr = new Uint8Array(W * H);
    const noise = new Float32Array(W * H);
    for (let i = 0; i < noise.length; i++) noise[i] = rng.next() * 0.6;
    const openings = []; // {x,y,room,horiz,ch}
    const rd = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    const edges = [], have = new Set();
    const inT = new Array(n).fill(false); inT[1] = true;
    for (let k = 2; k < n; k++) {
      let best = null, bd = 1e9;
      for (let i = 1; i < n; i++) if (inT[i]) for (let j = 1; j < n; j++) if (!inT[j]) {
        const d = rd(rooms[i], rooms[j]) + rng.next() * 4;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      inT[best[1]] = true; edges.push(best); have.add(best[0] * 64 + best[1]); have.add(best[1] * 64 + best[0]);
    }
    const gnear = rooms.slice(1).map(r => [r.id, rd(rooms[0], r) + rng.next() * 4]).sort((a, b) => a[1] - b[1]);
    edges.push([gnear[0][0], 0]);
    const extraCand = [];
    for (let i = 1; i < n; i++) for (let j = i + 1; j < n; j++) if (!have.has(i * 64 + j)) extraCand.push([i, j, rd(rooms[i], rooms[j]) + rng.next() * 3]);
    extraCand.sort((a, b) => a[2] - b[2]);
    const nExtra = Math.min(rng.int(1, 3), extraCand.length);
    const extra = rng.shuffle(extraCand.slice(0, Math.max(nExtra * 2, 4))).slice(0, nExtra);

    function pickOpening(room, side) {
      const horizSide = side === 0 || side === 2;
      const len = horizSide ? room.h : room.w;
      const offs = rng.shuffle(Array.from({ length: len }, (_, i) => i));
      for (const off of offs) {
        let ox, oy;
        if (side === 0) { ox = room.x + room.w; oy = room.y + off; }
        else if (side === 2) { ox = room.x - 1; oy = room.y + off; }
        else if (side === 1) { ox = room.x + off; oy = room.y + room.h; }
        else { ox = room.x + off; oy = room.y - 1; }
        const ax = ox + DX[side], ay = oy + DY[side];
        if (!inb(ox, oy) || !inb(ax, ay) || forb[ay * W + ax]) continue;
        if (g[oy - DY[side]][ox - DX[side]] !== '.') continue; // innanför öppningen måste det vara golv (rumsformen)
        if (room.open.some(o => cheb(o.x, o.y, ox, oy) <= 1)) continue;
        return { ox, oy, ax, ay, side, horiz: horizSide };
      }
      return null;
    }

    function route(sx, sy, sdir, tx, ty) {
      const dist = new Float64Array(W * H * 4).fill(Infinity);
      const prev = new Int32Array(W * H * 4).fill(-1);
      const heap = Heap();
      const s0 = (sy * W + sx) * 4 + sdir;
      dist[s0] = 0; heap.push(0, s0);
      while (heap.size) {
        const cur = heap.pop();
        if (heap.key > dist[cur]) continue;
        const d = cur & 3, cell = cur >> 2, x = cell % W, y = (cell / W) | 0;
        if (x === tx && y === ty) {
          const path = [];
          for (let s = cur; s !== -1; s = prev[s]) path.push([(s >> 2) % W, (((s >> 2) / W) | 0)]);
          return path.reverse();
        }
        for (let nd = 0; nd < 4; nd++) {
          if (nd === ((d + 2) & 3)) continue;
          const nx = x + DX[nd], ny = y + DY[nd];
          if (!inb(nx, ny)) continue;
          const ni = ny * W + nx;
          if (forb[ni]) continue;
          const c = dist[cur] + (corr[ni] ? 0.8 : 1) + noise[ni] + (nd !== d ? 2.5 : 0);
          const st = ni * 4 + nd;
          if (c < dist[st]) { dist[st] = c; prev[st] = cur; heap.push(c, st); }
        }
      }
      return null;
    }

    function widen(path) {
      if (path.length < 9 || !rng.chance(0.3)) return;
      const i0 = rng.int(3, path.length - 6);
      const L = Math.min(rng.int(3, 8), path.length - 3 - i0);
      const run = path.slice(i0, i0 + L);
      const horiz = run.every(p => p[1] === run[0][1]), vert = run.every(p => p[0] === run[0][0]);
      if (!horiz && !vert) return;
      const sgn = rng.chance(0.5) ? 1 : -1;
      for (const [x, y] of run) {
        const wx = horiz ? x : x + sgn, wy = horiz ? y + sgn : y;
        if (inb(wx, wy) && !forb[wy * W + wx] && g[wy][wx] === wc) { g[wy][wx] = '.'; corr[wy * W + wx] = 1; }
      }
    }

    function connect(ia, ib) {
      const a = rooms[ia], b = rooms[ib];
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const horiz = Math.abs(dx) + rng.next() * 4 >= Math.abs(dy);
      const sidesFor = hz => hz ? (dx > 0 ? [0, 2] : [2, 0]) : (dy > 0 ? [1, 3] : [3, 1]);
      const attempts = [sidesFor(horiz), sidesFor(horiz), sidesFor(!horiz)];
      for (let i = 0; i < 6; i++) attempts.push([rng.int(0, 3), rng.int(0, 3)]);
      for (const [sa, sb] of attempts) {
        const oa = pickOpening(a, sa), ob = pickOpening(b, sb);
        if (!oa || !ob) continue;
        const path = route(oa.ax, oa.ay, sa, ob.ax, ob.ay);
        if (!path) continue;
        for (const [x, y] of path) { g[y][x] = '.'; corr[y * W + x] = 1; }
        for (const [o, room] of [[oa, a], [ob, b]]) {
          g[o.oy][o.ox] = '.';
          room.open.push({ x: o.ox, y: o.oy });
          openings.push({ x: o.ox, y: o.oy, room: room.id, horiz: o.horiz, ch: '.' });
        }
        widen(path);
        a.deg++; b.deg++;
        return true;
      }
      return false;
    }
    for (const [i, j] of edges) if (!connect(i, j)) return null;
    for (const [i, j] of extra) connect(i, j);
    if (gnear[1] && rng.chance(0.35)) connect(gnear[1][0], 0);

    // ----- 3. Dörrar i en del öppningar (alltid in till vaktaren); vaktarens väggring i bossens väggtecken -----
    const doorChance = 0.35 + rng.next() * 0.2;
    for (const o of openings) if (o.room === 0 || rng.chance(doorChance)) { o.ch = 'D'; g[o.y][o.x] = 'D'; }
    const gr = rooms[0];
    for (let y = gr.y - 1; y <= gr.y + gr.h; y++) for (let x = gr.x - 1; x <= gr.x + gr.w; x++) if (g[y][x] === wc) g[y][x] = K.wall;
    for (let y = gr.y; y < gr.y + gr.h; y++) for (let x = gr.x; x < gr.x + gr.w; x++) if (g[y][x] === '.') G.fm[y * W + x] = 1; // floors[1] = vaktarens golv

    // ----- 4. Hemligt rum (3x3 bakom en hemlig vägg) -----
    const nearOpen = (x, y, r) => openings.some(o => cheb(o.x, o.y, x, y) <= r);
    let secret = null;
    if (rng.chance(0.6)) {
      const cands = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (g[y][x] !== '.' || nearOpen(x, y, 1)) continue;
        for (let d = 0; d < 4; d++) {
          const ox = x + DX[d], oy = y + DY[d];
          if (g[oy][ox] !== wc) continue;
          for (let k = 0; k < 3; k++) {
            let ix, iy;
            if (d === 0) { ix = ox + 1; iy = y - k; } else if (d === 2) { ix = ox - 3; iy = y - k; }
            else if (d === 1) { iy = oy + 1; ix = x - k; } else { iy = oy - 3; ix = x - k; }
            if (ix < 1 || iy < 1 || ix + 3 > W - 1 || iy + 3 > H - 1) continue;
            let ok = true;
            for (let yy = iy - 1; ok && yy <= iy + 3; yy++) for (let xx = ix - 1; xx <= ix + 3; xx++) if (g[yy][xx] !== wc || (yy >= iy && xx >= ix && yy < iy + 3 && xx < ix + 3 && forb[yy * W + xx])) { ok = false; break; }
            if (ok) cands.push({ ix, iy, ox, oy, d });
          }
        }
      }
      if (cands.length) {
        const c = rng.pick(cands);
        for (let yy = c.iy; yy < c.iy + 3; yy++) for (let xx = c.ix; xx < c.ix + 3; xx++) g[yy][xx] = '.';
        g[c.oy][c.ox] = '*';
        secret = { x: c.ix, y: c.iy, w: 3, h: 3, door: [c.ox, c.oy] };
        openings.push({ x: c.ox, y: c.oy, room: n, horiz: c.d === 0 || c.d === 2, ch: '*' });
      }
    }

    // ----- 5. Roller: start långt från vaktaren, utgången längst från start -----
    const passable = c => !isBlock(c);
    function bfs(sx, sy) {
      const dist = new Int16Array(W * H).fill(-1);
      const q = new Int32Array(W * H); let qh = 0, qt = 0;
      dist[sy * W + sx] = 0; q[qt++] = sy * W + sx;
      while (qh < qt) {
        const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (dist[ni] >= 0 || !passable(g[ny][nx])) continue;
          dist[ni] = dist[cur] + 1; q[qt++] = ni;
        }
      }
      return dist;
    }
    const at = (d, r) => d[r.rep[1] * W + r.rep[0]];
    const dG = bfs(gr.rep[0], gr.rep[1]);
    if (rooms.some(r => at(dG, r) < 0)) return null;
    let start = null, sv = -1;
    for (const r of rooms) if (r !== gr) { const v = at(dG, r) + rng.next() * 3; if (v > sv) { sv = v; start = r; } }
    start.type = 'start';
    const dS = bfs(start.rep[0], start.rep[1]);
    for (const r of rooms) r.d = at(dS, r);
    let exitRoom = null, ev = -1;
    for (const r of rooms) if (r !== start && r !== gr) { const v = r.d + rng.next() * 0.5; if (v > ev) { ev = v; exitRoom = r; } }
    exitRoom.type = 'exit';

    // ----- 6. Lås kring öppningar, P och x, pelarrader -----
    for (const o of openings) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(o.x + dx, o.y + dy, 2);
    const spot = r => {
      let best = null, bd = 1e9;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (g[y][x] === '.' && G.lock[y * W + x] < 2) { const d = cheb(x, y, r.cx, r.cy) + rng.next(); if (d < bd) { bd = d; best = [x, y]; } }
      return best;
    };
    const P = spot(start), X = spot(exitRoom);
    if (!P || !X) return null;
    g[P[1]][P[0]] = 'P'; g[X[1]][X[0]] = 'x';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { G.lockMin(P[0] + dx, P[1] + dy, 1); G.lockMin(X[0] + dx, X[1] + dy, 1); }
    for (const r of rooms) if (r.shape === 'pillars') {
      const hz = r.w >= r.h, A = hz ? r.w : r.h, B = hz ? r.h : r.w;
      for (const b of [2, B - 3]) for (let a = 2; a <= A - 3; a += 2) plant(G, hz ? r.x + a : r.x + b, hz ? r.y + b : r.y + a, wc);
    }
    if (gr.w >= 11 && gr.h >= 11) for (const sx of [-3, 3]) for (const sy of [-3, 3]) plant(G, gr.cx + sx, gr.cy + sy, K.wall);

    // ----- 7. Rumsposter och innehåll -----
    const rid = new Int16Array(W * H).fill(-1);
    const recs = rooms.map(r => {
      const cells = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!isWall(g[y][x])) { rid[y * W + x] = r.id; cells.push([x, y]); }
      return { id: r.id, type: r.type, tag: 'room', shape: r.shape, cells, cx: r.cx, cy: r.cy, box: { x: r.x, y: r.y, w: r.w, h: r.h }, d: r.d, deg: r.deg, indoor: true };
    });
    let srec = null;
    if (secret) {
      const cells = [];
      for (let y = secret.y; y < secret.y + 3; y++) for (let x = secret.x; x < secret.x + 3; x++) { rid[y * W + x] = n; cells.push([x, y]); }
      srec = { id: n, type: 'secret', tag: 'secret', cells, cx: secret.x + 1, cy: secret.y + 1, box: { x: secret.x, y: secret.y, w: 3, h: 3 }, d: 0, indoor: true, door: secret.door };
      recs.push(srec);
    }
    const corridors = [];
    for (let i = 0; i < W * H; i++) if (corr[i] && rid[i] < 0 && g[(i / W) | 0][i % W] === '.') corridors.push([i % W, (i / W) | 0]);
    const res = content(G, rng, depth, opts, {
      biome: 'dungeon', P, X, rooms: recs, rid, corridors, floors: [theme.floor, K.floor], gid: K.id, guardian: { center: [gr.cx, gr.cy] },
      secret: srec, spikes: rng.int(2, 4), cfg: { barrels: { p: 0.55, min: 2 }, deadEnd: true },
    });
    if (!res) return null;
    return { map: g.map(row => row.join('')), rooms: res.rooms, roomMask: res.roomMask, floors: res.floors, fm: G.fm, W, H };
  }

  // hemligt rum: kortkista eller rustning i mitten, resten slumpat
  function fillSecret(rng, g, secret, cells, secretGold) {
    const cs = rng.shuffle(cells);
    const items = [rng.chance(0.55) ? 'A' : 'C'];
    for (let i = 0; i < secretGold; i++) items.push('$');
    if (rng.chance(0.7)) items.push('h');
    if (rng.chance(0.4)) items.push('a');
    g[secret.cy][secret.cx] = items[0];
    let ci = 0;
    for (let i = 1; i < items.length; i++) {
      while (ci < cs.length && (g[cs[ci][1]][cs[ci][0]] !== '.' || (cs[ci][0] === secret.cx && cs[ci][1] === secret.cy))) ci++;
      if (ci < cs.length) { g[cs[ci][1]][cs[ci][0]] = items[i]; ci++; }
    }
  }

  // ---------- Rutnät: gemensamt API för biomerna ----------
  // g: tecken, fm: golvindex, sky: 1 = öppen himmel, lock: 1 = inga hinder, 2 = inget alls (dörrframsidor o.d.),
  // solid: får aldrig grävas igenom (kant, byggnadsväggar, dörrar), res: reserverat (vaktarens sal: bygget planterar inget där)
  function Grid(W, H, fill, border) {
    const G = { W, H, g: [], fm: new Uint8Array(W * H), sky: new Uint8Array(W * H), lock: new Uint8Array(W * H), solid: new Uint8Array(W * H), res: new Uint8Array(W * H) };
    for (let y = 0; y < H; y++) G.g.push(new Array(W).fill(fill));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { G.g[y][x] = border || fill; G.solid[y * W + x] = 1; }
    G.inb = (x, y) => x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2;
    G.at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '1' : G.g[y][x];
    G.lockMin = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H && G.lock[y * W + x] < v) G.lock[y * W + x] = v; };
    return G;
  }

  // kan (x,y) blockeras utan att något golv tappar kontakten? Lokal koll: alla fria 4-grannar måste hänga ihop
  // via ringen av 8 grannar (räcker för att hela kartan förblir sammanhängande)
  function localOK(G, x, y) {
    const f = [];
    for (let k = 0; k < 8; k++) f.push(!genBlk(G.at(x + RX[k], y + RY[k])));
    let runs = 0;
    for (let k = 0; k < 8; k++) {
      if (!f[k] || f[(k + 7) & 7]) continue; // bara början på en serie fria ringrutor
      let orth = false;
      for (let j = k; j < k + 8 && f[j & 7]; j++) if ((j & 1) === 0) orth = true;
      if (orth) runs++;
    }
    return runs <= 1;
  }
  // sätter ett hinder (träd, gravsten, pelare, ...) om rutan är fri, olåst, inte reserverad och inte stänger av något
  function plant(G, x, y, ch) {
    if (!G.inb(x, y) || G.g[y][x] !== '.' || G.lock[y * G.W + x] || G.res[y * G.W + x] || !localOK(G, x, y)) return false;
    G.g[y][x] = ch; return true;
  }
  function plantNear(G, rng, x, y, ch, r) {
    if (plant(G, x, y, ch)) return [x, y];
    const c = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) c.push([x + dx, y + dy]);
    for (const [xx, yy] of rng.shuffle(c)) if (plant(G, xx, yy, ch)) return [xx, yy];
    return null;
  }

  // BFS-avstånd (4-grannar) från en eller flera startrutor [[x, y], ...]
  function bfsG(G, starts, pass) {
    const { W, H, g } = G; pass = pass || (c => !genBlk(c));
    const dist = new Int16Array(W * H).fill(-1);
    const q = new Int32Array(W * H); let qh = 0, qt = 0;
    for (const [sx, sy] of starts) { const s = sy * W + sx; if (dist[s] < 0) { dist[s] = 0; q[qt++] = s; } }
    while (qh < qt) {
      const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (dist[ni] >= 0 || !pass(g[ny][nx])) continue;
        dist[ni] = dist[cur] + 1; q[qt++] = ni;
      }
    }
    return dist;
  }

  // billigaste väg (4-grannar) från någon av starts till en ruta där isGoal(i); cost(i) = Infinity spärrar
  function dijkstra(G, starts, isGoal, cost) {
    const { W } = G, N = W * G.H;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = Heap();
    for (const s of starts) { dist[s] = 0; heap.push(0, s); }
    while (heap.size) {
      const cur = heap.pop();
      if (heap.key > dist[cur]) continue;
      if (isGoal(cur)) { const p = []; for (let s = cur; s !== -1; s = prev[s]) p.push(s); return p.reverse(); }
      const x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!G.inb(nx, ny)) continue;
        const ni = ny * W + nx, c = cost(ni);
        if (!(c < Infinity)) continue;
        const nd = dist[cur] + c;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; heap.push(nd, ni); }
      }
    }
    return null;
  }

  // flood fill: små isolerade fickor fylls med o.fillCh, större kopplas till huvudregionen (största eller den vid o.mainAt)
  // med tunnlar o.width rutor breda. Fickor som innehåller annat än golv (dörrar, föremål) fylls aldrig.
  // Tunnlarna går aldrig genom solida eller reserverade rutor (vaktarens sal).
  function connectRegions(G, rng, o) {
    o = o || {};
    const { W, H, g } = G, N = W * H;
    const pass = o.pass || (c => !genBlk(c));
    const lab = new Int32Array(N).fill(-1), sizes = [], reps = [], pure = [], st = [];
    for (let i = 0; i < N; i++) {
      if (lab[i] >= 0 || !pass(g[(i / W) | 0][i % W])) continue;
      const k = sizes.length; let n = 0, dots = true;
      lab[i] = k; st.push(i);
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0; n++;
        if (g[y][x] !== '.' || G.res[cur]) dots = false;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (lab[ni] >= 0 || !pass(g[ny][nx])) continue;
          lab[ni] = k; st.push(ni);
        }
      }
      sizes.push(n); reps.push(i); pure.push(dots);
    }
    if (!sizes.length) return false;
    let main = 0;
    if (o.mainAt) main = lab[o.mainAt[1] * W + o.mainAt[0]]; else for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k;
    if (main < 0) return false;
    const tiny = k => k !== main && pure[k] && sizes[k] < (o.minSize || 0);
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && tiny(lab[i])) { g[(i / W) | 0][i % W] = o.fillCh; lab[i] = -1; }
    const order = sizes.map((s, k) => k).filter(k => k !== main && !tiny(k)).sort((a, b) => sizes[b] - sizes[a]);
    if (!order.length) return true;
    const conn = new Uint8Array(N);
    const flood = () => {
      conn.fill(0); conn[reps[main]] = 1; st.push(reps[main]);
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || conn[ni] || !pass(g[ny][nx])) continue;
          conn[ni] = 1; st.push(ni);
        }
      }
    };
    flood();
    const noise = new Float32Array(N); for (let i = 0; i < N; i++) noise[i] = rng.next();
    const w = o.width || 2;
    for (const k of order) {
      if (conn[reps[k]]) continue; // redan ihopkopplad via en tidigare tunnel
      const starts = []; for (let i = 0; i < N; i++) if (lab[i] === k) starts.push(i);
      const path = dijkstra(G, starts, i => conn[i] === 1, i => G.solid[i] || G.res[i] ? Infinity : pass(g[(i / W) | 0][i % W]) ? 0.3 : 1 + noise[i]);
      if (!path) return false;
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) {
          const xx = x + dx, yy = y + dy;
          if (!G.inb(xx, yy) || G.solid[yy * W + xx] || G.res[yy * W + xx] || pass(g[yy][xx])) continue;
          g[yy][xx] = '.'; if (o.onCarve) o.onCarve(xx, yy);
        }
      }
      flood();
    }
    return true;
  }

  // avstånd (Chebyshev) till närmaste hinder för varje ruta
  function obstDist(G) {
    const { W, H, g } = G, N = W * H;
    const d = new Int16Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (genBlk(g[(i / W) | 0][i % W])) { d[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + RX[k], ny = y + RY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (d[ni] < 0) { d[ni] = d[cur] + 1; q[qt++] = ni; }
      }
    }
    return d;
  }
  // bryter upp för stora öppna ytor: så länge någon ruta har längre än maxR till närmaste hinder stämplas skydd där
  // (vaktarens reserverade sal hoppas över)
  function breakOpen(G, rng, maxR, stamp) {
    const { W } = G, tried = new Uint8Array(W * G.H);
    for (let i = 0; i < tried.length; i++) if (G.res[i]) tried[i] = 1;
    for (let it = 0; it < 80; it++) {
      const d = obstDist(G);
      let best = 0, list = [];
      for (let i = 0; i < d.length; i++) {
        if (tried[i] || d[i] <= maxR) continue;
        if (d[i] > best) { best = d[i]; list = [i]; } else if (d[i] === best) list.push(i);
      }
      if (!list.length) return;
      const i = rng.pick(list); tried[i] = 1;
      stamp(i % W, (i / W) | 0);
    }
  }

  // värdebrus (bilinjär interpolation av ett slumpgitter) i [0,1], två oktaver, normerat till hela intervallet
  function fbm(rng, W, H, cell) {
    const one = c => {
      const gw = Math.ceil(W / c) + 2, gh = Math.ceil(H / c) + 2, lat = new Float32Array(gw * gh);
      for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
      const ox = rng.next() * c, oy = rng.next() * c, out = new Float32Array(W * H);
      const sm = t => t * t * (3 - 2 * t);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = (x + ox) / c, fy = (y + oy) / c, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const a = lat[iy * gw + ix], b = lat[iy * gw + ix + 1], cc = lat[(iy + 1) * gw + ix], d = lat[(iy + 1) * gw + ix + 1];
        out[y * W + x] = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
      }
      return out;
    };
    const A = one(cell), B = one(Math.max(2, cell / 2)), out = new Float32Array(W * H);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < out.length; i++) { out[i] = 0.68 * A[i] + 0.32 * B[i]; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / Math.max(1e-6, hi - lo);
    return out;
  }

  // dörr: 3x3 runt den får inga hinder, passagerutorna på båda sidor hålls helt fria
  function markDoor(G, x, y, ox, oy, ix, iy) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(x + dx, y + dy, 1);
    G.lockMin(ox, oy, 2); G.lockMin(ix, iy, 2);
    G.solid[y * G.W + x] = 1;
  }
  // byggnad med yttermått r: väggar wallCh, inre golv floorIdx under tak, nDoors dörrar mitt på olika sidor
  // (sides: sidornas prioritetsordning, annars slumpad)
  function stampBuilding(G, rng, r, wallCh, floorIdx, nDoors, sides) {
    const { W, g } = G;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * W + x, edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      g[y][x] = edge ? wallCh : '.'; G.solid[i] = edge ? 1 : 0; G.sky[i] = 0;
      if (!edge) G.fm[i] = floorIdx;
    }
    const doors = [];
    for (const side of sides || rng.shuffle([0, 1, 2, 3])) {
      if (doors.length >= nDoors) break;
      const len = side === 0 || side === 2 ? r.h - 2 : r.w - 2, mid = (len - 1) / 2;
      const offs = Array.from({ length: len }, (_, k) => [k, Math.abs(k - mid) + rng.next() * 1.5]).sort((a, b) => a[1] - b[1]);
      for (const [k] of offs) {
        let dx, dy;
        if (side === 0) { dx = r.x + r.w - 1; dy = r.y + 1 + k; } else if (side === 2) { dx = r.x; dy = r.y + 1 + k; }
        else if (side === 1) { dx = r.x + 1 + k; dy = r.y + r.h - 1; } else { dx = r.x + 1 + k; dy = r.y; }
        const ox = dx + DX[side], oy = dy + DY[side];
        if (!G.inb(ox, oy) || g[oy][ox] !== '.' || G.solid[oy * W + ox]) continue;
        g[dy][dx] = 'D'; markDoor(G, dx, dy, ox, oy, dx - DX[side], dy - DY[side]);
        doors.push({ x: dx, y: dy, out: [ox, oy] });
        break;
      }
    }
    if (!doors.length) return null;
    return { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2, cx: r.x + (r.w >> 1), cy: r.y + (r.h >> 1), doors };
  }

  // vaktarens lya i grottan/skogen: rund sal med mitt (cx, cy) och radie rad, ring av väggtecknet wch runt om (solid),
  // golv fIdx, reserverad så att bygget inte planterar något där
  function stampLair(G, rng, cx, cy, rad, wch, fIdx, skyV) {
    const { W, H, g } = G, inside = new Uint8Array(W * H), ring = new Uint8Array(W * H), cells = [];
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const dd = Math.hypot(x - cx, y - cy) + (rng.next() - 0.5) * 0.25;
      if (G.inb(x, y) && (dd <= rad + 0.2 || cheb(x, y, cx, cy) <= 2)) inside[y * W + x] = 1;
    }
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const i = y * W + x;
      if (!inside[i]) continue;
      g[y][x] = '.'; G.fm[i] = fIdx; G.sky[i] = skyV; G.res[i] = 1; G.solid[i] = 0; cells.push([x, y]);
      for (let k = 0; k < 8; k++) {
        const nx = x + RX[k], ny = y + RY[k], ni = ny * W + nx;
        if (inside[ni] || ring[ni]) continue;
        ring[ni] = 1; g[ny][nx] = wch; G.solid[ni] = 1; G.sky[ni] = skyV;
      }
    }
    return { cx, cy, rad, inside, ring, cells, fIdx, skyV };
  }
  // n öppningar i lyans ring, så långt isär som möjligt; score(utsida x, y) = lägre är bättre
  function lairGaps(G, rng, lair, n, score) {
    const { W, g } = G, cand = [];
    for (let i = 0; i < lair.ring.length; i++) {
      if (!lair.ring[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const ix = x - DX[d], iy = y - DY[d], ox = x + DX[d], oy = y + DY[d], oi = oy * W + ox;
        if (!lair.inside[iy * W + ix] || !G.inb(ox, oy) || lair.inside[oi] || lair.ring[oi] || G.solid[oi]) continue;
        if (!isWall(g[y + DX[d]][x + DY[d]]) || !isWall(g[y - DX[d]][x - DY[d]])) continue; // väggar på båda sidor om öppningen
        cand.push({ x, y, in: [ix, iy], out: [ox, oy], ang: Math.atan2(y - lair.cy, x - lair.cx), s: score(ox, oy) + rng.next() * 3 });
      }
    }
    cand.sort((a, b) => a.s - b.s);
    const out = [];
    const angGap = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
    for (const c of cand) { if (out.length >= n) break; if (out.some(o => angGap(o.ang, c.ang) < 1.7)) continue; out.push(c); }
    for (const c of out) {
      const i = c.y * W + c.x;
      g[c.y][c.x] = '.'; G.solid[i] = 0; G.fm[i] = lair.fIdx; G.sky[i] = lair.skyV; G.res[i] = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(c.x + dx, c.y + dy, 1);
      G.lockMin(c.in[0], c.in[1], 2); G.lockMin(c.out[0], c.out[1], 2);
    }
    return out;
  }

  // hemlig ficka (3x3) bakom en hemlig vägg i massivt berg/skog av tecknet wc
  function addSecretG(G, rng, wc) {
    const { W, H, g } = G, cands = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[y][x] !== '.' || G.lock[y * W + x] || G.res[y * W + x]) continue;
      for (let d = 0; d < 4; d++) {
        const ox = x + DX[d], oy = y + DY[d];
        if (g[oy][ox] !== wc) continue;
        for (let k = 0; k < 3; k++) {
          let ix, iy;
          if (d === 0) { ix = ox + 1; iy = y - k; } else if (d === 2) { ix = ox - 3; iy = y - k; }
          else if (d === 1) { iy = oy + 1; ix = x - k; } else { iy = oy - 3; ix = x - k; }
          if (ix < 1 || iy < 1 || ix + 3 > W - 1 || iy + 3 > H - 1) continue;
          let ok = true;
          for (let yy = iy - 1; ok && yy <= iy + 3; yy++) for (let xx = ix - 1; xx <= ix + 3; xx++) if (g[yy][xx] !== wc) { ok = false; break; }
          if (ok) cands.push({ ix, iy, ox, oy, x, y });
        }
      }
    }
    if (!cands.length) return null;
    const c = rng.pick(cands), skyV = G.sky[c.y * W + c.x];
    for (let yy = c.iy; yy < c.iy + 3; yy++) for (let xx = c.ix; xx < c.ix + 3; xx++) { g[yy][xx] = '.'; G.fm[yy * W + xx] = 0; G.sky[yy * W + xx] = skyV; G.lockMin(xx, yy, 1); }
    g[c.oy][c.ox] = '*'; G.sky[c.oy * W + c.ox] = skyV;
    markDoor(G, c.ox, c.oy, c.x, c.y, c.x, c.y);
    return { x: c.ix, y: c.iy, w: 3, h: 3, type: 'secret', cx: c.ix + 1, cy: c.iy + 1, door: [c.ox, c.oy] };
  }

  // ---------- Innehåll (alla biomer): roller, rumstyper, rekvisita, föremål, fiendegrupper ----------
  // L: { biome, P, X, rooms: [{ id, type, tag, cells, cx, cy, box, d, deg?, indoor, outBox? }] (id = index),
  //      rid (rum-id per ruta, -1 utanför), corridors? (korridorrutor, fängelsehålan), floors (utökas vid behov),
  //      gid (vaktare), guardian: { center }, secret (rumspost eller null), spikes (önskat antal spikfällor),
  //      cfg: { treasureTags, extraChest, eliteTags, shrineTags, barrels: { p, min, tags }, deadEnd } }
  // Varje rum utom start får rekvisita efter sin rumstyp och antingen en fiendegrupp (2-5, aldrig exakt en) eller,
  // för specialrummen (shop, shrine, treasure, secret, guardian), föremål/interaktiva saker i stället.
  function content(G, rng, depth, opts, L) {
    const { W, g, lock, fm } = G, { P, X, rooms, rid } = L, cfg = L.cfg || {};
    const cnt = {}, CAP = { o: 8, e: 4, z: 6, w: 1, y: 1 };
    const can = ch => CAP[ch] === undefined || (cnt[ch] || 0) < CAP[ch];
    const set = (x, y, ch) => { g[y][x] = ch; cnt[ch] = (cnt[ch] || 0) + 1; };
    const size = r => r.cells.length;
    const farFromP = (x, y) => Math.hypot(x - P[0], y - P[1]) >= 7;
    const nWall = (x, y) => (isWall(g[y - 1][x]) ? 1 : 0) + (isWall(g[y + 1][x]) ? 1 : 0) + (isWall(g[y][x - 1]) ? 1 : 0) + (isWall(g[y][x + 1]) ? 1 : 0);
    const nearCh = (x, y, ch, d) => { for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) if (G.at(xx, yy) === ch) return true; return false; };
    // kandidatrutor i rummet, sorterade (o.near/o.center: närmast först, annars slumpordning)
    // o: block (hinder: kräver olåst ruta), strict (olåst även för icke-hinder), wall, corner, open, far, pred, avoid: [tecken, avstånd], jit
    function cands(r, o) {
      const out = [], lim = o.block || o.strict ? 0 : 1;
      for (const p of r.cells) {
        const x = p[0], y = p[1];
        if (g[y][x] !== '.' || lock[y * W + x] > lim) continue;
        if (o.wall || o.corner || o.open) { const nw = nWall(x, y); if ((o.wall && !nw) || (o.corner && nw < 2) || (o.open && nw)) continue; }
        if (o.far && !farFromP(x, y)) continue;
        if (o.pred && !o.pred(x, y)) continue;
        if (o.avoid && nearCh(x, y, o.avoid[0], o.avoid[1])) continue;
        let k;
        if (o.near) { k = Math.hypot(x - o.near[0], y - o.near[1]); if (o.near[2] !== undefined && k > o.near[2]) continue; k += rng.next() * (o.jit || 0.6); }
        else if (o.center) k = Math.hypot(x - r.cx, y - r.cy) + rng.next() * (o.jit || 0.9);
        else k = rng.next();
        out.push([x, y, k]);
      }
      return out.sort((a, b) => a[2] - b[2]);
    }
    // placerar upp till n st av tecknet ch; hinder går genom localOK så att inget stängs av
    function place(r, ch, n, o) {
      o = o || {};
      const done = [];
      if (n <= 0 || !can(ch)) return done;
      const block = genBlk(ch);
      for (const [x, y] of cands(r, block ? Object.assign({ block: true }, o) : o)) {
        if (done.length >= n || !can(ch)) break;
        if (g[y][x] !== '.') continue;
        if (o.spread && done.some(p => cheb(p[0], p[1], x, y) < o.spread)) continue;
        if (block && !localOK(G, x, y)) continue;
        set(x, y, ch); done.push([x, y]);
      }
      return done;
    }
    function putAt(x, y, ch) {
      if (!G.inb(x, y) || g[y][x] !== '.' || !can(ch)) return false;
      if (genBlk(ch) ? lock[y * W + x] || !localOK(G, x, y) : lock[y * W + x] > 1) return false;
      set(x, y, ch); return true;
    }
    // bokhyllor o.d. i korta rader längs väggarna
    function shelves(r, ch, n) {
      let left = n;
      for (const [x, y] of cands(r, { block: true, wall: true })) {
        if (left <= 0) break;
        if (g[y][x] !== '.' || !localOK(G, x, y)) continue;
        const hz = isWall(g[y - 1][x]) || isWall(g[y + 1][x]);
        for (let k = 0, run = rng.int(2, 4); k < run && left > 0; k++) {
          const xx = x + (hz ? k : 0), yy = y + (hz ? 0 : k), i = yy * W + xx;
          if (rid[i] !== r.id || g[yy][xx] !== '.' || lock[i] || !nWall(xx, yy) || !localOK(G, xx, yy)) break;
          set(xx, yy, ch); left--;
        }
      }
      return n - left;
    }
    // bord i en rad genom rummets mitt längs långsidan (gap: varannan ruta)
    function row(r, ch, n, gap) {
      const b = r.box, hz = b.w >= b.h, done = [];
      const lines = [hz ? r.cy : r.cx];
      if ((hz ? b.h : b.w) >= 8 && n >= 4) lines.push(lines[0] + (rng.chance(0.5) ? 3 : -3));
      for (const ln of lines) {
        const a0 = (hz ? b.x : b.y) + 2, a1 = (hz ? b.x + b.w : b.y + b.h) - 3;
        for (let a = a0; a <= a1 && done.length < n; a += gap ? 2 : 1) {
          const x = hz ? a : ln, y = hz ? ln : a, i = y * W + x;
          if (!G.inb(x, y) || rid[i] !== r.id || g[y][x] !== '.' || lock[i] || !can(ch) || !localOK(G, x, y)) continue;
          set(x, y, ch); done.push([x, y]);
        }
      }
      return done;
    }
    // rader av likkistor: var annan ruta på långsidan, var tredje tvärs över
    function grid(r, ch, n) {
      const b = r.box, hz = b.w >= b.h;
      return place(r, ch, n, { open: true, center: true, jit: 3, pred: (x, y) => ((hz ? x - b.x : y - b.y) % 2 === 1) && ((hz ? y - b.y : x - b.x) % 3 === 1) });
    }
    // ring (svampring) med radien rad runt rummets mitt
    function ring(r, ch, rad, n) {
      const c = r.cells.filter(([x, y]) => g[y][x] === '.' && lock[y * W + x] < 2 && Math.abs(Math.hypot(x - r.cx, y - r.cy) - rad) < 0.55)
        .map(([x, y]) => [x, y, Math.atan2(y - r.cy, x - r.cx)]).sort((a, b) => a[2] - b[2]);
      const done = [];
      for (const [x, y] of c) {
        if (done.length >= n || !can(ch)) break;
        if (done.some(p => cheb(p[0], p[1], x, y) < 2)) continue;
        set(x, y, ch); done.push([x, y]);
      }
      return done;
    }
    // marknadsstånd: två bord och en låda i rad
    function stalls(r, n) {
      let k = 0;
      for (const [x, y] of cands(r, { block: true, open: true })) {
        if (k >= n) break;
        if (nearCh(x, y, 'J', 3)) continue;
        const hz = rng.chance(0.5), seq = rng.chance(0.5) ? 'JJT' : 'TJJ';
        let ok = true;
        for (let t = 0; t < 3 && ok; t++) { const xx = hz ? x + t : x, yy = hz ? y : y + t, i = yy * W + xx; ok = G.inb(xx, yy) && rid[i] === r.id && g[yy][xx] === '.' && !lock[i]; }
        if (!ok) continue;
        let m = 0;
        for (let t = 0; t < 3; t++) { const xx = hz ? x + t : x, yy = hz ? y : y + t; if (localOK(G, xx, yy)) { set(xx, yy, seq[t]); m++; } else break; }
        if (m) k++;
      }
      return k;
    }
    // altare (om banan får ett) eller staty vid väggen närmast rummets mitt
    function focal(r) {
      const ch = L.altar && can('y') ? 'y' : 'u';
      return place(r, ch, 1, { wall: true, center: true, jit: 2 })[0] || place(r, ch, 1, { center: true })[0] || null;
    }
    const extraChests = [];
    function chest(r, p) { if (rng.chance(p)) { const c = place(r, 'C', 1, { wall: true, far: true })[0]; if (c) extraChests.push(c); } }
    const floorIdx = name => { let k = L.floors.indexOf(name); if (k < 0 && L.floors.length < 10) { L.floors.push(name); k = L.floors.length - 1; } return k; };
    function paint(r, name) { const k = floorIdx(name); if (k >= 0) for (const [x, y] of r.cells) if (!isWall(g[y][x])) fm[y * W + x] = k; }
    const F = { int: (a, b) => rng.int(a, b), chance: p => rng.chance(p), place, putAt, shelves, row, grid, ring, stalls, focal, chest,
      nextTo: ch => (x, y) => g[y - 1][x] === ch || g[y + 1][x] === ch || g[y][x - 1] === ch || g[y][x + 1] === ch };

    const normal = () => rooms.filter(r => r.type === 'normal');
    const isCombat = r => r.type === 'normal' || r.type === 'exit' || r.type === 'elite';
    for (const r of rooms) { r.far = 0; for (const [x, y] of r.cells) if (g[y][x] === '.' && lock[y * W + x] < 2 && farFromP(x, y)) r.far++; }
    const maxD = Math.max(1, ...rooms.map(r => r.d || 0));
    L.altar = rng.chance(0.35);

    // ----- vaktarens sal: Z i mitten med fri 5x5, ljuskällor och tematisk dekor längs kanterna -----
    const gRoom = rooms.find(r => r.type === 'guardian');
    {
      const sp = GUARDIANS[L.gid], [zx, zy] = L.guardian.center;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) G.lockMin(zx + dx, zy + dy, 2);
      if (!gRoom || g[zy][zx] !== '.' || rid[zy * W + zx] !== gRoom.id) return null;
      set(zx, zy, 'Z');
      gRoom.cx = zx; gRoom.cy = zy;
      const nl = L.gid === 'beast' ? 4 : rng.int(2, 4);
      let lit = place(gRoom, sp.light, nl, { wall: true, spread: 4 }).length;
      if (lit < 2) lit += place(gRoom, sp.light, 2 - lit, { spread: 3 }).length;
      if (lit < 2) return null;
      for (const ch of rng.shuffle(sp.decor.split(''))) if (!place(gRoom, ch, 1, { wall: true, spread: 2, avoid: [ch, 1] }).length) place(gRoom, ch, 1, {});
      place(gRoom, 'h', 1, { wall: true }); place(gRoom, 'a', 1, { wall: true });
    }

    // ----- köpman: mot en vägg med fritt golv framför sig, i den närmare halvan av banan -----
    if (opts.shop) {
      const front = (x, y) => { for (let k = 0; k < 4; k++) { const fx = x - DX[k], fy = y - DY[k]; if (isWall(g[y + DY[k]][x + DX[k]]) && g[fy][fx] === '.' && lock[fy * W + fx] < 2) return [fx, fy]; } return null; };
      const c = normal().filter(a => size(a) >= 12).sort((a, b) => a.d - b.d);
      const pool = rng.shuffle(c.slice(0, Math.max(1, Math.ceil(c.length / 2))));
      pool.sort((a, b) => (a.far < 4 ? 0 : 1) - (b.far < 4 ? 0 : 1)); // rum där inga fiender får stå passar bäst
      let shop = null;
      for (const a of pool.concat(c)) {
        const m = place(a, 'M', 1, { center: true, pred: (x, y) => front(x, y) && cheb(x, y, P[0], P[1]) >= 3 })[0];
        if (m) { const f = front(m[0], m[1]); G.lockMin(f[0], f[1], 2); shop = a; F.shopAt = m; break; }
      }
      if (!shop) return null;
      shop.type = 'shop';
    }
    // ----- kortkista: helst i en utsedd byggnad/glänta (taggarna i prioritetsordning), annars ett avlägset rum -----
    {
      const tags = cfg.treasureTags || [];
      let c = [];
      for (const t of tags) { c = normal().filter(a => a.tag === t); if (c.length) break; }
      if (!c.length) c = normal().filter(a => size(a) >= 8);
      const t = rng.weighted(c, a => (1 + 2 * a.d / maxD) * (cfg.deadEnd && a.deg === 1 ? 3 : 1) * (a.far < 4 ? 4 : 1));
      if (!t || !place(t, 'C', 1, { center: true }).length) return null;
      t.type = 'treasure';
      if (tags.length) for (const a of normal().filter(a => a.tag === tags[0])) if (rng.chance(cfg.extraChest || 0) && place(a, 'C', 1, { center: true }).length) a.type = 'treasure';
    }
    // ----- elitrum: avlägsna, olika rum, med plats för en grupp långt från P -----
    {
      const nElite = Math.max(1, Math.floor(depth / 2)), et = cfg.eliteTags || [];
      for (let i = 0; i < nElite; i++) {
        const c = normal().filter(a => a.far >= 4).sort((a, b) => b.d - a.d);
        const a = rng.weighted(c.slice(0, Math.max(1, Math.ceil(c.length * 0.6))), a => (et.includes(a.tag) ? 3 : 1) * Math.sqrt(size(a)));
        if (!a) { if (i === 0) return null; break; }
        a.type = 'elite';
      }
    }
    // ----- helgedom med helande brunn (halva banorna, och alltid för rum där inga fiender får stå) -----
    {
      const tooNear = () => normal().filter(a => a.far < 4);
      const spare = rooms.filter(a => (a.type === 'normal' && a.far >= 4) || a.type === 'exit' || a.type === 'elite').length - (2 + Math.ceil(depth / 2));
      if ((rng.chance(0.5) && spare > 0) || tooNear().length) {
        const st = cfg.shrineTags || [];
        let c = tooNear();
        if (!c.length) { c = normal().filter(a => st.includes(a.tag)); if (!c.length) c = normal().filter(a => size(a) >= 9); }
        for (const a of rng.shuffle(c.slice()).sort((u, v) => (st.includes(v.tag) ? 1 : 0) - (st.includes(u.tag) ? 1 : 0))) {
          const w = a.tag === 'fountain' && putAt(a.cx, a.cy, 'w') ? [a.cx, a.cy] : place(a, 'w', 1, { center: true, jit: 2 })[0];
          if (w) { a.type = 'shrine'; F.wellAt = w; break; }
        }
      }
      if (tooNear().length) return null;
    }

    // ----- rumstyper och möblering -----
    const used = {};
    const SPECIAL_ARCH = { start: 'start', guardian: 'guardian', shop: 'shop', shrine: 'shrine', treasure: 'vault', secret: 'secret' };
    for (const r of rooms) {
      if (SPECIAL_ARCH[r.type]) { r.arch = r.tag === 'hut' && r.type === 'treasure' ? 'hut' : SPECIAL_ARCH[r.type]; continue; }
      const by = ARCH_BY[L.biome], list = (by[r.tag] || by.open || by.room).filter(([id]) => size(r) >= (ARCH[id].min || 0));
      r.arch = list.length ? rng.weighted(list, ([id, w]) => w / (1 + 2 * (used[id] || 0)))[0] : (by[r.tag] || by.open || by.room)[0][0];
      used[r.arch] = (used[r.arch] || 0) + 1;
    }
    for (const r of rooms) {
      const A = ARCH[r.arch];
      if (A.floor && (A.paint || (r.indoor && (L.biome === 'dungeon' || L.biome === 'courtyard')))) paint(r, A.floor);
      A.fill(r, F);
    }
    // altaret hamnar i ett kapell; finns inget får ett annat stort rum det
    if (L.altar && !cnt.y) {
      for (const r of rooms.filter(isCombat).sort((a, b) => size(b) - size(a))) {
        const p = place(r, 'y', 1, { wall: true, center: true, jit: 2 })[0];
        if (p) { place(r, 'c', F.int(1, 2), { near: [p[0], p[1], 2] }); break; }
      }
    }

    // ----- vapen: ett rum mitt i banan -----
    if (opts.weapon && WEAPON_CHARS.includes(opts.weapon)) {
      const ds = rooms.map(a => a.d).sort((a, b) => a - b), med = ds[ds.length >> 1];
      let pool = normal(); if (!pool.length) pool = rooms.filter(a => isCombat(a) || a.type === 'treasure');
      pool.sort((a, b) => Math.abs(a.d - med) - Math.abs(b.d - med));
      let done = false;
      for (const a of pool) if (place(a, opts.weapon, 1, {}).length) { done = true; break; }
      if (!done) return null;
    }
    // ----- eldfat som ljuskällor, intill väggar -----
    {
      const bc = cfg.barrels || { p: 0.5, min: 2 }, placed = [];
      const ok = (x, y) => cheb(x, y, P[0], P[1]) >= 2 && cheb(x, y, X[0], X[1]) >= 2 && placed.every(p => cheb(p[0], p[1], x, y) >= 4);
      const lit = rooms.filter(a => a.type !== 'guardian' && a.type !== 'secret');
      for (const a of rng.shuffle(lit.slice())) {
        const want = (rng.chance(bc.p) ? 1 : 0) + (bc.tags && bc.tags.includes(a.tag) ? 1 : 0);
        for (let k = 0; k < want; k++) { const c = place(a, 'f', 1, { wall: true, pred: ok })[0]; if (c) placed.push(c); }
      }
      for (const a of rng.shuffle(lit.slice())) { if (placed.length >= bc.min) break; const c = place(a, 'f', 1, { wall: true, pred: ok })[0]; if (c) placed.push(c); }
      if (!placed.length) return null;
    }
    // ----- hälsa, ammo, rustning, guld, krukor -----
    const lootRooms = rooms.filter(a => a.type !== 'shop' && a.type !== 'guardian' && a.type !== 'secret');
    const scatter = (count, ch, list) => {
      for (let i = 0; i < count; i++) for (let t = 0; t < 8; t++) { const a = rng.weighted(list, size); if (a && place(a, ch, 1, {}).length) break; }
    };
    const start = rooms.find(r => r.type === 'start');
    if (rng.chance(0.4)) place(start, rng.chance(0.5) ? 'h' : 'a', 1, { pred: (x, y) => cheb(x, y, P[0], P[1]) >= 2 });
    scatter(rng.int(3, 5), 'h', lootRooms.filter(a => a.type !== 'start'));
    scatter(rng.int(3, 5), 'a', lootRooms.filter(a => a.type !== 'start'));
    if (rng.chance(Math.min(0.75, 0.3 + 0.08 * depth))) scatter(1, 'A', lootRooms.filter(a => isCombat(a) || a.type === 'treasure'));
    const gold = rng.int(3, 8), secretGold = L.secret ? Math.min(2, gold - 2) : 0;
    scatter(gold - secretGold, '$', lootRooms);
    for (let i = rng.int(2, 5); i > 0; i--) for (let t = 0; t < 8; t++) { const a = rng.weighted(lootRooms, size); if (a && place(a, 'o', 1, { pred: (x, y) => nWall(x, y) > 0 || rng.chance(0.25) }).length) break; }
    // hemligt rum: en kandelaber/benhög i hörnet längst från ingången, sedan belöningarna
    if (L.secret) {
      const s = L.secret, d = s.door;
      const far = s.cells.filter(([x, y]) => (x !== s.cx || y !== s.cy) && g[y][x] === '.').sort((a, b) => cheb(b[0], b[1], d[0], d[1]) - cheb(a[0], a[1], d[0], d[1]) + (rng.next() - 0.5) * 0.5)[0];
      if (far) set(far[0], far[1], rng.chance(0.5) ? 'c' : 'j');
      fillSecret(rng, g, s, s.cells.slice(), secretGold);
    }

    // ----- fiender: grupper om 2-5 per stridsrum (elitrummen har E i gruppen), aldrig en ensam fiende -----
    const eTypes = enemyTypes(depth);
    const pickEnemy = mix => rng.weighted(eTypes, t => t[1] * (mix && mix.includes(t[0]) ? 3 : 1))[0];
    const fight = rooms.filter(isCombat);
    const want = new Map(fight.map(r => [r, 2]));
    const typeF = { normal: 1, exit: 1.3, elite: 1.4 };
    let left = 6 + 3 * depth + rng.int(-1, 2) - 2 * fight.length;
    for (const [div, top] of [[7, 5], [4, 6]]) { // först normala grupper, sedan större om rummen är få
      for (; left > 0; left--) {
        const r = rng.weighted(fight, q => (want.get(q) < Math.min(top, Math.max(2, Math.floor(q.far / div))) ? Math.sqrt(size(q)) * typeF[q.type] : 0));
        if (!r) break;
        want.set(r, want.get(r) + 1);
      }
    }
    for (const r of fight) {
      const c = cands(r, { far: true });
      if (c.length < 2) return null;
      const c0 = c[0], mix = ARCH[r.arch].mix, placed = [];
      const order = c.map(p => [p[0], p[1], Math.hypot(p[0] - c0[0], p[1] - c0[1]) + rng.next() * 1.5]).sort((a, b) => a[2] - b[2]);
      for (const sp of [2, 1]) for (const [x, y] of order) {
        if (placed.length >= want.get(r)) break;
        if (g[y][x] !== '.' || placed.some(p => cheb(p[0], p[1], x, y) < sp)) continue;
        set(x, y, r.type === 'elite' && !placed.length ? 'E' : pickEnemy(mix)); placed.push([x, y]);
      }
      if (placed.length < 2) return null;
      r.group = c0; r.en = placed.length;
    }
    // ----- explosiva tunnor nära fiendegrupperna (1-4) -----
    for (let k = rng.int(1, 4); k > 0; k--) {
      const r = rng.weighted(fight, q => (q.en >= 3 ? 2 : 1));
      if (!r || !(place(r, 'e', 1, { near: [r.group[0], r.group[1], 3.5] }).length || place(r, 'e', 1, {}).length)) break;
    }
    if (!cnt.e) for (const r of rng.shuffle(rooms.filter(q => q.type !== 'guardian' && q.type !== 'start'))) if (place(r, 'e', 1, {}).length) break;
    if (!cnt.e) return null;
    // ----- spikfällor: i korridorer (fängelsehålan) och stridsrum, aldrig vid dörrar, P eller x -----
    {
      const goal = Math.min(CAP.z, Math.max(cnt.z || 0, L.spikes || 0)), cor = L.corridors ? rng.shuffle(L.corridors.slice()) : [];
      let inCor = 0;
      for (const [x, y] of cor) {
        if ((cnt.z || 0) >= goal || inCor >= 2) break;
        if (g[y][x] === '.' && !lock[y * W + x] && !nearCh(x, y, 'z', 3)) { set(x, y, 'z'); inCor++; }
      }
      for (const r of rng.shuffle(fight.slice())) { if ((cnt.z || 0) >= goal) break; place(r, 'z', 1, { strict: true, avoid: ['z', 2] }); }
    }
    // ----- mimics: ~15 % av de extra kistorna (den garanterade kortkistan är alltid äkta) -----
    for (const [x, y] of extraChests) if (g[y][x] === 'C' && farFromP(x, y) && rng.chance(0.15)) g[y][x] = 'Q';

    // ----- rekvisita i alla rum utom start (säkerhetsnät om rumstypen inte fick plats med något) -----
    for (const r of rooms) {
      if (r.type === 'start' || r.cells.some(([x, y]) => PROP_CHARS.includes(g[y][x]))) continue;
      if (!place(r, rng.chance(0.5) ? 'c' : 'j', 1, {}).length && !place(r, 'j', 1, { strict: false }).length) {
        const c = r.cells.find(([x, y]) => g[y][x] === '.');
        if (!c) return null;
        set(c[0], c[1], 'j');
      }
    }

    // ----- utdata: rumslista och rumsmask -----
    const out = rooms.map(r => {
      const b = r.outBox || r.box, o = { x: b.x, y: b.y, w: b.w, h: b.h, type: r.type, arch: r.arch };
      if (r.tag && r.tag !== 'room') o.tag = r.tag;
      if (r.type === 'guardian') o.guardian = L.gid;
      return o;
    });
    const mask = new Array(W * G.H);
    for (let i = 0; i < mask.length; i++) mask[i] = rid[i] < 0 ? '-' : String.fromCharCode(48 + rid[i]);
    return { rooms: out, roomMask: rowsOf(W, G.H, mask), floors: L.floors };
  }

  // ---------- Områden för biomerna: start, utgång, områdesindelning, sedan content ----------
  // cfg: { biome, gid, floors, guardian: { cells, center, doors: [[x, y] utanför ingången] }, P, X: [x,y] (annars BFS-längst
  //   bort från vaktaren resp. P), seeds: [{x, y, tag, box | cells}] (utsedda områden, växer inte), areaCells (önskad storlek
  //   på övriga områden), treasureTags, extraChest, eliteTags, shrineTags, barrels: {p, min, tags}, secretWall, secretChance, spikes }
  function populate(G, rng, depth, opts, cfg) {
    const { W, H, g, lock } = G, N = W * H;
    const gr = cfg.guardian, inG = new Uint8Array(N);
    for (const [x, y] of gr.cells) inG[y * W + x] = 1;
    const freeCells = () => { const out = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && lock[y * W + x] < 2 && !inG[y * W + x]) out.push([x, y]); return out; };
    const farthest = (d, frac) => {
      const fr = freeCells().filter(([x, y]) => d[y * W + x] >= 0);
      if (!fr.length) return null;
      let mx = 0; for (const [x, y] of fr) mx = Math.max(mx, d[y * W + x]);
      return rng.pick(fr.filter(([x, y]) => d[y * W + x] >= mx * frac));
    };
    // ----- start långt från vaktarens sal, utgången långt från start -----
    let P = cfg.P;
    if (!P) P = farthest(bfsG(G, gr.doors), 0.85);
    if (!P || g[P[1]][P[0]] !== '.' || inG[P[1] * W + P[0]]) return null;
    g[P[1]][P[0]] = 'P';
    const dS = bfsG(G, [P]);
    const X = cfg.X || farthest(dS, 0.92);
    if (!X || g[X[1]][X[0]] !== '.' || dS[X[1] * W + X[0]] < 0 || inG[X[1] * W + X[0]]) return null;
    if (dS[gr.center[1] * W + gr.center[0]] < 0) return null;
    g[X[1]][X[0]] = 'x';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { G.lockMin(P[0] + dx, P[1] + dy, 1); G.lockMin(X[0] + dx, X[1] + dy, 1); }

    // ----- områden: vaktaren, utsedda (byggnader, gläntor), start, sedan längst-bort-utspridda frön som växer -----
    const aid = new Int16Array(N).fill(-1), areas = [];
    const open = i => dS[i] >= 0 && !isDoorCh(g[(i / W) | 0][i % W]); // dörrar hör inte till något område
    const newArea = (tag, type) => { const a = { id: areas.length, tag, type: type || 'normal', cells: [] }; areas.push(a); return a; };
    const claim = (a, i) => { aid[i] = a.id; a.cells.push([i % W, (i / W) | 0]); };
    const ga = newArea('guardian', 'guardian');
    for (const [x, y] of gr.cells) if (open(y * W + x)) claim(ga, y * W + x);
    for (const s of cfg.seeds || []) {
      const a = newArea(s.tag);
      const list = s.cells || [];
      if (s.box) for (let y = s.box.y; y < s.box.y + s.box.h; y++) for (let x = s.box.x; x < s.box.x + s.box.w; x++) list.push([x, y]);
      for (const [x, y] of list) { const i = y * W + x; if (aid[i] < 0 && open(i)) claim(a, i); }
      if (!a.cells.length) { areas.pop(); continue; }
      a.cx = s.x; a.cy = s.y;
    }
    let start = aid[P[1] * W + P[0]] >= 0 ? areas[aid[P[1] * W + P[0]]] : null;
    if (start && start.type === 'guardian') return null;
    if (!start) { // rutorna inom 5 steg från P
      start = newArea('start');
      const q = [P[1] * W + P[0]], dd = new Map([[q[0], 0]]); claim(start, q[0]);
      for (let qh = 0; qh < q.length; qh++) {
        const cur = q[qh], x = cur % W, y = (cur / W) | 0;
        if (dd.get(cur) >= 5) continue;
        for (let d = 0; d < 4; d++) { const ni = (y + DY[d]) * W + x + DX[d]; if (aid[ni] < 0 && open(ni)) { claim(start, ni); dd.set(ni, dd.get(cur) + 1); q.push(ni); } }
      }
    }
    start.type = 'start';
    const rest = []; for (let i = 0; i < N; i++) if (aid[i] < 0 && open(i)) rest.push(i);
    const maxCombat = Math.max(3, Math.round((6 + 3 * depth) / 2.4));
    const desig = areas.filter(a => a.type === 'normal').length;
    const K = rest.length ? Math.max(cfg.minOpen || 1, Math.min(Math.round(rest.length / (cfg.areaCells || 90)), maxCombat + 2 - desig)) : 0;
    const md = new Float32Array(rest.length);
    for (let j = 0; j < rest.length; j++) md[j] = Math.hypot(rest[j] % W - P[0], ((rest[j] / W) | 0) - P[1]);
    const q = [];
    for (let k = 0; k < K; k++) {
      let best = -1, bv = -1;
      for (let j = 0; j < rest.length; j++) { const v = md[j] + rng.next() * 2; if (v > bv) { bv = v; best = j; } }
      const i = rest[best], sx = i % W, sy = (i / W) | 0;
      claim(newArea('open'), i); q.push(i);
      for (let j = 0; j < rest.length; j++) { const d = Math.hypot(rest[j] % W - sx, ((rest[j] / W) | 0) - sy); if (d < md[j]) md[j] = d; }
    }
    const grow = q => {
      for (let qh = 0; qh < q.length; qh++) {
        const cur = q[qh], x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx;
          if (!G.inb(nx, ny) || aid[ni] >= 0 || !open(ni)) continue;
          aid[ni] = aid[cur]; areas[aid[cur]].cells.push([nx, ny]); q.push(ni);
        }
      }
    };
    grow(q);
    { const q2 = []; for (let i = 0; i < N; i++) if (aid[i] >= 0 && areas[aid[i]].type !== 'guardian') q2.push(i); grow(q2); } // fickor bakom byggnader
    for (let i = 0; i < N; i++) if (aid[i] < 0 && open(i)) { const a = newArea('open'); claim(a, i); grow([i]); } // fickor som bara nås via vaktarens sal
    // ----- slå ihop för små områden, och för många öppna (varje stridsområde ska få en hel grupp) -----
    for (let it = 0; it < 80; it++) {
      const op = areas.filter(a => !a.dead && a.tag === 'open' && !a.stuck);
      let v = op.filter(a => a.cells.length < 20).sort((a, b) => a.cells.length - b.cells.length)[0];
      const small = !!v;
      if (!v && op.length > K) v = op.sort((a, b) => a.cells.length - b.cells.length)[0];
      if (!v) break;
      const border = new Map();
      for (const [x, y] of v.cells) for (let d = 0; d < 4; d++) {
        const b = aid[(y + DY[d]) * W + x + DX[d]];
        if (b < 0 || b === v.id) continue;
        const o = areas[b];
        if (o.type === 'guardian' || (!small && o.tag !== 'open')) continue;
        border.set(b, (border.get(b) || 0) + 1 + (o.tag === 'open' ? 100 : 0));
      }
      if (!border.size) { v.stuck = true; continue; }
      let best = -1, bv = -1; for (const [b, c] of border) if (c > bv) { bv = c; best = b; }
      const tgt = areas[best];
      for (const [x, y] of v.cells) { aid[y * W + x] = tgt.id; tgt.cells.push([x, y]); }
      v.cells = []; v.dead = true;
    }
    const keep = areas.filter(a => !a.dead), remap = new Int16Array(areas.length).fill(-1);
    keep.forEach((a, k) => { remap[a.id] = k; a.id = k; });
    for (let i = 0; i < N; i++) if (aid[i] >= 0) aid[i] = remap[aid[i]];
    for (const a of keep) {
      if (a.type === 'guardian') [a.cx, a.cy] = gr.center;
      else if (a.type === 'start') [a.cx, a.cy] = P;
      else if (a.tag === 'open' || a.cx === undefined || aid[a.cy * W + a.cx] !== a.id) { // tyngdpunkt -> närmaste egna ruta
        let sx = 0, sy = 0; for (const [x, y] of a.cells) { sx += x; sy += y; }
        sx /= a.cells.length; sy /= a.cells.length;
        let best = a.cells[0], bd = 1e9; for (const c of a.cells) { const d = Math.hypot(c[0] - sx, c[1] - sy); if (d < bd) { bd = d; best = c; } }
        [a.cx, a.cy] = best;
      }
      a.d = dS[a.cy * W + a.cx];
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const [x, y] of a.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      a.box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      a.indoor = !G.sky[a.cy * W + a.cx];
    }
    const exitA = keep[aid[X[1] * W + X[0]]];
    if (!exitA || exitA === start || exitA.type === 'guardian') return null;
    exitA.type = 'exit';
    { const x0 = Math.max(1, P[0] - 3), y0 = Math.max(1, P[1] - 3); start.outBox = { x: x0, y: y0, w: Math.min(W - 2, P[0] + 3) - x0 + 1, h: Math.min(H - 2, P[1] + 3) - y0 + 1 }; }

    const sec = cfg.secretWall && rng.chance(cfg.secretChance || 0) ? addSecretG(G, rng, cfg.secretWall) : null;
    let srec = null;
    if (sec) {
      const cells = [];
      for (let y = sec.y; y < sec.y + 3; y++) for (let x = sec.x; x < sec.x + 3; x++) { aid[y * W + x] = keep.length; cells.push([x, y]); }
      srec = { id: keep.length, type: 'secret', tag: 'secret', cells, cx: sec.cx, cy: sec.cy, box: { x: sec.x, y: sec.y, w: 3, h: 3 }, d: 0, indoor: !G.sky[sec.cy * W + sec.cx], door: sec.door };
      keep.push(srec);
    }
    const res = content(G, rng, depth, opts, { biome: cfg.biome, P, X, rooms: keep, rid: aid, floors: cfg.floors, gid: cfg.gid,
      guardian: { center: gr.center }, secret: srec, spikes: cfg.spikes || 0, cfg });
    if (!res) return null;
    return { G, rooms: res.rooms, roomMask: res.roomMask, floors: res.floors };
  }

  // ---------- Grottor: cellautomat, vaktarens lya nära kanten ----------
  function buildCaves(rng, depth, opts, look, K) {
    const [W, H] = mapSize(rng, depth), wc = look.wall, N = W * H;
    const G = Grid(W, H, wc), { g } = G;
    // 45 % berg, sedan utjämning: berg om >= 5 av 3x3 är berg (de första varven även där 5x5 nästan är tomt -> pelare)
    let a = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = G.inb(x, y) && rng.next() >= 0.45 ? 0 : 1;
    const R = (b, x, y, r) => { let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; n += (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 1 : b[yy * W + xx]; } return n; };
    for (let it = 0; it < 5; it++) {
      const b = new Uint8Array(N).fill(1);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) b[y * W + x] = R(a, x, y, 1) >= 5 || (it < 3 && R(a, x, y, 2) <= 2) ? 1 : 0;
      a = b;
    }
    // fyllnadsgrad i rimligt spann, annars ny cellautomat
    let nOpen = 0; for (let i = 0; i < N; i++) if (!a[i]) nOpen++;
    if (nOpen < (W - 2) * (H - 2) * 0.3) return null;
    // fyllerigång: några slingrande gångar (1-2 breda) som skapar fler förbindelser
    const opens = []; for (let i = 0; i < N; i++) if (!a[i]) opens.push(i);
    for (let k = rng.int(1, 3); k > 0; k--) {
      const s = rng.pick(opens); let x = s % W, y = (s / W) | 0, d = rng.int(0, 3);
      for (let st = rng.int(20, 45); st > 0; st--) {
        if (rng.chance(0.25)) d = (d + (rng.chance(0.5) ? 1 : 3)) & 3;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 2 || ny < 2 || nx > W - 3 || ny > H - 3) { d = (d + 2) & 3; continue; }
        x = nx; y = ny; a[y * W + x] = 0;
        if (rng.chance(0.55)) { const p = (d + 1) & 3; a[(y + DY[p]) * W + x + DX[p]] = 0; }
      }
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = a[y * W + x] ? wc : '.';
    // vaktarens lya: rund sal nära kartans kant, ring av vaktarens väggtecken, 1-2 öppningar med tunnlar ut i grottan
    const rad = rng.int(4, 5), m = rad + 2, cs = [];
    for (let y = m; y <= H - 1 - m; y++) for (let x = m; x <= W - 1 - m; x++) cs.push([x, y, Math.hypot(x - W / 2, y - H / 2) + rng.next() * 5]);
    cs.sort((u, v) => v[2] - u[2]);
    const [gx, gy] = cs[rng.int(0, Math.min(cs.length - 1, 25))];
    const lair = stampLair(G, rng, gx, gy, rad, K.wall, K.bossIdx, 0);
    const gaps = lairGaps(G, rng, lair, rng.chance(0.4) ? 2 : 1, (x, y) => Math.hypot(x - W / 2, y - H / 2));
    if (!gaps.length) return null;
    const nz = new Float32Array(N); for (let i = 0; i < N; i++) nz[i] = rng.next();
    for (const gp of gaps) {
      const s = gp.out[1] * W + gp.out[0];
      const path = dijkstra(G, [s], i => g[(i / W) | 0][i % W] === '.' && !lair.inside[i] && cheb(i % W, (i / W) | 0, gp.out[0], gp.out[1]) > 1,
        i => (G.solid[i] || G.res[i] ? Infinity : g[(i / W) | 0][i % W] === '.' ? 0.3 : 1 + nz[i]));
      if (!path) return null;
      for (const i of path) for (const [xx, yy] of [[i % W, (i / W) | 0], [i % W + 1, (i / W) | 0]]) if (G.inb(xx, yy) && !G.solid[yy * W + xx] && !G.res[yy * W + xx]) g[yy][xx] = '.';
    }
    // största grottan behålls, andra stora kopplas dit med två rutor breda tunnlar, småfickor fylls igen
    if (!connectRegions(G, rng, { minSize: 16, fillCh: wc, width: 2 })) return null;
    nOpen = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.') nOpen++;
    const share = nOpen / ((W - 2) * (H - 2));
    if (share < 0.3 || share > 0.66) return null;
    // droppstenar i för stora salar
    breakOpen(G, rng, 5, (x, y) => { if (plantNear(G, rng, x, y, wc, 1) && rng.chance(0.5)) plantNear(G, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), wc, 1); });
    // lerfläckar
    const M = fbm(rng, W, H, 5);
    for (let i = 0; i < N; i++) if (M[i] < 0.3 && !G.res[i]) G.fm[i] = 1;
    return populate(G, rng, depth, opts, { biome: 'caves', gid: K.id, floors: K.floors, guardian: { cells: lair.cells, center: [gx, gy], doors: gaps.map(c => c.out) },
      areaCells: 75, barrels: { p: 0.45, min: 3 }, secretWall: wc, secretChance: 0.55, spikes: rng.int(1, 3) });
  }

  // ---------- Kyrkogård: öppet fält, kapell, kryptor, gravkvarter, vaktarens inhägnad ----------
  // gravkvarter: rektangel r, ev. med mur (7) och 2-3 gluggar; gravstenar i rader inuti
  function stampPlot(G, rng, r, walled) {
    const { W, g } = G, gates = [];
    let ix = r.x, iy = r.y, iw = r.w, ih = r.h;
    if (walled) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) g[y][x] = '7';
      ix++; iy++; iw -= 2; ih -= 2;
      for (const s of rng.shuffle([0, 1, 2, 3]).slice(0, rng.int(2, 3))) {
        const len = s === 0 || s === 2 ? ih : iw, k = rng.int(0, len - 1), two = len >= 4 && rng.chance(0.4);
        for (let j = 0; j < (two ? 2 : 1); j++) {
          const kk = Math.min(len - 1, k + j);
          let x, y;
          if (s === 0) { x = r.x + r.w - 1; y = iy + kk; } else if (s === 2) { x = r.x; y = iy + kk; }
          else if (s === 1) { x = ix + kk; y = r.y + r.h - 1; } else { x = ix + kk; y = r.y; }
          g[y][x] = '.';
          for (const t of [-1, 0, 1]) G.lockMin(x + DX[s] * t, y + DY[s] * t, 1);
          if (!j) gates.push([x + DX[s], y + DY[s]]);
        }
      }
    } else {
      const s = rng.int(0, 3);
      gates.push(s === 0 ? [r.x + r.w, r.y + (r.h >> 1)] : s === 2 ? [r.x - 1, r.y + (r.h >> 1)] : s === 1 ? [r.x + (r.w >> 1), r.y + r.h] : [r.x + (r.w >> 1), r.y - 1]);
    }
    const dirt = rng.chance(0.5);
    for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) G.fm[y * W + x] = dirt ? 3 : 0;
    // gravstenar i rader med en gång emellan, glest och lite ojämnt
    const horiz = iw >= ih ? rng.chance(0.75) : rng.chance(0.25);
    const A = horiz ? ih : iw, B = horiz ? iw : ih;
    for (let a = rng.int(0, 1); a < A; a += 2) {
      for (let b = rng.int(0, 1); b < B; b += rng.chance(0.2) ? 3 : 2) {
        if (rng.chance(0.1)) continue;
        plant(G, horiz ? ix + b : ix + a, horiz ? iy + a : iy + b, 'n');
      }
    }
    return { x: ix, y: iy, w: iw, h: ih, gates, walled };
  }

  function buildGraveyard(rng, depth, opts, look, K) {
    const [W, H] = mapSize(rng, depth), N = W * H;
    const G = Grid(W, H, '.', look.wall), { g, fm, lock } = G;
    G.sky.fill(1);
    const rects = [];
    const gapOK = (a, b, gap) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
    const place = (w, h, gap, z) => { // z = [x0, y0, x1, y1) zon för rektangeln
      z = z || [2, 2, W - 2, H - 2];
      if (z[2] - w < z[0] || z[3] - h < z[1]) return null;
      for (let t = 0; t < 80; t++) {
        const r = { x: rng.int(z[0], z[2] - w), y: rng.int(z[1], z[3] - h), w, h, gap };
        if (rects.every(o => gapOK(o, r, Math.max(gap, o.gap)))) { rects.push(r); return r; }
      }
      return null;
    };
    // ingång vid en av murarna (bestäms först: vaktarens inhägnad hamnar i bortre halvan)
    const side = rng.int(0, 3), along = (L) => rng.int(Math.floor(L / 3), Math.ceil(L * 2 / 3));
    const P = side === 0 ? [W - 2, along(H)] : side === 2 ? [1, along(H)] : side === 1 ? [along(W), H - 2] : [along(W), 1];
    // vaktarens inhägnad: mur i vaktarens väggtecken, öppen himmel, 1-2 dörrar
    const big = W * H >= 1150, gw = rng.int(11, big ? 13 : 11), gh = rng.int(11, big ? 13 : 12);
    const fz = side === 0 ? [2, 2, Math.ceil(W / 2) + 1, H - 2] : side === 2 ? [Math.floor(W / 2) - 1, 2, W - 2, H - 2]
      : side === 1 ? [2, 2, W - 2, Math.ceil(H / 2) + 1] : [2, Math.floor(H / 2) - 1, W - 2, H - 2];
    const grc = place(gw, gh, 3, fz) || place(gw, gh, 3);
    if (!grc) return null;
    const gb = stampBuilding(G, rng, grc, K.wall, K.bossIdx, rng.int(1, 2));
    if (!gb) return null;
    const gcells = [];
    for (let y = gb.y; y < gb.y + gb.h; y++) for (let x = gb.x; x < gb.x + gb.w; x++) { G.sky[y * W + x] = 1; G.res[y * W + x] = 1; gcells.push([x, y]); }
    // kapellet nära mitten
    let cw = rng.int(7, 9), ch = rng.int(8, 10);
    if (rng.chance(0.5)) [cw, ch] = [ch, cw];
    const cr = place(cw, ch, 3, [Math.floor(W * 0.2), Math.floor(H * 0.2), Math.ceil(W * 0.8), Math.ceil(H * 0.8)]) || place(cw, ch, 3);
    if (!cr) return null;
    const chapel = stampBuilding(G, rng, cr, '5', 2, rng.int(1, 2));
    if (!chapel) return null;
    if (chapel.w >= 6 && chapel.h >= 6) { // pelare i långhuset, speglade
      const hz = chapel.w >= chapel.h, L = hz ? chapel.w : chapel.h;
      for (let k = 2; k < L - 2; k += 3) for (const s of [1, (hz ? chapel.h : chapel.w) - 2]) plant(G, chapel.x + (hz ? k : s), chapel.y + (hz ? s : k), '5');
    }
    // kryptor / gravkor
    const crypts = [];
    for (let k = depth >= 3 ? 2 : rng.int(1, 2); k > 0; k--) {
      const r = place(rng.int(5, 6), rng.int(5, 6), 2);
      const c = r && stampBuilding(G, rng, r, rng.chance(0.5) ? '4' : '1', 2, 1);
      if (c) crypts.push(c);
    }
    if (!crypts.length) return null;
    // gravkvarter
    const plots = [];
    for (let k = rng.int(5, 7) + Math.floor((W * H - 900) / 400); k > 0; k--) {
      let r = null;
      for (let t = 0; t < 4 && !r; t++) r = t < 3 ? place(rng.int(6, 11 - 2 * t), rng.int(5, 8 - t), 2) : place(5, 4, 2); // krymper om det är trångt
      if (r) plots.push(Object.assign(stampPlot(G, rng, r, rng.chance(0.55)), { outer: r }));
    }
    const inPlot = new Uint8Array(N);
    for (const p of plots) for (let y = p.outer.y; y < p.outer.y + p.outer.h; y++) for (let x = p.outer.x; x < p.outer.x + p.outer.w; x++) inPlot[y * W + x] = 1;
    // levande ljus vid gravarna i en del kvarter
    for (const p of plots) if (rng.chance(0.4)) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (g[y][x] !== 'n' || !rng.chance(0.3)) continue;
      const d = rng.int(0, 3), xx = x + DX[d], yy = y + DY[d];
      if (G.inb(xx, yy) && g[yy][xx] === '.' && !lock[yy * W + xx]) g[yy][xx] = 'c';
    }
    // grusgångar från ingången till kapellet och vidare till vaktaren, kryptor och kvarter
    if (g[P[1]][P[0]] !== '.') return null;
    const nz = new Float32Array(N); for (let i = 0; i < N; i++) nz[i] = rng.next();
    const onPath = new Uint8Array(N);
    const pcost = i => { const c = g[(i / W) | 0][i % W]; if (genBlk(c) || isDoorCh(c) || !G.sky[i] || G.res[i]) return Infinity; return onPath[i] ? 0.3 : 1 + nz[i] * 0.8 + (inPlot[i] ? 4 : 0); };
    const gravel = (path, wide) => {
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (const [xx, yy] of wide ? [[x, y], [x + 1, y], [x, y + 1]] : [[x, y]]) {
          const j = yy * W + xx;
          if (!G.inb(xx, yy) || g[yy][xx] !== '.' || !G.sky[j] || G.res[j] || (inPlot[j] && wide)) continue;
          fm[j] = 1; onPath[j] = 1; G.lockMin(xx, yy, 1);
        }
      }
    };
    onPath[P[1] * W + P[0]] = 1;
    const pois = chapel.doors.map(d => d.out).concat(gb.doors.map(d => d.out));
    for (const c of crypts) pois.push(c.doors[0].out);
    for (const p of plots) for (const gt of p.gates) if (G.inb(gt[0], gt[1]) && g[gt[1]][gt[0]] === '.') pois.push(gt);
    let avenue = null;
    for (let k = 0; k < pois.length; k++) {
      const s = pois[k][1] * W + pois[k][0];
      if (onPath[s]) continue;
      const path = dijkstra(G, [s], i => onPath[i] === 1, pcost);
      if (path) { gravel(path, k === 0); if (k === 0) avenue = path; }
    }
    // statyallé längs den breda gången till kapellet
    if (avenue) for (let k = 3; k + 4 < avenue.length; k += 4) {
      const a = avenue[k], b = avenue[k + 1], ax = a % W, ay = (a / W) | 0, px = -(((b / W) | 0) - ay), py = b % W - ax;
      for (const s of [-1, 1]) for (const off of [2, 3]) {
        const ux = ax + px * s * off, uy = ay + py * s * off;
        if (G.inb(ux, uy) && G.sky[uy * W + ux] && !inPlot[uy * W + ux] && plant(G, ux, uy, 'u')) break;
      }
    }
    // döda träd i dungar och gamla gravar på ängen
    const D = fbm(rng, W, H, 6);
    const nearCh = (x, y, c) => { for (let k = 0; k < 8; k++) if (G.at(x + RX[k], y + RY[k]) === c) return true; return false; };
    const order = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) order.push([x, y]);
    for (const [x, y] of rng.shuffle(order)) {
      const i = y * W + x;
      if (g[y][x] !== '.' || lock[i] || inPlot[i] || !G.sky[i] || G.res[i]) continue;
      if (D[i] > 0.62 ? rng.chance(0.22) : rng.chance(0.025)) { if (!nearCh(x, y, 't')) plant(G, x, y, 't'); }
      else if (D[i] < 0.45 && rng.chance(plots.length < 4 ? 0.13 : 0.07) && !nearCh(x, y, 'n')) plant(G, x, y, 'n');
      else if (D[i] < 0.3 && rng.chance(0.02)) { // en kort rad gamla gravar
        const h = rng.chance(0.5);
        for (let k = rng.int(2, 4) - 1; k >= 0; k--) { const xx = x + (h ? 2 * k : 0), yy = y + (h ? 0 : 2 * k); if (G.inb(xx, yy) && !inPlot[yy * W + xx]) plant(G, xx, yy, 'n'); }
      }
    }
    // inga gläntor bredare än ~11 rutor: träd eller en liten gravrad där det är som öppnast
    breakOpen(G, rng, 6, (x, y) => {
      if (rng.chance(0.55)) { plantNear(G, rng, x, y, 't', 1); return; }
      const h = rng.chance(0.5);
      for (const k of [-2, 0, 2]) plant(G, x + (h ? k : 0), y + (h ? 0 : k), 'n');
    });
    if (!connectRegions(G, rng, { mainAt: P, width: 1 })) return null; // säkerhetsnät, ska inte behöva gräva
    const seeds = [{ x: chapel.cx, y: chapel.cy, tag: 'chapel', box: chapel }];
    for (const c of crypts) seeds.push({ x: c.cx, y: c.cy, tag: 'crypt', box: c });
    return populate(G, rng, depth, opts, { biome: 'graveyard', gid: K.id, floors: K.floors, guardian: { cells: gcells, center: [gb.cx, gb.cy], doors: gb.doors.map(d => d.out) },
      P, seeds, areaCells: 120, treasureTags: ['crypt'], extraChest: 0.5, eliteTags: ['chapel', 'open'], barrels: { p: 0.25, min: 2, tags: ['chapel', 'crypt'] } });
  }

  // ---------- Skog: brusmask, slingrande huvudstig, slinga, gläntor och vaktarens palissad ----------
  function buildForest(rng, depth, opts, look, K) {
    const [W, H] = mapSize(rng, depth), N = W * H, wc = look.wall;
    const G = Grid(W, H, wc), { g, fm, lock } = G;
    G.sky.fill(1);
    const D = fbm(rng, W, H, rng.range(5, 7)), M = fbm(rng, W, H, 4);
    const nz = new Float32Array(N); for (let i = 0; i < N; i++) nz[i] = rng.next();
    // glesa partier är öppna, täta blir skogsbryn
    const T = rng.range(0.4, 0.48);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (D[y * W + x] < T) g[y][x] = '.';
    const pid = new Int16Array(N), clr = new Uint8Array(N); // pid: vilken stig rutan tillhör (1 huvud, 2 slinga, 3+ sidostigar, 90 vaktaren)
    const cost = own => i => G.solid[i] || G.res[i] ? Infinity : (g[(i / W) | 0][i % W] === '.' ? 1 : 2 + 3 * D[i]) + 0.6 * nz[i] + (own && own(i) ? 6 : 0);
    const carve = (path, w, id) => {
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) {
          const xx = x + dx, yy = y + dy, j = yy * W + xx;
          if (!G.inb(xx, yy) || G.solid[j] || G.res[j]) continue;
          g[yy][xx] = '.'; fm[j] = 1; G.lockMin(xx, yy, 1); if (!pid[j]) pid[j] = id;
        }
      }
    };
    const route = (pts, own) => {
      let out = [];
      for (let k = 0; k + 1 < pts.length; k++) {
        const b = pts[k + 1], p = dijkstra(G, [pts[k]], i => i === b, cost(own));
        if (!p) return null;
        out = out.concat(k ? p.slice(1) : p);
      }
      return out;
    };
    // start och mål vid motsatta kanter, brytpunkter växelvis åt sidorna så att stigen slingrar
    const horiz = rng.chance(W >= H ? 0.6 : 0.4), L = horiz ? W : H, S2 = horiz ? H : W;
    const at = (a, b) => horiz ? b * W + a : a * W + b; // (längs, tvärs) -> index
    const aS = rng.int(2, 3), aE = L - 1 - rng.int(2, 3), nW = L >= 36 ? 3 : 2, up = rng.chance(0.5);
    const pts = [at(aS, rng.int(3, S2 - 4))];
    for (let k = 1; k <= nW; k++) {
      const a = Math.round(aS + (aE - aS) * k / (nW + 1)) + rng.int(-2, 2);
      const b = ((k & 1) === 1) === up ? rng.int(3, Math.floor(S2 * 0.38)) : rng.int(Math.ceil(S2 * 0.62), S2 - 4);
      pts.push(at(a, b));
    }
    pts.push(at(aE, rng.int(3, S2 - 4)));
    if (rng.chance(0.5)) pts.reverse();
    const main = route(pts);
    if (!main) return null;
    carve(main, 2, 1);
    // slinga: en andra väg mellan två punkter på huvudstigen, på andra sidan om den
    {
      const A = main[Math.floor(main.length * rng.range(0.15, 0.3))], B = main[Math.floor(main.length * rng.range(0.65, 0.85))];
      const ab = i => horiz ? [i % W, (i / W) | 0] : [(i / W) | 0, i % W];
      const [a1, b1] = ab(A), [a2, b2] = ab(B), bm = (b1 + b2) / 2;
      const bw = Math.max(3, Math.min(S2 - 4, Math.round(bm + (bm < S2 / 2 ? 1 : -1) * rng.int(6, 9))));
      const near = new Uint8Array(N); // huvudstigen med två rutors marginal: slingan ska inte gå bredvid den
      for (const i of main) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) if (G.inb(x + dx, y + dy)) near[(y + dy) * W + x + dx] = 1; }
      const alt = route([A, at(Math.round((a1 + a2) / 2), bw), B], i => near[i] === 1);
      if (!alt) return null;
      carve(alt, 2, 2);
    }
    // avstånd till stigarna
    const pd = new Int16Array(N).fill(-1), qq = [];
    for (let i = 0; i < N; i++) if (pid[i]) { pd[i] = 0; qq.push(i); }
    for (let qh = 0; qh < qq.length; qh++) {
      const cur = qq[qh], x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx; if (G.inb(nx, ny) && pd[ni] < 0) { pd[ni] = pd[cur] + 1; qq.push(ni); } }
    }
    const S = [main[0] % W, (main[0] / W) | 0], E = [main[main.length - 1] % W, (main[main.length - 1] / W) | 0];
    // vaktarens palissad: rund glänta i bortre delen av skogen, en bit från stigen, med egen sidostig
    const rad = rng.int(4, 5);
    let gc = [];
    for (const [pmax, sf] of [[rad + 8, 0.45], [rad + 14, 0.3]]) { // helst nära stigen och långt från start, annars lite friare
      for (let y = rad + 3; y <= H - rad - 4; y++) for (let x = rad + 3; x <= W - rad - 4; x++) {
        const i = y * W + x;
        if (pd[i] < rad + 2 || pd[i] > pmax || cheb(x, y, S[0], S[1]) < Math.max(W, H) * sf || cheb(x, y, E[0], E[1]) < rad + 4) continue;
        gc.push([x, y]);
      }
      if (gc.length) break;
    }
    if (!gc.length) return null;
    const [gx, gy] = rng.pick(gc);
    const lair = stampLair(G, rng, gx, gy, rad, K.wall, K.bossIdx, 1);
    for (const [x, y] of lair.cells) clr[y * W + x] = 1;
    const gaps = lairGaps(G, rng, lair, rng.chance(0.4) ? 2 : 1, (x, y) => pd[y * W + x] < 0 ? 99 : pd[y * W + x]);
    if (!gaps.length) return null;
    for (const gp of gaps) {
      const b = dijkstra(G, [gp.out[1] * W + gp.out[0]], i => pid[i] > 0, cost());
      if (!b) return null;
      carve(b, rng.chance(0.5) ? 2 : 1, 90);
    }
    // gläntor vid sidan av stigarna, med sidostigar (ibland två -> fler slingor)
    const clearings = [];
    const nC = rng.int(3, 4) + (depth >= 3 ? 1 : 0);
    for (let t = 0; t < 300 && clearings.length < nC; t++) {
      const x = rng.int(4, W - 5), y = rng.int(4, H - 5), i = y * W + x;
      if (pd[i] < 4 || pd[i] > 10 || clearings.some(c => cheb(c.x, c.y, x, y) < 8) || cheb(x, y, S[0], S[1]) < 6 || cheb(x, y, E[0], E[1]) < 6 || cheb(x, y, gx, gy) < rad + 7) continue;
      clearings.push({ x, y, rx: rng.int(2, 4), ry: rng.int(2, 4), cells: [] });
    }
    let hut = null;
    const hutC = rng.chance(0.55) ? clearings.find(c => c.x >= 5 && c.y >= 5 && c.x <= W - 6 && c.y <= H - 6) : null;
    if (hutC) { hutC.rx = Math.max(hutC.rx, 4); hutC.ry = Math.max(hutC.ry, 4); }
    for (let k = 0; k < clearings.length; k++) {
      const c = clearings[k], id = 3 + k;
      for (let dy = -c.ry - 1; dy <= c.ry + 1; dy++) for (let dx = -c.rx - 1; dx <= c.rx + 1; dx++) {
        const x = c.x + dx, y = c.y + dy, j = y * W + x;
        if (!G.inb(x, y) || G.solid[j] || G.res[j]) continue;
        if ((dx / (c.rx + 0.5)) ** 2 + (dy / (c.ry + 0.5)) ** 2 <= 1 + (nz[j] - 0.5) * 0.5) { g[y][x] = '.'; clr[j] = 1; if (!pid[j]) fm[j] = 3; c.cells.push([x, y]); }
      }
      let from = c.y * W + c.x;
      if (c === hutC) { // en stuga mitt i gläntan, med fri ring runt om
        const r = { x: c.x - 2, y: c.y - 2, w: 5, h: 5 };
        for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (G.inb(x, y) && !G.solid[y * W + x] && !G.res[y * W + x]) { g[y][x] = '.'; clr[y * W + x] = 1; }
        hut = stampBuilding(G, rng, r, '9', 1, 1);
        if (!hut) return null;
        from = hut.doors[0].out[1] * W + hut.doors[0].out[0];
      }
      const b1 = dijkstra(G, [from], i => pid[i] > 0 && pid[i] !== id, cost());
      if (!b1) return null;
      carve(b1, rng.chance(0.5) ? 2 : 1, id);
      if (rng.chance(0.45)) {
        const e = b1[b1.length - 1], ex = e % W, ey = (e / W) | 0;
        const b2 = dijkstra(G, [c.y * W + c.x], i => pid[i] > 0 && pid[i] !== id && cheb(i % W, (i / W) | 0, ex, ey) >= 8, cost(i => pid[i] === id));
        if (b2) carve(b2, 1, id);
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(c.x + dx, c.y + dy, 1); // gläntans mitt hålls fri
    }
    // isolerade gläntor i bladverket: små fylls, stora får en tunnel
    if (!connectRegions(G, rng, { minSize: 12, fillCh: wc, width: 2, mainAt: S })) return null;
    // enskilda träd: tätare nära skogsbrynet, glest i gläntorna
    const cells = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) cells.push([x, y]);
    for (const [x, y] of rng.shuffle(cells)) {
      const i = y * W + x;
      if (g[y][x] !== '.' || lock[i]) continue;
      let p = Math.max(0.05, Math.min(0.28, 0.05 + (D[i] - T + 0.3) * 0.6));
      if (clr[i]) p *= 0.4;
      if (rng.chance(p)) plant(G, x, y, 't');
    }
    breakOpen(G, rng, 6, (x, y) => { plantNear(G, rng, x, y, 't', 1); if (rng.chance(0.5)) plantNear(G, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), 't', 1); });
    for (let i = 0; i < N; i++) if (fm[i] === 0 && M[i] < 0.22) fm[i] = 2; // lerpölar
    const seeds = clearings.filter(c => c !== hutC).map(c => ({ x: c.x, y: c.y, tag: 'clearing', cells: c.cells.filter(([x, y]) => g[y][x] !== wc) }));
    if (hut) seeds.unshift({ x: hut.cx, y: hut.cy, tag: 'hut', box: hut });
    return populate(G, rng, depth, opts, { biome: 'forest', gid: K.id, floors: K.floors, guardian: { cells: lair.cells, center: [gx, gy], doors: gaps.map(c => c.out) },
      P: S, X: E, seeds, areaCells: 80, treasureTags: ['hut', 'clearing'], eliteTags: ['clearing'],
      barrels: { p: 0.2, min: 2, tags: ['clearing', 'hut'] }, secretWall: wc, secretChance: 0.4 });
  }

  // ---------- Borggård: öppen gård omgiven av byggnadslängor; vaktarens hall och en fontän på gården ----------
  function buildCourtyard(rng, depth, opts, look, K) {
    const [W, H] = mapSize(rng, depth), N = W * H;
    const G = Grid(W, H, look.wall, '4'), { g, fm, lock } = G;
    // längornas inre djup per sida (N Ö S V); 0 = bara ringmur
    const th = [rng.int(4, 7), rng.int(4, 7), rng.int(4, 7), rng.int(4, 7)];
    // färre längor (rum) på grunda våningar: varje rum ska ha en hel fiendegrupp
    for (const s of rng.shuffle([0, 1, 2, 3]).slice(0, depth <= 2 ? 2 : depth <= 4 ? 1 : rng.chance(0.5) ? 1 : 0)) th[s] = 0; // bara ringmur
    const span = (a, b, L) => L - 2 - (th[a] ? th[a] + 1 : 0) - (th[b] ? th[b] + 1 : 0);
    for (let k = 0; k < 12 && span(1, 3, W) < 16; k++) { const s = th[1] >= th[3] ? 1 : 3; th[s] = th[s] > 4 ? th[s] - 1 : 0; }
    for (let k = 0; k < 12 && span(0, 2, H) < 16; k++) { const s = th[0] >= th[2] ? 0 : 2; th[s] = th[s] > 4 ? th[s] - 1 : 0; }
    const cx0 = 1 + (th[3] ? th[3] + 1 : 0), cx1 = W - 2 - (th[1] ? th[1] + 1 : 0);
    const cy0 = 1 + (th[0] ? th[0] + 1 : 0), cy1 = H - 2 - (th[2] ? th[2] + 1 : 0);
    const mat = [0, 1, 2, 3].map(() => rng.chance(0.25) ? '9' : look.wall);
    const zone = s => s === 0 ? [1, 1, W - 2, cy0 - 1] : s === 2 ? [1, cy1 + 1, W - 2, H - 2] : s === 3 ? [1, cy0, cx0 - 1, cy1] : [cx1 + 1, cy0, W - 2, cy1];
    for (let s = 0; s < 4; s++) if (th[s]) { const [x0, y0, x1, y1] = zone(s); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g[y][x] = mat[s]; G.solid[y * W + x] = 1; } }
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { g[y][x] = '.'; G.sky[y * W + x] = 1; G.solid[y * W + x] = 0; }
    // längorna delas i rum (långa salar: färre men större rum)
    const rooms = [], strips = [[], [], [], []];
    const split = (s, a0, a1, b0, b1) => {
      for (let pos = a0; pos <= a1;) {
        const rem = a1 - pos + 1, len = rem <= 15 ? rem : rng.int(8, Math.min(14, rem - 8));
        const r = s % 2 === 0 ? { x: pos, y: b0, w: len, h: b1 - b0 + 1 } : { x: b0, y: pos, w: b1 - b0 + 1, h: len };
        r.side = s; r.id = rooms.length; r.cx = r.x + (r.w >> 1); r.cy = r.y + (r.h >> 1);
        rooms.push(r); strips[s].push(r);
        const wood = mat[s] === '9' || rng.chance(0.3);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { g[y][x] = '.'; G.solid[y * W + x] = 0; fm[y * W + x] = wood ? 3 : 2; }
        pos += len + 1;
      }
    };
    if (th[0]) split(0, 1, W - 2, 1, th[0]);
    if (th[2]) split(2, 1, W - 2, H - 1 - th[2], H - 2);
    if (th[3]) split(3, cy0, cy1, 1, th[3]);
    if (th[1]) split(1, cy0, cy1, W - 1 - th[1], W - 2);
    // möjliga dörrar: [x, y, insida x, y, utsida x, y] per förbindelse (b = null: gården)
    const links = [];
    for (const st of strips) for (let k = 0; k + 1 < st.length; k++) {
      const r = st[k], q = st[k + 1], cells = [];
      if (r.side % 2 === 0) { const sx = r.x + r.w; for (let y = r.y; y < r.y + r.h; y++) cells.push([sx, y, sx - 1, y, sx + 1, y]); }
      else { const sy = r.y + r.h; for (let x = r.x; x < r.x + r.w; x++) cells.push([x, sy, x, sy - 1, x, sy + 1]); }
      links.push({ a: r, b: q, cells });
    }
    for (const s of [0, 2]) for (const r of strips[s]) {
      const wy = s === 0 ? cy0 - 1 : cy1 + 1, iy = s === 0 ? wy - 1 : wy + 1, oy = s === 0 ? wy + 1 : wy - 1;
      const yard = [], left = [], right = [];
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = [x, wy, x, iy, x, oy];
        if (x >= cx0 && x <= cx1) yard.push(c); else if (th[3] && x <= cx0 - 2) left.push(c); else if (th[1] && x >= cx1 + 2) right.push(c);
      }
      if (yard.length) links.push({ a: r, b: null, cells: yard });
      if (left.length) links.push({ a: r, b: strips[3][s === 0 ? 0 : strips[3].length - 1], cells: left });
      if (right.length) links.push({ a: r, b: strips[1][s === 0 ? 0 : strips[1].length - 1], cells: right });
    }
    for (const s of [1, 3]) for (const r of strips[s]) {
      const wx = s === 3 ? cx0 - 1 : cx1 + 1, ix = s === 3 ? wx - 1 : wx + 1, ox = s === 3 ? wx + 1 : wx - 1, cells = [];
      for (let y = r.y; y < r.y + r.h; y++) cells.push([wx, y, ix, y, ox, y]);
      links.push({ a: r, b: null, cells });
    }
    const par = rooms.map((_, i) => i).concat([rooms.length]);
    const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
    const node = r => (r ? r.id : rooms.length);
    const yardDoors = [];
    const addDoor = L => {
      const ok = L.cells.filter(([x, y, ix, iy, ox, oy]) => {
        if (!isWall(g[y][x]) || g[iy][ix] !== '.' || g[oy][ox] !== '.') return false;
        const fl = ix === ox ? [g[y][x - 1], g[y][x + 1]] : [g[y - 1][x], g[y + 1][x]];
        if (!isWall(fl[0]) || !isWall(fl[1])) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isDoorCh(g[y + dy][x + dx])) return false;
        return true;
      });
      if (!ok.length) return false;
      const mid = (ok.length - 1) / 2, c = ok.map((v, k) => [v, Math.abs(k - mid) + rng.next() * ok.length * 0.4]).sort((u, v) => u[1] - v[1])[0][0];
      g[c[1]][c[0]] = 'D'; markDoor(G, c[0], c[1], c[4], c[5], c[2], c[3]);
      if (!L.b) yardDoors.push(c);
      par[find(node(L.a))] = find(node(L.b)); L.used = true;
      return true;
    };
    for (const L of rng.shuffle(links)) if (rng.chance(L.b ? 0.6 : 0.5)) addDoor(L);
    for (let it = 0; it < 3; it++) for (const L of links.slice().sort((u, v) => (u.b ? 1 : 0) - (v.b ? 1 : 0))) if (!L.used && find(node(L.a)) !== find(node(L.b))) addDoor(L);
    if (rooms.some(r => find(r.id) !== find(rooms.length))) return null;
    for (const L of links) if (yardDoors.length < 3 && !L.b && !L.used) addDoor(L);
    if (yardDoors.length && rng.chance(0.5)) { const c = rng.pick(yardDoors); g[c[1]][c[0]] = 'G'; } // en järngrind
    // vaktarens hall i ett av gårdens hörn (två rutor gång mot längorna), dörrar mot gårdens mitt
    const cwid = cx1 - cx0 + 1, chei = cy1 - cy0 + 1;
    const hw = Math.min(13, cwid - 4, rng.int(11, 13)), hh = Math.min(13, chei - 4, rng.int(11, 13));
    if (hw < 11 || hh < 11) return null;
    const corner = rng.int(0, 3), hx = corner & 1 ? cx1 - 1 - hw : cx0 + 2, hy = corner & 2 ? cy1 - 1 - hh : cy0 + 2;
    const inSides = [corner & 1 ? 2 : 0, corner & 2 ? 3 : 1];
    const hall = stampBuilding(G, rng, { x: hx, y: hy, w: hw, h: hh }, K.wall, K.bossIdx, rng.int(1, 2), rng.shuffle(inSides).concat(rng.shuffle([0, 1, 2, 3].filter(s => !inSides.includes(s)))));
    if (!hall) return null;
    const gcells = [];
    for (let y = hall.y; y < hall.y + hall.h; y++) for (let x = hall.x; x < hall.x + hall.w; x++) { G.res[y * W + x] = 1; gcells.push([x, y]); }
    for (let y = hy - 1; y <= hy + hh; y++) for (let x = hx - 1; x <= hx + hw; x++) G.res[y * W + x] = 1; // gången runt hallen hålls fri från torn
    // gräsfläckar på gruset
    const Mn = fbm(rng, W, H, 5);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (G.sky[y * W + x] && Mn[y * W + x] > 0.6) fm[y * W + x] = 1;
    // fontänen: stenlagd plats (5x5) så långt från hallen och gårdskanterna som möjligt
    let fountain = null;
    {
      let bv = -1;
      for (let y = cy0 + 3; y <= cy1 - 3; y++) for (let x = cx0 + 3; x <= cx1 - 3; x++) {
        let ok = true;
        for (let yy = y - 2; ok && yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) { const i = yy * W + xx; if (g[yy][xx] !== '.' || !G.sky[i] || G.res[i] || lock[i]) { ok = false; break; } }
        if (!ok) continue;
        const dh = Math.max(hx - x, x - (hx + hw - 1), hy - y, y - (hy + hh - 1)), de = Math.min(x - cx0, cx1 - x, y - cy0, cy1 - y);
        const v = Math.min(dh, 2 * de) + rng.next() * 2;
        if (v > bv) { bv = v; fountain = { x: x - 2, y: y - 2, w: 5, h: 5, cx: x, cy: y }; }
      }
      if (fountain) for (let y = fountain.y; y < fountain.y + 5; y++) for (let x = fountain.x; x < fountain.x + 5; x++) { G.res[y * W + x] = 1; fm[y * W + x] = 2; }
    }
    // torn och pelare som skydd, med fri ring runt om
    const towers = [];
    const nT = rng.int(1, 2) + Math.floor(cwid * chei / 260);
    for (let t = 0; t < 150 && towers.length < nT; t++) {
      const s = rng.pick([1, 2, 2, 3]), x = rng.int(cx0 + 2, cx1 - 1 - s), y = rng.int(cy0 + 2, cy1 - 1 - s);
      const r = { x, y, w: s, h: s };
      if (towers.some(o => !(o.x + o.w + 3 <= r.x || r.x + r.w + 3 <= o.x || o.y + o.h + 3 <= r.y || r.y + r.h + 3 <= o.y))) continue;
      let ok = true;
      for (let yy = y - 1; ok && yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
        const inner = xx >= x && yy >= y && xx < x + s && yy < y + s;
        if (g[yy][xx] !== '.' || !G.sky[yy * W + xx] || G.res[yy * W + xx] || (inner && lock[yy * W + xx])) { ok = false; break; }
      }
      if (!ok) continue;
      const round = s === 3 && rng.chance(0.5);
      for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (!(round && (xx - x) % 2 === 0 && (yy - y) % 2 === 0)) g[yy][xx] = '4';
      towers.push(r);
    }
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (fm[y * W + x] === 1 && rng.chance(0.06)) plant(G, x, y, 't');
    breakOpen(G, rng, 5, (x, y) => { if (fm[y * W + x] === 1 && rng.chance(0.6)) plantNear(G, rng, x, y, 't', 1); else plantNear(G, rng, x, y, '4', 1); });
    if (!connectRegions(G, rng, { width: 1 })) return null;
    for (let y = hy - 1; y <= hy + hh; y++) for (let x = hx - 1; x <= hx + hw; x++) if (!(x >= hall.x && y >= hall.y && x < hall.x + hall.w && y < hall.y + hall.h)) G.res[y * W + x] = 0;
    const seeds = rooms.map(r => ({ x: r.cx, y: r.cy, tag: 'room', box: r }));
    if (fountain) seeds.push({ x: fountain.cx, y: fountain.cy, tag: 'fountain', box: fountain });
    return populate(G, rng, depth, opts, { biome: 'courtyard', gid: K.id, floors: K.floors, guardian: { cells: gcells, center: [hall.cx, hall.cy], doors: hall.doors.map(d => d.out) },
      seeds, areaCells: 110, minOpen: depth <= 2 ? 1 : 2, treasureTags: ['room'], eliteTags: ['open', 'room'], shrineTags: ['fountain'], barrels: { p: 0.4, min: 3 }, spikes: rng.int(1, 3) });
  }

  LOOKS.caves.build = buildCaves;
  LOOKS.graveyard.build = buildGraveyard;
  LOOKS.forest.build = buildForest;
  LOOKS.courtyard.build = buildCourtyard;

  // ---------- Bossarena ----------
  const ARENAS = {
    graveyard: { biome: 'graveyard', wall: '7', floors: ['floor_grass_dead', 'floor_gravel', 'floor_ground_dirt'], ceil: 'floor_stone', outdoor: true, ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['GRAVKUNGENS VILA', 'DE DÖDAS TRÄDGÅRD', 'BENFÄLTET'] },
    cave: { biome: 'caves', wall: '8', floors: ['floor_cave', 'floor_mud'], ceil: 'ceil_cave', outdoor: false, ambient: [0.13, 0.17],
      fog: rng => rng.pick([[16, 8, 8], [10, 12, 14]]), names: ['DRAKENS HÅLA', 'DET DJUPA SVALGET', 'BESTENS LYA'] },
    forest: { biome: 'forest', wall: '6', floors: ['floor_ground_grass', 'floor_ground_dirt', 'floor_grass_dead'], ceil: 'floor_wood_planks', outdoor: true, ambient: [0.25, 0.32],
      fog: NIGHT_FOG, names: ['DEN SVARTA GLÄNTAN', 'HÄXANS RING', 'DE HÄNGDAS EK'] },
  };
  // bossens dekor runt arenans kanter (bossen, P, grinden och mitten hålls fria); A: arenans mått
  function bossDecor(G, rng, gid, A) {
    const sp = GUARDIANS[gid], { g, W } = G;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) G.lockMin(A.BX + dx, A.BY + dy, 2);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { G.lockMin(A.PX + dx, A.PY + dy, 1); G.lockMin(A.cx + dx, A.AY0 + 1 + dy, 1); }
    for (let y = 10; y <= 18; y++) for (let x = A.cx - 4; x <= A.cx + 4; x++) G.lockMin(x, y, 1);
    const cand = [];
    for (let y = A.AY0; y <= A.AY1; y++) for (let x = A.AX0; x <= A.AX1; x++) if (Math.min(x - A.AX0, A.AX1 - x, y - A.AY0, A.AY1 - y) <= 1 && g[y][x] === '.') cand.push([x, y]);
    const list = (sp.decor + sp.decor + sp.light).split('');
    let n = 0;
    for (const [x, y] of rng.shuffle(cand)) {
      if (n >= 10) break;
      if (g[y][x] !== '.' || G.lock[y * W + x]) continue;
      let crowded = false;
      for (let k = 0; k < 8; k++) if (PROP_CHARS.includes(G.at(x + RX[k], y + RY[k])) || G.at(x + RX[k], y + RY[k]) === 'n') crowded = true;
      if (crowded) continue;
      const ch = rng.pick(list);
      if (genBlk(ch) ? plant(G, x, y, ch) : (g[y][x] = ch, true)) n++;
    }
  }
  function boss(seed, opts) {
    opts = opts || {};
    const gid = GUARDIANS[opts.boss] ? opts.boss : null;
    if (opts.arena && ARENAS[opts.arena]) return bossArena(seed, opts.arena, opts, gid);
    const rng = RNG(seed).fork('boss');
    const theme = rng.pick(BOSS_THEMES);
    const wc = gid ? GUARDIANS[gid].wall : theme.wall;
    const W = 25, H = 27, cx = 12; // arena: x 1..23 (23 breda), y 4..25 (22 djupa)
    const AX0 = 1, AX1 = 23, AY0 = 4, AY1 = 25;
    const G = Grid(W, H, wc), g = G.g;
    for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) g[y][x] = '.';
    for (let y = 1; y <= 2; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = '.';
    g[1][cx] = 'x';
    g[3][cx] = 'G';
    const PX = cx, PY = AY1 - 1, BX = cx, BY = AY0 + 3;
    // pelare (2x2) speglade i x
    const blocks = [];
    const nPairs = rng.int(2, 3);
    for (let t = 0; t < 60 && blocks.length < nPairs; t++) {
      const x = rng.int(3, 8), y = rng.int(8, 20);
      if (blocks.some(b => Math.abs(b.x - x) < 4 && Math.abs(b.y - y) < 4)) continue;
      blocks.push({ x, y });
    }
    for (const b of blocks) for (const bx of [b.x, 23 - b.x]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[b.y + dy][bx + dx] = wc;
    // eldfat runt kanterna
    const jit = () => rng.int(-1, 1);
    const spots = [];
    for (const x of [3, 7, 17, 21]) { spots.push([x + jit(), AY0], [x + jit(), AY1]); }
    for (const y of [7, 12, 17, 22]) { spots.push([AX0, y + jit()], [AX1, y + jit()]); }
    for (const [x, y] of spots) {
      if (g[y][x] !== '.' || cheb(x, y, cx, AY0) <= 2 || cheb(x, y, PX, PY) <= 1) continue;
      g[y][x] = 'f';
    }
    g[PY][PX] = 'P';
    g[BY][BX] = 'B';
    const fc = [];
    for (let y = 12; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) if (g[y][x] === '.' && cheb(x, y, PX, PY) >= 2) fc.push([x, y]);
    rng.shuffle(fc);
    const nh = rng.int(3, 4), na = rng.int(3, 4);
    for (let i = 0; i < nh + na && i < fc.length; i++) g[fc[i][1]][fc[i][0]] = i < nh ? 'h' : 'a';
    // bossens tema: golv i bossens textur (med en ram av salens golv längs väggarna) och dekor längs kanterna
    const floors = [theme.floor];
    if (gid) {
      floors.push(GUARDIANS[gid].floor);
      for (let y = AY0 + 1; y < AY1; y++) for (let x = AX0 + 1; x < AX1; x++) G.fm[y * W + x] = 1;
      bossDecor(G, RNG(seed).fork('boss-decor'), gid, { cx, PX, PY, BX, BY, AX0, AX1, AY0, AY1 });
    }
    const level = {
      name: rng.pick(theme.names), biome: 'dungeon', floor: theme.floor, floors, floorMask: rowsOf(W, H, G.fm),
      ceil: theme.ceil, sky: null, secretWall: wc, fog: theme.fog.slice(), ambient: roundAmb(rng, theme.ambient),
      map: g.map(r => r.join('')), depth: opts.depth || 6, seed, arena: 'hall',
      rooms: [{ x: AX0, y: AY0, w: AX1 - AX0 + 1, h: AY1 - AY0 + 1, type: 'boss' }, { x: cx - 1, y: 1, w: 3, h: 2, type: 'exit' }],
    };
    if (gid) level.boss = gid;
    return level;
  }

  // arenor utomhus/i grottan: samma grundform som tronsalen (P nere, B uppe, grind G och utgång x bakom),
  // skydd i speglade par runt kanterna men en fri mitt (9x9) där den stora bossen kan röra sig.
  // Med en boss (gid) görs arenans inre väggar (skydd, kantväxt, bakväggen) i bossens väggtecken och mitten får bossens golv.
  function bossArena(seed, arena, opts, gid) {
    const A = ARENAS[arena], root = RNG(seed).fork('boss-' + arena);
    const W = 25, H = 27, cx = 12, AX0 = 1, AX1 = 23, AY0 = 4, AY1 = 25, wc = A.wall, ic = gid ? GUARDIANS[gid].wall : wc;
    const PX = cx, PY = AY1 - 1, BX = cx, BY = AY0 + 3;
    const mid = (x, y) => x >= cx - 4 && x <= cx + 4 && y >= 10 && y <= 18;
    const lrng = root.fork('look'), name = lrng.pick(A.names), fog = A.fog(lrng), ambient = roundAmb(lrng, A.ambient);
    for (let attempt = 0; attempt < 20; attempt++) {
      const rng = root.fork('a' + attempt);
      const G = Grid(W, H, wc), { g, fm } = G;
      for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) { g[y][x] = '.'; G.sky[y * W + x] = A.outdoor ? 1 : 0; }
      for (let y = 1; y <= 2; y++) for (let x = cx - 1; x <= cx + 1; x++) { g[y][x] = '.'; G.sky[y * W + x] = arena === 'forest' ? 1 : 0; }
      g[1][cx] = 'x'; g[3][cx] = 'G';
      markDoor(G, cx, 3, cx, 4, cx, 2);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) G.lockMin(BX + dx, BY + dy, 1); // bossen är stor
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(PX + dx, PY + dy, 1);
      for (let y = 10; y <= 18; y++) for (let x = cx - 4; x <= cx + 4; x++) G.lockMin(x, y, 1);
      const N2 = fbm(rng, W, H, 4);
      // ojämna kanter: berg/bryn växer in från väggen (inte i kyrkogårdens raka mur)
      if (arena !== 'graveyard') {
        for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) {
          const e = Math.min(x - AX0, AX1 - x, y - AY0, AY1 - y), v = N2[y * W + x];
          if ((e === 0 && v > 0.3) || (e === 1 && v > 0.6) || (e === 2 && v > 0.85)) plant(G, x, y, ic);
        }
      }
      // skydd i speglade par
      const covers = [];
      const nPairs = rng.int(4, 6);
      for (let t = 0; t < 120 && covers.length < nPairs; t++) {
        const x = rng.int(3, 9), y = rng.int(7, 22);
        if (mid(x, y) || covers.some(c => cheb(c[0], c[1], x, y) < 4)) continue;
        const kind = rng.next();
        const cellsK = arena === 'graveyard' ? (kind < 0.45 ? [[0, 0, 'n'], [2, 0, 'n'], [4, 0, 'n']] : kind < 0.75 ? [[0, 0, 't']] : [[0, 0, ic], [1, 0, ic]])
          : arena === 'cave' ? (kind < 0.6 ? [[0, 0, ic], [1, 0, ic], [0, 1, ic], [1, 1, ic]].filter(() => rng.chance(0.85)) : [[0, 0, ic]])
            : (kind < 0.5 ? [[0, 0, 't'], [1, 1, 't']] : kind < 0.8 ? [[0, 0, 't']] : [[0, 0, ic], [1, 0, ic], [0, 1, ic], [1, 1, ic]]);
        let n = 0;
        for (const [dx, dy, ch] of cellsK) for (const xx of [x + dx, W - 1 - x - dx]) if (plant(G, xx, y + dy, ch)) n++;
        if (n) covers.push([x, y]);
      }
      // strödda gravstenar / träd / droppstenar
      const loose = arena === 'graveyard' ? 'n' : arena === 'forest' ? 't' : ic;
      for (let k = rng.int(5, 9); k > 0; k--) { const x = rng.int(2, 22), y = rng.int(6, 23); if (!mid(x, y)) plant(G, x, y, loose); }
      // eldfat runt kanterna
      const jit = () => rng.int(-1, 1), spots = [];
      for (const x of [3, 7, 17, 21]) spots.push([x + jit(), AY0 + 1], [x + jit(), AY1 - 1]);
      for (const y of [7, 12, 17, 22]) spots.push([AX0 + 1, y + jit()], [AX1 - 1, y + jit()]);
      let nf = 0;
      for (const [x, y] of spots) if (cheb(x, y, cx, AY0) > 2 && cheb(x, y, PX, PY) > 2 && plantNear(G, rng, x, y, 'f', 2)) nf++;
      if (nf < 6) continue;
      g[PY][PX] = 'P'; g[BY][BX] = 'B';
      const fc = [];
      for (let y = 12; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) if (g[y][x] === '.' && G.lock[y * W + x] < 2 && cheb(x, y, PX, PY) >= 2) fc.push([x, y]);
      rng.shuffle(fc);
      const nh = rng.int(3, 4), na = rng.int(3, 4);
      for (let i = 0; i < nh + na && i < fc.length; i++) g[fc[i][1]][fc[i][0]] = i < nh ? 'h' : 'a';
      // golv: grus-/jordstig från start till grinden, annars lera eller vissnat gräs i fläckar
      for (let y = 2; y <= AY1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (arena !== 'cave' && (x === cx || N2[y * W + x] > 0.4)) fm[y * W + x] = 1;
      for (let i = 0; i < W * H; i++) if (!fm[i] && N2[i] < 0.3) fm[i] = arena === 'cave' ? 1 : 2;
      const floors = A.floors.slice();
      if (gid) {
        // bossens golv i en cirkel kring arenans mitt (hela grottan), bakväggen i bossens väggtecken, dekor längs kanterna
        floors.push(GUARDIANS[gid].floor);
        const rr = arena === 'cave' ? 7.5 : 5.5, bi = floors.length - 1;
        for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) if (Math.hypot(x - cx, y - 14) <= rr) fm[y * W + x] = bi;
        for (let y = 1; y <= 3; y++) for (let x = 1; x <= W - 2; x++) if (g[y][x] === wc) g[y][x] = ic;
        bossDecor(G, root.fork('decor' + attempt), gid, { cx, PX, PY, BX, BY, AX0, AX1, AY0, AY1 });
      }
      const level = {
        name, biome: A.biome, floor: floors[0], floors, floorMask: rowsOf(W, H, fm), ceil: A.ceil, sky: A.outdoor ? rowsOf(W, H, G.sky) : null,
        secretWall: wc, fog, ambient, map: g.map(r => r.join('')), depth: opts.depth || 6, seed, arena,
        rooms: [{ x: AX0, y: AY0, w: AX1 - AX0 + 1, h: AY1 - AY0 + 1, type: 'boss' }, { x: cx - 1, y: 1, w: 3, h: 2, type: 'exit' }],
      };
      if (gid) level.boss = gid;
      if (!validate(level).length) return level;
    }
    throw new Error('Gen.boss: kunde inte bygga arenan ' + arena + ' (seed ' + seed + ')');
  }

  // ---------- Validering ----------
  const ENEMY_CHARS = 'SKVILNORWE';
  const VALID = new Set(('123456789#%~&=DG*xPBhaA$CMfotn.QZ' + ENEMY_CHARS + PROP_CHARS + WEAPON_CHARS).split(''));
  function validate(level) {
    const errs = [];
    const map = level && level.map;
    if (!Array.isArray(map) || !map.length) return ['kartan saknas'];
    const H = map.length, W = map[0].length;
    for (let y = 0; y < H; y++) if (typeof map[y] !== 'string' || map[y].length !== W) { errs.push('rad ' + y + ' har fel längd'); return errs; }
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '1' : map[y][x];
    const nCh = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      nCh[c] = (nCh[c] || 0) + 1;
      if (!VALID.has(c)) errs.push('okänt tecken "' + c + '" vid ' + x + ',' + y);
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !isWall(c)) errs.push('kanten är inte vägg vid ' + x + ',' + y);
    }
    let px = -1, py = -1, nP = 0, nX = 0;
    const exits = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (map[y][x] === 'P') { nP++; px = x; py = y; }
      if (map[y][x] === 'x') { nX++; exits.push([x, y]); }
    }
    if (nP !== 1) errs.push('förväntade exakt ett P, hittade ' + nP);
    if (nX < 1) errs.push('utgång x saknas');
    for (const [c, lim, what] of [['Z', 1, 'vaktare Z'], ['w', 1, 'brunnar w'], ['y', 1, 'altare y'], ['z', 6, 'spikfällor z']]) if ((nCh[c] || 0) > lim) errs.push('för många ' + what + ': ' + nCh[c]);
    // dörrar, eldfat och spikfällor
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (isDoorCh(c)) {
        const ew = isWall(at(x - 1, y)) && isWall(at(x + 1, y)), ns = isWall(at(x, y - 1)) && isWall(at(x, y + 1));
        if (!ew && !ns) errs.push('dörr ' + c + ' utan väggar på sidorna vid ' + x + ',' + y);
        else if (ew && ns) errs.push('dörr ' + c + ' innesluten av väggar vid ' + x + ',' + y);
        else {
          const a = ew ? at(x, y - 1) : at(x - 1, y), b = ew ? at(x, y + 1) : at(x + 1, y);
          if (isBlock(a) || isBlock(b)) errs.push('dörr ' + c + ' har blockerad passage vid ' + x + ',' + y);
        }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === 'f') errs.push('eldfat intill ' + c + ' vid ' + x + ',' + y);
      }
      if (c === 'z') {
        if (nP === 1 && cheb(x, y, px, py) <= 1) errs.push('spikfälla intill P vid ' + x + ',' + y);
        if (exits.some(e => cheb(x, y, e[0], e[1]) <= 1)) errs.push('spikfälla intill utgången vid ' + x + ',' + y);
        for (let d = 0; d < 4; d++) if (isDoorCh(at(x + DX[d], y + DY[d]))) errs.push('spikfälla i dörröppning vid ' + x + ',' + y);
      }
    }
    // nåbarhet från P (4-grannskap; väggar, eldfat, köpman och blockerande rekvisita blockerar)
    if (nP === 1) {
      const seen = new Uint8Array(W * H), st = [py * W + px]; seen[st[0]] = 1;
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || isBlock(map[ny][nx])) continue;
          seen[ni] = 1; st.push(ni);
        }
      }
      let shown = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isBlock(map[y][x]) && !seen[y * W + x] && shown++ < 5) errs.push('onåbar ruta "' + map[y][x] + '" vid ' + x + ',' + y);
      if (shown > 5) errs.push('... totalt ' + shown + ' onåbara rutor');
    }
    // fiender: inte i startrummet / nära P
    const rooms = level.rooms || [];
    const startRoom = rooms.find(r => r.type === 'start');
    const inRoom = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (ENEMY_CHARS.includes(c) || c === 'Q' || c === 'Z') {
        if (nP === 1 && Math.hypot(x - px, y - py) < 6) errs.push('fiende ' + c + ' för nära P vid ' + x + ',' + y);
        if (startRoom && inRoom(startRoom, x, y)) errs.push('fiende ' + c + ' i startrummet vid ' + x + ',' + y);
      }
    }
    // rumstyper
    const startish = rooms.find(r => r.type === 'start' || r.type === 'boss');
    if (startish && nP === 1 && !inRoom(startish, px, py)) errs.push('P ligger inte i startrummet');
    const ex = rooms.find(r => r.type === 'exit');
    if (ex) {
      let found = false;
      for (let y = ex.y; y < ex.y + ex.h; y++) for (let x = ex.x; x < ex.x + ex.w; x++) if (at(x, y) === 'x') found = true;
      if (!found) errs.push('utgången x ligger inte i exit-rummet');
    }
    for (const k of ['name', 'floor', 'ceil', 'secretWall']) if (typeof level[k] !== 'string') errs.push('fältet ' + k + ' saknas');
    if (!Array.isArray(level.fog) || level.fog.length !== 3) errs.push('fog saknas');
    if (typeof level.ambient !== 'number') errs.push('ambient saknas');
    // biom, golvtexturer, golvmask, rumsmask och himmel (samma storlek som kartan)
    if (level.biome !== undefined && !BIOMES.some(b => b.id === level.biome)) errs.push('okänd biom ' + level.biome);
    if (level.guardian !== undefined && !GUARDIANS[level.guardian]) errs.push('okänd vaktare ' + level.guardian);
    const nF = Array.isArray(level.floors) ? level.floors.length : 1;
    if (level.floors !== undefined && (!Array.isArray(level.floors) || !nF || nF > 10 || level.floors.some(f => typeof f !== 'string') || level.floors[0] !== level.floor)) errs.push('floors ogiltigt (1-10 namn, floors[0] = floor)');
    const mask = (k, ok) => {
      const m = level[k];
      if (m === null || m === undefined) return;
      if (!Array.isArray(m) || m.length !== H) { errs.push(k + ' har fel storlek'); return; }
      for (let y = 0; y < H; y++) {
        if (typeof m[y] !== 'string' || m[y].length !== W) { errs.push(k + ' rad ' + y + ' har fel längd'); return; }
        for (let x = 0; x < W; x++) if (!ok(m[y][x])) { errs.push(k + ' har ogiltigt tecken "' + m[y][x] + '" vid ' + x + ',' + y); return; }
      }
    };
    mask('sky', c => c === '0' || c === '1');
    mask('floorMask', c => c >= '0' && c <= '9' && c.charCodeAt(0) - 48 < nF);
    mask('roomMask', c => c === '-' || (c.charCodeAt(0) >= 48 && c.charCodeAt(0) - 48 < rooms.length));
    return errs;
  }

  window.Gen = { floor, boss, validate, THEMES, BOSS_THEMES, BIOMES, GUARDIANS, ARCHES: Object.keys(ARCH) };
})();
