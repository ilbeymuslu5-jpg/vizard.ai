/* Meshy AI'dan gelen ham taramayı (assets/warrior/source.glb, ~1M üçgen, tek
   parça, KTX2 sıkıştırmalı) oyunda kullanılabilir bir varlığa indirger:

     assets/warrior/otag-warrior.glb   (~8-12k üçgen, PNG/JPEG dokular, düz
     glTF — KTX2/meshopt gerektirmez, GLTFLoader ile doğrudan açılır)

   Adımlar:
   1. Ham geometriyi (pozisyon/uv/indeks) tarayıcıda KTX2+meshopt çözerek çıkar.
   2. Dokuları (baseColor/normal/metalRough) GPU'dan okuyup düz PNG/JPEG'e çevir
      — CompressedTexture'lar CPU'dan doğrudan okunamaz, bir dörtgene çizip
      render hedefinden geri okumak gerekir.
      ÖNEMLİ: okuma GL'in alttan üste sırasını düzeltmek için satırları çevirir;
      bu yüzden sonuçtaki doku üç.js'in flipY=true kuralına göre kullanılmalı
      (kaynaktaki KTX2 dokusu flipY=false idi — karıştırmak dokuyu UV
      adacıkları arasında bulaştırır, bkz. commit günlüğü).
   3. meshoptimizer (WASM, saniyeler sürer — three.js'in SimplifyModifier'ı
      1M üçgende dakikalarca sürüyor ve pratik değil) ile üçgen sayısını indirir.
   4. Geometriyi ayağı y=0'da, boyu 1 birim olacak şekilde hizalar, tangent
      hesaplar, GLTFExporter ile tek GLB'ye gömer.

   Kullanım:  node tools/finalize-warrior.mjs
   Girdi:     assets/warrior/source.glb
   Çıktı:     assets/warrior/otag-warrior.glb  */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const srcGlb = path.join(root, 'assets/warrior/source.glb');
const outGlb = path.join(root, 'assets/warrior/otag-warrior.glb');
if (!fs.existsSync(srcGlb)) {
  console.error('Kaynak bulunamadı:', srcGlb);
  process.exit(1);
}

const esbuild = await import('esbuild');
const { chromium } = await import('playwright');
const { MeshoptSimplifier } = await import('meshoptimizer');

const entryFile = path.join(repoRoot, '_warrior_entry.mjs');
fs.writeFileSync(entryFile,
  "export {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';\n" +
  "export {KTX2Loader} from 'three/examples/jsm/loaders/KTX2Loader.js';\n" +
  "export {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';\n" +
  "export {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';\n");
const shim = {
  name: 'three-global',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'tg' }));
    b.onLoad({ filter: /.*/, namespace: 'tg' }, () => ({ contents: 'module.exports = globalThis.THREE;', loader: 'js' }));
  }
};
await esbuild.build({
  entryPoints: [entryFile], bundle: true, format: 'esm',
  outfile: entryFile.replace('.mjs', '.bundle.mjs'), write: true, plugins: [shim]
});
const bundleJs = fs.readFileSync(entryFile.replace('.mjs', '.bundle.mjs'), 'utf8');
fs.unlinkSync(entryFile); fs.unlinkSync(entryFile.replace('.mjs', '.bundle.mjs'));

const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage();
page.on('pageerror', e => console.error('sayfa hatası:', e.message));

/* about:blank temeli import.meta.url çözümlemesini bozuyor (KTX2Loader'ın
   wasm/js yolları için); gerçek bir file:// belgesi gerekiyor. */
