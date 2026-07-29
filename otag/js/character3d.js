/* ============================================================
   character3d.js : Otağ savaşçısının 3B gövdesi

   Referans levhadaki karakterin koddan üretilmiş hâli:
   ahşap yumurta gövde, kiremitli çatı, hilal-yıldız tepelik,
   yüz penceresi (7 ifade), mızrak, hilalli kalkan, ahşap ayaklar.

   Tasarım ölçüsü: mızrak ucuyla birlikte 112 birim.
   Bütün dokular tuvalde üretilir — dış dosya yok, file:// kısıtı yok.
   ============================================================ */
'use strict';

const CharModel = {
  ready: false, tex: {}, geo: {}, mat: {},

  /* oyunun poz adları → yüz ifadesi (sayfadaki ifade seti) */
  POSE2EXPR: {
    idle: 'neutral', angry: 'angry', happy: 'happy', confused: 'surprised',
    love: 'love', sad: 'sad', surprised: 'surprised', sleep: 'sleepy',
    rage: 'angry', block: 'angry', spin: 'angry', dead: 'dead'
  },
  EXPR: ['neutral', 'happy', 'angry', 'surprised', 'sad', 'love', 'sleepy', 'dead'],

  C: {
    plank: '#a53f2e', plankDark: '#6d2820', plankLight: '#c25340',
    shingle: '#98372a', shingleDark: '#5e2018',
    wood: '#c49763', woodDark: '#8d6438',
    steel: '#9aa0a6', steelDark: '#4a4f55',
    cloth: '#c0392b', bone: '#e8dcc8', pupil: '#2a1a12'
  },

  /* ============================================================
     PAYLAŞILAN DOKU ve GEOMETRİLER
     ============================================================ */
  init() {
    if (this.ready) return;
    const C = this.C;

    this.tex.planks = this.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = C.plankDark; g.fillRect(0, 0, w, h);
      const n = 14, pw = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * pw, k = .82 + (i * 37 % 100) / 100 * .36;
        g.fillStyle = this.shade(C.plank, k);
        g.fillRect(x + 1.5, 0, pw - 3, h);
        /* damar */
        g.strokeStyle = this.shade(C.plankDark, 1.1); g.lineWidth = 1;
        for (let j = 0; j < 5; j++) {
          const gx = x + 4 + (j * 7 + i * 3) % (pw - 8);
          g.beginPath(); g.moveTo(gx, 0);
          for (let y = 0; y < h; y += 26) g.lineTo(gx + Math.sin((y + i * 40) * .06) * 2.5, y);
          g.stroke();
        }
        /* yıpranma */
        g.fillStyle = 'rgba(0,0,0,.16)';
        for (let j = 0; j < 7; j++) g.fillRect(x + 2 + (j * 13 + i * 9) % (pw - 6), (j * 71 + i * 53) % h, 2, 12 + j * 3);
        g.fillStyle = 'rgba(255,220,190,.07)';
        g.fillRect(x + 2, 0, 2.5, h);
      }
      /* yatay kuşaklar */
      g.fillStyle = 'rgba(0,0,0,.32)';
      for (const y of [h * .30, h * .66]) g.fillRect(0, y, w, 7);
      g.fillStyle = 'rgba(176,130,78,.5)';
      for (const y of [h * .30, h * .66]) g.fillRect(0, y + 1, w, 4);
    }, { repeat: [1, 1] });

    this.tex.shingle = this.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = C.shingleDark; g.fillRect(0, 0, w, h);
      const rows = 9, cols = 12, rh = h / rows, cw = w / cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh;
          const k = .8 + ((r * 7 + c * 13) % 10) / 10 * .45;
          g.fillStyle = this.shade(C.shingle, k);
          g.beginPath();
          g.moveTo(x + 1, y + 1);
          g.lineTo(x + cw - 1, y + 1);
          g.lineTo(x + cw - 1, y + rh * .74);
          g.quadraticCurveTo(x + cw / 2, y + rh * 1.02, x + 1, y + rh * .74);
          g.closePath(); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.4; g.stroke();
          g.fillStyle = 'rgba(255,210,180,.10)';
          g.fillRect(x + 2, y + 2, cw - 4, 2.5);
        }
      }
    }, { repeat: [3, 3] });

    this.tex.wood = this.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = C.wood; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(90,60,30,${.10 + (i % 4) * .05})`;
        g.lineWidth = 1 + (i % 3);
        const y = (i * 37) % h;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x < w; x += 24) g.lineTo(x, y + Math.sin(x * .05 + i) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,230,190,.12)'; g.fillRect(0, 0, w, 6);
    }, { repeat: [1, 3] });

    this.tex.shield = this.canvasTex(256, 256, (g, w, h) => {
      const c = w / 2;
      g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, w, h);
      /* kızıl yüz */
      const rg = g.createRadialGradient(c * .8, c * .75, 8, c, c, c);
      rg.addColorStop(0, '#d1493a'); rg.addColorStop(.7, '#b3271f'); rg.addColorStop(1, '#7c1a14');
      g.fillStyle = rg;
      g.beginPath(); g.arc(c, c, c * .84, 0, TAU); g.fill();
      /* ışınsal tahta izleri */
      g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU;
        g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c * .84, c + Math.sin(a) * c * .84); g.stroke();
      }
      /* hilal + yıldız */
      g.fillStyle = '#f2ece0';
      g.beginPath();
      g.arc(c - c * .14, c, c * .46, 0, TAU, false);
      g.arc(c + c * .11, c, c * .385, 0, TAU, true);  // ters sarım → hilal boşluğu
      g.fill();
      g.fillStyle = '#f2ece0';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? c * .085 : c * .2;
        const px = c + c * .36 + Math.cos(a) * r, py = c + Math.sin(a) * r;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    });

    /* yüz ifadeleri: 4x2 atlas, saydam zemin */
    this.tex.faces = this.canvasTex(1024, 256, (g, w, h) => {
      const CW = 256, CH = 128;
      this.EXPR.forEach((name, i) => {
        const cx = (i % 4) * CW, cy = ((i / 4) | 0) * CH;
        g.save(); g.translate(cx, cy);
        this.drawFace(g, name, CW, CH);
        g.restore();
      });
    });

    this.tex.ghost = this.canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = 'rgba(255,90,70,.85)';
      g.beginPath();
      g.arc(w / 2, h * .38, w * .33, Math.PI, 0);
      g.lineTo(w * .83, h * .82);
      for (let i = 0; i < 4; i++) {
        const x0 = w * .83 - i * w * .165;
        g.quadraticCurveTo(x0 - w * .08, h * (i % 2 ? .74 : .94), x0 - w * .165, h * .82);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#2a0a08'; g.lineWidth = 6; g.strokeStyle = '#2a0a08';
      for (const ex of [w * .38, w * .62]) {
        g.beginPath(); g.moveTo(ex - 9, h * .32); g.lineTo(ex + 9, h * .46);
        g.moveTo(ex + 9, h * .32); g.lineTo(ex - 9, h * .46); g.stroke();
      }
    });

    /* --- geometriler --- */
    const G = this.geo;
    G.egg = new THREE.LatheGeometry(this.eggProfile(), 22);
    G.roof = new THREE.LatheGeometry(this.roofProfile(), 18);
    G.cyl = new THREE.CylinderGeometry(1, 1, 1, 12); G.cyl.translate(0, .5, 0);
    G.cylC = new THREE.CylinderGeometry(1, 1, 1, 12);
    G.cone = new THREE.ConeGeometry(1, 1, 10); G.cone.translate(0, .5, 0);
    G.sph = new THREE.SphereGeometry(1, 14, 10);
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.disc = new THREE.CylinderGeometry(1, 1, 1, 32);
    G.plane = new THREE.PlaneGeometry(1, 1);
    G.tip = new THREE.LatheGeometry(this.tipProfile(), 8);
    for (const k in G) G[k].userData.shared = true;

    this.ready = true;
  },

  /* gövde profili: alttan geniş, üste doğru sivrilen ahşap yumurta.
     R(y) örneklenebilsin diye nokta listesi olarak tutulur. */
  EGG: [[0, 0], [12, 1], [18, 3], [23, 7], [26.5, 13], [28, 22], [27.5, 32],
        [25.4, 40], [22, 47], [17, 53], [10, 58], [0, 61]],
  eggProfile() { return this.EGG.map(([r, y]) => new THREE.Vector2(r, y)); },
  /* gövdenin belirli yükseklikteki yarıçapı — parçaları yüzeye oturtmak için */
  eggR(y) {
    const P = this.EGG;
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][1]) {
        const k = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1] || 1);
        return lerp(P[i - 1][0], P[i][0], clamp(k, 0, 1));
      }
    }
    return 0;
  },
  /* çatı: gövdenin tepesine oturan, hafif içbükey sivri kiremitli külah */
  roofProfile() {
    const p = [[26.5, 0], [26, 3], [24, 8], [21, 14], [17.5, 21], [13.5, 28],
               [9.5, 34], [5.5, 40], [2.4, 44], [0, 46.5]];
    return p.map(([x, y]) => new THREE.Vector2(x, y));
  },
  /* mızrak ucu: yaprak biçimi */
  tipProfile() {
    const p = [[0, 0], [1.7, 1.2], [3.1, 4.5], [3.4, 9], [2.6, 14], [1.3, 17.6], [0, 19.4]];
    return p.map(([x, y]) => new THREE.Vector2(x, y));
  },

  /* ---------- yüz ifadeleri ---------- */
  drawFace(g, name, W, H) {
    const C = this.C, ex = [W * .32, W * .68], ey = H * .5;
    const sclera = (x, rx, ry) => {
      g.fillStyle = C.bone;
      g.beginPath(); g.ellipse(x, ey, rx, ry, 0, 0, TAU); g.fill();
    };
    const pupil = (x, dx, dy, r) => {
      g.fillStyle = C.pupil;
      g.beginPath(); g.arc(x + dx, ey + dy, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(x + dx - r * .3, ey + dy - r * .35, r * .28, 0, TAU); g.fill();
    };
    const brow = (x, a, up) => {
      g.strokeStyle = C.pupil; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 26, ey - 34 - up + a * 12);
      g.lineTo(x + 26, ey - 34 - up - a * 12);
      g.stroke();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';

    switch (name) {
      case 'neutral':
        ex.forEach(x => { sclera(x, 30, 33); pupil(x, 0, 2, 13); });
        break;
      case 'happy':
        g.strokeStyle = C.pupil; g.lineWidth = 12;
        ex.forEach(x => { g.beginPath(); g.arc(x, ey + 8, 26, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); });
        g.fillStyle = 'rgba(220,90,70,.35)';
        ex.forEach(x => { g.beginPath(); g.ellipse(x, ey + 34, 20, 10, 0, 0, TAU); g.fill(); });
        break;
      case 'angry':
        ex.forEach((x, i) => { sclera(x, 29, 26); pupil(x, i ? -3 : 3, 3, 13); });
        brow(ex[0], 1, 0); brow(ex[1], -1, 0);
        break;
      case 'surprised':
        ex.forEach(x => { sclera(x, 33, 38); pupil(x, 0, 0, 10); });
        brow(ex[0], .2, 16); brow(ex[1], -.2, 16);
        break;
      case 'sad':
        ex.forEach((x, i) => { sclera(x, 29, 30); pupil(x, 0, 8, 13); });
        brow(ex[0], -.9, 4); brow(ex[1], .9, 4);
        g.fillStyle = '#7cc4e8';
        ex.forEach(x => {
          g.beginPath();
          g.moveTo(x + 20, ey + 12);
          g.quadraticCurveTo(x + 30, ey + 34, x + 20, ey + 42);
          g.quadraticCurveTo(x + 10, ey + 34, x + 20, ey + 12);
          g.fill();
        });
        break;
      case 'love':
        g.fillStyle = '#e0402f';
        ex.forEach(x => {
          g.beginPath();
          g.moveTo(x, ey + 30);
          g.bezierCurveTo(x - 42, ey - 2, x - 20, ey - 34, x, ey - 12);
          g.bezierCurveTo(x + 20, ey - 34, x + 42, ey - 2, x, ey + 30);
          g.fill();
        });
        break;
      case 'sleepy':
        g.strokeStyle = C.pupil; g.lineWidth = 11;
        ex.forEach(x => { g.beginPath(); g.arc(x, ey - 10, 26, Math.PI * .14, Math.PI * .86); g.stroke(); });
        g.fillStyle = '#9fd8ff';
        g.font = 'bold 44px "Trebuchet MS", sans-serif';
        g.fillText('z', W * .80, ey - 6);
        g.font = 'bold 30px "Trebuchet MS", sans-serif';
        g.fillText('z', W * .90, ey - 26);
        break;
      case 'dead':
        g.strokeStyle = C.pupil; g.lineWidth = 12;
        ex.forEach(x => {
          g.beginPath();
          g.moveTo(x - 22, ey - 22); g.lineTo(x + 22, ey + 22);
          g.moveTo(x + 22, ey - 22); g.lineTo(x - 22, ey + 22);
          g.stroke();
        });
        break;
    }
  },

  /* ---------- yardımcılar ---------- */
  canvasTex(w, h, paint, opt = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    paint(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat[0], opt.repeat[1]); }
    t.anisotropy = 4;
    return t;
  },
  shade(hex, k) {
    const c = new THREE.Color(hex).multiplyScalar(k);
    return `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  },
  std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: .82, metalness: .03 }, o)); },

  /* ============================================================
     GÖVDE KURULUMU
     ============================================================ */
  build(opt = {}) {
    this.init();
    const G = this.geo, C = this.C;
    const h = opt.h || 112, S = h / 112;
    const elder = !!opt.elder;
    const tint = elder ? new THREE.Color(.74, .72, .78) : new THREE.Color(1, 1, 1);

    const M = {
      /* renkler 1'in üstünde: karanlık bölgelerde karakter siluete gömülmesin */
      body: this.std({ map: this.tex.planks, color: tint.clone().multiplyScalar(1.28), roughness: .9 }),
      roof: this.std({ map: this.tex.shingle, color: tint.clone().multiplyScalar(1.22), roughness: .88 }),
      wood: this.std({ map: this.tex.wood, color: tint.clone().multiplyScalar(1.2), roughness: .8 }),
      dark: this.std({ color: new THREE.Color('#241611'), roughness: 1 }),
      steel: this.std({ color: new THREE.Color(C.steel), roughness: .35, metalness: .85 }),
      steelD: this.std({ color: new THREE.Color(C.steelDark), roughness: .5, metalness: .7 }),
      cloth: this.std({ color: new THREE.Color(C.cloth), roughness: .95, side: THREE.DoubleSide }),
      shield: this.std({ map: this.tex.shield, color: new THREE.Color(1.2, 1.2, 1.2), roughness: .7 }),
      star: this.std({ color: new THREE.Color('#d8402c'), roughness: .6, emissive: new THREE.Color('#3a0a05') })
    };
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.tex.faces.clone(), transparent: true, roughness: 1,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff), emissiveIntensity: .5
    });
    faceMat.emissiveMap = faceMat.map;
    faceMat.map.needsUpdate = true;
    faceMat.map.userData.perInstance = true;
    faceMat.map.repeat.set(.25, .5);
    faceMat.map.offset.set(0, .5);

    const root = new THREE.Group();
    const body = new THREE.Group();       // eğilme / zıplama burada
    root.add(body);

    const put = (geo, mat, pos, scale, rot, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0] * S, pos[1] * S, pos[2] * S);
      if (scale) m.scale.set(scale[0] * S, scale[1] * S, scale[2] * S);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = shadow; m.receiveShadow = shadow;
      return m;
    };

    /* ---- gövde: ahşap yumurta ---- */
    body.add(put(G.egg, M.body, [0, 0, 0], [1, 1, 1]));

    /* sırt: çapraz destek kirişleri (arka görünüm) */
    for (const tz of [-1, 1]) {
      const bm = put(G.box, M.wood, [0, 30, -this.eggR(30) + 1], [3.4, 46, 3], [0, 0, tz * .38]);
      body.add(bm);
    }

    /* ---- çatı: gövdenin tepesine oturan kiremitli külah ---- */
    const roofG = new THREE.Group();
    roofG.position.y = 38 * S;
    body.add(roofG);
    roofG.add(put(G.roof, M.roof, [0, 0, 0], [1, 1, 1]));
    /* saçak: ince ahşap kuşak */
    roofG.add(put(new THREE.CylinderGeometry(26.8, 28.2, 4, 20), M.wood, [0, 0, 0], [1, 1, 1]));
    /* iki ön eğik kiriş — referanstaki ahşap iskelet */
    for (const sx of [-1, 1]) {
      const bm = put(G.box, M.wood, [sx * 9, 20, 13], [3, 42, 2.8]);
      bm.rotation.set(-.30, 0, sx * .30);
      roofG.add(bm);
    }
    /* tepe: hilal + yıldız */
    const finial = new THREE.Group();
    finial.position.y = 45 * S;
    roofG.add(finial);
    finial.add(put(G.cyl, M.wood, [0, -2, 0], [1.6, 9, 1.6]));
    const cres = put(new THREE.TorusGeometry(6, 1.6, 7, 18, Math.PI * 1.5), M.wood, [0, 13, 0], [1, 1, 1]);
    cres.rotation.z = -.9;
    finial.add(cres);
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2 : 4.6;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      i ? starShape.lineTo(px, py) : starShape.moveTo(px, py);
    }
    starShape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 1.4, bevelEnabled: false });
    finial.add(put(starGeo, M.star, [7, 18.5, 0], [1, 1, 1], [0, 0, .4]));

    /* ---- yüz penceresi: gövde eğrisini izleyen kavisli panel ---- */
    const FY = 25, FR = this.eggR(FY), HALF = .56;
    const faceG = new THREE.Group();
    faceG.position.set(0, FY * S, 0);
    body.add(faceG);
    /* karanlık oyuk */
    faceG.add(put(new THREE.CylinderGeometry(FR - 2.2, FR - 2.2, 19, 14, 1, true, -HALF, HALF * 2),
      M.dark, [0, 0, 0], [1, 1, 1], null, false));
    /* ifade paneli */
    const facePlane = new THREE.Mesh(
      new THREE.CylinderGeometry(FR + .5, FR + .5, 18, 16, 1, true, -HALF, HALF * 2), faceMat);
    facePlane.scale.setScalar(S);
    faceG.add(facePlane);
    /* çerçeve: üst lento, alt eşik, iki yan direk (gövdeye teğet küçük kirişler) */
    const frame = (y, hgt, n, half, wdt) => {
      for (let i = 0; i < n; i++) {
        const ang = -half + i * (half * 2 / (n - 1));
        const r = FR + .6;
        faceG.add(put(G.box, M.wood, [Math.sin(ang) * r, y, Math.cos(ang) * r],
          [wdt, hgt, 3.4], [0, ang, 0]));
      }
    };
    frame(10.4, 4, 6, HALF, 6.8);
    frame(-10.4, 4, 6, HALF, 6.8);
    for (const sx of [-1, 1]) {
      const ang = sx * HALF, r = FR + .6;
      faceG.add(put(G.box, M.wood, [Math.sin(ang) * r, 0, Math.cos(ang) * r],
        [3.6, 23, 3.4], [0, ang, 0]));
    }

    /* ---- ayaklar ---- */
    const feet = [];
    for (const sx of [-1, 1]) {
      const f = new THREE.Group();
      f.position.set(sx * 11.5 * S, 0, 13 * S);
      body.add(f);
      f.add(put(G.sph, M.wood, [0, 4.5, 0], [9, 5.2, 11.5]));
      for (let i = -1; i <= 1; i++) f.add(put(G.sph, M.wood, [i * 4.4, 3.6, 8.5], [2.6, 2.3, 3.4]));
      feet.push(f);
    }

    /* ---- kollar: kısa güdükler, eller gövdeye yakın ---- */
    const mkArm = sx => {
      const g2 = new THREE.Group();
      g2.position.set(sx * this.eggR(28) * .8 * S, 28 * S, 8 * S);
      body.add(g2);
      g2.add(put(G.cyl, M.wood, [0, 0, 0], [3, 11, 3], [0, 0, sx * -1.25]));
      const hand = put(G.sph, M.wood, [sx * 10, -1, 3], [4.6, 4.6, 4.6]);
      g2.add(hand);
      return { g: g2, hand };
    };
    const armL = mkArm(-1), armR = mkArm(1);

    /* ---- kalkan (sol kol) ---- */
    const shieldG = new THREE.Group();
    shieldG.position.set(-7 * S, -4 * S, 15 * S);
    armL.g.add(shieldG);
    shieldG.rotation.set(Math.PI / 2, 0, 0);
    shieldG.add(put(G.disc, M.shield, [0, 0, 0], [18.5, 2.4, 18.5]));
    shieldG.add(put(new THREE.TorusGeometry(18.5, 1.8, 7, 28), M.steelD, [0, 1, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 12; i++) {
      const ang = i / 12 * TAU;
      shieldG.add(put(G.sph, M.steel, [Math.cos(ang) * 17, 1.5, Math.sin(ang) * 17], [1.2, 1.2, 1.2], null, false));
    }
    shieldG.add(put(G.disc, M.steel, [0, 1.4, 0], [3.2, 1.4, 3.2]));

    /* ---- mızrak (sağ kol) ---- */
    const spearG = new THREE.Group();
    spearG.position.set(11 * S, -26 * S, 4 * S);
    armR.g.add(spearG);
    spearG.add(put(G.cyl, M.wood, [0, 0, 0], [1.9, 92, 1.9]));
    spearG.add(put(G.cyl, M.steelD, [0, 90, 0], [2.5, 4, 2.5]));
    spearG.add(put(G.tip, M.steel, [0, 93, 0], [1.4, 1, 1.4]));
    /* kızıl sargı + püskül */
    spearG.add(put(new THREE.TorusGeometry(2.3, 1.2, 6, 12), M.cloth, [0, 60, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
    const ribbon = new THREE.Group();
    ribbon.position.set(0, 60 * S, 0);
    spearG.add(ribbon);
    for (let i = 0; i < 3; i++)
      ribbon.add(put(G.plane, M.cloth, [0, -10 - i * 2, 2.2 + i * .7], [7, 22, 1], [0, i * .55, 0], false));

    /* ---- gölge lekesi ---- */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 26),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .42, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(27 * S);
    shadow.position.y = 1.2;
    root.add(shadow);

    /* ölünce yükselen küçük hayalet (referans levhadaki gibi) */
    const ghost = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.ghost, transparent: true, depthWrite: false, opacity: 0
    }));
    ghost.scale.set(30 * S, 38 * S, 1);
    ghost.visible = false;
    root.add(ghost);

    const inst = {
      root, body, roofG, faceG, facePlane, faceMat, armL, armR, shieldG, spearG,
      ribbon, feet, shadow, ghost, S, mats: M,
      expr: null, walkT: 0, blink: 0, blinkT: rnd(4, 1),
      a: { tilt: 0, pitch: 0, spin: 0, armR: 0, armL: 0, shield: 0, lift: 0, squashY: 1, roofT: 0 },
      setExpr: name => this.setExpr(inst, name),
      update: (dt, s) => this.update(inst, dt, s),
      dispose: () => this.dispose(inst)
    };
    this.setExpr(inst, 'neutral');
    return inst;
  },

  setExpr(inst, name) {
    if (inst.expr === name) return;
    const i = Math.max(0, this.EXPR.indexOf(name));
    inst.expr = name;
    inst.faceMat.map.offset.set((i % 4) * .25, i < 4 ? .5 : 0);
  },

  /* ============================================================
     ANİMASYON
     ============================================================ */
  update(inst, dt, s) {
    const a = inst.a, S = inst.S;
    const st = s.state || 'idle', t = s.t || 0;
    const dead = !!s.dead;

    /* ---- yüz ---- */
    let expr = this.POSE2EXPR[s.pose] || 'neutral';
    if (dead) expr = 'dead';
    /* göz kırpma: nötr durumda arada bir */
    inst.blinkT -= dt;
    if (inst.blinkT <= 0) { inst.blinkT = rnd(5.5, 2.2); inst.blink = .12; }
    inst.blink = Math.max(0, inst.blink - dt);
    if (inst.blink > 0 && (expr === 'neutral' || expr === 'happy')) expr = 'sleepy';
    this.setExpr(inst, expr);

    /* ---- hedef duruşlar ---- */
    let tilt = 0, pitch = 0, lift = 0, squashY = 1;
    let aR = 0, aL = 0, shield = 0, spin = a.spin;
    let stepL = 0, stepR = 0;

    if (dead) {
      /* devril: yana yat, hafif göm */
      pitch = -1.35;
      lift = -6 - Math.min(10, (s.deadT || 0) * 6);
      tilt = .55;
      aR = -.6; aL = .4;
    } else switch (st) {
      case 'run': {
        inst.walkT += dt * 13;
        const w = inst.walkT;
        lift = Math.abs(Math.sin(w)) * 5.5;
        tilt = Math.sin(w) * .13;
        pitch = .16;
        squashY = 1 - Math.abs(Math.sin(w * 2)) * .05;
        stepL = Math.sin(w) * 7; stepR = -Math.sin(w) * 7;
        aR = Math.sin(w) * .3 - .1; aL = -Math.sin(w) * .25;
        break;
      }
      case 'idle': {
        inst.walkT += dt * 2.2;
        lift = Math.sin(inst.walkT) * 1.4;
        squashY = 1 + Math.sin(inst.walkT) * .022;
        tilt = Math.sin(inst.walkT * .6) * .03;
        aR = Math.sin(inst.walkT * .8) * .05;
        break;
      }
      case 'attack': {
        /* hazırlık → savurma: gövde geri yaslanır, sonra mızrak ileri fırlar */
        const heavy = s.combo === 3;
        const wind = heavy ? .16 : .09, dur = heavy ? .34 : .26;
        const k = clamp(t / dur, 0, 1);
        if (t < wind) {
          const q = t / wind;
          pitch = -.3 * q; aR = -1.5 * q; tilt = .18 * q;
        } else {
          const q = clamp((t - wind) / (dur - wind), 0, 1);
          const punch = Math.sin(q * Math.PI);
          pitch = -.3 + punch * (heavy ? 1.15 : .85);
          aR = -1.5 + punch * (heavy ? 3.4 : 2.7);
          tilt = .18 - punch * .3;
          lift = punch * (heavy ? 5 : 2);
          squashY = 1 + punch * .07;
        }
        aL = -.25;
        break;
      }
      case 'block': {
        pitch = .28; lift = -3; squashY = .94;
        shield = 1; aL = -.35; aR = .45;
        if (s.parrying) { lift = 1; squashY = 1.04; }
        break;
      }
      case 'dash': {
        pitch = .55; lift = 4; squashY = .9;
        aR = -.7; aL = -.5;
        stepL = stepR = -6;
        break;
      }
      case 'spin': {
        spin += dt * 22;
        pitch = .1; lift = 5 + Math.sin(t * 22) * 2;
        aR = -1.45; aL = -1.35;      // kollar açık, mızrak yatay
        break;
      }
      case 'hurt': {
        pitch = -.5; tilt = -.3; lift = 1;
        aR = -.3; aL = .3;
        break;
      }
    }

    /* ---- yumuşat ve uygula ---- */
    const rate = st === 'attack' || st === 'spin' || dead ? 26 : 12;
    a.tilt = damp(a.tilt, tilt, rate, dt);
    a.pitch = damp(a.pitch, pitch, rate, dt);
    a.lift = damp(a.lift, lift, rate, dt);
    a.squashY = damp(a.squashY, squashY, rate, dt);
    a.armR = damp(a.armR, aR, rate, dt);
    a.armL = damp(a.armL, aL, rate, dt);
    a.shield = damp(a.shield, shield, 14, dt);
    a.spin = st === 'spin' ? spin : damp(a.spin, 0, 10, dt);

    const sq = s.squash || { x: 1, y: 1 };
    inst.body.position.y = a.lift * S;
    inst.body.rotation.set(a.pitch * .55, a.spin, a.tilt);
    inst.body.scale.set(sq.x, a.squashY * sq.y, sq.x);

    /* çatı ve tepelik gövdeden bir tık gecikmeli sallansın */
    a.roofT = damp(a.roofT, a.tilt, 7, dt);
    inst.roofG.rotation.z = (a.tilt - a.roofT) * 1.6;
    inst.roofG.rotation.x = (a.pitch - a.roofT * .3) * .18;

    inst.armR.g.rotation.x = a.armR;
    inst.armL.g.rotation.x = a.armL * (1 - a.shield);
    /* kalkan daima öne bakar; blokta gövdenin önüne kayar ve dikleşir */
    inst.shieldG.rotation.set(Math.PI / 2, 0, -.34 * (1 - a.shield));
    inst.shieldG.position.set(
      lerp(-7, 2, a.shield) * S,
      lerp(-4, 0, a.shield) * S,
      lerp(15, 27, a.shield) * S);

    inst.feet[0].position.z = (8 + stepL) * S;
    inst.feet[1].position.z = (8 + stepR) * S;
    inst.feet[0].position.y = Math.max(0, stepL) * .35 * S;
    inst.feet[1].position.y = Math.max(0, stepR) * .35 * S;

    /* püskül savrulması */
    inst.ribbon.rotation.x = Math.sin(inst.walkT * 2.2) * .25 - a.armR * .3;

    /* hasar parlaması: gövde kızarır */
    const fl = clamp(s.hurtFlash || 0, 0, 1);
    inst.mats.body.emissive.setRGB(fl * .22, fl * .05, fl * .03);
    inst.mats.roof.emissive.setRGB(fl * .2, fl * .04, fl * .03);

    /* dokunulmazlık yanıp sönmesi */
    const alpha = (s.iframe > 0 && st !== 'dash' && !dead) ? (Math.sin(t * 40) > 0 ? .45 : 1) : 1;
    if (inst._alpha !== alpha) {
      inst._alpha = alpha;
      for (const k in inst.mats) {
        const m = inst.mats[k];
        const tr = alpha < .999;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = alpha;
      }
    }

    /* gölge */
    inst.shadow.material.opacity = .42 * (dead ? Math.max(0, 1 - (s.deadT || 0) / 1.5) : 1);
    inst.shadow.scale.setScalar((27 + a.lift * .25) * S);

    /* ölünce yükselen hayalet */
    if (dead) {
      const d = s.deadT || 0;
      inst.ghost.visible = d > .35;
      inst.ghost.position.set(0, (44 + d * 34) * S, 0);
      inst.ghost.material.opacity = clamp((d - .35) * 1.6, 0, 1) * clamp(2.4 - d * .7, 0, .8);
    } else if (inst.ghost.visible) {
      inst.ghost.visible = false;
    }
  },

  dispose(inst) {
    inst.root.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m.map && m.map.userData.perInstance) m.map.dispose();
        m.dispose();
      }
    });
  }
};
