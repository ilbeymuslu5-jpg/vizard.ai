/* Tüm oyunu tek bir HTML dosyasına gömer (CSS + JS + görsel base64).
   Kullanım:  node tools/build-single.mjs            -> dist/otag.html (tam sayfa)
              node tools/build-single.mjs --fragment -> dist/otag-fragment.html */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragment = process.argv.includes('--fragment');

const sheetPath = process.env.OTAG_SHEET || path.join(root, 'assets/otag_sheet.png');
const dataUri = 'data:image/png;base64,' + fs.readFileSync(sheetPath).toString('base64');

const warriorPath = path.join(root, 'assets/warrior/otag-warrior.glb');
const warriorUri = fs.existsSync(warriorPath)
  ? 'data:model/gltf-binary;base64,' + fs.readFileSync(warriorPath).toString('base64')
  : null;

const portraitPath = path.join(root, 'assets/warrior/portrait.png');
const portraitUri = fs.existsSync(portraitPath)
  ? 'data:image/png;base64,' + fs.readFileSync(portraitPath).toString('base64')
  : null;

/* Görsel yalnızca BİR kez gömülür: CSS onu --otag-sheet değişkeninden okur,
   değişkeni de aşağıdaki betik atar. */
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const order = ['core', 'sprites', 'character3d', 'warrior', 'render3d', 'world', 'entities', 'systems', 'ui', 'main'];
const js = order.map(n => `/* ===== ${n}.js ===== */\n` +
  fs.readFileSync(path.join(root, `js/${n}.js`), 'utf8')).join('\n');

/* three.js tek dosyaya olduğu gibi girer (IIFE, global THREE) */
const three = fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src'));

const head = `<title>OTAĞ — Kızıl Sefer</title>\n<style>\n${css}\n</style>`;
/* Görsel dosyada tek kopya durur; portre kuralı çalışma anında ondan üretilir.
   (Uzun data URI'ler CSS değişkenine sığmıyor, stil kuralına sığıyor.) */
const scripts =
  `<script>\nwindow.OTAG_SHEET_URI=${JSON.stringify(dataUri)};\n` +
  (warriorUri ? `window.OTAG_WARRIOR_URI=${JSON.stringify(warriorUri)};\n` : '') +
  (portraitUri ? `window.OTAG_PORTRAIT_URI=${JSON.stringify(portraitUri)};\n` : '') +
  `(function(){var s=document.createElement('style');` +
  `s.textContent='.portrait{background-image:url("'+window.OTAG_SHEET_URI+'") !important}' +` +
  `(window.OTAG_PORTRAIT_URI?'.menu-hero .portrait.big::before{background-image:url("'+window.OTAG_PORTRAIT_URI+'") !important}':'');` +
  `(document.body||document.documentElement).appendChild(s);})();\n</script>\n` +
  `<script>\n${three}\n</script>\n` +
  `<script>\n${js}\n</script>`;

const out = fragment
  ? `${head}\n${body}\n${scripts}\n`
  : `<!DOCTYPE html>\n<html lang="tr">\n<head>\n<meta charset="UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`;

const dir = path.join(root, 'dist');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, fragment ? 'otag-fragment.html' : 'otag.html');
fs.writeFileSync(file, out);
console.log(file, (out.length / 1048576).toFixed(2) + ' MB');
