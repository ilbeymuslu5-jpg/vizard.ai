# Horde Survivor 3D — kaynak

Tek dosyalık `../horde-survivor-3d.html` bu klasörden üretilir.

    node build.mjs                 # ../horde-survivor-3d.html (bağımsız sayfa)
    node build.mjs out.html --artifact   # Artifact iskeletine uygun gövde

## Dosyalar
- `src/main.js`  — oyun (kamera, sürü, silahlar, XP/kart, HUD)
- `src/world.js` — 4 biyomlu arena; zemin dokusu çalışma anında üretilir
- `src/weaponModels.js` — sınıfa göre elde taşınan silah görseli (kılıç/yay/asa/balta,
  nadirlik rengi + seviye 3/5 ek detay); `refreshHeldWeapon()` ile `main.js`'e bağlı
- `src/armorModels.js` — Destansı+ zırhlarda ince ışıltı halesi; `addPiece()` üzerinden
  mevcut eşya-bazlı detaylı geometrinin (`SHAPE`) üstüne bindirilir, yerini almaz
- `assets/uipack_rpg_sheet.png` — Kenney "UI Pack: RPG Expansion" (CC0) sprite sayfası;
  menü düğmeleri ve HP/XP/boss barlarında kullanılıyor (aşağıya bakınız)
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

## Teçhizat: koşu içinde gelişen RPG ilerlemesi

Kahraman artık **sade başlar** ve zırhını oyun sırasında toplar.

### Model değişimi
Yeni "base form" modeli iskeletsiz geldi (0 skin, 0 animasyon, 137k üçgen), bu
yüzden animasyonlu modelden `scripts/transfer_rig.mjs` ile iskelet aktarıldı
(14k üçgene sadeleştirme + en yakın komşu ağırlık transferi; en uzak eşleşme
0.21 birim / model boyu 1.70).

Meshy'nin "base form" ihracı **kıyafetsiz** bir gövdedir. Oyunun varsayılan
kahramanı olarak uygun olmadığı için keten tunik, kemer ve pantolon oyun
tarafında kalıcı geometri olarak ekleniyor (`OUTFIT`); zırhlar bunun üstüne
biniyor. Ayrıca modelin malzeme rengi `0xd7dde8` (çelik tonu) idi — eski model
gümüş zırhlıydı ve beyaza doymasın diye böyleydi; ten renkli yeni modeli
soldurduğu için `0xffffff` yapıldı.

### Sistem: envanter + kasa
6 yuva, yuva başına 6 **isimli eşya** — toplam 36. Kademe yok; her eşyanın
kendi kimliği, nadirliği ve stat profili var.

| Nadirlik | Renk |
|---|---|
| Yaygın | gri |
| Nadir | mavi |
| Destansı | mor |
| Efsanevi | altın |

**Artılar ve eksiler.** 36 eşyanın **19'u temiz** (yalnızca artı), **17'sinde
bir bedel var**. Kural: güçlü artı genelde bir eksiyle geliyor, ama her
nadirlikte bedelsiz seçenekler de bulunuyor — böylece "en yüksek nadirliği tak"
tek doğru cevap olmuyor. Örnek:

- *Cinnet Pençesi* (destansı): Hasar +%25, Kritik +%8 · **Zırh −3**
- *Kule Kalkanı* (destansı): Zırh +12, Can +55 · **Hız −%12, Saldırı hızı −%6**
- *Titan Yumruğu* (efsanevi): Hasar +%22, Saldırı hızı +%12, Etki alanı +%10 — bedelsiz

Eksiler ayrı bir yolla değil, aynı toplama torbasından geçiyor: negatif değer
zaten negatif toplanıyor, `recomputeStats()` içinde `plus` ve `minus` aynı
döngüde işleniyor.

### Kasa: seviye atladıkça düşer
- **Her seviye atlamada 1 kasa** düşer (`gainXp` içinde).
- Boss 2 kasa, elit %35, sıradan düşman %0.4.
- Kasa toplanınca içinden **yüzdelik şansla** bir eşya çıkar; şanslar
  seviyeyle iyileşir ve envanterde yazıyor:

| Seviye | Yaygın | Nadir | Destansı | Efsanevi |
|---|---|---|---|---|
| 1 | %74 | %19 | %6 | %1 |
| 10 | %52 | %30 | %14 | %5 |
| 25 | %22 | %42 | %26 | %10 |

Doğrulama: 4000 kasa açıldı, gerçek dağılım ilan edilen oranlarla örtüşüyor
(sv1 → %73/19/6/1, sv25 → %22/43/25/10).

