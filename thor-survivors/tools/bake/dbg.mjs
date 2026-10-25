import { startServer, openPage } from './lib.mjs';
const { srv, port } = await startServer();
const { browser, page } = await openPage(port);
for (const [f, clips] of [['enemies/sergeant', ['idle','walk','attack']], ['characters/bastion', ['run','idle']], ['enemies/welder',['walk','run']]]) {
  await page.evaluate(u => window.baker.load(u), `/models/${f}.glb`);
  for (const c of clips) console.log(f, c, JSON.stringify(await page.evaluate(c => window.baker.periodErrors(c), c)));
}
await browser.close(); srv.close();
