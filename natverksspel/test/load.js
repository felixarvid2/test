// Laddar spelets skript i Node för tester
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = undefined;
const root = path.join(__dirname, '..', 'js');
const files = ['net/util.js', 'net/model.js', 'net/sim.js', 'cli/ios_show.js', 'cli/ios.js', 'cli/host.js', 'cli/wlc.js', 'cli/lb.js', 'levels.js'];
for (const f of files) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = globalThis.NV;
