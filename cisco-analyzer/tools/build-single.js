// Builds one self-contained HTML file (all CSS and JS inlined), e.g. to publish or e-mail the tool.
// Usage: node tools/build-single.js [output.html] [--no-download]
//   --no-download  hides the Download buttons (for viewers that block file downloads)
//   --fragment     writes only <title>, <style> and the body content (for hosts that add their own <html>/<head>)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const noDownload = args.includes('--no-download');
const out = args.find(a => !a.startsWith('--')) || path.join(root, 'dist', 'cisco-config-analyzer.html');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (m, href) => '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');
let first = true;
html = html.replace(/\s*<script src="([^"]+)"><\/script>/g, (m, src) => {
  let js = fs.readFileSync(path.join(root, src), 'utf8');
  if (noDownload && src.endsWith('app.js')) js = js.replace(/function download\(name, text\) \{[\s\S]*?\n  \}\n/, 'function download() { /* disabled in this build */ }\n');
  const pre = first && noDownload ? '<script>window.CCA = { allowDownload: false };</script>\n' : '';
  first = false;
  return '\n' + pre + '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
if (args.includes('--fragment')) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = title + '\n' + style + '\n' + body;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
