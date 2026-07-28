# OTAĞ — Son Muhafız

**Oyun Tasarım Dokümanı (GDD) v0.1**

---

## 1. Künye

| Alan | Değer |
|---|---|
| Çalışma adı | OTAĞ: Son Muhafız |
| Motor | Unreal Engine 5.6 |
| Platform | Steam / Windows 64-bit |
| Tür | 3D Third Person Action Adventure |
| Grafik stili | Stylized Realistic (stilize gerçekçi) |
| Ekip | Solo geliştirici |
| Demo süresi | 30–60 dakika |
| Hedef | Ticari Steam çıkışı |
| Kodlama | %100 Blueprint (C++ yok) |

---

## 2. Ana Karakter

Referans görselden türetilmiştir.

- **İsim:** Otağ
- **Kimlik:** Yaşayan bir çadır-ev. Ahşap gövde, kırmızı kiremit çatı, çatı tepesinde ay-yıldız.
- **Silah:** Sağ elde mızrak (Mızrak = temel saldırı).
- **Kalkan:** Sol kolda ay-yıldızlı yuvarlak kalkan (Blok / Parry).
- **Boyut:** Yaklaşık 1.2 m — bodur, ağır, sevimli ama sağlam.
- **Yürüyüş:** İki kısa ahşap ayak, hafif zıplayarak/sallanarak yürür.
- **Duygu durumları (görselden):** normal, öfkeli, mutlu, şaşkın, aşık, üzgün, korkmuş, uykulu, alevli (güçlenmiş), kalkan kalkanı aktif, dönen saldırı, ölü.

### Karakterin duyguları → oyun içi kullanım

| Duygu | Nerede kullanılır |
|---|---|
| Normal | Idle animasyonu |
| Öfkeli | Savaşa girince / düşman görünce |
| Alevli (kırmızı enerji) | Rage / Güç yükseltmesi |
| Kalkan (kırmızı hex bariyer) | Blok yeteneği VFX |
| Dönen saldırı (kırmızı yay) | Spin Attack — özel yetenek |
| Uykulu | Menü ekranı / checkpoint'te dinlenme |
| Ölü (xx gözler) | Death animasyonu / Game Over ekranı |
| Şaşkın (?) | Quest güncellendi bildirimi |
| Mutlu | Quest tamamlandı |

---

## 3. Oynanış Döngüsü (Core Loop)

```
Keşfet  →  Düşmanla karşılaş  →  Savaş (Mızrak + Kalkan)
   ↑                                      ↓
Yeni bölge açılır  ←  Görev tamamla  ←  Ödül / Eşya topla
```

---

## 4. Demo İçeriği (30–60 dk)

1. **Prolog — Uyanış (5 dk):** Otağ uykudan uyanır, hareket + kamera öğretilir.
2. **Bölge 1 — Yanık Ova (15 dk):** İlk düşmanlar, saldırı ve blok öğretilir.
3. **Bölge 2 — Taş Geçit (15 dk):** Enemy spawner dalgaları, envanter, iksir.
4. **Bölge 3 — Kadim Kapı (10 dk):** Görev zinciri, anahtar toplama.
5. **Boss — Gölge Otağ (10 dk):** 3 fazlı boss savaşı.
6. **Kapanış:** "Demo Bitti / Wishlist" ekranı.

---

## 5. Yapılacak Sistemler (Milestone Listesi)

| # | Milestone | Durum |
|---|---|---|
| M0 | Unreal 5.6 kurulumu + proje oluşturma | ⬜ |
| M1 | Klasör yapısı + isimlendirme kuralları | ⬜ |
| M2 | Enhanced Input + Input Mapping | ⬜ |
| M3 | Third Person karakter + kamera | ⬜ |
| M4 | Karakter modeli/animasyon (Fab ücretsiz asset) | ⬜ |
| M5 | Health System (can) | ⬜ |
| M6 | Damage System (hasar) | ⬜ |
| M7 | Combat — Mızrak saldırı comboları | ⬜ |
| M8 | Combat — Kalkan blok / parry | ⬜ |
| M9 | Enemy AI (Behavior Tree) | ⬜ |
| M10 | Enemy Spawner (dalga sistemi) | ⬜ |
| M11 | Inventory (envanter) | ⬜ |
| M12 | Quest System (görev) | ⬜ |
| M13 | Save / Load System | ⬜ |
| M14 | Main Menu | ⬜ |
| M15 | Pause Menu | ⬜ |
| M16 | Settings (grafik/ses/kontrol) | ⬜ |
| M17 | Level Design — 3 bölge | ⬜ |
| M18 | Boss Fight — Gölge Otağ | ⬜ |
| M19 | Ses + Müzik | ⬜ |
| M20 | Optimizasyon + Packaging | ⬜ |
| M21 | Steamworks entegrasyonu | ⬜ |
| M22 | Steam store sayfası + build yükleme | ⬜ |

