# Horde Survivor 3D — kaynak

Tek dosyalık `../horde-survivor-3d.html` bu klasörden üretilir.

    node build.mjs                 # ../horde-survivor-3d.html (bağımsız sayfa)
    node build.mjs out.html --artifact   # Artifact iskeletine uygun gövde

## Dosyalar
- `src/main.js`  — oyun (kamera, sürü, silahlar, XP/kart, HUD)
- `src/world.js` — 4 biyomlu arena; zemin dokusu çalışma anında üretilir
- `shell.html`   — stil + menü/kart/sonuç işaretlemesi
- `knight.glb`   — oyuncu modeli (aşağıya bakınız)

## Model hazırlığı

Oyuncu modeli Meshy'den gelen **animasyonlu** GLB'dir: 24 eklemli iskelet ve
iki klip — `Walking` (1.03 sn) ve `Running` (0.63 sn). Geometri zaten oyuna
uygun (10.3k üçgen); ağırlığın tamamı dokulardaydı.

`scripts/prepare_animated.mjs` şunları yapar:
- Kaynakta **iki adet 2048² PNG** vardı ve ikisi bayt bayt aynıydı (baseColor
  ve emissive olarak aynı doku). Biri atılır, kalan 512px JPEG'e indirilir.
- `alphaMode: BLEND` → `OPAQUE` (dokuda gerçek saydamlık yok; BLEND gereksiz
  sıralama sorunu çıkarıyordu).
- İskelet ve animasyonlar korunur, anahtar kareler seyreltilir, meshopt ile
  sıkıştırılır (784 KB → 296 KB).

        node scripts/prepare_animated.mjs kaynak.glb 512 85   # -> knight.glb

Model meshopt ile sıkıştırıldığı için oyun tarafında `MeshoptDecoder`
paketlenir (~29 KB). Model **+Z yönüne bakar**, bu yüzden `MODEL_YAW = 0`.

Rengi korumak için Meshy'nin fullbright emissive kurulumu yerine, dokunun
kendisi ölçülü bir `emissiveMap` (yoğunluk 0.34) olarak da verilir; böylece
gölgede kalan yüzeyler sönükleşmez ama model sahne ışığından tamamen kopmaz.

### Eski statik model (kullanılmıyor)
İlk gönderilen rigsiz GLB 10.7 MB / 552k üçgendi ve **yan yana 4 kopya**
içeriyordu. `scripts/extract_one.mjs` (bağlı bileşen analizi) +
`scripts/optimize_model.mjs` (meshoptimizer sadeleştirme, KTX2 → JPEG) ile
269 KB'a indirilmişti; animasyonlu sürüm gelince devre dışı kaldı.
