/* Tek dosyalık (Artifact'a uygun) paket üretir: index.html'in <head> stilini +
   dist/style.css'i + <body> içeriğini + esbuild ile paketlenmiş src/main.js'i
   birleştirir. Kullanım: node build.mjs [cikti.html] [--artifact]
   --artifact: doctype/html/head/body yazmaz (Artifact iskeleti kendi üretir) */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const outFile = process.argv[2] || path.join(DIR, 'dist', 'survivor2d-bundle.html');
const artifactMode = process.argv.includes('--artifact');

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || 'Survivor 2D';
const headStyle = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1]
  .replace(/<script type="module" src="src\/main\.js"><\/script>\s*$/, '') || '';
const tailwindCss = fs.readFileSync(path.join(DIR, 'dist', 'style.css'), 'utf8');

const res = await build({
  entryPoints: [path.join(DIR, 'src', 'main.js')],
  bundle: true, format: 'iife', minify: true, target: ['es2020'],
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text;

const viewportShim = `<script>(function(){var m=document.querySelector('meta[name="viewport"]');
if(!m){m=document.createElement("meta");m.name="viewport";document.head.appendChild(m);}
m.content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
addEventListener("load",function(){setTimeout(function(){dispatchEvent(new Event("resize"));},60);});})();</script>`;

const payload = `<style>${tailwindCss}</style>\n<style>${headStyle}</style>\n${body}\n<script>${js}</script>`;

let out;
if (artifactMode) {
  out = `<title>${title}</title>\n${viewportShim}\n${payload}`;
  for (const bad of ['<!doctype', '<html', '<head', '<body', '</html>', '</head>', '</body>']) {
    if (out.toLowerCase().includes(bad)) throw new Error('iskelet etiketi sizdi: ' + bad);
  }
} else {
  out = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0d0b1a">
<title>${title}</title>
</head>
<body>
${payload}
</body>
</html>`;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`${path.basename(outFile)}: ${kb(Buffer.byteLength(out))}`);
