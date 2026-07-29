# OTAĞ — Kızıl Sefer

Senin gönderdiğin karakterle (mızraklı, hilal‑yıldız kalkanlı küçük otağ savaşçısı)
yapılmış, **çalışır durumda**, **3 boyutlu** bir aksiyon‑macera oyunu.

Unreal Engine yok, kurulum yok. Tek klasör, **çift tıkla açılır**, tarayıcıda çalışır.
Dünya gerçek 3B: perspektif kamera, gölge haritası, ateş ışıkları, sis ve derinlik.

---

## Nasıl oynanır

`otag/index.html` dosyasına çift tıkla. Hepsi bu.
(Chrome, Edge veya Firefox — hepsi olur.)

### Tuşlar

| Tuş | Ne yapar |
|---|---|
| **W A S D** | Hareket |
| **Fare** | Nişan al / yönünü çevir |
| **Sol tık** | Mızrak saldırısı — 3'lü kombo (3. vuruş ağır) |
| **Sağ tık / Boşluk** | Kalkanı kaldır. Vuruş anında kaldırırsan **parry** |
| **Shift** | Atılış — kısa süre dokunulmazlık |
| **Q** | Kızıl Girdap — öfke barı dolunca alan saldırısı |
| **E** | Etkileşim: konuş, sandık aç, ateş yak, bölge geç |
| **1–5** | Eşya kullan |
| **I / J** | Envanter / Görev defteri |
| **ESC** | Duraklat |
| **Fare tekerleği** | Kamerayı yakınlaştır / uzaklaştır |
| **Orta tuş sürükle** (veya **[** **]**) | Kamerayı çevir — yürüyüş yönü kameraya göre döner |

### Dövüşün püf noktaları

- **Parry** en güçlü hamle: düşman tam vuracakken kalkanı kaldır. Düşman sersemler,
  öfken dolar, arkasına geçip **arkadan vuruş** yaparsın (%60 fazla hasar).
- Düşmanın saldırısından önce yerde/üstünde kızıl bir **telegraf** çizilir. Onu gör, atıl.
- **Balyoz** (iri düşman) yere vurur, halka yayılır — halkadan kaç, sonra arkasına geç.
- Patron **hücum** ederken kayaya çarparsa sersemler; o anda hasarı **1.75 katına** çıkar.

---

## Oyunda ne var

**4 bölge, ~30–45 dakikalık tam bir oyun akışı:**

1. **Otağ Kampı** — Dede ile konuşma, öğretici, ilk gölge dalgaları
2. **Kül Ormanı** — 3 gölge dalgası, mühürlü sandık, **Kızıl Anahtar**
3. **Gölge Geçidi** — 3 ateş kulesi yakma bulmacası, her ateş yeni bir dalga çağırır
4. **Kara Otağ Arenası** — 3 evreli patron dövüşü

**Sistemler** (senin listendeki her madde karşılandı, sadece Blueprint yerine JavaScript ile):

| İstenen | Durum |
|---|---|
| Klasör / dosya yapısı | ✔ `js/` altında 7 modül, isimlendirme tutarlı |
| Girdi haritası | ✔ `js/core.js` → `Input` |
| Kaydetme sistemi | ✔ `localStorage`, bölge geçişlerinde otomatik kayıt |
| Dövüş | ✔ kombo, ağır vuruş, blok, parry, atılış, girdap, arkadan vuruş |
| Yapay zekâ | ✔ 3 düşman türü: kovalayan, mesafe koruyan okçu, alan vuran balyoz |
| Düşman doğurucu | ✔ dalga yöneticisi (`js/systems.js` → `Waves`) |
| Can sistemi | ✔ can / dayanıklılık / öfke barları, iksirler, can küreleri |
| Hasar sistemi | ✔ hasar sayıları, geri tepme, dokunulmazlık kareleri, vuruş donması |
| Envanter | ✔ 10 slot, hızlı çubuk, pasif eşyalar (Mızrak/Kalkan Runesi, Kor Yürek) |
| Görev sistemi | ✔ 4 zincirleme görev, ekran takipçisi + görev defteri |
| Ana menü | ✔ |
| Duraklatma menüsü | ✔ |
| Ayarlar | ✔ ses (3 kanal), ekran sarsıntısı, zorluk, hasar sayıları |
| Patron dövüşü | ✔ 3 evre, 4 farklı saldırı, gölge çağırma |
| Paketleme | Aşağıya bak ⬇ |

### 3B nasıl çalışıyor

Oyun mantığı 2B kaldı — çarpışma, yapay zekâ, görevler hep `(x, y)` düzleminde.
Çizim katmanı ise tamamen 3B: `(x, y)` zemin düzlemi, yükseklik ayrı eksen.
Böylece dövüş hissi bozulmadan dünya üç boyuta taşındı.

