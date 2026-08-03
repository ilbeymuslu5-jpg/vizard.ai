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

## Performans notu: "titriyor" ve düşen FPS

Yüksek seviyede (30+) oyun titriyor ve donuk hissettiriyordu. Ölçüm, sebebin
render yükü **olmadığını** gösterdi:

| | Sv. 1 | Sv. 43 (tüm EVO) |
|---|---|---|
| ekran sallantısı aktif kare | %73 | %100 (ort. 1.05) |
| hit-stop aktif kare | %5 | %54 |

Altı EVO silahla saniyede binlerce isabet oluyor; her isabet `addShake` ve
`hitStop` tetikliyordu. İkisi de hiç boşalamadığı için kamera sürekli titriyor
ve oyun karelerin yarısından fazlasında donuyordu (`dt = 0`).

Çözüm: sıradan isabetler için bekleme süresi (sallantı 0.14 sn, hit-stop
0.32 sn) ve daha düşük tavan. Boss ölümü, oyuncunun hasar alması gibi tekil
olaylar `force` ile bunu atlar. Ölçüm sonrası: sallantı 0.30, hit-stop %16.

Ayrıca kare başına yapılan tahsisler kaldırıldı: `project()` dizi döndürmüyor,
silah `stats()` nesnesi önbelleğe alınıyor, döner bıçak nesneleri yeniden
kullanılıyor, ekran dışı düşmanlar izdüşüm alınmadan eleniyor.


## Dünya varlıkları: "World Asset Collection" referansı

Kullanıcının paylaştığı referans sayfasındaki (ağaç, kaya, sütun, saz,
nilüfer, kaktüs, fıçı, testi, kemik, köprü, merdiven vb.) tüm varlıklar
`src/world.js` içinde prosedürel olarak modellendi ve 4 biyoma dağıtıldı:

| Biyom | Varlıklar |
|---|---|
| Orman | yapraklı ağaç, çam, kütük, yosunlu devrik gövde, çalı, çakıl |
| Kayalık | kaya sütunu/uçurum, yuvarlak kaya, çalı, kaktüs, çakıl |
| Harabeler | batık/kırık sütun, döşeme taşı, saz, nilüfer, testi, tahta köprü, merdiven |
| Volkanik | yanmış kütük, kömürleşmiş gövde, kemik/kafatası, magma havuzu (kabuklu) |

Her nesne türü, birkaç ilkel şeklin `mergeGeometries` ile **tek geometriye
birleştirilmiş** hâlidir; renk vertex color olarak gömülüdür. Tüm örnekler
tür başına **tek InstancedMesh** ile çizilir — toplam dünya 34 çizim
çağrısına sığar (öncesinde nesne başına ayrı mesh vardı, 250+ çağrı).

Zemin dokusu da referanstaki "Texture Swatches" örneklerine göre genişletildi:
orman için çim tutamları, kayalık için çatlak ağı, harabeler için batık taş
ızgara + yosun lekesi + su parıltısı, volkanik için kül serpintisi + akkor
çatlak.

Ağaç/kaya/sütun/fıçı gibi katı nesneler `COLLIDERS` dizisine (x, z, yarıçap)
kaydedilir; oyuncu bunların içinden geçemez (bkz. bir alttaki performans
notu — `resolveProps`). Düşmanlar bilinçli olarak geçebilir, yoksa
yüzlercesi ağaç diplerinde yığılıp sürü akışını bozar.


## Oyun geliştirmeleri (ölçüme dayalı)

### XP eğrisi: seviye atlama ekranı sürekli araya giriyordu
10. dakika koşullarında gerçekçi bir build ile ölçüm:

| | eski eğri | yeni eğri |
|---|---|---|
| 36 saniyede atlanan seviye | 30 → 52 (22 seviye) | 30 → 33 (3 seviye) |
| kart seçimi | ~1,3 saniyede bir | ~10 saniyede bir |
| kart ekranında geçen süre | %15 (300 ms robot tepkisiyle) | %0–2 |

