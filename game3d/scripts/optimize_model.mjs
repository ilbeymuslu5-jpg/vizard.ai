import { NodeIO } from '@gltf-transform/core';
import { KHRTextureBasisu, KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { simplify, weld, dedup, prune, resample, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const SRC = process.argv[2];
const TARGET_RATIO = parseFloat(process.argv[3] || '0.02');   // 552k * 0.02 ≈ 11k ucgen
const TEX = parseInt(process.argv[4] || '512', 10);

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([KHRTextureBasisu, KHRMeshQuantization, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot();

const triCount = () => root.listMeshes().reduce((n, m) =>
  n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log('baslangic ucgen:', Math.round(triCount()));

await MeshoptSimplifier.ready;
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_RATIO, error: 0.008, lockBorder: false }),
);
console.log('sadelestirme sonrasi ucgen:', Math.round(triCount()));

// Dokular: sadece baseColor kalsin (JPEG). metallicRoughness / normal / emissive atilir.
const base = await sharp('tex0.png').resize(TEX, TEX, { fit: 'fill' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
for (const mat of root.listMaterials()) {
  mat.setMetallicRoughnessTexture(null);
  mat.setNormalTexture(null);
  mat.setEmissiveTexture(null);
  mat.setEmissiveFactor([0, 0, 0]);
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(1);
  mat.setDoubleSided(false);
  const t = mat.getBaseColorTexture();
  if (t) { t.setImage(base); t.setMimeType('image/jpeg'); t.setURI(''); }
}
// Kullanilmayan dokular/örnekleyiciler temizlensin, sonra geometri kuantalansin
await doc.transform(prune(), dedup(), quantize({ pattern: /^(POSITION|TEXCOORD|NORMAL)(_\d+)?$/ }));

// Gereksiz oznitelikleri at (renk/tanjant/ikinci UV)
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const name of prim.listSemantics())
      if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(name)) prim.setAttribute(name, null);
await doc.transform(prune());

// Meshopt sikistirmasini kaldir: calisma aninda ek cozucu gerekmesin
// Artik kullanilmayan uzantilari tamamen kaldir (calisma aninda ek cozucu gerekmesin)
for (const ext of root.listExtensionsUsed())
  if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_texture_basisu')
    ext.dispose();
console.log('kalan uzantilar:', root.listExtensionsUsed().map(e => e.extensionName).join(', ') || '(yok)');

const out = await io.writeBinary(doc);
fs.writeFileSync('knight.glb', out);
console.log(`\nknight.glb: ${(out.byteLength / 1024).toFixed(0)} KB  (base64 ~${(out.byteLength * 4 / 3 / 1024).toFixed(0)} KB)`);
console.log('ucgen:', Math.round(triCount()), '| doku:', TEX + 'px JPEG', (base.length / 1024).toFixed(0) + ' KB');