- **`js/render3d.js`** — three.js sahnesi: kamera, ışıklar, gölge haritası, sis,
  arazi kabartması, ufuk silueti, parçacık sistemleri.
- **Düşmanlar, patron, ağaçlar, çadırlar, kayalar, sancaklar, sandıklar** kodla
  üretilmiş gerçek 3B gövdeler (low‑poly, düz gölgelemeli).
- **Karakter, senin gönderdiğin gerçek 3B taramadan** (`assets/warrior/otag-warrior.glb`,
  bkz. "Karakter modeli nereden geliyor" ⬇): ahşap gövde, kiremitli çatı,
  hilal‑yıldız tepelik, hilalli kalkan, kızıl sargılı mızrak — hepsi taranmış
  dokusuyla birlikte. Tek parça bir model olduğu için animasyon gövde bütünü
  üzerinde çalışıyor: bekleme, koşma, saldırı (geri yaslan → mızrak hamlesi),
  girdap, kalkan bloğu, darbe, ölüm (devrilir, üstünden hayalet yükselir).
  `js/warrior.js` bu hareketleri sürüyor.
- Dede de aynı model, gri‑ahşap tonunda; yaklaşınca sana döner.
- WebGL var ama model yüklenemezse (ya da hiç WebGL yoksa), oyun otomatik
  olarak **eski prosedürel gövdeye** düşer (`js/character3d.js` — ahşap yumurta
  + 7 yüz ifadesi + kol/kalkan/mızrak ayrı ayrı animasyonlu, tamamen kodla
  üretilmiş yedek model). Oynanış hiçbir durumda bozulmaz.
- **Ateşler** alev + titreyen nokta ışığı + yükselen kıvılcım demeti.
- WebGL yoksa oyun sessizce **eski 2B çizime** düşer; oynanış değişmez.

**Teknik:**
- Ses tamamen tarayıcıda üretiliyor (WebAudio) — tek bir ses dosyası bile yok.
- Zemin dokusu kodla üretilip 3B araziye kaplanıyor.
- Tek dış kütüphane: three.js (`vendor/three.min.js`, projeye gömülü, `GLTFLoader` dahil).
- Yedek prosedürel karakterin bütün dokuları (tahta, kiremit, kalkan, yüzler) tuvalde üretiliyor.

### Karakter modeli nereden geliyor

Gönderdiğin `.glb` bir "image‑to‑3D" taraması — 1 milyon üçgen, tek parça,
KTX2 sıkıştırmalı dokular. Oyun içinde doğrudan kullanılamayacak kadar ağırdı,
o yüzden bir kerelik bir indirgeme hattından geçirildi:

