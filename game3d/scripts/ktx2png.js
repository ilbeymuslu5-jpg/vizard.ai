// KTX2 (Basis) dokularini RGBA32'ye cozup PNG olarak kaydeder
const fs = require('fs'), path = require('path'), struct = require('util');
const sharp = require('sharp');
const loadBasis = () => eval(fs.readFileSync('./node_modules/three/examples/jsm/libs/basis/basis_transcoder.js','utf8') + ';BASIS');
const wasmBinary = fs.readFileSync('./node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm');

// GLB'den ktx2 bufferlarini cikar
function readGlb(p) {
  const d = fs.readFileSync(p);
  let off = 12, json = null, bin = null;
  const total = d.readUInt32LE(8);
  while (off < total) {
    const clen = d.readUInt32LE(off), ctype = d.readUInt32LE(off + 4);
    const body = d.subarray(off + 8, off + 8 + clen);
    if (ctype === 0x4E4F534A) json = JSON.parse(body.toString('utf8'));
    else if (ctype === 0x004E4942) bin = body;
    off += 8 + clen;
  }
  return { json, bin };
}

(async () => {
  const { json, bin } = readGlb(process.argv[2]);
  const Module = await loadBasis()({ wasmBinary });
  Module.initializeBasis();
  const out = [];
  for (let i = 0; i < json.images.length; i++) {
    const im = json.images[i];
    const bv = json.bufferViews[im.bufferView];
    const off = bv.byteOffset || 0;
    const data = new Uint8Array(bin.subarray(off, off + bv.byteLength));
    const f = new Module.KTX2File(data);
    if (!f.isValid()) { console.log('img' + i + ': gecersiz'); f.close(); f.delete(); continue; }
    f.startTranscoding();
    const w = f.getWidth(), h = f.getHeight();
    const RGBA32 = 13;
    const size = f.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32);
    const dst = new Uint8Array(size);
    const ok = f.transcodeImage(dst, 0, 0, 0, RGBA32, 0, -1, -1);
    f.close(); f.delete();
    if (!ok) { console.log('img' + i + ': transcode basarisiz'); continue; }
    const name = 'tex' + i + '.png';
    await sharp(Buffer.from(dst), { raw: { width: w, height: h, channels: 4 } }).png().toFile(name);
    console.log(`img${i}: ${w}x${h} -> ${name} (${(fs.statSync(name).size/1024).toFixed(0)} KB)`);
    out.push({ i, w, h, name });
  }
  fs.writeFileSync('tex_manifest.json', JSON.stringify({ images: out, materials: json.materials }, null, 1));
  console.log('\nmateryal:', JSON.stringify(json.materials));
})();
