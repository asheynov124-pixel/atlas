// Turn dist-artifact/ into one HTML fragment the Artifact publisher wraps: title, fonts, inline CSS, root, inline JS.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'dist-artifact';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('could not find bundle names');
const jsText = fs.readFileSync(path.join(dir, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssText = fs.readFileSync(path.join(dir, css), 'utf8').replace(/<\/style/gi, '<\\/style');
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)?.[0] ?? '';
const out = `<title>Alder</title>
<meta name="description" content="A design atelier for the house you are building: color, framing, texture, light, the pieces that finish a room, and your real rooms with a plan, a budget, and an order sheet." />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fonts}
<style>${cssText}
html, body, #root { height: 100%; }
</style>
<div id="root"></div>
<script type="module">${jsText}</script>
`;
fs.writeFileSync('alder-artifact.html', out);
console.log('alder-artifact.html', (out.length / 1024).toFixed(0), 'KB');
