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

Oyuncu modeli **iki Meshy ihracının birleşimidir**:

| kaynak | katkı |
|---|---|
| `Meshy_Merged_Animations.glb` | 24 eklemli iskelet + `Walking` / `Running` klipleri |
| `Front_View_Knight_texture.glb` | yüksek detaylı geometri (524k üçgen) ve PBR dokular |

İkinci model **rigsizdi**, birincisi ise daha düşük detaylıydı. UV yerleşimleri
farklı olduğu için doku takası mümkün değildi; bunun yerine `scripts/transfer_rig.mjs`
**iskelet ağırlıklarını aktarıyor**:

1. Yeni model 524k → 14k üçgene sadeleştirilir (meshoptimizer)
2. Tek tip ölçek + kaydırma ile animasyonlu modelin bind uzayına hizalanır
   (ayaklar ve boy eşlenir)
3. Her yeni vertex için en yakın 4 rigli vertex bulunup `JOINTS_0`/`WEIGHTS_0`
   ters mesafe ağırlığıyla harmanlanır. İki mesh aynı karakter olduğu için en
   uzak eşleşme modelin boyunun ~%4'ü kadar kalıyor.
4. Animasyonlu belgenin mesh'i yeni geometri ve doku ile değiştirilir; iskelet,
   düğüm hiyerarşisi ve animasyonlar aynen korunur

        node scripts/transfer_rig.mjs animasyonlu.glb yeni.glb 14000 512

Sonuç: **259 KB**, 14k üçgen, 2 animasyon. Model meshopt ile sıkıştırıldığından
oyun tarafında `MeshoptDecoder` paketlenir (~29 KB). Model **+Z yönüne bakar**
(`MODEL_YAW = 0`).

### Doku neden GLB'nin dışında?
three.js, GLB'ye gömülü görselleri `blob:` URL üzerinden yükler. Katı bir
Content-Security-Policy altında (Artifact sayfaları) bu istek engelleniyor,
`GLTFLoader` dokuyu yükleyemiyor ve karakter düz gri kalıyordu — `file://`
testlerinde CSP olmadığı için sorun görünmüyordu.

Bu yüzden doku GLB'ye gömülmez; ayrı bir JPEG olarak (`knight_tex.jpg`)
`window.__KNIGHT_TEX_B64` içine base64 gömülür ve oyun tarafında
`createImageBitmap` ile çözülür. Bu bir kaynak isteği olmadığı için CSP'den
etkilenmez.

Dikkat: doku materyalden çıkarıldığında `prune()` UV koordinatlarını
"kullanılmıyor" sayıp siliyor. Bu yüzden `prune({ keepAttributes: true })`
kullanılıyor.

### Okunurluk
Oyun mesafesinde karakter ~60 piksel; gümüş zırh siluetin çoğunu kaplayıp soluk
bir lekeye dönüşüyordu. Ters kabuk (inverted hull) koyu dış çizgi eklendi.
Geometri kuantalandığı için offset'in birimi model birimi değil — kalınlık
uniform olarak verilip tarayıcıda ölçülerek `0.0005`'e ayarlandı.

### Kullanılmayan betikler
`extract_one.mjs` + `optimize_model.mjs`: ilk gönderilen rigsiz GLB 10.7 MB /
552k üçgendi ve **yan yana 4 kopya** içeriyordu; bağlı bileşen analiziyle tek
şövalye ayıklanıp 269 KB'a indirilmişti. `prepare_animated.mjs`: animasyonlu
modeli tek başına hazırlar (aynı 2048² dokunun iki kopyasını teke indirir).
