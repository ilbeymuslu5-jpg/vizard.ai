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
// --embed-armor[=dizin] : zırh GLB'lerini de (varsayılan assets/armor_packs,
// veya verilen dizin — ör. Artifact için sıkıştırılmış "lite" kopya) base64
// olarak göm. Normal derlemede bu KAPALI: zırhlar depo klasöründen ağ
// üzerinden tembel yüklenir (bkz. loadGlbPiece); Artifact sandbox'ında dış
// dosya isteği YAPILAMADIĞI için orada zırhların görünmesi bu bayrağı ister.
const embedArmorArg = process.argv.find(a => a.startsWith('--embed-armor'));
const embedArmor = !!embedArmorArg;
const armorDir = embedArmorArg && embedArmorArg.includes('=')
  ? path.resolve(embedArmorArg.slice(embedArmorArg.indexOf('=') + 1))
  : path.join(DIR, 'assets', 'armor_packs');

const res = await build({
  entryPoints: [path.join(DIR, 'src', testMode ? 'test-entry.js' : 'main.js')],
  bundle: true, format: 'iife', minify: true, target: ['es2020'],
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text;
const shell = fs.readFileSync(path.join(DIR, 'shell.html'), 'utf8');
const glb = fs.readFileSync(path.join(DIR, 'knight.glb')).toString('base64');
const tex = fs.readFileSync(path.join(DIR, 'knight_tex.jpg')).toString('base64');
const uipack = fs.readFileSync(path.join(DIR, 'assets', 'uipack_rpg_sheet.png')).toString('base64');
/* CSS'te kullanılan tekil sprite'lar AYRI dosyalar olarak gömülür (Kenney paketinde
   zaten hazır geliyorlar) — çalışma anında atlas'tan canvas.toDataURL() ile kırpmak
   yerine. Artifact'ın sandbox'lı iframe'inde toDataURL() SecurityError fırlatıyordu
   (data: URI'den yüklenen görsel o bağlamda "tainted" sayılıyor); dosyaları build
   zamanında (Node, tarayıcı yok) gömmek bu riski tamamen ortadan kaldırıyor. */
const UI_SPRITE_FILES = {
  primary: 'buttonLong_beige.png', primaryActive: 'buttonLong_beige_pressed.png',
  ghost: 'buttonLong_brown.png', ghostActive: 'buttonLong_brown_pressed.png',
  panelBrown: 'panel_brown.png', panelInsetBeige: 'panelInset_beige.png',
  checkBeige: 'iconCheck_beige.png', crossGrey: 'iconCross_grey.png',
  dashRound: 'buttonRound_blue.png',
  iconSquare: 'buttonSquare_grey.png', iconSquareActive: 'buttonSquare_grey_pressed.png',
  cursorHand: 'cursorHand_beige.png',
};
const uiSprites = {};
for (const key in UI_SPRITE_FILES) {
  uiSprites[key] = fs.readFileSync(path.join(DIR, 'assets', UI_SPRITE_FILES[key])).toString('base64');
}
// Envanter yuva ikonları + kahraman istatistik rozetleri (kullanıcının
// repoya yüklediği genel RPG ikon paketinden seçildi) — küçük (toplam
// ~230KB), GLB zırh parçalarının aksine tek dosyaya gömülmesi sorun değil.
const ITEM_ICON_FILES = {
  slotHelm: 'icons/slot_helm.png', slotChest: 'icons/slot_chest.png',
  slotGloves: 'icons/slot_gloves.png', slotBoots: 'icons/slot_boots.png',
  statHp: 'icons/stat_hp.png', statDmg: 'icons/stat_dmg.png',
  statArmor: 'icons/stat_armor.png', statSpeed: 'icons/stat_speed.png',
  statCrit: 'icons/stat_crit.png',
};
const itemIcons = {};
for (const key in ITEM_ICON_FILES) {
  itemIcons[key] = fs.readFileSync(path.join(DIR, 'assets', ITEM_ICON_FILES[key])).toString('base64');
}
const armorGlb = {};
if (embedArmor) {
  for (const f of fs.readdirSync(armorDir)) {
    if (!f.endsWith('.glb')) continue;
    armorGlb[f.slice(0, -4)] = fs.readFileSync(path.join(armorDir, f)).toString('base64');
  }
}

const TITLE = 'HORDE SURVIVOR 3D — İzometrik Bullet Heaven' + (testMode ? ' [TEST]' : '');

// Artifact iskeleti sayfa başlığı bölümünü kendi ürettiği için viewport meta'sı
// çalışma anında eklenir; bağımsız dosyada ise normal meta etiketi kullanılır.
const viewportShim = `<script>(function(){var m=document.querySelector('meta[name="viewport"]');
if(!m){m=document.createElement("meta");m.name="viewport";document.head.appendChild(m);}
m.content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
addEventListener("load",function(){setTimeout(function(){dispatchEvent(new Event("resize"));},60);});})();</script>`;

const payload = `<script>window.__KNIGHT_B64="${glb}";window.__KNIGHT_TEX_B64="${tex}";window.__UIPACK_B64="${uipack}";window.__UI_SPRITES_B64=${JSON.stringify(uiSprites)};window.__ITEM_ICONS_B64=${JSON.stringify(itemIcons)};window.__ARMOR_GLB_B64=${embedArmor ? JSON.stringify(armorGlb) : 'null'};</script>\n<script>${js}</script>`;

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
const armorKb = embedArmor ? kb(Object.values(armorGlb).reduce((s, v) => s + v.length, 0)) : '0';
console.log(`${path.basename(outFile)}: ${kb(Buffer.byteLength(out))}` +
  `  (js ${kb(js.length)} · model ${kb(glb.length)} · armor ${armorKb})${testMode ? ' [TEST]' : ''}`);

// Üretim paketine test kodu sızmadığını doğrula (sessizce bozulmasın)
if (!testMode && /TEST PANEL|tpBadge|initTestPanel/.test(out))
  throw new Error('test paneli üretim paketine sızdı');
