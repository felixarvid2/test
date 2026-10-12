// Browser smoke test: loads both example labs and clicks through every tab in desktop and phone
// width, failing on JavaScript errors or horizontal overflow. Needs Playwright with Chromium.
// Usage: node test/ui.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright is not installed – skipping the UI test.'); process.exit(0); }
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'));
  for (const lab of ['campus', 'branch']) { await p.selectOption('#lab-select', lab); await p.click('#btn-sample'); }
  if (await p.locator('.device').count() !== 7) errs.push('expected 7 devices');
  await p.click('[data-tab=findings]');
  await p.click('.finding summary');
  await p.click('#btn-export');
  await p.click('[data-tab=troubleshoot]');
  await p.click('#examples button');
  await p.waitForSelector('#assist .card');
  await p.click('#steps-bydev');
  await p.click('[data-tab=network]');
  await p.click('.topo .node');
  await p.fill('#p-src', '192.168.20.5'); await p.fill('#p-dst', '192.168.10.5'); await p.click('#btn-path');
  if (!(await p.textContent('#path')).includes('GUEST-IN')) errs.push('path tester did not report the ACL');
  await p.click('[data-tab=configs]');
  await p.click('[data-view="0"]');
  await p.fill('#viewer-search', 'interface');
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  if (await p.locator('#viewer[open]').count()) errs.push('Esc did not close the config viewer');
  await p.setViewportSize({ width: 390, height: 800 });
  for (const t of ['configs', 'findings', 'troubleshoot', 'network']) {
    await p.click('[data-tab=' + t + ']');
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) errs.push('horizontal overflow on ' + t + ': ' + w + 'px');
  }
  await b.close();
  if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
  console.log('UI smoke test passed');
})();
