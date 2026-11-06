// Bygger assets3d/offline.js: alla 3D-modeller, texturer och ljud som data-URI:er i en enda skriptfil.
// När spelet öppnas direkt från disken (file://) får sidan inte läsa filerna i assets3d/, men den får
// ladda skript. index.html laddar då den här filen, och NV.assets3d hämtar allt härifrån i stället.
// Kör: node tools/offline.js   (från natverksspel/, eller ange mappen som argument)
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const dir = path.join(root, 'assets3d');
const TYPES = { '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg' };
const out = {};
let bytes = 0;
(function walk(d) {
  for (const n of fs.readdirSync(d).sort()) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) { if (n !== 'LICENSES') walk(f); continue; }
    const type = TYPES[path.extname(n).toLowerCase()];
    if (!type || n === 'offline.js') continue;
    const buf = fs.readFileSync(f);
    bytes += buf.length;
    out[path.relative(root, f).split(path.sep).join('/')] = 'data:' + type + ';base64,' + buf.toString('base64');
  }
})(dir);
const js = '// Byggd av tools/offline.js. Ändra inte för hand.\nwindow.NV_OFFLINE = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n';
fs.writeFileSync(path.join(dir, 'offline.js'), js);
console.log('assets3d/offline.js: ' + Object.keys(out).length + ' filer, ' + (bytes / 1048576).toFixed(1) + ' MB in, ' + (js.length / 1048576).toFixed(1) + ' MB ut');