---

## 6. İsimlendirme Kuralı (Naming Convention)

Unreal endüstri standardı (Allar Naming Convention):

| Varlık | Ön ek | Örnek |
|---|---|---|
| Blueprint Class | `BP_` | `BP_OtagCharacter` |
| Blueprint Interface | `BPI_` | `BPI_Damageable` |
| Widget Blueprint | `WBP_` | `WBP_HealthBar` |
| Struct | `S_` | `S_ItemData` |
| Enum | `E_` | `E_ItemType` |
| Data Table | `DT_` | `DT_Items` |
| Animation Blueprint | `ABP_` | `ABP_Otag` |
| Animation Montage | `AM_` | `AM_SpearAttack01` |
| Animation Sequence | `A_` | `A_Idle` |
| Skeletal Mesh | `SK_` | `SK_Otag` |
| Static Mesh | `SM_` | `SM_Rock01` |
| Material | `M_` | `M_Wood` |
| Material Instance | `MI_` | `MI_Wood_Red` |
| Texture | `T_` | `T_Wood_D` |
| Niagara System | `NS_` | `NS_SpearTrail` |
| Sound Cue | `SC_` | `SC_Hit` |
| Level | `L_` | `L_Bolge01` |
| Input Action | `IA_` | `IA_Attack` |
| Input Mapping Context | `IMC_` | `IMC_Default` |

**Kural:** Türkçe karakter (ç, ğ, ı, ö, ş, ü) ve boşluk **asla** kullanılmaz.

---

## 7. Klasör Yapısı

```
Content/
└── Otag/
    ├── Core/            (GameMode, GameInstance, PlayerController)
    ├── Characters/
    │   ├── Player/
    │   └── Enemies/
    ├── Input/           (IA_ ve IMC_ dosyaları)
    ├── Combat/          (hasar, montaj, hitbox)
    ├── AI/              (Behavior Tree, Blackboard, AIController)
    ├── Items/           (envanter eşyaları, DataTable)
    ├── Quests/
    ├── SaveSystem/
    ├── UI/
    │   ├── HUD/
    │   ├── Menus/
    │   └── Common/
    ├── Levels/
    ├── Art/
    │   ├── Materials/
    │   ├── Textures/
    │   ├── Meshes/
    │   └── VFX/
    ├── Audio/
    │   ├── Music/
    │   └── SFX/
    └── Blueprints/      (yardımcı / genel BP'ler)
```

**Kural:** Motorun `Content` kökü asla kirletilmez, her şey `Content/Otag/` altındadır.

---

## 8. Kontroller (Klavye + Gamepad)

| Aksiyon | Klavye | Gamepad |
|---|---|---|
| Hareket | W A S D | Sol analog |
| Kamera | Fare | Sağ analog |
| Zıpla | Space | A |
| Saldır (mızrak) | Sol tık | X |
| Blok (kalkan) | Sağ tık (basılı) | LB |
| Kaçış / Dodge | Shift | B |
| Etkileşim | E | Y |
| Envanter | I | Menu |
| Duraklat | Esc | Start |

---

## 9. Teknik Kararlar

- **Lumen:** Açık (stilize gerçekçi görünüm için).
- **Nanite:** Static mesh'lerde açık, karakterde kapalı.
- **World Partition:** Demo küçük olduğu için **kapalı** (basitlik).
- **Motion Matching:** Kullanılmayacak (karmaşık). Klasik State Machine.
- **Networking:** Yok. Tek oyunculu.
- **Hedef FPS:** 60 FPS @ 1080p, orta seviye GPU.