`5 + 3.5·lv + lv^1.42` yerine
`6 + 5·lv + 0.35·lv² + max(0, lv−12)^2.6`. İlk 12 seviye neredeyse
değişmedi (x1.2), 30. seviyede ~10 kat pahalı. Erken tempo ölçümle
doğrulandı: 50. saniyede Sv.3 (öncesi 55. saniyede Sv.3).

### Altının karşılığı: kalıcı yükseltmeler
Altın toplanıyordu ama hiçbir işe yaramıyordu (bir koşuda 2000+ birikiyor).
Artık koşu sonunda kasaya yazılıyor ve menüdeki beş kalıcı yükseltmeye
harcanıyor (dayanıklılık, keskinlik, çeviklik, çekim, zırh — her biri 5
kademe, artan maliyet). `localStorage` sandbox bağlamlarda erişilemeyebildiği
için tüm erişimler korumalı; erişilemezse o oturum boyu bellekte tutulur.

### Ses (prosedürel WebAudio, harici dosya yok)
Osilatör + filtrelenmiş gürültüyle üretilen efektler: ateş, isabet, ölüm,
patlama, hasar, toplama, atılma, seviye, boss, zafer/yenilgi.
Menüde AudioContext açılmaz (tarayıcı etkileşim bekler), "OYUNA BAŞLA" ile
kurulur. Sallantı/hit-stop ile aynı ders: her efektin bekleme süresi ve
global eşzamanlı ses sınırı var — ölçümde yoğun anda 5 saniyede ~85 ses
düğümü (limitsiz olsa binlerce).

### Atılma (dash)
Kısa hız patlaması + dokunulmazlık, 2,4 sn bekleme. Mobilde sağ alttaki ⚡
butonu (bekleme dolumu konik gradyanla gösterilir), PC'de Boşluk/Shift.
Sürüyle çevrildiğinde kaçış imkânı verir.

### Bekleme duruşu
Modelde idle klibi olmadığı için karakter dururken yarı adımda donuyordu;
artık çok yavaş (0.18x) adımlama + nefes salınımı ile "hazır duruş" okunuyor.


## Grafik iyileştirmeleri (ve gerçek gölgelerin neden kullanılmadığı)

### Denenen ve ölçülüp vazgeçilen: gerçek gölge haritası
Yönlü ışık + gölge haritası kuruldu (oyuncuyu takip eden dar ortografik
gölge kamerası, 1–2K harita). Sonuç:

- **%66 FPS bedeli** (yazılım rasterizasyonunda 16.3 → 5.6 fps)
- Buna karşılık kazanç düşüktü: izometrik açıda güneş 61° yükseklikte
  olduğu için gölgeler kısa kalıyor ve büyük ölçüde nesnenin kendi altında
  gizleniyordu — piksel farkı ölçümü de bunu doğruladı.

Not: ilk denemede gölge hiç görünmüyordu; sebep `sun.shadow.camera` ortografik
sınırları değiştirildikten sonra `updateProjectionMatrix()` çağrılmamasıydı
(three varsayılan ±5 projeksiyonu kullanmaya devam ediyor).

### Kullanılan: zemin dokusuna pişirilmiş gölgeler
Nesneler sabit olduğundan gölgeleri dünya kurulurken bir kez zemin tuvaline
çiziliyor (`SHADOW_SIZE` tablosuna göre yumuşak elips, ışık yönünde kaydırılmış).
**Çalışma anında sıfır maliyet**, stilize görünüme de daha uygun.

### Diğerleri
- **Detay dokusu**: biyom haritası 2048 px'i 128 birime yayıyor (16 px/birim),
  yakından bulanıktı. 34× tekrar eden gren dokusu shader'da çarpılıyor.
  Ölçüm: tam ekran fazladan doku örneklemesi ~%12 maliyet → düşük güçlü
  cihazlarda kapalı (`buildWorld(scene, { detail: !LOW_END })`).
- **Gökyüzü gradyanı**: düz renk yerine dikey gradyan (ufuk hissi).
- **Su**: kostik benzeri parıltı dokusu, yavaşça kayarak akıntı hissi veriyor.