1. **`tools/finalize-warrior.mjs`** taramayı açar (tarayıcıda, KTX2 + meshopt
   çözerek), dokuları GPU'dan okuyup düz JPEG'e çevirir, üçgen sayısını
   [meshoptimizer](https://github.com/zeux/meshoptimizer)'ın hızlı basitleştiricisiyle
   ~8.300 üçgene indirir (spec'teki "7.842 tri" hedefine çok yakın — göz,
   kalkan, hiçbir ayrıntı kaybolmadan), ayağı yere oturtur, boyu 1 birime
   ölçekler ve tek bir `otag-warrior.glb` (0,7 MB) olarak dışa aktarır.
2. Sonuç dosya düz `THREE.GLTFLoader` ile açılır — KTX2/meshopt/Draco gibi ek
   çözücü gerektirmez, oyunun kendisi hiçbir ek kütüphane taşımaz.

Kaynak tarama (`assets/warrior/source.glb`, 15 MB) depoya dahil edilmedi
(`.gitignore`) — sadece indirgenmiş sonuç kullanılır. Farklı bir oranla
yeniden üretmek istersen kaynağı `assets/warrior/source.glb`'ye koyup
tekrar çalıştır:

```bash
npm i three esbuild playwright meshoptimizer
node tools/build-single.mjs                 # dist/otag.html (GLTFExporter bunu okur)
WARRIOR_RATIO=0.012 node tools/finalize-warrior.mjs   # daha yüksek detay isterse
```
- `assets/otag_sheet.png` artık yalnızca arayüz portresinde ve WebGL'siz
  yedek 2B çizimde kullanılıyor.
- İfadeler oyuna bağlı: öfke barın dolunca **kızgın**, canın azalınca **üzgün**,
  şaşırınca **şaşkın**, ölünce **✕ göz**, 12 saniye kıpırdamazsan **uykulu**.

---

## Dosya haritası (bir şeyi değiştirmek istersen)

```
otag/
├─ index.html            arayüz iskeleti (menüler, HUD)
├─ style.css             tüm arayüz görünümü
├─ assets/otag_sheet.png karakter sayfası (4 sütun × 3 satır, portre + yedek 2B)
├─ assets/warrior/otag-warrior.glb   asıl 3B karakter modeli (indirgenmiş tarama)
├─ vendor/three.min.js   3B motoru + GLTFLoader (tek dış kütüphane)
└─ js/
   ├─ core.js       matematik, girdi, ses, parçacıklar, kamera
   ├─ sprites.js    karakter sayfasının dilimlenmesi + çizimi (portre/yedek)
   ├─ warrior.js    asıl 3B model: yükleme + katı gövde animasyonu
   ├─ character3d.js prosedürel yedek model (WebGL var ama model yüklenemezse)
   ├─ render3d.js   3B çizim: sahne, kamera, ışık, gövdeler, efektler
   ├─ world.js      BÖLGELER burada (ZONES). Harita, engel, sandık, kapı ekle
   ├─ entities.js   oyuncu, düşman türleri (ENEMY_TYPES), patron, mermiler
   ├─ systems.js    eşyalar (ITEMS), görevler (QUEST_DEFS), dalgalar (WAVES), kayıt
   ├─ ui.js         HUD, menüler, envanter, diyalog
   └─ main.js       oyun döngüsü, bölge geçişi, etkileşim
```

Sık istenen ayarlar:

- **Oyuncu hızı / hasarı:** `js/entities.js` → `class Player` (`spd 268`, `dmg 17/30`)
- **Düşman gücü:** `js/entities.js` → `ENEMY_TYPES`
- **Patron canı:** `js/entities.js` → `class Boss` (`900`)
- **Dalga içerikleri:** `js/systems.js` → `WAVES`
- **Yeni görev:** `js/systems.js` → `QUEST_DEFS` + `Quests.event`
- **Yeni bölge:** `js/world.js` → `ZONES` içine yeni kayıt, sonra bir `exit` propu ekle
- **Kamera açısı / uzaklığı:** `js/render3d.js` → `pitch`, `dist`
- **Karakterin animasyonları:** `js/warrior.js` → `update()` içindeki `switch(st)`
- **Karakter modelini yeniden üret:** `tools/finalize-warrior.mjs` (bkz. yukarı)
- **Yedek prosedürel modelin biçimi/ifadeleri:** `js/character3d.js` → `EGG`, `drawFace`
- **Işık ve sis:** `js/render3d.js` → `buildZone` içindeki `sun`, `hemi`, `fog`

---

## Steam'e / itch.io'ya çıkarmak

**itch.io (5 dakika, bedava):** `otag` klasörünü zip'le, itch.io'da "HTML" projesi
olarak yükle, ana dosya `index.html`. Anında oynanabilir.

**Steam (masaüstü .exe gerekir):** Steam tarayıcı oyunu kabul etmez, `.exe` ister.
Bu oyunu değiştirmeden `.exe` yapmanın standart yolu **Electron** ile sarmalamaktır:

```bash
npm init -y
npm i -D electron electron-builder
# main.js: BrowserWindow ile otag/index.html'i aç
npx electron-builder --win
```

Sonrası Steam'in kendi süreci: Steamworks hesabı (100 $ ücret), mağaza sayfası,
yaş/uygunluk formları, `steamcmd` ile derlemenin yüklenmesi. Başarımlar ve bulut
kayıt istersen `steamworks.js` paketiyle Steam API'ye bağlanılır.

Dürüst not: oyun **oynanır ve bitirilebilir** durumda, ama ticari bir Steam sürümü
için genelde şunlar da eklenir — daha fazla bölge ve düşman çeşidi, seslendirme,
oyun içi müzik parçaları, dil desteği, oyun kolu desteği ve bir demo/fragman.
Bunların hepsi bu yapının üstüne eklenebilir; sistemler hazır.

---

## Tek dosyalık sürüm

GitHub'daki linke basınca **kod** görünür, oyun açılmaz — GitHub bir oyun sunucusu değil,
kod deposu. Oynanabilir sürüm için:

- **`dist/otag.html`** — her şeyi (3B motoru, kod, stil, karakter görseli) içinde
  taşıyan tek dosya.
  İndir, çift tıkla, oynanır. Kimseye göndermek istersen sadece bu dosyayı gönder.
- Yeniden üretmek için: `node tools/build-single.mjs`
  (`--fragment` ile gövde-yalnız sürüm üretilir; gömülü oynatıcılar için.)

### GitHub üzerinden oynanabilir link istersen

Depoda **Settings → Pages → Source: Deploy from a branch** seç, dalı `main`, klasörü
`/ (root)` yap. Birkaç dakika sonra oyun şu adreste açılır:
`https://<kullanıcı-adın>.github.io/vizard.ai/otag/`
