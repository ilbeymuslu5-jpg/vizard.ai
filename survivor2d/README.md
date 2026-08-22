# Survivor 2D — Prototip

Bağımsız, mobil öncelikli, portre modunda Survivor.io tarzı bir bullet-heaven
prototipi. HTML5 Canvas (2D, WebGL yok) + vanilya JS ES modülleri + build
zamanında derlenmiş Tailwind CSS.

## Çalıştırma

ES modülleri (`import`/`export`) tarayıcı güvenlik politikası gereği
**`file://` üzerinden çalışmaz** — CORS hatası verir. Herhangi bir statik
sunucuyla servis etmek gerekir:

    cd survivor2d
    python3 -m http.server 8080
    # tarayıcıda http://localhost:8080 aç

veya `npx serve`, VS Code'un Live Server eklentisi vb. herhangi biri işe yarar.

## Dosyalar

- `index.html` — 1080×1920 portre çerçeve (geniş ekranlarda ortalanır/mektup-
  kutusu), canvas + DOM UI kökleri
- `src/main.js` — giriş noktası: modülleri birbirine bağlar, canvas boyutlandırma
- `src/core/GameLoop.js` — kahraman durumu, oto-saldırı/mermi, düşman dalga
  spawn'ı, XP orbu toplama, çarpışma, render (2D Canvas)
- `src/ui/HUD.js` — üst XP/can barı, seviye/süre/öldürme/altın, dokunulan
  her yerde beliren dinamik joystick
- `src/ui/InventoryModal.js` — Miğfer/Göğüslük/Bot/Silah/Yüzük ızgarası +
  hesaplanmış ATK/DEF/HP/SPD paneli
- `src/ui/LevelUpModal.js` — 3 kartlı rogue-lite yükseltme seçimi, nadirlik
  renkleriyle (Common/Rare/Epic/Legendary)
- `src/data/equipment.js` — `EQUIPMENT_DATABASE` (5 yuva × 4 eşya)
- `src/data/upgrades.js` — koşuya özel geçici yükseltme havuzu

## Tailwind: neden CDN değil de yerel build?

`https://cdn.tailwindcss.com` script'i **çalışma anında** DOM'u tarayıp
stil üretir; bu hem üretim için resmi olarak önerilmez hem de ağı kısıtlı/
kapalı ortamlarda (örn. bu prototipin geliştirildiği sandbox) tamamen
sessizce bozulur — hiçbir CSS uygulanmaz, `position:absolute`/`z-index`
gibi temel şeyler bile çalışmaz. Bunun yerine `dist/style.css` **build
zamanında** üretilip `index.html`'e `<link>` ile bağlanıyor: sıfır ağ
bağımlılığı, tamamen "standalone".

Yeni bir Tailwind sınıfı eklersen (index.html veya src/**/*.js içinde),
yeniden üretmek için:

    npm install        # ilk seferde (sadece devDependency: tailwindcss)
    npx tailwindcss -i src/tailwind-input.css -o dist/style.css --minify

## Eşya görselleri

`equipment.js`'teki her eşyanın bir `sprite` alanı var (gerçek görsel
varlıklar geldiğinde kullanılacak dosya adı) ama şu an mevcut değiller;
UI bunun yerine `icon` alanındaki emoji ile render ediyor.
