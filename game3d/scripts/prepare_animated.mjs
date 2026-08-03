/* Animasyonlu Meshy GLB'sini oyuna hazırlar.
   - Aynı 2048² dokunun iki kopyası (baseColor + emissive) tek JPEG'e indirilir
   - alphaMode BLEND -> OPAQUE (dokuda gerçek saydamlık yok, sıralama sorunu çıkarıyor)
   - iskelet + animasyonlar korunur; meshopt ile sıkıştırılır
   Kullanım: node scripts/prepare_animated.mjs kaynak.glb [dokuPx] [jpegKalite] */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
const TEX = parseInt(process.argv[3] || '512', 10);
const Q = parseInt(process.argv[4] || '85', 10);

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(SRC);
const root = doc.getRoot();

const tri = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log(`kaynak: ${Math.round(tri())} üçgen, ${root.listAnimations().length} animasyon, ` +
            `${root.listSkins().length} iskelet, ${root.listTextures().length} doku`);
for (const a of root.listAnimations()) console.log('  animasyon:', a.getName());

// --- Dokular: ikisi de aynı; tek bir JPEG baseColor bırak ---
const first = root.listTextures()[0];
const jpeg = await sharp(Buffer.from(first.getImage()))
  .resize(TEX, TEX, { fit: 'fill' })
  .flatten({ background: '#ffffff' })              // alfa yok; JPEG için düzleştir
  .jpeg({ quality: Q, mozjpeg: true })
  .toBuffer();

/* Doku GLB'ye GÖMÜLMÜYOR (bkz. transfer_rig.mjs): blob: URL + katı CSP sorunu. */
for (const mat of root.listMaterials()) {
  mat.setBaseColorTexture(null);
  // Emissive, baseColor'ın birebir kopyasıydı: kaldır. Rengin sönük kalmaması için
  // oyun tarafında ölçülü bir emissive katkısı veriliyor.
  mat.setEmissiveTexture(null);
  mat.setEmissiveFactor([0, 0, 0]);
  mat.setAlphaMode('OPAQUE');                      // dokuda saydamlık yok
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(1);
}

// Kullanılmayan doku/örnekleyici/uzantıları at, anahtar kareleri seyrelt, meshopt uygula
await doc.transform(resample(), dedup(), prune({ keepAttributes: true }));
for (const ext of root.listExtensionsUsed())
  if (ext.extensionName === 'KHR_materials_specular') ext.dispose();

// Boyut ölçümü: sıkıştırmasız hâl
const rawSize = (await io.writeBinary(doc)).byteLength;

// meshopt: vertex + animasyon verisini ~4x küçültür (oyun tarafında ~25 KB çözücü ister)
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
console.log(`sıkıştırmasız ${(rawSize / 1024).toFixed(0)} KB -> meshopt uygulandı`);

const out = await io.writeBinary(doc);
const dst = path.join(DIR, '..', 'knight.glb');
fs.writeFileSync(dst, out);
fs.writeFileSync(path.join(DIR, '..', 'knight_tex.jpg'), jpeg);
console.log(`\n${path.basename(dst)}: ${(out.byteLength / 1024).toFixed(0)} KB ` +
            `(base64 ~${(out.byteLength * 4 / 3 / 1024).toFixed(0)} KB)`);
console.log(`doku: ${TEX}px JPEG ${(jpeg.length / 1024).toFixed(0)} KB · ` +
            `uzantılar: ${root.listExtensionsUsed().map(e => e.extensionName).join(', ') || '(yok)'}`);
