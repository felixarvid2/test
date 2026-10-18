// Validates dist/ against the YouTube Playables bundle rules (docs/PLAYABLES.md) and zips it to
// release/tower-merge-playables.zip. Run through `npm run package` (builds first).
//
// Rules checked:
//   - index.html at the root of the bundle (and therefore of the zip), a single page
//   - the Playables SDK script tag is the first <script> in index.html (before any game code)
//   - relative paths only (no "/assets/..." and no scheme/host URLs) in html and css
//   - the SDK URL is the only external URL in index.html; no CDN fonts/scripts anywhere in the bundle
//   - file names only use [A-Za-z0-9_.-]
//   - at most 8000 files, every file < 30 MiB (warn above 512 KiB)
//   - initial bundle (compressed, everything loads before gameReady) < 30 MiB (warn above 15 MiB)
//   - no eval / new Function / WebAssembly / web workers in the game code (warnings: the vendor
//     bundle may contain some, run the Playables bundle analyzer on it)
// The zip is written by this script (no external `zip` binary needed) with a fixed timestamp.
import { deflateRawSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = join(root, 'release');
const ZIP_NAME = 'tower-merge-playables.zip';
const SDK = 'https://www.youtube.com/game_api/v1';
const SDK_TAG = /<script\b[^>]*\bsrc=["']https:\/\/www\.youtube\.com\/game_api\/v1["'][^>]*>\s*<\/script>/i;
const MiB = 1024 * 1024;
const KiB = 1024;
const LIMITS = {
  files: 8000,
  fileMax: 30 * MiB,
  fileWarn: 512 * KiB,
  initialMax: 30 * MiB,
  initialWarn: 15 * MiB,
};
/** URL hosts that appear as plain strings (namespaces, docs links) in library code and make no requests. */
const HARMLESS_HOSTS = /^(www\.w3\.org|w3\.org|phaser\.io|www\.phaser\.io|github\.com|opensource\.org|developer\.mozilla\.org|mozilla\.org|www\.youtube\.com|youtube\.com|developers\.google\.com|localhost)$/;
const FORBIDDEN_HOSTS = /(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.|cdnjs\.|unpkg\.com|jsdelivr\.net|googleapis\.com\/ajax)/;

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const fmtSize = (n) => (n >= MiB ? `${(n / MiB).toFixed(2)} MiB` : `${(n / KiB).toFixed(1)} KiB`);

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------
if (!existsSync(join(dist, 'index.html'))) {
  console.error('error: dist/index.html is missing. Run `npm run build` first (or use `npm run package`).');
  process.exit(1);
}

const files = walk(dist);
const rels = files.map((f) => relative(dist, f).split(sep).join('/'));

// index.html: SDK first, single page, relative paths (comments are ignored)
const html = readFileSync(join(dist, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const sdkMatch = SDK_TAG.exec(html);
if (!sdkMatch) {
  fail(`index.html does not contain <script src="${SDK}"></script>. Add it to the <head> of the source index.html.`);
} else if (html.search(/<script\b/i) !== sdkMatch.index) {
  fail('the Playables SDK <script> must be the first <script> in index.html (another script or module loads before it). '
    + 'Move it above the game script in the source index.html.');
}
const otherPages = rels.filter((r) => r.endsWith('.html') && r !== 'index.html');
if (otherPages.length > 0) fail(`extra HTML pages found (a Playable must be a single page): ${otherPages.join(', ')}`);

for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  const url = m[1];
  if (url === SDK || /^(data:|#|mailto:)/i.test(url)) continue;
  if (/^(https?:)?\/\//i.test(url)) fail(`index.html references an external URL: ${url}`);
  else if (url.startsWith('/')) fail(`index.html uses an absolute path (use ./ relative paths, check vite base): ${url}`);
}
for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
  if (m[0] !== SDK && !/\b(?:src|href)=["']$/.test(html.slice(Math.max(0, m.index - 6), m.index))) {
    fail(`index.html contains an external URL: ${m[0]}`);
  }
}

// every file: name, size, content checks
let rawTotal = 0;
let initialTotal = 0;
const sizes = [];
const externalHosts = new Map();
const risky = new Map();
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const rel = rels[i];
  const buf = readFileSync(file);
  const size = buf.length;
  rawTotal += size;
  // Compressed transfer size is what counts; already-compressed media is counted as is.
  const compressible = /\.(js|mjs|html|css|json|txt|svg|xml|ttf|otf|wasm|map)$/i.test(rel);
  const transfer = compressible ? gzipSync(buf, { level: 9 }).length : size;
  initialTotal += transfer;
  sizes.push({ rel, size, transfer });
  for (const part of rel.split('/')) {
    if (!/^[A-Za-z0-9_.-]+$/.test(part)) fail(`file name not allowed (only A-Z a-z 0-9 _ - . are valid): ${rel}`);
  }
  if (size >= LIMITS.fileMax) fail(`file over 30 MiB: ${rel} (${fmtSize(size)})`);
  else if (size > LIMITS.fileWarn) warn(`file over the recommended 512 KiB: ${rel} (${fmtSize(size)})`);
  if (/\.map$/i.test(rel)) warn(`source map shipped: ${rel} (remove it from the bundle, it only adds size)`);

  if (/\.(html|js|mjs|css)$/i.test(rel)) {
    const text = buf.toString('utf8');
    if (/\.css$/i.test(rel) || rel === 'index.html') {
      for (const m of text.matchAll(/url\(\s*["']?([^)"']+)/gi)) {
        const u = m[1];
        if (/^data:/i.test(u)) continue;
        if (/^(https?:)?\/\//i.test(u)) fail(`${rel} loads an external resource: ${u}`);
        else if (u.startsWith('/')) fail(`${rel} uses an absolute path in url(): ${u}`);
      }
      for (const m of text.matchAll(/@import\s+(?:url\()?["']?([^"');]+)/gi)) fail(`${rel} @import is not allowed (${m[1]}); bundle the file instead`);
    }
    if (/\.(js|mjs)$/i.test(rel)) {
      // Absolute asset paths in the code would break inside Playables.
      const absAsset = text.match(/["'`]\/(?:assets|audio|images|sprites|fonts)\/[^"'`]+/);
      if (absAsset) fail(`${rel} contains an absolute asset path: ${absAsset[0].slice(1)} (use relative ./assets paths)`);
      for (const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)([^\s"'`)\\<>]*)/g)) {
        const host = m[1];
        if (FORBIDDEN_HOSTS.test(host)) fail(`${rel} references a CDN / font host: ${m[0]}`);
        else if (!HARMLESS_HOSTS.test(host)) externalHosts.set(host, (externalHosts.get(host) ?? 0) + 1);
      }
      const checks = [
        ['eval()', /(?<![\w$.])eval\s*\(/g],
        ['new Function()', /new\s+Function\s*\(/g],
        ['WebAssembly', /WebAssembly\./g],
        ['web worker', /new\s+(?:Shared)?Worker\s*\(/g],
      ];
      for (const [name, re] of checks) {
        const n = (text.match(re) ?? []).length;
        if (n > 0) risky.set(`${name} in ${rel}`, n);
      }
    }
  }
}
for (const [host, n] of externalHosts) warn(`code mentions external host ${host} (${n}x): confirm it is not requested at runtime`);
for (const [what, n] of risky) warn(`${what}: ${n} occurrence(s). Playables may reject eval / wasm / workers; check with the bundle analyzer`);
if (files.length > LIMITS.files) fail(`too many files: ${files.length} > ${LIMITS.files}`);
if (initialTotal >= LIMITS.initialMax) fail(`initial bundle ${fmtSize(initialTotal)} (compressed) is >= 30 MiB`);
else if (initialTotal > LIMITS.initialWarn) warn(`initial bundle ${fmtSize(initialTotal)} (compressed) is above the recommended 15 MiB`);

// ---------------------------------------------------------------------------------------------
// Report, then zip
// ---------------------------------------------------------------------------------------------
console.log(`dist: ${files.length} files, raw ${fmtSize(rawTotal)}, initial bundle (compressed) ~${fmtSize(initialTotal)}`);
const top = [...sizes].sort((a, b) => b.transfer - a.transfer).slice(0, 5);
console.log('largest (compressed):');
for (const t of top) console.log(`  ${fmtSize(t.transfer).padStart(10)}  ${t.rel}`);
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\npackage failed: ${errors.length} problem(s) in dist/. Nothing was written to release/.`);
  process.exit(1);
}

// minimal zip writer: deflate, fixed DOS timestamp (1980-01-01), index.html first, forward slashes
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(0, 10); // time 00:00
    local.writeUInt16LE(0x21, 12); // date 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const ordered = rels
  .map((rel, i) => ({ name: rel, data: readFileSync(files[i]) }))
  .sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : a.name < b.name ? -1 : 1));
mkdirSync(out, { recursive: true });
const zipPath = join(out, ZIP_NAME);
rmSync(zipPath, { force: true });
writeFileSync(zipPath, buildZip(ordered));

// verify the archive: unzip -t when available, and index.html must be listed at the root
let verified = 'not verified (unzip not installed)';
try {
  execFileSync('unzip', ['-tq', zipPath], { stdio: 'pipe' });
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (listing[0] !== 'index.html') throw new Error(`index.html is not at the zip root (first entry: ${listing[0]})`);
  if (listing.length !== files.length) throw new Error(`zip has ${listing.length} entries, dist has ${files.length} files`);
  verified = 'verified with unzip -t, index.html at the root';
} catch (e) {
  if (e && e.code === 'ENOENT') verified = 'not verified (unzip not installed)';
  else {
    console.error(`error: the written zip failed verification: ${e.stderr ? e.stderr.toString() : e.message}`);
    process.exit(1);
  }
}
console.log(`packaged ${relative(root, zipPath)}: ${fmtSize(statSync(zipPath).size)}, ${files.length} files (${verified})`);
if (warnings.length > 0) console.log(`${warnings.length} warning(s) above; the package is valid.`);