Kontrollü A/B (aynı oturumda, sırayı değiştirerek iki tur):
önceki 7.6 fps → yeni 6.7 fps (detay dokusu açıkken).

## Çift joystick (twin-stick) kontrol

Ekranın **sol yarısı** hareket, **sağ yarısı** nişan çubuğu. İkisi de dinamik:
parmağın değdiği yerde beliriyor, sabit bir konumları yok. İki parmak da aynı
yarıya düşerse ikincisi diğer çubuğa yönlendiriliyor (`pointerdown` içinde),
yoksa oyuncunun ikinci parmağı hiç çalışmıyordu.

PC karşılığı: WASD ile yürü, **fare imleciyle** nişan al. İmleç ile oyuncunun
ekrandaki izdüşümü arasındaki vektör dünya yönüne çevriliyor.

- Nişan çubuğu **boştayken** silahlar eskisi gibi en yakın düşmanı otomatik
  hedefliyor — yani tek parmakla da oynanabiliyor. Tüm nişanlı/otomatik ayrımı
  tek bir yerde: `aimAngle(range)`.
- Nişan alınırken karakter **namlunun yönüne** bakıyor (yan yürürken bile);
  alınmıyorsa yürüdüğü yöne bakmaya devam ediyor.
- Atılma düğmesi sağ alttan **alta ortaya** taşındı: sağ alt köşe artık nişan
  çubuğunun bölgesi, düğme orada kalsaydı nişan almak isteyen parmak
  yanlışlıkla atılıyordu.

### Ölçülen hata: çift sayıda atış hedefin ortasını boşa harcıyordu
Nişanlı yelpaze ilk başta ortalanmıştı (`(i - (count-1)/2) * spread`). Çift
sayıda atışta hedefin tam ortası boş kalıyor: ölçüm, 2 ışınlı lazerin 14 birim
mesafedeki hedefi ıskaladığını gösterdi (yanal sapma 1.19 > ışın yarı genişliği
1.10). `fanAngle()` ile düzeltildi — **ilk atış tam nişan yönüne** gider,
fazlalıklar sırayla iki yana açılır (0, +s, −s, +2s…).

Doğrulama: nişan yönündeki düşman 48 hasar alıyor, nişanın tersindeki yakın
düşman 0; çubuk bırakılınca otomatik hedeflemede ikisi de vuruluyor.

## Giyilebilirler (teçhizat)

Dört yuva — **kask, pelerin, kalkan, aura** — menüdeki kalıcı altınla alınır.
Kuşanılan parça hem karakterin üstünde görünür hem gerçek istatistik verir
(zırh, maks. can, hız, mıknatıs, hasar, kritik…). Kuşanma yalnızca menüde
değiştiği için bonuslar koşu başında bir kez `P.base`'e işleniyor —
kare başına maliyet yok (`applyGear()`).

### Parçalar kemiğe bağlanıyor
Parçalar iskeletin ilgili kemiğine (`Head`, `Spine02`, `LeftHand`) çocuk olarak
ekleniyor, böylece yürüme animasyonuyla birlikte hareket ediyorlar.

Tablodaki `pos`/`rot` **karakter uzayında** (dünya birimi, +Z ileri, +Y yukarı)
yazılıyor; kod bunları kemiğin karakter uzayındaki dönüşünü tersleyerek kemiğe
taşıyor. Elle çevirmek hataya çok açıktı: örneğin `LeftHand` kemiğinin +Y'si
dünyada **aşağıyı** gösteriyor, ilk denemede kalkan yan yatmıştı.

Ölçek de ölçülerek çözüldü: kemik uzayı model birimi (bu modelde ~santimetre),
`U = 1 / (MODEL_SCALE · kemikÖlçeği)` ile geometri dünya biriminde yazılabiliyor.

### Kask neden büyüdü: modelin zaten miğferi var
İlk kasklar (yarıçap 0.2) görünmüyordu. Kemik konumları ve iskeletli köşe
konumları ölçüldü (`getVertexPosition` + baskın kemik):

