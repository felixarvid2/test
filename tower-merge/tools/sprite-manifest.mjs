// Lists public/assets/sprites/*.svg into public/assets/sprites/manifest.json: [{ key, file }]
// sorted by key. The key is the file name without ".svg"; file is relative to the sprites folder.
// Run via `npm run sprites` (also the first step of `npm run build`).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'assets', 'sprites');
mkdirSync(dir, { recursive: true });

const entries = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.svg'))
  .map((file) => ({ key: file.slice(0, -4), file }))
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
console.log(`sprite manifest: ${entries.length} sprites`);
