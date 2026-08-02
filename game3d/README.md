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
Kaynak Meshy GLB'si 10.7 MB, 552k üçgen ve **yan yana 4 kopya** içeriyordu.
`scripts/extract_one.mjs` bağlı bileşenleri bulup X eksenindeki boşluklara göre
kümeleyerek tek şövalyeyi ayıklar; `scripts/optimize_model.mjs` meshoptimizer ile
sadeleştirir, KTX2 dokuları tek bir JPEG baseColor'a indirger ve geometriyi
kuantalar. Sonuç: **269 KB, 10.5k üçgen**.

    node scripts/extract_one.mjs kaynak.glb      # -> knight_single.glb
    node scripts/ktx2png.js kaynak.glb           # KTX2 -> tex0.png (baseColor)
    node scripts/optimize_model.mjs knight_single.glb 0.07 512   # -> knight.glb

Not: model rigsiz ve animasyonsuzdur; yürüme/sallanma hareketi kodda
prosedürel olarak üretilir.
