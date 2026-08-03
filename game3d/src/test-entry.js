/* Test paketinin giriş noktası.
   Oyunun kendisi hiç değişmez; üzerine yalnızca test paneli eklenir.
   Normal paket src/main.js'ten derlendiği için bu dosya ve testpanel.js
   üretim çıktısına HİÇ girmez. */
import './main.js';
import { initTestPanel } from './testpanel.js';

/* main.js modül gövdesi bittiğinde window.__game hazırdır (boot() ilk
   await'ine kadar eşzamanlı ilerler), yani panel burada kurulabilir. */
initTestPanel();
