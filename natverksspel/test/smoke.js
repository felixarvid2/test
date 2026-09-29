const G = require('./load.js');
const s = G.model.buildGolden({ week: 1 });
G.sim.refresh(s);
for (const h of ['PC-Anna','PC-Karim','PC-Bo','PC-Maja','PC-Sara','PC-Lisa','Gast-laptop','PC-Lager']) { const l = G.sim.dhcp(s, h); console.log(h, l.ip, l.mask, l.gw, l.dns); }
s.devices['Gast-mobil'].ssid = 'Nordvik-Gast'; s.devices['Lager-skanner'].ssid = 'Nordvik-Lager'; G.sim.touch(s);
console.log('APjoin', G.sim.get(s).apJoined);
for (const h of ['Gast-mobil','Lager-skanner']) { const l = G.sim.dhcp(s, h); console.log(h, l.ip, l.gw); }
const t = (a, b) => { const r = G.sim.ping(s, a, b); console.log('ping', a, '->', b, r.ok ? ('OK loss=' + r.loss.toFixed(2) + ' ttl=' + r.ttl) : ('FAIL ' + r.reason + ' ' + (r.where || '') + (r.back ? ' back:' + r.back.reason + '@' + r.back.where : ''))); };
t('PC-Anna','192.168.1.10'); t('PC-Anna','192.168.1.70'); t('PC-Anna','198.51.100.80'); t('PC-Anna','9.9.9.9');
t('PC-Lisa','192.168.1.11'); t('PC-Lager','192.168.1.10'); t('PC-Lager','198.51.100.80'); t('Gast-laptop','192.168.1.10'); t('Gast-laptop','198.51.100.80');
t('Gast-mobil','198.51.100.80'); t('Gast-mobil','192.168.2.20'); t('Tekniker','192.168.2.193'); t('R1','10.0.0.2'); t('SW1','192.168.1.193');
console.log(G.sim.resolve(s,'PC-Anna','filserver'), G.sim.resolve(s,'PC-Anna','www.example.com'), G.sim.resolve(s,'Gast-laptop','www.example.com'));
console.log('nat', s.devices.R1.rt.natTrans.length, 'ntp', G.sim.ntpSynced(s, s.devices.SW1));
const D = G.sim.get(s); console.log('stp', JSON.stringify(D.stp.SW2), Object.keys(D.blocked));
