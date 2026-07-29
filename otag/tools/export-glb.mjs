/* Otağ savaşçısını oyun dışına, motorlarda kullanılabilir bir varlık olarak
   çıkarır:  dist/otag-warrior.glb  (geometri + PBR dokular + 8 animasyon klibi)

   Kullanım:
     npm i three esbuild playwright
     node tools/export-glb.mjs

   Model tarayıcıda üretildiği için (dokular tuvale çiziliyor) dışa aktarma da
   başsız bir tarayıcıda yapılır: dist/otag.html açılır, CharModel kurulur,
   prosedürel animasyonlar kare kare örneklenip glTF klibine çevrilir. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const gamePage = path.join(dist, 'otag.html');
if (!fs.existsSync(gamePage)) {
  console.error('Önce oyunu derle:  node tools/build-single.mjs');
  process.exit(1);
}

/* --- 1) GLTFExporter'ı sayfadaki THREE'ye bağlı tek bir dosyaya paketle --- */
const esbuild = await import('esbuild');
const shim = {
  name: 'three-global',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'tg' }));
    b.onLoad({ filter: /.*/, namespace: 'tg' }, () => ({
      contents: 'module.exports = globalThis.THREE;', loader: 'js'
    }));
  }
};
const bundled = await esbuild.build({
  stdin: {
    contents: "export { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';",
    resolveDir: root, loader: 'js'
  },
  bundle: true, format: 'iife', globalName: 'GLTFX', write: false,
  plugins: [shim], legalComments: 'none'
});
const exporterJs = bundled.outputFiles[0].text;

/* --- 2) başsız tarayıcıda modeli kur, animasyonları pişir, GLB üret --- */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
/* tarayıcı ayrı bir yerdeyse:  CHROMIUM_PATH=/yol/chrome node tools/export-glb.mjs */
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage();
page.on('pageerror', e => console.error('sayfa hatası:', e.message));
await page.goto('file://' + gamePage);
await page.waitForFunction('typeof CharModel !== "undefined" && typeof THREE !== "undefined"');
await page.addScriptTag({ content: exporterJs });

const b64 = await page.evaluate(async () => {
  const FPS = 30;

  /* dışa aktarılacak temiz kopya: oyun içi efektler (gölge lekesi, hayalet) yok */
  const inst = CharModel.build({ h: 112 });
  inst.shadow.parent.remove(inst.shadow);
  inst.ghost.parent.remove(inst.ghost);
  const model = inst.root;

  /* animasyonu süren düğümler */
  const nodes = [inst.body, inst.roofG, inst.armL.g, inst.armR.g,
                 inst.shieldG, inst.feet[0], inst.feet[1], inst.ribbon];

  const STATES = {
    Idle:        { dur: 2.4, s: { state: 'idle', pose: 'idle' } },
    Walk:        { dur: 1.2, s: { state: 'run', pose: 'idle', gait: .55 } },
    Run:         { dur: .97, s: { state: 'run', pose: 'angry' } },
    Attack:      { dur: .8,  s: { state: 'attack', pose: 'angry', combo: 1 }, once: true },
    SpinAttack:  { dur: 1.4, s: { state: 'spin', pose: 'spin' } },
    ShieldBlock: { dur: 1.0, s: { state: 'block', pose: 'block' } },
    Hit:         { dur: .7,  s: { state: 'hurt', pose: 'surprised' }, once: true },
    Death:       { dur: 2.2, s: { state: 'idle', pose: 'dead', dead: true }, once: true }
  };

  const clips = [];
  for (const [name, def] of Object.entries(STATES)) {
    /* duruşu oturt: döngülü animasyonlarda sönümleme dengeye gelsin */
    inst.a = { tilt: 0, pitch: 0, spin: 0, armR: 0, armL: 0, shield: 0, lift: 0, squashY: 1, roofT: 0 };
    inst.walkT = 0;
    const st = Object.assign({ t: 0, squash: { x: 1, y: 1 } }, def.s);
    if (!def.once) for (let i = 0; i < 90; i++) { st.t += 1 / FPS; inst.update(1 / FPS, st); }
    else { st.t = 0; }

    const frames = Math.round(def.dur * FPS);
    const times = [], pos = {}, quat = {}, scl = {};
    for (const n of nodes) { pos[n.name] = []; quat[n.name] = []; scl[n.name] = []; }

    for (let f = 0; f <= frames; f++) {
      const t = f / FPS;
      times.push(t);
      if (def.once) { st.t = t; if (def.s.dead) st.deadT = t; }
      else st.t += 1 / FPS;
      inst.update(1 / FPS, st);
      for (const n of nodes) {
        pos[n.name].push(n.position.x, n.position.y, n.position.z);
        quat[n.name].push(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w);
        scl[n.name].push(n.scale.x, n.scale.y, n.scale.z);
      }
    }

    const tracks = [];
    for (const n of nodes) {
      tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.position`, times, pos[n.name]));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, times, quat[n.name]));
      tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.scale`, times, scl[n.name]));
    }
    clips.push(new THREE.AnimationClip(name, def.dur, tracks));
  }

  /* nötr ifadeye dön ve dışa aktar */
  inst.setExpr('neutral');

  const exporter = new GLTFX.GLTFExporter();
  const buf = await new Promise((res, rej) =>
    exporter.parse(model, res, rej, { binary: true, animations: clips, onlyVisible: false }));

  let s = '', bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));

  let tris = 0, verts = 0;
  model.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    verts += g.attributes.position.count;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return { data: btoa(s), tris: Math.round(tris), verts, clips: clips.map(c => `${c.name} (${c.duration.toFixed(2)}s)`) };
});

await browser.close();

const out = path.join(dist, 'otag-warrior.glb');
fs.writeFileSync(out, Buffer.from(b64.data, 'base64'));
console.log(`${out}  ${(fs.statSync(out).size / 1048576).toFixed(2)} MB`);
console.log(`üçgen: ${b64.tris}   vertex: ${b64.verts}`);
console.log('klipler: ' + b64.clips.join(', '));
