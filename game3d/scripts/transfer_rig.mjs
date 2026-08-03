/* Yeni (statik ama yüksek detaylı) modele, animasyonlu modelin iskeletini aktarır.
   İki model aynı karakterin farklı ihraçları olduğu için en yakın nokta
   eşlemesiyle ağırlık transferi yapılabiliyor.

   1) Yeni model sadeleştirilir (524k -> ~14k üçgen)
   2) Yeni mesh, animasyonlu modelin bind uzayına taşınır (tek tip ölçek + kaydırma)
   3) Her yeni vertex için en yakın K rigli vertex bulunup JOINTS/WEIGHTS
      ters mesafe ağırlığıyla harmanlanır
   4) Animasyonlu belgenin mesh'i yeni geometri+doku ile değiştirilir;
      iskelet, düğüm hiyerarşisi ve animasyonlar aynen korunur

   Kullanım: node scripts/transfer_rig.mjs animasyonlu.glb yeni.glb [ucgen] [dokuPx] */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const [SRC_RIG, SRC_NEW] = [process.argv[2], process.argv[3]];
const TARGET_TRIS = parseInt(process.argv[4] || '14000', 10);
const TEX = parseInt(process.argv[5] || '512', 10);

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const rig = await io.read(SRC_RIG);
const neu = await io.read(SRC_NEW);

const primOf = doc => doc.getRoot().listMeshes()[0].listPrimitives()[0];
const triCount = doc => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);

/* ---- 1) Yeni modeli sadeleştir ---- */
console.log(`yeni model: ${Math.round(triCount(neu))} üçgen -> hedef ${TARGET_TRIS}`);
const ratio = Math.min(1, TARGET_TRIS / triCount(neu));
await neu.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }));
console.log(`sadeleştirme sonrası: ${Math.round(triCount(neu))} üçgen`);

/* ---- 2) Vertex verilerini oku ---- */
function readAttr(prim, name) {
  const a = prim.getAttribute(name); if (!a) return null;
  const n = a.getCount(), c = a.getElementSize();
  const out = new Float32Array(n * c), el = new Array(c);
  for (let i = 0; i < n; i++) { a.getElement(i, el); for (let k = 0; k < c; k++) out[i * c + k] = el[k]; }
  return { data: out, comp: c, count: n };
}
const rigPrim = primOf(rig), newPrim = primOf(neu);
const rigPos = readAttr(rigPrim, 'POSITION');
const rigJoints = readAttr(rigPrim, 'JOINTS_0');
const rigWeights = readAttr(rigPrim, 'WEIGHTS_0');
if (!rigJoints || !rigWeights) throw new Error('Kaynak modelde iskelet ağırlıkları yok');
const newPos = readAttr(newPrim, 'POSITION');
const newNor = readAttr(newPrim, 'NORMAL');
const newUv = readAttr(newPrim, 'TEXCOORD_0');

/* ---- 3) Yeni mesh'i rigli modelin bind uzayına hizala ---- */
const bounds = p => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) for (let k = 0; k < 3; k++) {
    const v = p.data[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
  }
  return { mn, mx };
};
const bR = bounds(rigPos), bN = bounds(newPos);
const scale = (bR.mx[1] - bR.mn[1]) / (bN.mx[1] - bN.mn[1]);              // boy oranı
const offX = (bR.mn[0] + bR.mx[0]) / 2 - (bN.mn[0] + bN.mx[0]) / 2 * scale;
const offZ = (bR.mn[2] + bR.mx[2]) / 2 - (bN.mn[2] + bN.mx[2]) / 2 * scale;
const offY = bR.mn[1] - bN.mn[1] * scale;                                  // ayakları hizala
console.log(`hizalama: ölçek ${scale.toFixed(4)}, kaydırma [${offX.toFixed(3)}, ${offY.toFixed(3)}, ${offZ.toFixed(3)}]`);
for (let i = 0; i < newPos.count; i++) {
  newPos.data[i * 3]     = newPos.data[i * 3]     * scale + offX;
  newPos.data[i * 3 + 1] = newPos.data[i * 3 + 1] * scale + offY;
  newPos.data[i * 3 + 2] = newPos.data[i * 3 + 2] * scale + offZ;
}

