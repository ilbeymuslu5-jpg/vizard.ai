/* three.js çekirdeğini + GLTFLoader'ı tek global THREE nesnesine paketler.
   Çıktı: vendor/three.min.js  (script etiketiyle yüklenir, ES modül değildir)

   GLTFLoader burada sade tutuluyor: KTX2/Draco/Meshopt eklentisi yok, çünkü
   assets/warrior/otag-warrior.glb (tools/finalize-warrior.mjs ile üretilir)
   bunları gerektirmeyecek şekilde düz PNG/JPEG dokularla dışa aktarılıyor.

   Kullanım:  node tools/build-vendor.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const entry = path.join(repoRoot, '_vendor_entry.mjs');
fs.writeFileSync(entry,
  "import * as THREE_NS from 'three';\n" +
  "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';\n" +
  "export default Object.assign({}, THREE_NS, { GLTFLoader });\n");

const out = await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'iife', globalName: 'THREE_MOD',
  minify: true, legalComments: 'none', write: false
});
fs.unlinkSync(entry);

const js = out.outputFiles[0].text + '\nvar THREE = THREE_MOD.default;';
const dest = path.join(root, 'vendor/three.min.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, js);
console.log(dest, (js.length / 1048576).toFixed(2) + ' MB');
