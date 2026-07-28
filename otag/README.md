# OTAĞ — Kızıl Sefer

Senin gönderdiğin karakterle (mızraklı, hilal‑yıldız kalkanlı küçük otağ savaşçısı)
yapılmış, **çalışır durumda** bir aksiyon‑macera oyunu.

Unreal Engine yok, Blueprint yok, C++ yok, kurulum yok.
Tek klasör, **çift tıkla açılır**, tarayıcıda çalışır.

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

**Teknik:**
- Ses tamamen tarayıcıda üretiliyor (WebAudio) — tek bir ses dosyası bile yok.
- Zemin dokuları, düşmanlar, ağaçlar, ateşler kodla çiziliyor.
- Tek görsel dosya: senin karakter sayfan (`assets/otag_sheet.png`), 12 poz.
  Arka planı şeffaflaştırıldı ve 4×3 ızgara olarak dilimlendi.
- Pozlar oyuna bağlı: öfke barın dolunca **alev pozu**, canın azalınca **üzgün**,
  blokta **kalkan pozu**, girdapta **dönme pozu**, ölünce **hayalet pozu**,
  12 saniye kıpırdamazsan **uyuma pozu**.

---

## Dosya haritası (bir şeyi değiştirmek istersen)

```
otag/
├─ index.html            arayüz iskeleti (menüler, HUD)
├─ style.css             tüm arayüz görünümü
├─ assets/otag_sheet.png karakter sayfası (4 sütun × 3 satır)
└─ js/
   ├─ core.js       matematik, girdi, ses, parçacıklar, kamera
   ├─ sprites.js    karakter sayfasının dilimlenmesi + çizimi
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
