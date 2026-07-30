/* Ana menüdeki kahraman görselini gerçek 3B modelden (assets/warrior/otag-warrior.glb,
   bkz. finalize-warrior.mjs) render eder.

   Menünün büyük portresi eskiden `assets/otag_sheet.png` sprite sayfasından
   geliyordu — gerçek tarama oyuna eklenince menü hâlâ eski çizimi gösteriyor,
   bu da "karakter değişmemiş" izlenimi veriyordu. Bu betik onun yerine
   gerçek modelden iyi ışıklandırılmış, saydam arka planlı, tam boy bir
   render üretir.

   Kullanım:  node tools/build-single.mjs   (önce dist/otag.html gerekir)
              node tools/bake-portrait.mjs
   Çıktı:     assets/warrior/portrait.png (432×576, şeffaf) */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamePage = path.join(root, 'dist/otag.html');
if (!fs.existsSync(gamePage)) {
  console.error('Önce derle: node tools/build-single.mjs');
  process.exit(1);
}

const { chromium } = await import('playwright');
const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 720, height: 960 } });
page.on('pageerror', e => console.error('sayfa hatası:', e.message));
await page.goto('file://' + gamePage);
await page.waitForFunction('typeof Warrior !== "undefined" && Warrior.ready');

const uri = await page.evaluate(async () => {
  const geo = Warrior.geo, mat = Warrior.baseMat.clone();
  const mesh = new THREE.Mesh(geo, mat);
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  /* modelin dikey merkezini dünya orijinine oturt: ayak -boy/2, tepe +boy/2 */
  mesh.position.sub(center);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a1410, 1.6));
  const key = new THREE.DirectionalLight(0xffe6c0, 3.4);
  key.position.set(1.1, 1.6, 1.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6a3a, 1.6);
  rim.position.set(-1.4, .6, -1.2);
  scene.add(rim);
  scene.add(mesh);

  const cam = new THREE.PerspectiveCamera(32, 720 / 960, 0.01, 10);
  cam.position.set(size.y * 0.52, size.y * 0.20, size.y * 1.85);
  cam.lookAt(0, 0, 0);   // dikey merkez y=0'da; boy*0.5 EKLEMEK bakışı kafanın üstüne kaydırır

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(720, 960);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.innerHTML = ''; document.body.appendChild(renderer.domElement);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
});
await browser.close();

const fullResPath = path.join(root, 'assets/warrior/_portrait_full.png');
fs.writeFileSync(fullResPath, Buffer.from(uri.split(',')[1], 'base64'));

/* 432×576'ya küçült (görüntülendiği alanın ~2 katı) — Pillow yoksa tam
   çözünürlükte bırak */
const outPath = path.join(root, 'assets/warrior/portrait.png');
try {
  const { execSync } = await import('child_process');
  execSync(`python3 -c "` +
    `from PIL import Image;` +
    `im=Image.open('${fullResPath}').convert('RGBA');` +
    `im.resize((432,576), Image.LANCZOS).save('${outPath}', optimize=True)"`);
  fs.unlinkSync(fullResPath);
} catch {
  fs.renameSync(fullResPath, outPath);
  console.warn('Pillow bulunamadı, tam çözünürlükte kaydedildi (dosya daha büyük).');
}

console.log(outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + ' KB');
