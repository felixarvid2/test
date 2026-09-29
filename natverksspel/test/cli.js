const G = require('./load.js');
const s = G.model.buildGolden({ week: 1 });
G.sim.refresh(s);
['PC-Anna','PC-Karim','PC-Bo','PC-Lisa','Gast-laptop','PC-Lager'].forEach(h => G.sim.dhcp(s, h));
function run(dev, cmds, privileged) {
  const ses = new G.IosSession(s, dev, { privileged });
  for (const c of cmds) {
    const r = ses.handle(c);
    let out = r.out || '';
    if (r.stream) out += r.stream.map(x => x.text).join('');
    console.log(ses.prompt ? '' : '', '>>> [' + dev + '] ' + c + '\n' + out);
  }
  return ses;
}
const args = process.argv.slice(2);
const dev = args[0]; const cmds = args.slice(1);
run(dev, cmds, true);
