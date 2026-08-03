/* Tek dosyalık HTML üretir:
   shell.html (stil + işaretleme) + base64 GLB + esbuild ile paketlenmiş three.js/oyun kodu
   Kullanım: node build.mjs [cikti.html] [--artifact] [--test]
   --artifact : Artifact iskeletine uygun gövde üretir (doctype/html/head/body yazmaz)
   --test     : Test paketi — giriş noktası src/test-entry.js olur ve test paneli
                eklenir. Normal pakette testpanel.js'in tek satırı bile yoktur. */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const outFile = process.argv[2] || path.join(DIR, '..', 'horde-survivor-3d.html');
const artifactMode = process.argv.includes('--artifact');
const testMode = process.argv.includes('--test');

const res = await build({
  entryPoints: [path.join(DIR, 'src', testMode ? 'test-entry.js' : 'main.js')],
  bundle: true, format: 'iife', minify: true, target: ['es2020'],
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text;
const shell = fs.readFileSync(path.join(DIR, 'shell.html'), 'utf8');
const glb = fs.readFileSync(path.join(DIR, 'knight.glb')).toString('base64');
const tex = fs.readFileSync(path.join(DIR, 'knight_tex.jpg')).toString('base64');

const TITLE = 'HORDE SURVIVOR 3D — İzometrik Bullet Heaven' + (testMode ? ' [TEST]' : '');

// Artifact iskeleti sayfa başlığı bölümünü kendi ürettiği için viewport meta'sı
// çalışma anında eklenir; bağımsız dosyada ise normal meta etiketi kullanılır.
const viewportShim = `<script>(function(){var m=document.querySelector('meta[name="viewport"]');
if(!m){m=document.createElement("meta");m.name="viewport";document.head.appendChild(m);}
m.content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
addEventListener("load",function(){setTimeout(function(){dispatchEvent(new Event("resize"));},60);});})();</script>`;

const payload = `<script>window.__KNIGHT_B64="${glb}";window.__KNIGHT_TEX_B64="${tex}";</script>\n<script>${js}</script>`;

let out;
if (artifactMode) {
  out = `<title>${TITLE}</title>\n${viewportShim}\n${shell}\n${payload}`;
  for (const bad of ['<!doctype', '<html', '<head', '<body', '</html>', '</head>', '</body>']) {
    if (out.toLowerCase().includes(bad)) throw new Error('iskelet etiketi sizdi: ' + bad);
  }
} else {
  out = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0a0c14">
<title>${TITLE}</title>
</head>
<body>
${shell}
${payload}
</body>
</html>`;
}

fs.writeFileSync(outFile, out);
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`${path.basename(outFile)}: ${kb(Buffer.byteLength(out))}` +
  `  (js ${kb(js.length)} · model ${kb(glb.length)})${testMode ? ' [TEST]' : ''}`);

// Üretim paketine test kodu sızmadığını doğrula (sessizce bozulmasın)
if (!testMode && /TEST PANEL|tpBadge|initTestPanel/.test(out))
  throw new Error('test paneli üretim paketine sızdı');