| Bölge | Dünya kutusu |
|---|---|
| `Head` kemiği | y = 1.19 (yani **ense**, kafanın tepesi değil) |
| Kafayı süren köşeler | y 1.01 → 2.20, yarı genişlik 0.37 |
| `LeftHand` köşeleri | merkez (0.50, 0.54, 0.15), ~0.19 küp |

Yani `Head` kemiği boynun dibinde; kask oraya konunca omuzların içinde
kalıyordu. Kasklar kafanın ortasına (y≈1.52) taşındı ve mevcut miğferi
**saracak** kadar büyütüldü (yarıçap 0.40–0.44).

### Aura
Zeminde yatan iki halka + yükselen kıvılcımlar (mevcut parçacık havuzunu
kullanıyor, yeni çizim nesnesi yok). Halkalar sahne düzeyinde duruyor, karaktere
bağlı değil — hasar alırken karakter yanıp sönerken auranın kaybolmaması için.
İlk sürümde halkalar **Z ekseninde** döndürülüyordu: geometri zaten yatırılmış
olduğu için halkalar yere dik kalkıyordu; dönüş ekseni Y olmalı.

### Maliyet
Kontrollü A/B (260 düşman, aynı oturumda sıra değiştirilerek 3+3 tur):
teçhizatsız 10.49 fps · tam teçhizat 10.99 fps → **ölçüm gürültüsünün içinde**,
kayda değer maliyet yok (en fazla 10 çizim çağrısı ekliyor).

### Menü
Teçhizat ve kalıcı yükseltmeler **sekmeli** tek panelde: alt alta konduğunda
menü uzayıp "OYUNA BAŞLA" düğmesini telefon ekranında görüş alanının dışına
itiyordu (390×780 ve 360×640'ta doğrulandı).

## Test sürümü

`npm run build:test` — her şeyin açık olduğu, üstüne **test paneli** eklenmiş
ayrı bir paket üretir. Oyunun kendisi birebir aynıdır; panel oyun koduna hiç
dokunmaz, her şeyi `window.__game` üzerinden yapar.

Ayrım derleme zamanında: normal paket `src/main.js`'ten, test paketi
`src/test-entry.js`'ten derlenir. Yani `testpanel.js`'in **tek satırı bile**
üretim çıktısına girmez — `build.mjs` bunu çıktıda arayıp doğruluyor
(sızarsa derleme hata verir).

Açılışta: tüm teçhizat sahiplenilir, kasa 99999, kalıcı yükseltmeler tam.
`metaSave()` çağrılmaz, böylece test sürümü gerçek kaydı bozmaz.

Panel `🧪` düğmesi veya **T** tuşu ile açılır:

| Bölüm | Neler var |
|---|---|
| Teçhizat | Her yuvayı tek tek gez, "en iyi set", "hepsini çıkar" |
| Silahlar | Silaha tıkla: +1 seviye → Sv.5'te EVO · "Hepsi Sv.5" · "Hepsi EVO" |
| Pasifler | Hepsi tam / sıfırla |
| Oyuncu | Ölümsüz, canı doldur, +1 Sv (kart ekranı), +5 Sv (kartsız) |
| Düşman | +30 / +150 düşman, boss, final boss, hepsini öldür, doğumu kapat |
| Zaman | +1 dk, +3 dk (boss'lar 3 dakikada bir), zamanı dondur |
| Diğer | +2000 altın, "her şeyi aç", "kilitli başlat" (yeni oyuncu deneyimi) |

Sürekli etkiler (ölümsüzlük, doğum kapalı, zaman donduruldu) oyun koduna bayrak
eklemek yerine 50 ms'lik bir zamanlayıcıdan durumu geri yazarak uygulanıyor —
üretim kodunda tek satır test mantığı olmasın diye. Ölümsüzlük her tikte
yeniden uygulanıyor: `startGame()` maksimum canı sıfırladığı için tek seferlik
yazmak yeniden başlatmadan sonra kayboluyordu (ölçüldü).

Doğrulama: paneldeki 34 düğmenin tamamı katı CSP altında tek tek tıklandı,
sıfır hata; üretim paketinde test kodu aranıp bulunmadığı doğrulandı.