const distPage = path.join(root, 'dist/otag.html');
if (!fs.existsSync(distPage)) { console.error('Önce derle: node tools/build-single.mjs'); process.exit(1); }
await page.goto('file://' + distPage);
await page.route('**/basis_transcoder.wasm', route => route.fulfill({ path: path.join(repoRoot, 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm') }));
await page.route('**/basis_transcoder.js', route => route.fulfill({ path: path.join(repoRoot, 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js') }));
await page.addScriptTag({ content: bundleJs + '\nwindow.GL = {GLTFLoader,KTX2Loader,MeshoptDecoder,GLTFExporter};', type: 'module' });
await page.waitForFunction('!!window.GL');

/* ---- 1) ham geometri + dokuları çıkar ---- */
console.log('1/4  kaynak GLB açılıyor ve dokular okunuyor…');
const glbB64 = fs.readFileSync(srcGlb).toString('base64');
const extracted = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  const ktx2 = new GL.KTX2Loader().setTranscoderPath('https://x.local/').detectSupport(renderer);
  const meshopt = await GL.MeshoptDecoder.ready.then(() => GL.MeshoptDecoder);
  const loader = new GL.GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(meshopt);
  const gltf = await new Promise((res, rej) => loader.parse(bin.buffer, '', res, rej));
  let mesh; gltf.scene.traverse(o => { if (o.isMesh) mesh = o; });
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const g = mesh.geometry;

  function toB64(arr) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* CompressedTexture'ı dörtgene çizip render hedefinden geri oku */
  function bake(tex, outSize, colorSpace, mime) {
    if (!tex) return null;
    renderer.outputColorSpace = colorSpace;
    const w = tex.image.width, h = tex.image.height;
    const rt = new THREE.WebGLRenderTarget(w, h);
    rt.texture.colorSpace = colorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const gx = cv.getContext('2d');
    const img = gx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    gx.putImageData(img, 0, 0);
    if (outSize && outSize !== w) {
      const cv2 = document.createElement('canvas'); cv2.width = outSize; cv2.height = outSize;
      cv2.getContext('2d').drawImage(cv, 0, 0, outSize, outSize);
      return cv2.toDataURL(mime, .9);
    }
    return cv.toDataURL(mime, .9);
  }

  const box = new THREE.Box3().setFromObject(mesh);

  return {
    posB64: toB64(g.attributes.position.array),
    uvB64: toB64(g.attributes.uv.array),
    idxB64: toB64(g.index.array),
    idxIs32: g.index.array.BYTES_PER_ELEMENT === 4,
    vertexCount: g.attributes.position.count,
    triCount: g.index.count / 3,
    box: { min: box.min.toArray(), max: box.max.toArray() },
    baseUri: bake(mat.map, 1024, THREE.SRGBColorSpace, 'image/jpeg'),
    normalUri: bake(mat.normalMap, 768, THREE.LinearSRGBColorSpace, 'image/png'),
    roughUri: bake(mat.roughnessMap, 768, THREE.LinearSRGBColorSpace, 'image/png'),
    metalScalar: mat.metalness, roughScalar: mat.roughness
  };
}, glbB64);
console.log(`   kaynak: ${extracted.vertexCount} köşe, ${Math.round(extracted.triCount)} üçgen`);

/* ---- 2) meshoptimizer ile indirge (Node'da, WASM — saniyeler sürer) ---- */
console.log('2/4  üçgen sayısı indiriliyor…');
await MeshoptSimplifier.ready;
const buf = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));
const pos = new Float32Array(buf(extracted.posB64).buffer);
const uv = new Float32Array(buf(extracted.uvB64).buffer);
const idxRaw = buf(extracted.idxB64);
const idxSrc = extracted.idxIs32 ? new Uint32Array(idxRaw.buffer) : new Uint16Array(idxRaw.buffer);
const idx32 = Uint32Array.from(idxSrc);

const TARGET_RATIO = Number(process.env.WARRIOR_RATIO || 0.008);   // ~7-8k üçgen, görsel kayıpsız (bkz. QA ekran görüntüleri)
const targetIdxCount = Math.max(300, Math.floor(extracted.triCount * TARGET_RATIO) * 3);
const [newIdx, err] = MeshoptSimplifier.simplifyWithAttributes(
  idx32, pos, 3, uv, 2, [0.6], null, targetIdxCount, 0.08, ['Prune']
);
const [remap, uniqueCount] = MeshoptSimplifier.compactMesh(newIdx);
const cpos = new Float32Array(uniqueCount * 3), cuv = new Float32Array(uniqueCount * 2);
for (let i = 0; i < extracted.vertexCount; i++) {
  const j = remap[i]; if (j === 0xffffffff) continue;
  cpos[j * 3] = pos[i * 3]; cpos[j * 3 + 1] = pos[i * 3 + 1]; cpos[j * 3 + 2] = pos[i * 3 + 2];
  cuv[j * 2] = uv[i * 2]; cuv[j * 2 + 1] = uv[i * 2 + 1];
}
const finalTris = newIdx.length / 3;
console.log(`   ${finalTris} üçgen, ${uniqueCount} köşe, hata ${err.toFixed(4)}`);

/* ---- 3) geometriyi hizala, malzemeyi kur, GLB'ye göm ---- */
console.log('3/4  hizalanıyor ve dokular gömülüyor…');
const posB64f = Buffer.from(cpos.buffer).toString('base64');
const uvB64f = Buffer.from(cuv.buffer).toString('base64');
const idxB64f = Buffer.from(newIdx.buffer).toString('base64');

const result = await page.evaluate(async ({ posB64, uvB64, idxB64, baseUri, normalUri, roughUri, metalScalar, roughScalar, box }) => {
  const bufA = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bufA(posB64)), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bufA(uvB64)), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(bufA(idxB64)), 1));
  geo.computeVertexNormals();

  /* ayak y=0'da, boy = 1 birim olacak şekilde hizala/ölçekle */
  const h = box.max[1] - box.min[1];
  geo.scale(1 / h, 1 / h, 1 / h);
  geo.translate(0, -box.min[1] / h, 0);
  geo.computeBoundingBox();
  const cx = (geo.boundingBox.max.x + geo.boundingBox.min.x) / 2;
  const cz = (geo.boundingBox.max.z + geo.boundingBox.min.z) / 2;
  geo.translate(-cx, 0, -cz);

  /* normal/pürüzlülük haritaları kaldırıldı: Sobel'den türetilen sahte normal
     haritası dosyayı ~4MB şişiriyordu ama bu üçgen sayısında (düz gölgeleme +
     iyi taban doku) görsel farkı yok denecek kadar azdı — QA ekran
     görüntülerinde zaten yalnız taban dokuyla kusursuz görünüyordu. */
  const loadImg = uri => new Promise(res => { if (!uri) return res(null); const im = new Image(); im.onload = () => res(im); im.src = uri; });
  const baseImg = await loadImg(baseUri);
  const tex = new THREE.Texture(baseImg);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true; tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: .82, metalness: .04,
    name: 'OtagWarrior_Baked'
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'OtagWarrior';

  const exporter = new GL.GLTFExporter();
  const b = await new Promise((res, rej) => exporter.parse(mesh, res, rej, { binary: true }));
  let s = '', bytes = new Uint8Array(b);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));

  /* dışa aktarıcı dokuyu kendi flipY kuralına göre PNG'ye gömdü — bu pikselleri
     JPEG'e çevirip Node tarafında geri gömeceğiz (ayrı pişirdiğimiz JPEG'i
     kullanmak farklı bir çevirme kuralına sahip olduğu için dokuyu bozuyordu). */
  const dv = new DataView(b);
  const glbLen = dv.getUint32(8, true);
  let off = 12, jsonBuf = null, binBuf = null;
  while (off < glbLen) {
    const clen = dv.getUint32(off, true);
    const ctype = new TextDecoder().decode(new Uint8Array(b, off + 4, 4));
    const chunk = b.slice(off + 8, off + 8 + clen);
    if (ctype === 'JSON') jsonBuf = chunk; else if (ctype === 'BIN\0') binBuf = chunk;
    off += 8 + clen;
  }
  const json = JSON.parse(new TextDecoder().decode(jsonBuf));
  const bv = json.bufferViews[json.images[0].bufferView];
  const pngBlob = new Blob([new Uint8Array(binBuf, bv.byteOffset, bv.byteLength)], { type: 'image/png' });
  const pngUrl = URL.createObjectURL(pngBlob);
  const pngImg = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = pngUrl; });
  const cv = document.createElement('canvas'); cv.width = pngImg.width; cv.height = pngImg.height;
  cv.getContext('2d').drawImage(pngImg, 0, 0);
  const jpegUri = cv.toDataURL('image/jpeg', .9);
  URL.revokeObjectURL(pngUrl);

  return { glbB64: btoa(s), jpegUri, tris: geo.index.count / 3, verts: geo.attributes.position.count };
}, {
  posB64: posB64f, uvB64: uvB64f, idxB64: idxB64f,
  baseUri: extracted.baseUri, normalUri: extracted.normalUri, roughUri: extracted.roughUri,
  metalScalar: extracted.metalScalar, roughScalar: extracted.roughScalar, box: extracted.box
});