Çıkan eşya **boş yuvaya kendiliğinden** takılıyor; yuva doluysa çantaya
düşüyor ve karşılaştırmayı oyuncu envanterden yapıyor. Kopya veya çanta
doluysa altına çevriliyor.

### Envanter
🎒 düğmesi **üst sağda**, duraklat düğmesinin yanında (veya **I** tuşu, ya da
duraklat ekranından); açıkken oyun durur.

> **Düzeltilen hata:** düğme ilk sürümde ALT SAĞDAYDI — yani nişan
> başparmağının tam durduğu yerde. Oyuncu nişan almak için oraya dokununca
> envanter açılıyor, oyun duruyor ve karakter donmuş gibi görünüyordu.
> (Atılma düğmesi tam bu sebeple alta ortaya taşınmıştı; aynı hata çantayla
> tekrarlandı.) Artık ekranın alt yarısında oyunu durduran hiçbir düğme yok —
> 10×20 ızgarayla taranarak doğrulandı: alt yarıda yalnızca alt-ortadaki
> atılma düğmesi var, geri kalan her yer kontrol çubuklarına ait. Kuşanılanlar üstte, çanta altta; her hücrede eşyanın ikonu, adı,
nadirlik rengi ve **yeşil artıları / kırmızı eksileri** görünür. Çantada
bekleyen eşya varsa 🎒 düğmesi yanıp söner.

İkonlar 2B canvas'a **çizim komutlarıyla** üretiliyor: harici dosya yok,
`data:` URL yok (katı CSP altında da çalışır) ve renkler modeldeki eşyayla
aynı kaynaktan geldiği için envanterde gördüğün şey karakterin üstündekiyle
birebir aynı.

Envanter ve çanta **koşuya özel** (roguelike döngüsü). Kalıcı olan tek şey
koleksiyon kaydı: menüdeki KOLEKSİYON sekmesi hangi eşyaları bulduğunu
gösterir.

### Yerleşim: ölçmeden yapılamıyor
Parçalar kemiğe bağlı; `pos`/`rot` karakter uzayında yazılıp kemiğin dönüşü
terslenerek kemiğe taşınıyor. Yeni gövde ölçüldü (`getVertexPosition` +
baskın kemik) ve üç hata bu sayede bulundu:

1. **Miğfer görünmüyordu.** Kafa neredeyse küre: y 1.6–1.7'de yarı genişlik
   0.41, tepe 2.15. 0.44 yarıçaplı kubbenin tepesinden kafa taşıyordu.