/* ---- 4) Ağırlık transferi: en yakın K rigli vertex ---- */
const K = 4;
const outJ = new Uint16Array(newPos.count * 4);
const outW = new Float32Array(newPos.count * 4);
// Hızlandırma: rigli vertexleri kaba bir ızgaraya yerleştir
const cell = (bR.mx[1] - bR.mn[1]) / 24;
const grid = new Map();
const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (let i = 0; i < rigPos.count; i++) {
  const k = key(rigPos.data[i*3], rigPos.data[i*3+1], rigPos.data[i*3+2]);
  let b = grid.get(k); if (!b) { b = []; grid.set(k, b); } b.push(i);
}
const cand = [];
let maxDist = 0;
for (let i = 0; i < newPos.count; i++) {
  const x = newPos.data[i*3], y = newPos.data[i*3+1], z = newPos.data[i*3+2];
  // yarıçapı büyüterek yeterli aday topla
  cand.length = 0;
  for (let r = 1; r <= 6 && cand.length < K * 3; r++) {
    cand.length = 0;
    const cx = Math.floor(x/cell), cy = Math.floor(y/cell), cz = Math.floor(z/cell);
    for (let a = -r; a <= r; a++) for (let b2 = -r; b2 <= r; b2++) for (let c2 = -r; c2 <= r; c2++) {
      const bucket = grid.get(`${cx+a},${cy+b2},${cz+c2}`);
      if (bucket) for (const idx of bucket) cand.push(idx);
    }
  }
  const src = cand.length ? cand : Array.from({ length: rigPos.count }, (_, n) => n);
  // en yakın K
  const best = [];
  for (const idx of src) {
    const dx = rigPos.data[idx*3] - x, dy = rigPos.data[idx*3+1] - y, dz = rigPos.data[idx*3+2] - z;
    const d2 = dx*dx + dy*dy + dz*dz;
    if (best.length < K) { best.push([d2, idx]); best.sort((p, q) => p[0] - q[0]); }
    else if (d2 < best[K-1][0]) { best[K-1] = [d2, idx]; best.sort((p, q) => p[0] - q[0]); }
  }
  if (Math.sqrt(best[0][0]) > maxDist) maxDist = Math.sqrt(best[0][0]);
  // ters mesafe ağırlıklı harman
  const acc = new Map();
  let wsum = 0;
  for (const [d2, idx] of best) {
    const w = 1 / (Math.sqrt(d2) + 1e-4);
    wsum += w;
    for (let k = 0; k < 4; k++) {
      const j = rigJoints.data[idx*4+k], jw = rigWeights.data[idx*4+k];
      if (jw <= 0) continue;
      acc.set(j, (acc.get(j) || 0) + jw * w);
    }
  }
  // en güçlü 4 eklemi al, normalize et
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = top.reduce((s, e) => s + e[1], 0) || 1;
  for (let k = 0; k < 4; k++) {
    outJ[i*4+k] = top[k] ? top[k][0] : 0;
    outW[i*4+k] = top[k] ? top[k][1] / tot : 0;
  }
}
console.log(`ağırlık transferi tamam · en uzak eşleşme mesafesi ${maxDist.toFixed(4)} (model boyu ${(bR.mx[1]-bR.mn[1]).toFixed(2)})`);

/* ---- 5) Rigli belgenin mesh'ini yeni geometriyle değiştir ---- */
const buf = rig.getRoot().listBuffers()[0];
const mkAcc = (name, type, arr) => rig.createAccessor(name).setType(type).setArray(arr).setBuffer(buf);
rigPrim.setAttribute('POSITION', mkAcc('POSITION', 'VEC3', newPos.data));
rigPrim.setAttribute('NORMAL', mkAcc('NORMAL', 'VEC3', newNor.data));
rigPrim.setAttribute('TEXCOORD_0', mkAcc('TEXCOORD_0', 'VEC2', newUv.data));
rigPrim.setAttribute('JOINTS_0', mkAcc('JOINTS_0', 'VEC4', outJ));
rigPrim.setAttribute('WEIGHTS_0', mkAcc('WEIGHTS_0', 'VEC4', outW));
for (const sem of rigPrim.listSemantics())
  if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(sem))
    rigPrim.setAttribute(sem, null);
// indisler
const newIdx = newPrim.getIndices();
const idxArr = new Uint32Array(newIdx.getCount());
for (let i = 0; i < idxArr.length; i++) idxArr[i] = newIdx.getScalar(i);
rigPrim.setIndices(mkAcc('indices', 'SCALAR',
  newPos.count > 65535 ? idxArr : new Uint16Array(idxArr)));

/* ---- 6) Yeni modelin dokusunu kullan ---- */
const newMat = neu.getRoot().listMaterials()[0];
const newBase = newMat.getBaseColorTexture();
const jpeg = await sharp(Buffer.from(newBase.getImage()))
  .resize(TEX, TEX, { fit: 'fill' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
for (const mat of rig.getRoot().listMaterials()) {
  const t = mat.getBaseColorTexture();
  t.setImage(jpeg).setMimeType('image/jpeg').setURI('');
  mat.setEmissiveTexture(null); mat.setEmissiveFactor([0, 0, 0]);
  mat.setAlphaMode('OPAQUE'); mat.setMetallicFactor(0); mat.setRoughnessFactor(1);
  mat.setDoubleSided(false);
}

await rig.transform(resample(), dedup(), prune());
for (const ext of rig.getRoot().listExtensionsUsed())
  if (ext.extensionName === 'KHR_materials_specular') ext.dispose();
await rig.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));

const out = await io.writeBinary(rig);
const dst = path.join(DIR, '..', 'knight.glb');
fs.writeFileSync(dst, out);
console.log(`\n${path.basename(dst)}: ${(out.byteLength/1024).toFixed(0)} KB · ` +
  `${Math.round(triCount(rig))} üçgen · ${rig.getRoot().listAnimations().length} animasyon · ` +
  `${rig.getRoot().listSkins().length} iskelet · doku ${TEX}px ${(jpeg.length/1024).toFixed(0)} KB`);
