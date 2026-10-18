// Validates dist/ against the YouTube Playables bundle rules and zips it to release/.
// Rules checked (developers.google.com/youtube/gaming/playables/certification): index.html at the
// root, SDK script before any game code, relative paths only, filenames [A-Za-z0-9_.-], <= 8000
// files, every file < 30 MiB (warn > 512 KiB), initial bundle < 30 MiB compressed (warn > 15 MiB).
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = join(root, 'release');
const SDK = 'https://www.youtube.com/game_api/v1';
const MiB = 1024 * 1024;
const errors = [];
const warnings = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html missing – run `npm run build` first');
  process.exit(1);
}

// SDK first: move the SDK tag to be the first <script> in <head> if the bundler put another before it.
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const sdkTag = `<script src="${SDK}"></script>`;
if (!html.includes(sdkTag)) errors.push('index.html does not load the Playables SDK');
const firstScript = html.indexOf('<script');
if (html.includes(sdkTag) && firstScript !== html.indexOf(sdkTag)) {
  html = html.replace(sdkTag, '');
  html = html.replace('<script', `${sdkTag}\n    <script`);
  writeFileSync(join(dist, 'index.html'), html);
  console.log('moved the SDK script before the game scripts');
}

const files = walk(dist);
let total = 0;
let gzTotal = 0;
for (const file of files) {
  const rel = relative(dist, file);
  const size = statSync(file).size;
  total += size;
  const buf = readFileSync(file);
  gzTotal += /\.(js|html|css|json|txt|svg|ttf)$/.test(file) ? gzipSync(buf).length : size;
  for (const part of rel.split('/')) {
    if (!/^[A-Za-z0-9_.-]+$/.test(part)) errors.push(`filename not allowed: ${rel}`);
  }
  if (size >= 30 * MiB) errors.push(`file over 30 MiB: ${rel}`);
  else if (size > 512 * 1024) warnings.push(`file over 512 KiB (${(size / 1024).toFixed(0)} KiB): ${rel}`);
  if (/\.(html|js|css)$/.test(file)) {
    const text = buf.toString('utf8');
    // Absolute asset paths break inside Playables; only the SDK URL may be absolute.
    const abs = text.match(/(?:src|href)=["']\/(?!\/)[^"']*/g);
    if (abs) errors.push(`absolute path in ${rel}: ${abs[0]}`);
    const ext = [...text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0])
      .filter((u) => u !== SDK && !/w3\.org|phaser\.io|github\.com|opensource\.org|mozilla\.org|youtube\.com\/game_api/.test(u));
    if (rel === 'index.html' && ext.length) errors.push(`external URL in index.html: ${ext[0]}`);
  }
}
if (files.length > 8000) errors.push(`too many files: ${files.length} > 8000`);
// Everything loads before gameReady, so the whole bundle is the initial bundle.
if (gzTotal >= 30 * MiB) errors.push(`initial bundle ${(gzTotal / MiB).toFixed(1)} MiB >= 30 MiB`);
else if (gzTotal > 15 * MiB) warnings.push(`initial bundle ${(gzTotal / MiB).toFixed(1)} MiB > 15 MiB recommended`);

console.log(`files: ${files.length}, raw ${(total / MiB).toFixed(2)} MiB, compressed ~${(gzTotal / MiB).toFixed(2)} MiB`);
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const zip = join(out, 'tiny-dungeon-playables.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-9', '-q', zip, '.'], { cwd: dist });
console.log(`packaged ${relative(root, zip)} (${(statSync(zip).size / MiB).toFixed(2)} MiB)`);
