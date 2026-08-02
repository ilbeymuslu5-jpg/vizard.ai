// Kaynak GLB yan yana 4 sovalye iceriyor. Bagli bilesenleri bulup
// X eksenindeki bosluklara gore kumeleyerek TEK sovalyeyi ayiklar.
import { NodeIO } from '@gltf-transform/core';
import { KHRTextureBasisu, KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([KHRTextureBasisu, KHRMeshQuantization, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];

const posA = prim.getAttribute('POSITION');
const idxA = prim.getIndices();
const nv = posA.getCount(), ni = idxA.getCount();
const pos = new Float32Array(nv * 3), v = [0, 0, 0];
for (let i = 0; i < nv; i++) { posA.getElement(i, v); pos[i*3] = v[0]; pos[i*3+1] = v[1]; pos[i*3+2] = v[2]; }
const idx = new Uint32Array(ni);
for (let i = 0; i < ni; i++) idx[i] = idxA.getScalar(i);
console.log(`kaynak: ${nv} vertex, ${ni/3} ucgen`);

// --- Union-Find ile bagli bilesenler ---
const parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (let t = 0; t < ni; t += 3) { uni(idx[t], idx[t+1]); uni(idx[t], idx[t+2]); }

// Bilesen basina ucgen sayisi ve X merkezi
const comps = new Map();
for (let t = 0; t < ni; t += 3) {
  const r = find(idx[t]);
  let c = comps.get(r);
  if (!c) { c = { tris: 0, sx: 0, minX: 1e9, maxX: -1e9 }; comps.set(r, c); }
  c.tris++;
  for (let k = 0; k < 3; k++) { const x = pos[idx[t+k]*3]; c.sx += x; if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x; }
}
for (const c of comps.values()) c.cx = c.sx / (c.tris * 3);
const list = [...comps.entries()].map(([r, c]) => ({ r, ...c })).sort((a, b) => a.cx - b.cx);
console.log(`bagli bilesen: ${list.length}`);

// X ekseninde en buyuk 3 bosluktan bolerek 4 kume olustur
const gaps = [];
for (let i = 1; i < list.length; i++) gaps.push({ i, g: list[i].cx - list[i-1].cx });
gaps.sort((a, b) => b.g - a.g);
const cuts = gaps.slice(0, 3).map(g => g.i).sort((a, b) => a - b);
console.log('kume sinirlari (bosluk):', gaps.slice(0, 3).map(g => g.g.toFixed(3)).join(', '));
const groups = []; let start = 0;
for (const c of [...cuts, list.length]) { groups.push(list.slice(start, c)); start = c; }
groups.forEach((g, i) => console.log(`  kume${i}: ${g.length} bilesen, ${g.reduce((n,c)=>n+c.tris,0)} ucgen, X ${Math.min(...g.map(c=>c.minX)).toFixed(2)}..${Math.max(...g.map(c=>c.maxX)).toFixed(2)}`));

// En cok ucgene sahip kumeyi sec (en eksiksiz sovalye)
const best = groups.reduce((a, b) => (b.reduce((n,c)=>n+c.tris,0) > a.reduce((n,c)=>n+c.tris,0) ? b : a));
const keep = new Set(best.map(c => c.r));
console.log(`secilen kume: ${best.reduce((n,c)=>n+c.tris,0)} ucgen`);

// Secilen ucgenleri yeni bir primitife tasi (vertex yeniden numaralandirma)
const remap = new Int32Array(nv).fill(-1);
const newIdx = []; const order = [];
for (let t = 0; t < ni; t += 3) {
  if (!keep.has(find(idx[t]))) continue;
  for (let k = 0; k < 3; k++) {
    const oi = idx[t+k];
    if (remap[oi] < 0) { remap[oi] = order.length; order.push(oi); }
    newIdx.push(remap[oi]);
  }
}
console.log(`sonuc: ${order.length} vertex, ${newIdx.length/3} ucgen`);

// Oznitelikleri alt kumeye indir
for (const sem of prim.listSemantics()) {
  const a = prim.getAttribute(sem);
  const comp = a.getElementSize();
  const el = new Array(comp);
  const dst = new Float32Array(order.length * comp);
  for (let i = 0; i < order.length; i++) { a.getElement(order[i], el); for (let k = 0; k < comp; k++) dst[i*comp+k] = el[k]; }
  const na = doc.createAccessor(sem).setType(a.getType()).setArray(dst).setBuffer(root.listBuffers()[0]);
  prim.setAttribute(sem, na);
}
const ia = doc.createAccessor('indices').setType('SCALAR')
  .setArray(order.length > 65535 ? new Uint32Array(newIdx) : new Uint16Array(newIdx))
  .setBuffer(root.listBuffers()[0]);
prim.setIndices(ia);

fs.writeFileSync('knight_single.glb', await io.writeBinary(doc));
console.log('yazildi: knight_single.glb');