2. **Sonra miğfer yüzü tamamen kapattı** (kubbe y 1.30'a kadar iniyordu).
   Kafanın yalnızca üst yarısını örtecek şekilde ayarlandı.
3. **Pelerin yakası boyundan yukarı çember yapıyordu.** `rotateX(90°)` ile
   yatırılan halka sonra `rotateZ` ile döndürülüyordu; bu onu dikleştiriyor.
   Hizalama dönüşü **Y** ekseninde olmalı. Ölçümde pelerinin tepesi y 1.62
   çıkıyordu (olması gereken 1.29).

Çarpışma taraması: 8 yön × 120 kare × 290 engel, en kötü nüfuz **0.081 birim**
(karakter boyunun %3.7'si) — itme çözücüsünün tek karelik artığı.

## RPG genişletmesi: Grafik Tasarım Dokümanı'na göre geliştirme

Kullanıcının paylaştığı `Horde_Survivor_3D_RPG_Grafik_Tasarım_Dokümanı.md`
dosyası; 4 karakter sınıfı, 3 dallı yetenek ağacı, temalı zırh setleri, 4
biyom bossu, toon shading + rim/glow/bloom/vinyet/kromatik-sapma ve harici
PNG/`.glb`/`.wav` varlık listesi (doku üretim aracı, ses stüdyosu vb. bu
ortamda yok) istiyordu. **Ölçek kararı**: dokümanın *ruhu* — sınıf çeşitliliği,
derinlemesine ilerleme, biyoma özgü boss kimliği, cel-shaded görünüm —
oyunun var olan mimarisiyle (prosedürel three.js geometrisi, canvas ikonlar,
mevcut parçacık/patlama/knockback sistemleri) uygulandı; gerçekleştirilemeyen
kavramlar en yakın gerçek/test edilebilir mekaniğe eşlendi, her uyarlama kod
içinde yorum olarak işaretlendi.

### Sınıflar
`CLASSES` tablosu (Paladin/Ranger/Mage/Berserker): can/hız/hasar çarpanları +
başlangıç silahı + kıyafet paleti `resetPlayer()`'da `applyMeta()`'dan ÖNCE
uygulanıyor (kalıcı yükseltmeler çarpımsal değil **toplamsal** hâle getirildi
— aksi hâlde sınıf bonusunun üstüne yazıyordu, ölçümle bulundu). Zırh/bot
giyilince kıyafet parçası gizlenen mantık `outfitNodes[i].holder.visible`
üzerinden korunuyor; sınıf değişince `refreshOutfitVisuals()` geometriyi
güncel paletle yeniden kurar.

### Yetenek ağacı
39 düğüm (3 dal × 13), tier 1–4'te 3 seçenekten biri, tier 5 tek ULTIME.
Çalışma zamanı okumaları `P.sk` nesnesinde önbelleklenir (`applySkillTree()`
koşu başında bir kez çalışır) — her isabette yeniden hesaplanmaz. Zincirleme
efektler (İkili Vuruş, Elektrik Zinciri, Kritik Patlama) `hitEnemy()`'ye
eklenen `noProc` parametresiyle en fazla bir kademe yayılabiliyor; sonsuz
özyineleme riski böylece yapısal olarak kapatıldı.

### Set bonusları
4 tema (Orman/Volkan/Harabe/Buzul) × 4 parça, `equippedSetCounts()` ile
sayılıp `recomputeStats()` içinde 2'li/4'lü eşiklerde `P.setBonus` bayrakları
üretiliyor. Orman'ın "ormanda hız +%20" bonusu **biyoma göre anlık** olduğu
için `recomputeStats()` değil `updatePlayer()` içinde her karede
`biomeAt(P.x,P.z)` ile kontrol ediliyor; Volkan/Harabe/Buzul'un periyodik
efektleri (yanan iz, don izi, yaprak kalkanı) mevcut `makeFire`/`chillNearby`
altyapısını yeniden kullanıyor.

### Temalı boss'lar
Dokümandaki 4 boss (Eski Ağaç/Magma Golem/Unutulmuş Kral/Buzul Ejderha) dünya
biyomlarıyla eşlendi: `biomeAt()` dört kadran döndürüyor (orman/kayalık/
harabe/volkanik), doğan boss'un görsel teması **doğduğu kadrana göre**
seçiliyor; final boss (Sv.20+/`WIN_TIME`) her zaman Buzul Ejderha — dokümanın
henüz ayrı bir harita bölgesi olmayan "Buzul" biyomu böylece final
karşılaşmasına bağlandı. Zorluk ölçeği (`BOSS_TIERS`) temadan bağımsız,
koşu içindeki boss sayısına göre artmaya devam ediyor. Her tema kendi
silüetine (gövde+taç+kök / bloklu golem / pelerinli kral / kanatlı ejderha)
ve saldırı setine (`BOSS_ATTACKS`) sahip; hepsi var olan telegraf/doğum
altyapısını yeniden kullanıyor.

### Grafik: toon shading + ucuz "post-processing"
- **Toon shading**: `MeshToonMaterial` + 4 basamaklı gradyan doku —
  düşman/boss/teçhizat materyallerinde `MeshLambertMaterial`'ın yerini aldı.
  Tek dokulu ek arama olduğu için ekstra çizim geçişi gerektirmiyor.
- **Glow**: boss'larda hafifçe büyütülmüş (×1.12), additive-blend kopya kabuk
  — gerçek bloom yerine tek ek mesh.
- **Bloom/vinyet/kromatik sapma**: gerçek GPU post-processing (EffectComposer
  + blur geçişleri) bu oyunun ölçülü performans bütçesiyle uyuşmuyor (bkz.
  gölge haritası notundaki %66 FPS bedeli). Bunun yerine isabet anında
  ekranın kenarlarını koyulaştıran dairesel gradyan + kısa kırmızı/camgöbeği
  kenar şeridi (`G.flashRed` üzerinden, tek `drawOverlay()` çizimi) ve
  parçacıklarda soluk-hale + parlak-çekirdek iki katmanlı çizim eklendi.

### Elde taşınan sınıf silahı
`src/weaponModels.js` — sınıf başına elde taşınan silah görseli (kılıç/yay/asa/
balta), nadirlik rengine göre boyanmış, seviye 3'te ek detay ve seviye 5'te
halo/rüzgar halkası/şok dalgası gibi görsel yükseltmeler. Oyunun kendi silah
kimlikleri (bolt/guardian/rocket/laser/kunai) tür olarak bu 4 kategoriye
birebir denk düşmediği için `CLASS_WEAPON_TYPE` eşlemesiyle sınıf ikonuna
bağlandı (Paladin→kılıç, Ranger→yay, Mage→asa, Berserker→balta); mevcut
'guardian' dönen bıçak efekti ayrıca korunuyor. `RightHand` kemiğine
`attachNode()` ile bağlanıyor; görsel sınıf değişince veya silah seviye
atlayınca (`updateWeapons()` içinde ucuz anahtar karşılaştırmasıyla, her
karede yeniden kurmadan) güncelleniyor. Yay'ın eğrisi yerel düzlemde düz
olduğu için izometrik kameradan kenardan görünmesin diye ek bir yaw
döndürmesiyle tutuluyor.

### Destansı+ zırh halesi
`src/armorModels.js` — 6 kademeli bir nadirlik tablosu (common…mythic) taşıyan,
slot başına küçük bir örnek gövde + Destansı ve üstünde yarı saydam bir hale
küresi üreten bağımsız bir üreteç. Oyunun kendi eşya sistemi zaten 36 isimli,
her biri kendi `SHAPE[slot](det, it)` geometrisine sahip eşya barındırıyor
(bkz. "Teçhizat" bölümü) — bu üretecin 4 slotluk genel gövdeleriyle
değiştirmek gerileme olurdu. Bunun yerine yalnızca **hale** kısmı yeniden
kullanıldı: `addPiece()` artık üçüncü bir `rar` parametresi alıyor, Destansı/
Efsanevi eşyalarda `createArmorPiece('_aura', ...)` çağrılıp yalnızca hale
child'ı mevcut detaylı geometrinin üstüne ekleniyor (temel gövde dalları hiç
eşleşmediği için boş kalıyor). Oyunun 4 kademeli nadirlik kimliği
(`common/rare/epic/legend`) üretecin 6 kademeli tablosuna `ARMOR_RARITY_ALIAS`
ile eşlendi (`legend` → `legendary`).

### Kenney UI Pack entegrasyonu
`assets/uipack_rpg_sheet.png` — 512×512'lik tek sprite sayfası (32 KB), `build.mjs`
tarafından `window.__UIPACK_B64` olarak diğer varlıklarla (GLB, doku) aynı yolla
tek dosyaya gömülüyor. XML atlas çalışma anında ayrıştırılmıyor; ihtiyaç
duyulan birkaç sprite'ın koordinatları `UI_ATLAS`/`UI_BUTTONS` sabitlerine elle
yazıldı.

- **HP/XP/boss barları**: üç parçalı ("3-slice") bar dokuları — sabit uç
  kapaklar + gerilen orta parça — `drawRpgBar()` ile canvas'a çiziliyor. Dolum
  oranı, tam bar genişliğinde çizilen dolgu sprite'ını `ctx.clip()` ile
  kırparak elde ediliyor (uçlar orana göre doğal biçimde kesiliyor). Doku
  henüz yüklenmediyse (ilk kare) fonksiyon `false` döner, çağıran taraf eski
  düz `fillRect` çizimine düşer.
- **Menü düğmeleri**: CSS `border-image` tüm kaynak görseli dilimlediği için
  atlas'tan doğrudan alt-dikdörtgen kullanılamıyor — her düğme sprite'ı
  (`buttonLong_beige/_pressed`, `buttonLong_brown/_pressed`) yüklenince bir
  kerelik bir `<canvas>` ile kırpılıp kendi `data:` URL'i olarak
  `--ui-btn-*` özel özelliğine yazılıyor; `.btn`/`.btn.ghost` bunu
  `border-image-source` olarak okuyor. `border-image-slice` değerleri
  (10 14) sprite'ın gerçek bevel kalınlığına göre ölçülüp ayarlandı — ilk
  denemede çok büyük seçilince (20 40) buton düz bir taş levha gibi
  görünüyordu.

Doğrulama: her sistem için ayrı Playwright script'i (sınıf istatistikleri,
yetenek kapıları, set eşikleri/hasar çarpanları, biyoma göre boss teması,
doğal `spawnWave()` akışı, materyal tipi kontrolü) — hepsi sıfır konsol
hatasıyla geçti. Test paneline SINIF/YETENEK AĞACI/SET/TEMALI BOSS bölümleri
eklendi.

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
| Teçhizat | Yuvadaki eşyayı gez · nadirliğe göre set tak · çantayı doldur · yere kasa bırak · envanteri aç |
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
