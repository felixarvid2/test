// Genererar spelets bilder med FLUX.2 Turbo på fal.ai.
//
//   FAL_KEY=... node rune/tools/gen-assets.js            genererar det som saknas
//   node rune/tools/gen-assets.js --dry                  visar vad som skulle genereras och vad det kostar
//   node rune/tools/gen-assets.js --only relic/runsten    bara vissa (komma-separerat, prefix fungerar: relic/)
//   node rune/tools/gen-assets.js --manifest             skriver bara om js/assets.js från filerna på disk
//
// Kostnad: $0.008 per megapixel. Varje bild räknas som påbörjade megapixlar (alltid avrundat uppåt),
// så uppskattningen är aldrig lägre än fal.ai:s debitering. Total kostnad sparas i assets/cost.json
// och skriptet vägrar gå över BUDGET (standard $1.90, max $2.00) sammanlagt över alla körningar.
const fs = require('fs');
const path = require('path');
const { list } = require('./asset-prompts.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
const LEDGER = path.join(OUT, 'cost.json');
const ENDPOINT = 'https://fal.run/fal-ai/flux-2/turbo';
const PRICE_PER_MP = 0.008;
const HARD_CAP = 2.0;
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const k = args.indexOf(n); return k >= 0 ? args[k + 1] : null; };
const BUDGET = Math.min(HARD_CAP, Number(opt('--budget') || process.env.BUDGET || 1.9));
const CONC = Number(opt('--concurrency') || 4);

const cost = (it) => Math.ceil((it.w * it.h) / 1e6) * PRICE_PER_MP;
const file = (key) => path.join(OUT, key + '.webp');
const readLedger = () => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return { spent: 0, images: 0, log: [] }; } };
const writeLedger = (l) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); };

function writeManifest() {
  const keys = [];
  (function walk(dir, pre) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p, pre + f + '/');
      else if (f.endsWith('.webp')) keys.push(pre + f.replace(/\.webp$/, ''));
    }
  })(OUT, '');
  const body = '// Genererad av tools/gen-assets.js – vilka bilder som finns i assets/.\n'
    + '(function () { var R = (typeof window !== \'undefined\' ? window : globalThis).R; R.ASSETS = {\n'
    + keys.map((k) => '  ' + JSON.stringify(k) + ': 1').join(',\n') + '\n}; })();\n';
  fs.writeFileSync(path.join(ROOT, 'js', 'assets.js'), body);
  console.log('js/assets.js: ' + keys.length + ' bilder');
}

async function gen(it, key) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: it.prompt, image_size: { width: it.w, height: it.h }, num_images: 1, output_format: 'webp', seed: seedOf(it.key), enable_prompt_expansion: false })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + txt.slice(0, 300));
  const data = JSON.parse(txt);
  const url = data.images && data.images[0] && data.images[0].url;
  if (!url) throw new Error('inget bild-URL i svaret');
  let buf;
  if (url.startsWith('data:')) buf = Buffer.from(url.split(',')[1], 'base64');
  else { const r2 = await fetch(url); if (!r2.ok) throw new Error('nedladdning ' + r2.status); buf = Buffer.from(await r2.arrayBuffer()); }
  fs.mkdirSync(path.dirname(file(it.key)), { recursive: true });
  fs.writeFileSync(file(it.key), buf);
}
function seedOf(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

async function main() {
  if (flag('--manifest')) return writeManifest();
  const only = opt('--only') ? opt('--only').split(',') : null;
  let todo = list().filter((it) => !fs.existsSync(file(it.key)));
  if (only) todo = todo.filter((it) => only.some((o) => it.key === o || (o.endsWith('/') && it.key.startsWith(o))));
  const ledger = readLedger();
  const need = todo.reduce((s, it) => s + cost(it), 0);
  console.log('Saknas: ' + todo.length + ' bilder, uppskattat högst $' + need.toFixed(3)
    + '. Redan spenderat: $' + ledger.spent.toFixed(3) + '. Budget totalt: $' + BUDGET.toFixed(2));
  if (flag('--dry')) return;
  const key = process.env.FAL_KEY;
  if (!key) { console.error('FAL_KEY saknas.'); process.exit(1); }

  let i = 0, fails = 0;
  async function worker() {
    while (i < todo.length) {
      const it = todo[i++];
      const c = cost(it);
      if (ledger.spent + c > BUDGET + 1e-9) { console.log('Budgeten räcker inte för ' + it.key + ' – stoppar.'); i = todo.length; return; }
      ledger.spent += c; ledger.images++; // reservera innan anropet, så parallella anrop aldrig spräcker budgeten
      try {
        await gen(it, key);
        ledger.log.push({ key: it.key, cost: c, at: new Date().toISOString() });
        console.log('✓ ' + it.key + '  ($' + ledger.spent.toFixed(3) + ')');
      } catch (e) {
        fails++;
        // Avvisade anrop (4xx före generering) debiteras inte, men vi behåller reservationen för säkerhets skull
        // utom vid autentiseringsfel där inget kan ha genererats.
        if (/^40[13] /.test(e.message)) { ledger.spent -= c; ledger.images--; }
        console.log('✗ ' + it.key + ': ' + e.message);
        if (/^40[13] /.test(e.message)) { i = todo.length; }
      }
      writeLedger(ledger);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  writeLedger(ledger);
  writeManifest();
  console.log('Klart. Totalt spenderat (uppskattat, övre gräns): $' + ledger.spent.toFixed(3) + (fails ? ', ' + fails + ' misslyckades' : ''));
}
main().catch((e) => { console.error(e); process.exit(1); });