await browser.close();

/* GLTFExporter dokuyu her zaman canvas üzerinden PNG'ye yeniden kodluyor,
   JPEG'i korumuz — taban dokuyu kendi JPEG baytlarımızla değiştiriyoruz
   (aynı boyutta resim, sadece kodlama küçülüyor: ~750KB PNG → ~120KB JPEG). */
console.log('   doku JPEG olarak yeniden gömülüyor…');
const finalGlb = spliceImage(Buffer.from(result.glbB64, 'base64'),
  Buffer.from(result.jpegUri.split(',')[1], 'base64'), 'image/jpeg');

fs.mkdirSync(path.dirname(outGlb), { recursive: true });
fs.writeFileSync(outGlb, finalGlb);
console.log(`4/4  ${outGlb}  ${(finalGlb.length / 1048576).toFixed(2)} MB`);
console.log(`     üçgen: ${result.tris}   köşe: ${result.verts}`);

/* ---- GLB içindeki ilk 'image/*' bufferView'ı yeni bir görselle değiştirir ---- */
function spliceImage(glb, newBytes, mime) {
  const length = glb.readUInt32LE(8);
  let off = 12, jsonChunk, binChunk;
  while (off < length) {
    const clen = glb.readUInt32LE(off), ctype = glb.toString('ascii', off + 4, off + 8);
    const data = glb.subarray(off + 8, off + 8 + clen);
    if (ctype === 'JSON') jsonChunk = data; else if (ctype === 'BIN\0') binChunk = data;
    off += 8 + clen;
  }
  const json = JSON.parse(jsonChunk.toString('utf8'));
  const img = json.images[0];
  const bv = json.bufferViews[img.bufferView];
  const oldLen = bv.byteLength, oldOff = bv.byteOffset;
  const delta = newBytes.length - oldLen;

  const newBin = Buffer.concat([
    binChunk.subarray(0, oldOff), newBytes, binChunk.subarray(oldOff + oldLen)
  ]);
  bv.byteLength = newBytes.length;
  for (const other of json.bufferViews) if (other !== bv && other.byteOffset > oldOff) other.byteOffset += delta;
  img.mimeType = mime;
  json.buffers[0].byteLength = newBin.length;

  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (newBin.length % 4)) % 4;
  const binPadded = Buffer.concat([newBin, Buffer.alloc(binPad, 0)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4);
  const totalLen = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  header.writeUInt32LE(totalLen, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0); jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0); binHeader.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
}
