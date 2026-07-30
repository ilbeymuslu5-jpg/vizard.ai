/* ============================================================
   render3d.js : oyunun 3B çizim katmanı (three.js)

   Oyun mantığı 2B kalır. Zemin düzlemi (x, y) → 3B'de (x, 0, y).
   Yani oyunun "y" ekseni 3B'de derinliktir (z), yükseklik ayrı eksendir.
   WebGL yoksa R3D.ok=false kalır ve main.js eski 2B çizime döner.
   ============================================================ */
'use strict';

const R3D = {
  ok: false,
  renderer: null, scene: null, camera: null,
  zoneGroup: null, actorGroup: null, fxGroup: null,
  sun: null, hemi: null, amb: null, sky: null,
  W: 1, H: 1, dpr: 1,

  /* kamera */
  camYaw: 0, yawT: 0, pitch: .56, dist: 520, distT: 520,
  camPos: null, camAim: null,

  /* havuzlar */
  actors: new Map(),     // oyun nesnesi -> 3B temsili
  fires: [],             // bölgedeki ateşler
  rings: [], slashes: [],

  time: 0,

  /* ============================================================
     KURULUM
     ============================================================ */
  init(canvas) {
    if (typeof THREE === 'undefined') return false;
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('WebGL başlatılamadı, 2B çizime dönülüyor:', e);
      return false;
    }
    this.renderer = r;
    r.setClearColor(0x07060a, 1);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.22;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 4, 9000);
    this.camPos = new THREE.Vector3();
    this.camAim = new THREE.Vector3();

    /* ışıklar */
    this.hemi = new THREE.HemisphereLight(0x6a5a70, 0x241a18, .8);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, .3);
    this.scene.add(this.amb);

    const sun = new THREE.DirectionalLight(0xffd9b0, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 2600;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 4;
    const sc = sun.shadow.camera;
    sc.left = -1150; sc.right = 1150; sc.top = 1150; sc.bottom = -1150;
    sc.updateProjectionMatrix();
    this.scene.add(sun, sun.target);
    this.sun = sun;

    /* gökyüzü kubbesi */
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 24, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(this.sky);

    this.zoneGroup = new THREE.Group();
    this.actorGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.scene.add(this.zoneGroup, this.actorGroup, this.fxGroup);

    this.buildShared();
    this.initFxLayers();
    this.bindCamControls(canvas);

    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    this.ok = true;
    return true;
  },

  /* --------- paylaşılan geometri ve dokular --------- */
  buildShared() {
    const G = {};
    G.box = new THREE.BoxGeometry(1, 1, 1); G.box.translate(0, .5, 0);
    G.cyl = new THREE.CylinderGeometry(1, 1, 1, 10); G.cyl.translate(0, .5, 0);
    G.cone6 = new THREE.ConeGeometry(1, 1, 6); G.cone6.translate(0, .5, 0);
    G.cone7 = new THREE.ConeGeometry(1, 1, 7); G.cone7.translate(0, .5, 0);
    G.cone4 = new THREE.ConeGeometry(1, 1, 4); G.cone4.translate(0, .5, 0);
    G.ico0 = new THREE.IcosahedronGeometry(1, 0);
    G.ico1 = new THREE.IcosahedronGeometry(1, 1);
    G.sph = new THREE.SphereGeometry(1, 10, 8);
    G.oct = new THREE.OctahedronGeometry(1, 0);
    G.plane = new THREE.PlaneGeometry(1, 1);
    G.disc = new THREE.CircleGeometry(1, 40); G.disc.rotateX(-Math.PI / 2);
    G.ring = new THREE.RingGeometry(.86, 1, 56); G.ring.rotateX(-Math.PI / 2);
    G.tap = new THREE.CylinderGeometry(1, .55, 1, 10); G.tap.translate(0, .5, 0);
    /* paylaşılan geometriler bölge temizliğinde atılmamalı */
    for (const k in G) G[k].userData.shared = true;
    this.G = G;

    /* yumuşak gölge lekesi */
    this.blobTex = this.makeTex(64, 64, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(0,0,0,.85)');
      rg.addColorStop(.55, 'rgba(0,0,0,.45)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    /* parçacık noktası */
    this.dotTex = this.makeTex(48, 48, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(.35, 'rgba(255,255,255,.7)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    /* alev damlası */
    this.flameTex = this.makeTex(96, 160, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h * .72, 2, w / 2, h * .62, w * .62);
      rg.addColorStop(0, 'rgba(255,255,235,1)');
      rg.addColorStop(.22, 'rgba(255,214,130,.95)');
      rg.addColorStop(.5, 'rgba(255,120,40,.55)');
      rg.addColorStop(1, 'rgba(180,40,10,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(w / 2, 4);
      g.bezierCurveTo(w * .95, h * .48, w * .88, h * .95, w / 2, h - 3);
      g.bezierCurveTo(w * .12, h * .95, w * .05, h * .48, w / 2, 4);
      g.fill();
    });
    /* hale */
    this.glowTex = this.makeTex(128, 128, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(255,255,255,.95)');
      rg.addColorStop(.3, 'rgba(255,255,255,.35)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    /* sancak bezi */
    this.bannerTex = this.makeTex(128, 96, (g, w, h) => {
      g.fillStyle = '#8d2320'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a1c1a';
      for (let i = 0; i < 6; i++) g.fillRect(0, i * 18 + 8, w, 3);
      g.fillStyle = '#e8dcc8';
      g.beginPath(); g.arc(w * .52, h * .5, 26, .7, 5.6); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(w * .60, h * .5, 21, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#e8dcc8';
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5, r0 = i % 2 ? 5 : 11;
        const px = w * .74 + Math.cos(a) * r0, py = h * .5 + Math.sin(a) * r0;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    });

    this.blobMat = new THREE.MeshBasicMaterial({
      map: this.blobTex, transparent: true, depthWrite: false, opacity: .5, color: 0x000000
    });
  },

  makeTex(w, h, paint) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    paint(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  /* --------- kamera denetimi: tekerlek yakınlaştırır, orta tuş döndürür --------- */
  bindCamControls(canvas) {
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.distT = clamp(this.distT + Math.sign(e.deltaY) * 70, 420, 1500);
    }, { passive: false });

    let drag = false, lx = 0;
    canvas.addEventListener('mousedown', e => { if (e.button === 1) { drag = true; lx = e.clientX; e.preventDefault(); } });
    addEventListener('mouseup', e => { if (e.button === 1) drag = false; });
    addEventListener('mousemove', e => {
      if (!drag) return;
      this.yawT -= (e.clientX - lx) * .006;
      lx = e.clientX;
    });
    addEventListener('keydown', e => {
      if (e.key === 'q' || e.key === 'e') return;          // oyun tuşları
      if (e.key === '[') this.yawT += .18;
      if (e.key === ']') this.yawT -= .18;
    });
  },

  resize(w, h, dpr) {
    if (!this.ok) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  /* ============================================================
     BÖLGE KURULUMU  (World.load sonunda çağrılır)
     ============================================================ */
  buildZone() {
    if (!this.ok || !World.z) return;
    const z = World.z, pal = z.pal;
    this.clearGroup(this.zoneGroup);
    this.fires.length = 0;
    this.propObj = new Map();

    const rng = mulberry32(World.id.split('').reduce((a, c) => a + c.charCodeAt(0) * 131, 11));
    const base = new THREE.Color(pal.base), base2 = new THREE.Color(pal.base2);

    /* ---- atmosfer ---- */
    const fogCol = base2.clone().lerp(base, .25);
    this.scene.fog = new THREE.Fog(fogCol, 560, 2700);
    this.renderer.setClearColor(fogCol, 1);
    this.sky.material.map = this.makeSky(pal);
    this.sky.material.needsUpdate = true;

    const night = World.id === 'arena' ? 1 : World.id === 'pass' ? .75 : World.id === 'forest' ? .5 : .3;
    this.hemi.color.set(World.id === 'forest' ? 0x5c6a55 : 0x6a5a70);
    this.hemi.groundColor.copy(base2);
    this.hemi.intensity = .95 - night * .3;
    this.sun.color.set(World.id === 'arena' ? 0xff8a5a : World.id === 'pass' ? 0xffa070 : 0xffd9b0);
    this.sun.intensity = 2.35 - night * 1.1;

    /* ---- zemin ---- */
    const gTex = new THREE.CanvasTexture(World.getGround(World.id));
    gTex.colorSpace = THREE.SRGBColorSpace;
    gTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const segX = Math.max(24, Math.round(z.w / 60)), segY = Math.max(24, Math.round(z.h / 60));
    const gGeo = new THREE.PlaneGeometry(z.w, z.h, segX, segY);
    gGeo.rotateX(-Math.PI / 2);
    /* hafif kabartı: zemin tam düz olmasın */
    const pos = gGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), zz = pos.getZ(i);
      const n = Math.sin(x * .0071 + 1.3) * Math.cos(zz * .0063) + Math.sin((x + zz) * .0032 + 2.1) * .6;
      pos.setY(i, -3.2 + n * 3.2);
    }
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({
      map: gTex, roughness: 1, metalness: 0, color: new THREE.Color(1.32, 1.28, 1.24)
    }));
    ground.position.set(z.w / 2, 0, z.h / 2);
    ground.receiveShadow = true;
    this.zoneGroup.add(ground);

    /* bölge dışı arazi: aynı doku, koyultulmuş ve tekrarlı — duvarın
       ötesi boşluk gibi değil, devam eden arazi gibi görünsün */
    const sTex = gTex.clone();
    sTex.needsUpdate = true;
    sTex.wrapS = sTex.wrapT = THREE.RepeatWrapping;
    sTex.repeat.set((z.w + 6000) / z.w, (z.h + 6000) / z.h);
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(z.w + 6000, z.h + 6000),
      new THREE.MeshStandardMaterial({ map: sTex, color: new THREE.Color(.5, .48, .46), roughness: 1 })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(z.w / 2, -16, z.h / 2);
    this.zoneGroup.add(skirt);

    /* ---- engeller ---- */
    for (const s of World.solids) this.buildSolid(s, pal, rng);

    /* ---- nesneler ---- */
    for (const p of World.props) this.buildProp(p, pal, rng);

    /* ---- zemin döküntüsü ve ufuk ---- */
    this.scatterDetail(z, pal, rng);
    this.buildHorizon(z, pal, rng);

    this.frameCam(true);
  },

  /* küçük taşlar ve kuru otlar — zemin boş görünmesin (tek çizim çağrısı) */
  scatterDetail(z, pal, rng) {
    const n = clamp(Math.round(z.w * z.h / 7000), 60, 320);
    const rockMat = this.mat(new THREE.Color(pal.detail).multiplyScalar(.5));
    const grassMat = this.mat(new THREE.Color(pal.detail).multiplyScalar(.85), { roughness: 1 });
    const rocks = new THREE.InstancedMesh(this.G.ico0, rockMat, n);
    const grass = new THREE.InstancedMesh(this.G.cone4, grassMat, n);
    rocks.castShadow = true; rocks.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    let ri = 0, gi = 0;
    for (let i = 0; i < n * 2 && (ri < n || gi < n); i++) {
      const x = 70 + rng() * (z.w - 140), y = 70 + rng() * (z.h - 140);
      if (World.blockedAt(x, y, 26)) continue;
      const isRock = rng() < .45;
      if (isRock && ri < n) {
        const r0 = 5 + rng() * 13;
        e.set(rng() * 3, rng() * 6, rng() * 3); q.setFromEuler(e);
        v.set(x, r0 * .35, y); sc.set(r0, r0 * .7, r0 * .9);
        rocks.setMatrixAt(ri++, m4.compose(v, q, sc));
      } else if (gi < n) {
        const h = 12 + rng() * 22;
        e.set((rng() - .5) * .5, rng() * 6, (rng() - .5) * .5); q.setFromEuler(e);
        v.set(x, 0, y); sc.set(2.4 + rng() * 2, h, 2.4 + rng() * 2);
        grass.setMatrixAt(gi++, m4.compose(v, q, sc));
      }
    }
    rocks.count = ri; grass.count = gi;
    rocks.instanceMatrix.needsUpdate = true; grass.instanceMatrix.needsUpdate = true;
    if (ri) this.zoneGroup.add(rocks); else rocks.dispose();
    if (gi) this.zoneGroup.add(grass); else grass.dispose();
  },

  /* bölgenin ötesinde silüet dağlar / ağaç hattı — ufuk boş kalmasın */
  buildHorizon(z, pal, rng) {
    const cx = z.w / 2, cz = z.h / 2;
    const R0 = Math.max(z.w, z.h) * 1.15, N = 86;
    const forest = World.id === 'forest';
    const col = new THREE.Color(pal.base2).multiplyScalar(forest ? .45 : .55);
    const mesh = new THREE.InstancedMesh(forest ? this.G.cone7 : this.G.cone6,
      this.mat(col, { flatShading: true }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rng() * .05;
      const r = R0 * (1 + rng() * .75);
      const h = forest ? 300 + rng() * 380 : 260 + rng() * 760;
      const w = forest ? h * .22 : h * (.6 + rng() * .7);
      e.set(0, rng() * 6, 0); q.setFromEuler(e);
      v.set(cx + Math.cos(a) * r, -20, cz + Math.sin(a) * r);
      sc.set(w, h, w);
      mesh.setMatrixAt(i, m4.compose(v, q, sc));
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.zoneGroup.add(mesh);
  },

  makeSky(pal) {
    return this.makeTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      const top = new THREE.Color(pal.base2).multiplyScalar(.5).getStyle();
      const mid = new THREE.Color(pal.base).multiplyScalar(.72).getStyle();
      gr.addColorStop(0, top);
      gr.addColorStop(.52, mid);
      gr.addColorStop(.62, new THREE.Color(pal.base).multiplyScalar(1.05).getStyle());
      gr.addColorStop(1, top);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  },

  mat(color, opt = {}) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color: new THREE.Color(color), roughness: .92, metalness: .02, flatShading: true
    }, opt));
  },

  /* --------- kaya / ağaç / çadır / duvar --------- */
  buildSolid(s, pal, rng) {
    const G = this.gr = this.G;
    if (s.t === 'rect') {
      if (s.kind !== 'wall' && s.kind !== 'gate') return;
      if (s.kind === 'gate') return;                       // kapı prop olarak çizilir
      const h = 240;
      const m = new THREE.Mesh(G.box, this.mat(new THREE.Color(pal.base2).multiplyScalar(1.18), { roughness: 1 }));
      m.scale.set(s.w, h, s.h);
      m.position.set(s.x, 0, s.y);
      m.castShadow = true; m.receiveShadow = true;
      this.zoneGroup.add(m);
      /* üst kenar taşları */
      const n = Math.max(2, Math.round(Math.max(s.w, s.h) / 90));
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n;
        const cap = new THREE.Mesh(G.ico0, this.mat(new THREE.Color(pal.detail).multiplyScalar(.5)));
        const cx = s.w > s.h ? s.x + s.w * t : s.x + s.w / 2;
        const cz = s.w > s.h ? s.y + s.h / 2 : s.y + s.h * t;
        cap.position.set(cx, h - 6, cz);
        const r0 = 12 + rng() * 10;
        cap.scale.set(r0 * (s.w > s.h ? 1.4 : .9), r0 * .8, r0 * (s.w > s.h ? .9 : 1.4));
        cap.rotation.set(rng(), rng() * TAU, rng());
        cap.castShadow = true;
        this.zoneGroup.add(cap);
      }
      return;
    }

    const { x, y, r, kind } = s;
    const g = new THREE.Group();
    g.position.set(x, 0, y);

    if (kind === 'tree') {
      const trunk = new THREE.Mesh(G.cyl, this.mat('#241a13', { roughness: 1 }));
      trunk.scale.set(r * .2, r * 1.9, r * .2);
      trunk.castShadow = true; trunk.receiveShadow = true;
      g.add(trunk);
      const leafCol = ['#1d2a1b', '#243320', '#182417'];
      const lobes = [[0, 2.15, 1.02], [-.5, 1.85, .74], [.55, 1.9, .68], [-.1, 2.6, .6], [.25, 2.35, .55]];
      for (let i = 0; i < lobes.length; i++) {
        const [ox, oy, rr] = lobes[i];
        const l = new THREE.Mesh(G.ico1, this.mat(leafCol[i % 3]));
        l.position.set(ox * r, oy * r, (rng() - .5) * r * .5);
        l.scale.setScalar(rr * r);
        l.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        l.castShadow = true; l.receiveShadow = true;
        g.add(l);
      }
    } else if (kind === 'tent') {
      const body = new THREE.Mesh(G.cone7, this.mat('#5b2b25'));
      body.scale.set(r * 1.2, r * 2.3, r * 1.2);
      body.castShadow = true; body.receiveShadow = true;
      g.add(body);
      const door = new THREE.Mesh(G.cone4, this.mat('#170c0b', { roughness: 1 }));
      door.scale.set(r * .42, r * 1.1, r * .42);
      door.position.set(0, 0, r * .95);
      g.add(door);
      const pole = new THREE.Mesh(G.cyl, this.mat('#c9b28a', { metalness: .4, roughness: .5 }));
      pole.scale.set(2.4, r * 2.9, 2.4);
      g.add(pole);
      const cres = new THREE.Mesh(new THREE.TorusGeometry(r * .2, r * .045, 6, 14, Math.PI * 1.35),
        this.mat('#e8c877', { metalness: .5, roughness: .35, emissive: 0x2a1a06 }));
      cres.position.y = r * 3.05;
      cres.rotation.z = .6;
      g.add(cres);
    } else {
      const rock = new THREE.Mesh(G.ico0, this.mat(new THREE.Color(pal.detail).multiplyScalar(.55)));
      rock.scale.set(r, r * (.7 + rng() * .5), r * (.85 + rng() * .3));
      rock.position.y = r * .45;
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      g.add(rock);
      const chip = new THREE.Mesh(G.ico0, this.mat(new THREE.Color(pal.detail).multiplyScalar(.4)));
      chip.scale.setScalar(r * .45);
      chip.position.set(r * .8 * (rng() - .5), r * .2, r * .9 * (rng() - .5));
      chip.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      chip.castShadow = true;
      g.add(chip);
    }
    this.zoneGroup.add(g);
  },

  /* --------- ateş: alev + ışık + kıvılcım --------- */
  addFire(x, h, z, opt = {}) {
    const color = opt.color || '#ff7a3c';
    const size = opt.size || 1;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flameTex, color: new THREE.Color(color),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    sp.scale.set(38 * size, 92 * size, 1);
    sp.position.set(x, h + 30 * size, z);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flameTex, color: new THREE.Color('#ffe9b0'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8
    }));
    core.scale.set(16 * size, 44 * size, 1);
    core.position.set(x, h + 20 * size, z);

    const light = new THREE.PointLight(new THREE.Color(color), 1, opt.radius || 640, 2);
    light.position.set(x, h + 34 * size, z);
    const power = (opt.power || 1);
    light.intensity = power * 26000 * size;

    /* yükselen kıvılcımlar */
    const N = Math.round(26 * size);
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const parts = [];
    for (let i = 0; i < N; i++) parts.push({ t: rnd(1), x: 0, y: 0, z: 0, vx: 0, vz: 0, life: rnd(2, 1) });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.dotTex, color: new THREE.Color(color), size: 7 * size, sizeAttenuation: true,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9
    }));

    const grp = new THREE.Group();
    grp.add(sp, core, light, pts);
    this.zoneGroup.add(grp);

    const fire = {
      grp, sp, core, light, pts, parts, arr, geo, size, on: true, x, z, h,
      update: (dt, t) => {
        if (!fire.on) return;
        const f = .82 + Math.sin(t * 11 + x) * .1 + Math.sin(t * 23.3 + z) * .08;
        sp.scale.set(38 * size * (f * .85 + .22), 92 * size * f, 1);
        core.scale.set(16 * size * f, 46 * size * (f * .88 + .2), 1);
        light.intensity = power * 26000 * size * (.78 + f * .3);
        for (let i = 0; i < N; i++) {
          const p = parts[i];
          p.t += dt;
          if (p.t >= p.life) {
            p.t = 0; p.life = rnd(2.2, 1);
            p.x = rnd(11, -11) * size; p.z = rnd(11, -11) * size; p.y = 0;
            p.vx = rnd(16, -16); p.vz = rnd(16, -16);
          }
          p.y += (52 + i % 7 * 6) * dt;
          p.x += p.vx * dt; p.z += p.vz * dt;
          arr[i * 3] = x + p.x;
          arr[i * 3 + 1] = h + 18 * size + p.y;
          arr[i * 3 + 2] = z + p.z;
        }
        geo.attributes.position.needsUpdate = true;
      },
      setOn: v => {
        if (fire.on === v) return;
        fire.on = v; grp.visible = v;
      }
    };
    this.fires.push(fire);
    return fire;
  },

  /* --------- nesneler --------- */
  buildProp(p, pal, rng) {
    const G = this.G;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.y);
    let rec = { g, p };

    switch (p.type) {
      case 'firepit': {
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * TAU;
          const st = new THREE.Mesh(G.ico0, this.mat('#3a2b24'));
          st.position.set(Math.cos(a) * 32, 4, Math.sin(a) * 32);
          st.scale.set(11, 9, 11);
          st.rotation.set(rng(), rng() * 3, rng());
          st.castShadow = true; st.receiveShadow = true;
          g.add(st);
        }
        const logs = new THREE.Mesh(G.cyl, this.mat('#1e1512'));
        logs.scale.set(19, 12, 19); logs.rotation.x = .1;
        g.add(logs);
        this.zoneGroup.add(g);
        rec.fire = this.addFire(p.x, 12, p.y, { color: '#ff9a3c', size: 1.35, power: 1.15, radius: 900 });
        break;
      }
      case 'torch': {
        const pole = new THREE.Mesh(G.cyl, this.mat('#241a20'));
        pole.scale.set(5, 70, 5); pole.castShadow = true;
        g.add(pole);
        const cup = new THREE.Mesh(G.tap, this.mat('#3a2a30'));
        cup.scale.set(13, 16, 13); cup.position.y = 64;
        g.add(cup);
        this.zoneGroup.add(g);
        rec.fire = this.addFire(p.x, 74, p.y, { color: '#ff5c2c', size: .85, power: .95, radius: 720 });
        break;
      }
      case 'brazier': {
        const pole = new THREE.Mesh(G.cyl, this.mat('#2a2026'));
        pole.scale.set(7, 46, 7); pole.castShadow = true;
        g.add(pole);
        const bowl = new THREE.Mesh(G.tap, this.mat('#3d3038'));
        bowl.scale.set(22, 22, 22); bowl.position.y = 44;
        bowl.castShadow = true;
        g.add(bowl);
        const cold = new THREE.Mesh(G.ico0, this.mat('#5a5a68', { emissive: 0x11111a }));
        cold.scale.setScalar(9); cold.position.y = 62;
        g.add(cold);
        rec.cold = cold;
        this.zoneGroup.add(g);
        rec.fire = this.addFire(p.x, 64, p.y, { color: '#ff5c2c', size: 1.05, power: 1.05, radius: 780 });
        rec.fire.setOn(!!p.lit);
        cold.visible = !p.lit;
        break;
      }
      case 'banner': {
        const pole = new THREE.Mesh(G.cyl, this.mat('#3a2a20'));
        pole.scale.set(3.4, 100, 3.4); pole.castShadow = true;
        g.add(pole);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(52, 52, 6, 4), new THREE.MeshStandardMaterial({
          map: this.bannerTex, side: THREE.DoubleSide, roughness: .95, transparent: true
        }));
        cloth.position.set(26, 68, 0);
        cloth.castShadow = true;
        g.add(cloth);
        rec.cloth = cloth;
        this.zoneGroup.add(g);
        break;
      }
      case 'chest': {
        const body = new THREE.Mesh(G.box, this.mat('#3f2620'));
        body.scale.set(52, 30, 36); body.position.set(-26, 0, -18);
        body.castShadow = true; body.receiveShadow = true;
        g.add(body);
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, 30, -18);
        const lid = new THREE.Mesh(G.box, this.mat('#57342a'));
        lid.scale.set(52, 16, 36); lid.position.set(-26, 0, 0);
        lid.castShadow = true;
        lidPivot.add(lid);
        g.add(lidPivot);
        const lock = new THREE.Mesh(G.box, this.mat('#b98b3f', { metalness: .6, roughness: .35 }));
        lock.scale.set(12, 14, 6); lock.position.set(-6, 16, 2);
        g.add(lock);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: new THREE.Color('#ffd27a'),
          blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .5
        }));
        halo.scale.set(150, 150, 1); halo.position.y = 26;
        g.add(halo);
        rec.lid = lidPivot; rec.halo = halo;
        this.zoneGroup.add(g);
        break;
      }
      case 'npc': {
        /* Dede: aynı gövde, yaşlı ahşap tonunda */
        const ch = (Warrior.ready ? Warrior : CharModel).build({ h: 100, elder: true });
        ch.root.position.set(p.x, 0, p.y);
        this.zoneGroup.add(ch.root);
        rec.ch = ch;
        break;
      }
      case 'bossaltar': {
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Mesh(G.cone4, this.mat('#171015'));
          sp.position.set(-160 + i * 80, 0, 0);
          sp.scale.set(20, 78 + (i % 2) * 30, 20);
          sp.castShadow = true; sp.receiveShadow = true;
          g.add(sp);
        }
        const glow = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({
          map: this.glowTex, color: new THREE.Color('#c82814'),
          blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .45
        }));
        glow.scale.setScalar(240); glow.position.y = 2;
        g.add(glow);
        const l = new THREE.PointLight(0xff3a1a, 30000, 1200, 2);
        l.position.set(0, 90, 0);
        g.add(l);
        rec.altarLight = l; rec.altarGlow = glow;
        this.zoneGroup.add(g);
        break;
      }
      case 'gate': {
        const w = p.w, h = 190;
        rec.doors = [];
        for (const dir of [-1, 1]) {
          const d = new THREE.Mesh(G.box, this.mat('#3a221f'));
          d.scale.set(w / 2, h, Math.max(30, p.h));
          d.position.set(dir < 0 ? p.x : p.x + w / 2, 0, p.y);
          d.castShadow = true; d.receiveShadow = true;
          this.zoneGroup.add(d);
          rec.doors.push({ mesh: d, dir, x0: d.position.x });
        }
        break;
      }
      case 'exit': {
        const cx = p.x + p.w / 2, cz = p.y + p.h / 2;
        const rad = clamp(Math.max(p.w, p.h) * .42, 46, 105);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(rad * .62, rad, 230, 18, 1, true),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color('#ffb45c'), transparent: true, opacity: .1,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
          }));
        col.position.set(cx, 115, cz);
        this.zoneGroup.add(col);
        /* zeminde halka: kapı ağzını işaretler, geniş bir leke yapmaz */
        const disc = new THREE.Mesh(this.G.ring, new THREE.MeshBasicMaterial({
          color: new THREE.Color('#ffcf7d'),
          blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .45,
          side: THREE.DoubleSide
        }));
        disc.scale.set(rad, 1, rad);
        disc.position.set(cx, 4, cz);
        this.zoneGroup.add(disc);
        const l = new THREE.PointLight(0xffb45c, 4200, 430, 2);
        l.position.set(cx, 70, cz);
        this.zoneGroup.add(l);
        rec.col = col; rec.disc = disc; rec.exitLight = l;
        rec.g = null;
        break;
      }
      default:
        return;
    }
    this.propObj.set(p, rec);
  },

  /* ============================================================
     DÜŞMAN / PATRON GÖVDELERİ
     ============================================================ */
  makeEnemy(e) {
    const G = this.G, c = e.cfg, h = e.h, w = h * .82;
    const g = new THREE.Group();
    const bodyMat = this.mat(c.color, { roughness: .95, emissive: new THREE.Color(c.eye).multiplyScalar(.06) });

    const body = new THREE.Mesh(G.cone7, bodyMat);
    body.scale.set(w * .56, h, w * .56);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    /* etek: tırtıklı alt sıra */
    const skirt = new THREE.Mesh(G.cone7, bodyMat);
    skirt.scale.set(w * .6, h * .22, w * .6);
    skirt.rotation.y = .45;
    g.add(skirt);

    /* tepe dikeni */
    const spike = new THREE.Mesh(G.cone4, bodyMat);
    spike.scale.set(w * .09, h * .26, w * .09);
    spike.position.set(w * .06, h * .96, 0);
    spike.rotation.z = -.35;
    g.add(spike);

    /* gözler */
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.eye) });
    const eyes = [];
    for (const sx of [-1, 1]) {
      const ey = new THREE.Mesh(G.sph, eyeMat);
      ey.scale.set(w * .085, h * .038, w * .05);
      ey.position.set(sx * w * .13, h * .56, w * .17);
      g.add(ey); eyes.push(ey);
    }
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color(c.eye),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .35
    }));
    eyeGlow.scale.set(w * 1.1, w * 1.1, 1);
    eyeGlow.position.set(0, h * .56, w * .1);
    g.add(eyeGlow);

    let extra = null;
    if (e.type === 'archer') {
      extra = new THREE.Mesh(new THREE.TorusGeometry(h * .26, h * .022, 5, 16, Math.PI * 1.1),
        this.mat('#7d6a4a'));
      extra.position.set(w * .42, h * .5, w * .2);
      extra.rotation.set(0, Math.PI / 2, Math.PI / 2);
      extra.castShadow = true;
      g.add(extra);
    }
    if (e.type === 'brute') {
      const sh = new THREE.Mesh(G.cone4, this.mat('#3a2028'));
      sh.scale.set(w * .16, h * .3, w * .16);
      sh.position.set(-w * .42, h * .68, 0);
      sh.rotation.z = .9;
      sh.castShadow = true;
      g.add(sh);
      /* balyoz */
      const hg = new THREE.Group();
      const handle = new THREE.Mesh(G.cyl, this.mat('#4a3a30'));
      handle.scale.set(4.5, 62, 4.5);
      handle.rotation.z = -Math.PI / 2;
      hg.add(handle);
      const head = new THREE.Mesh(G.box, this.mat('#2a2028'));
      head.scale.set(26, 30, 26);
      head.position.set(62, -15, 0);
      head.castShadow = true;
      hg.add(head);
      hg.position.set(w * .34, h * .55, w * .1);
      g.add(hg);
      extra = hg;
    }

    const shadow = new THREE.Mesh(this.G.disc, this.blobMat.clone());
    shadow.position.y = 1.2;
    shadow.scale.set(e.r * 1.5, 1, e.r * 1.4);
    g.add(shadow);

    this.actorGroup.add(g);
    return { g, body, skirt, spike, eyes, eyeGlow, extra, shadow, bodyMat, eyeMat, h, w };
  },

  syncEnemy(e, o, dt) {
    const c = e.cfg;
    let a = 1, sc = 1, sink = 0;
    if (e.dead) {
      a = clamp(1 - e.deadT / .7, 0, 1);
      sc = Math.max(.02, 1 - e.deadT * .5);
      sink = e.deadT * 22;
      if (sc <= .05) { o.g.visible = false; return; }
    }
    o.g.visible = true;
    const breathe = e.dead ? 0 : Math.sin(e.bob) * 3;

    o.g.position.set(e.x, -sink + breathe, e.y);
    o.g.rotation.y = Math.PI / 2 - e.face;
    o.g.scale.setScalar(sc);

    /* hazırlanma: geriye yaslan, sonra saldırıda ileri savrul */
    let lean = 0, push = 0;
    if (e.state === 'windup') { const k = e.t / c.windup; lean = -k * .34; push = -k * 10; }
    else if (e.state === 'attack') { const k = clamp(e.t / (c.active + .06), 0, 1); lean = Math.sin(k * Math.PI) * .5; push = Math.sin(k * Math.PI) * 22; }
    if (e.stunT > 0) lean = Math.sin(e.t * 26) * .22;
    o.body.rotation.x = lean;
    o.skirt.rotation.x = lean * .3;
    o.spike.rotation.x = lean;
    o.g.position.x += Math.cos(e.face) * push;
    o.g.position.z += Math.sin(e.face) * push;

    /* balyoz savurması */
    if (o.extra && e.type === 'brute') {
      const sw = e.state === 'windup' ? -1.1 + (e.t / c.windup) * 1.3
        : e.state === 'attack' ? .8 : -.4;
      o.extra.rotation.z = damp(o.extra.rotation.z, sw, 14, dt);
    }

    /* hasar parlaması + göz yoğunluğu */
    const glow = e.state === 'windup' ? 1 : .55;
    o.eyeMat.color.set(c.eye).multiplyScalar(.6 + glow * .9);
    o.eyeGlow.material.opacity = a * (.2 + glow * .35);
    const fl = e.flash;
    o.bodyMat.emissive.set(c.eye).multiplyScalar(.06 + fl * .9);
    if (fl > .02) o.bodyMat.emissive.lerp(new THREE.Color(0xffffff), clamp(fl, 0, 1) * .7);

    const trans = a < .999;
    if (o.bodyMat.transparent !== trans) { o.bodyMat.transparent = trans; o.bodyMat.needsUpdate = true; }
    o.bodyMat.opacity = a;
    o.shadow.material.opacity = .5 * a;
    o.shadow.position.y = 1.2 + sink;
  },

  makeBoss(b) {
    const G = this.G, h = b.h, w = h * .95;
    const g = new THREE.Group();
    const bodyMat = this.mat('#2a1620', { roughness: .9, emissive: 0x3a0a04 });

    const body = new THREE.Mesh(G.cone6, bodyMat);
    body.scale.set(w * .58, h, w * .58);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const skirt = new THREE.Mesh(G.cone6, this.mat('#3d2028', { roughness: .95 }));
    skirt.scale.set(w * .64, h * .3, w * .64);
    skirt.rotation.y = .5;
    skirt.castShadow = true;
    g.add(skirt);

    /* taç */
    const crownMat = this.mat('#2a1218');
    for (let i = -2; i <= 2; i++) {
      const s = new THREE.Mesh(G.cone4, crownMat);
      s.scale.set(w * .07, h * (.16 + (2 - Math.abs(i)) * .05), w * .07);
      s.position.set(i * w * .17, h * .93, w * .04);
      s.rotation.z = -i * .12;
      s.castShadow = true;
      g.add(s);
    }
    /* çatlaklar: gövde üstünde ince kızıl çizgiler */
    const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a1a'), transparent: true, opacity: .8 });
    const cracks = [];
    for (const pts of b.cracks) {
      const v = pts.map(([px, py]) => new THREE.Vector3(px * w * .5, (1 + py) * h * .92, w * .3 * (1 - (1 + py))));
      const cg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), 12, h * .01, 4, false);
      const cm = new THREE.Mesh(cg, crackMat);
      g.add(cm); cracks.push(cm);
    }
    /* gözler */
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a14') });
    for (const sx of [-1, 1]) {
      const ey = new THREE.Mesh(G.sph, eyeMat);
      ey.scale.set(w * .1, h * .028, w * .05);
      ey.position.set(sx * w * .16, h * .58, w * .2);
      g.add(ey);
    }
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color('#ff3a14'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .35
    }));
    aura.scale.set(w * 3, h * 2.2, 1);
    aura.position.y = h * .5;
    g.add(aura);

    const light = new THREE.PointLight(0xff3a1a, 46000, 1500, 2);
    light.position.set(0, h * .6, 0);
    g.add(light);

    const shadow = new THREE.Mesh(this.G.disc, this.blobMat.clone());
    shadow.position.y = 1.6;
    shadow.scale.set(b.r * 1.9, 1, b.r * 1.8);
    g.add(shadow);

    this.actorGroup.add(g);
    return { g, body, skirt, cracks, crackMat, aura, light, bodyMat, eyeMat, shadow, h, w };
  },

  syncBoss(b, o, dt) {
    let a = 1, sc = 1;
    if (b.dead) { a = clamp(1 - b.deadT / 2.2, 0, 1); sc = Math.max(.02, 1 - b.deadT * .12); }
    if (sc <= .05) { o.g.visible = false; return; }
    o.g.visible = true;

    const breathe = Math.sin(b.bob) * 6;
    o.g.position.set(b.x, breathe, b.y);
    o.g.rotation.y = Math.PI / 2 - b.face;
    o.g.scale.setScalar(sc);

    let lean = 0;
    if (b.state.endsWith('Wind')) lean = Math.sin(b.t * 14) * .06;
    if (b.state === 'charge') lean = .32;
    if (b.stunT > 0) lean = Math.sin(b.t * 20) * .2;
    o.body.rotation.x = lean;

    const k = .3 + (b.phase - 1) * .22;
    o.crackMat.opacity = (.55 + Math.sin(b.bob * 2) * .18 + (b.phase - 1) * .15) * a;
    o.aura.material.opacity = (.22 + k * .5) * a;
    o.light.intensity = (34000 + b.phase * 16000) * a * (.85 + Math.sin(b.bob * 3) * .12);
    o.bodyMat.emissive.set('#3a0a04').multiplyScalar(1 + b.phase * .5 + b.flash * 6);
    if (b.flash > .02) o.bodyMat.emissive.lerp(new THREE.Color(0xffffff), clamp(b.flash, 0, 1) * .6);

    const trans = a < .999;
    if (o.bodyMat.transparent !== trans) { o.bodyMat.transparent = trans; o.bodyMat.needsUpdate = true; }
    o.bodyMat.opacity = a;
    o.shadow.material.opacity = .55 * a;
  },

  /* ============================================================
     MERMİ / TOPLANAN
     ============================================================ */
  makeProjectile(pr) {
    const G = this.G;
    let m;
    if (pr.kind === 'arrow') {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(G.cyl, this.mat('#d8c49a', { emissive: 0x151008 }));
      shaft.scale.set(1.6, 30, 1.6);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = -14;
      g.add(shaft);
      const tip = new THREE.Mesh(G.cone4, this.mat('#8d7a5a', { metalness: .5, roughness: .4 }));
      tip.scale.set(4.5, 12, 4.5);
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 14;
      g.add(tip);
      m = g;
    } else {
      m = new THREE.Mesh(G.oct, new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff4a20'), blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false
      }));
      m.scale.setScalar(11);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color(pr.kind === 'arrow' ? '#ffe9b0' : '#ff5a2a'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .35
    }));
    halo.scale.set(46, 46, 1);
    const g2 = new THREE.Group();
    g2.add(m, halo);
    this.actorGroup.add(g2);
    return { g: g2, m, halo };
  },

  syncProjectile(pr, o, dt) {
    o.g.position.set(pr.x, 44, pr.y);
    o.g.rotation.y = -pr.a;
    if (pr.kind !== 'arrow') o.m.rotation.y += dt * 7, o.m.rotation.x += dt * 5;
    o.halo.material.color.set(pr.friendly ? '#ffe9b0' : (pr.kind === 'arrow' ? '#d8c49a' : '#ff4a20'));
  },

  makePickup(pk) {
    const col = pk.kind === 'hp' ? '#8ce87f' : pk.kind === 'rage' ? '#ffb45c' : '#9fd8ff';
    const m = new THREE.Mesh(this.G.oct, new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }));
    m.scale.setScalar(9);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color(col),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .6
    }));
    halo.scale.set(58, 58, 1);
    const shadow = new THREE.Mesh(this.G.disc, this.blobMat.clone());
    shadow.scale.set(11, 1, 10); shadow.position.y = 1.2;
    shadow.material.opacity = .3;
    const g = new THREE.Group();
    g.add(m, halo, shadow);
    this.actorGroup.add(g);
    return { g, m, halo, shadow };
  },

  syncPickup(pk, o, dt) {
    const y = 16 + pk.z + Math.sin(pk.t * 3) * 4;
    o.g.position.set(pk.x, 0, pk.y);
    o.m.position.y = y; o.halo.position.y = y;
    o.m.rotation.y += dt * 2.4; o.m.rotation.x += dt * 1.6;
    o.halo.material.opacity = .45 + Math.sin(pk.t * 5) * .15;
  },

  /* ============================================================
     PARÇACIK / HALKA / MIZRAK İZİ KATMANLARI
     ============================================================ */
  initFxLayers() {
    const MAXP = 1400;
    const mk = (add, opacity, size) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        map: this.dotTex, size, vertexColors: true, sizeAttenuation: true,
        transparent: true, depthWrite: false, opacity,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending
      }));
      pts.frustumCulled = false;
      this.fxGroup.add(pts);
      return { geo, pts, pos: geo.attributes.position, col: geo.attributes.color };
    };
    this.pGlow = mk(true, .95, 9);
    this.pDust = mk(false, .55, 12);
    this._c = new THREE.Color();
  },

  /* 2B parçacıkların yükseklik yorumu:
     ekranda yukarı hareket = 3B'de yükselme, bir kısmı da kuzeye kayma */
  syncParticles() {
    let ng = 0, nd = 0;
    for (const p of FX.parts) {
      if (p.y0 === undefined) p.y0 = p.y;
      const rise = (p.y0 - p.y);
      const wx = p.x, wy = Math.max(1.5, rise * (p.glow ? .85 : .5)), wz = p.y0 - rise * (p.glow ? .18 : .45);
      const k = 1 - p.t / p.life;
      const tgt = p.glow ? this.pGlow : this.pDust;
      const i = p.glow ? ng++ : nd++;
      if (i * 3 + 2 >= tgt.pos.array.length) continue;
      tgt.pos.array[i * 3] = wx; tgt.pos.array[i * 3 + 1] = wy; tgt.pos.array[i * 3 + 2] = wz;
      this._c.set(p.color).multiplyScalar(p.glow ? k * 1.5 : k * .8);
      tgt.col.array[i * 3] = this._c.r; tgt.col.array[i * 3 + 1] = this._c.g; tgt.col.array[i * 3 + 2] = this._c.b;
    }
    this.pGlow.geo.setDrawRange(0, ng); this.pDust.geo.setDrawRange(0, nd);
    this.pGlow.pos.needsUpdate = this.pGlow.col.needsUpdate = true;
    this.pDust.pos.needsUpdate = this.pDust.col.needsUpdate = true;
  },

  syncRings() {
    const need = FX.rings.length;
    while (this.rings.length < need) {
      const m = new THREE.Mesh(this.G.ring, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      }));
      m.frustumCulled = false;
      this.fxGroup.add(m);
      this.rings.push(m);
    }
    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i];
      if (i >= need) { m.visible = false; continue; }
      const r = FX.rings[i], k = r.t / r.life;
      const rad = lerp(r.r0, r.r1, k);
      m.visible = true;
      m.position.set(r.x, 4 + (r.y !== undefined ? 0 : 0), r.y);
      /* FX.ring y'si zemin konumudur; yükseklik olarak biraz kaldır */
      m.position.y = 5;
      m.scale.set(rad, 1, rad);
      m.material.color.set(r.color);
      m.material.opacity = (1 - k) * .85;
    }
  },

  syncSlashes() {
    const list = Game.slashes;
    while (this.slashes.length < list.length) {
      const m = new THREE.Mesh(new THREE.RingGeometry(.6, 1, 24, 1, 0, 1), new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      }));
      m.rotation.x = -Math.PI / 2;
      m.frustumCulled = false;
      this.fxGroup.add(m);
      this.slashes.push(m);
    }
    for (let i = 0; i < this.slashes.length; i++) {
      const m = this.slashes[i];
      if (i >= list.length) { m.visible = false; continue; }
      const s = list[i], k = s.t / s.life;
      const half = s.half * (.4 + k), r = s.r * (.6 + k * .5);
      m.visible = true;
      m.geometry.dispose();
      m.geometry = new THREE.RingGeometry(Math.max(4, r - 26), r + 8, 26, 1, -s.a - half, half * 2);
      m.position.set(s.x, 46, s.y);
      m.material.color.set(s.color);
      m.material.opacity = (1 - k) * .75;
    }
  },

  /* ============================================================
     KAMERA
     ============================================================ */
  frameCam(snap) {
    const cam = this.camera;
    this.camYaw = damp(this.camYaw, this.yawT, 8, snap ? 1 : this._dt || .016);
    this.dist = damp(this.dist, this.distT, 6, snap ? 1 : this._dt || .016);

    const tx = Cam.x + Cam.ox * .6, tz = Cam.y + Cam.oy * .6;
    this.camAim.set(tx, 55, tz);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camPos.set(
      tx + Math.sin(this.camYaw) * cp * this.dist,
      55 + sp * this.dist,
      tz + Math.cos(this.camYaw) * cp * this.dist
    );
    /* kamera bölgenin dışına çıkmasın: duvarın ardına düşerse sahneyi
       duvar kapatır. Kenara gelince açı dikleşir, görüş açık kalır. */
    const b = Cam.bounds;
    if (b) {
      const m = 90;
      this.camPos.x = clamp(this.camPos.x, b.x + m, b.x + b.w - m);
      this.camPos.z = clamp(this.camPos.z, b.y + m, b.y + b.h - m);
    }

    if (snap) { cam.position.copy(this.camPos); }
    else cam.position.lerp(this.camPos, .55);
    cam.lookAt(this.camAim);
    this.sky.position.copy(cam.position);

    /* güneş oyuncuyu takip etsin ki gölge haritası hep kadrajda olsun */
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx - 520, 900, tz - 380);
    this.sun.target.updateMatrixWorld();

    /* 2B kameranın sınır kısıtı 3B görüş alanına göre ayarlanır */
    const vy = 2 * Math.tan(cam.fov * Math.PI / 360) * this.dist;
    Cam.setView(vy * cam.aspect * .82, vy * .74 / Math.max(.4, sp));
  },

  /* ekran pikselinden zemin noktası */
  groundPoint(mx, my) {
    if (!this.ok) return { x: 0, y: 0 };
    this._ndc.set((mx / this.W) * 2 - 1, -(my / this.H) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hit = this._ray.ray.intersectPlane(this._plane, this._hit);
    if (!hit) {
      const d = this._ray.ray.direction;
      return { x: this.camera.position.x + d.x * 2000, y: this.camera.position.z + d.z * 2000 };
    }
    return { x: hit.x, y: hit.z };
  },

  /* dünya noktasını ekran pikseline yansıtır (hasar sayıları için) */
  project(x, h, z, out) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, h, z).project(this.camera);
    out.x = (v.x * .5 + .5) * this.W;
    out.y = (-v.y * .5 + .5) * this.H;
    out.vis = v.z < 1;
    return out;
  },

  /* ============================================================
     KARE
     ============================================================ */
  frame(dt) {
    if (!this.ok) return;
    this._dt = dt;
    this.time += dt;
    const t = this.time;

    /* menüde kamp ağır ağır dönsün — arka plan canlı dursun */
    if (Game.mode === 'menu') this.yawT += dt * .05;

    this.frameCam(false);

    /* --- nesne durumları --- */
    if (this.propObj) {
      for (const [p, rec] of this.propObj) {
        if (p.type === 'brazier') { rec.fire.setOn(!!p.lit); if (rec.cold) rec.cold.visible = !p.lit; }
        if (p.type === 'chest') {
          rec.lid.rotation.x = damp(rec.lid.rotation.x, p.opened ? -2.1 : 0, 6, dt);
          rec.halo.visible = !p.opened;
          if (!p.opened) rec.halo.material.opacity = .35 + Math.sin(t * 3) * .18;
        }
        if (p.type === 'banner' && rec.cloth) {
          rec.cloth.rotation.y = Math.sin(t * 1.6 + p.x) * .22;
          rec.cloth.rotation.z = Math.sin(t * 2.3 + p.x) * .05;
        }
        if (p.type === 'gate' && rec.doors) {
          const off = p.anim * p.w * .5;
          for (const d of rec.doors) d.mesh.position.x = d.x0 + d.dir * off;
        }
        if (p.type === 'bossaltar') {
          rec.altarGlow.material.opacity = .35 + Math.sin(t * 2.2) * .12;
          rec.altarLight.intensity = 26000 + Math.sin(t * 3.1) * 8000;
        }
        if (p.type === 'exit') {
          const open = !p.gate || (World.props.find(q => q.id === p.gate) || {}).open;
          const vis = !!open;
          rec.col.visible = rec.disc.visible = rec.exitLight.visible = vis;
          if (vis) {
            rec.col.material.opacity = .12 + Math.sin(t * 2.2) * .04;
            rec.disc.material.opacity = .4 + Math.sin(t * 2.2) * .12;
            rec.col.rotation.y += dt * .35;
          }
        }
        if (p.type === 'npc' && rec.ch) {
          /* oyuncu yaklaşınca ona dönsün */
          const pl = Game.player;
          if (pl) {
            const want = Math.PI / 2 - angTo(p.x, p.y, pl.x, pl.y);
            const near = dist2(p.x, p.y, pl.x, pl.y) < 340 * 340;
            const tgt = near ? want : 0;
            rec.ch.root.rotation.y += angDiff(rec.ch.root.rotation.y, tgt) * Math.min(1, dt * 3);
          }
          rec.ch.update(dt, { state: 'idle', t, pose: p.pose || 'sleep' });
        }
      }
    }

    for (const f of this.fires) f.update(dt, t);

    /* --- canlılar --- */
    const live = new Set();

    if (Game.player) {
      const pl = Game.player;
      live.add(pl);
      let o = this.actors.get(pl);
      if (!o) {
        const M = Warrior.ready ? Warrior : CharModel;
        o = { kind: 'char', ch: M.build({ h: pl.h }), pfx: this.makePlayerFx() };
        this.actorGroup.add(o.ch.root); this.actors.set(pl, o);
      }
      this.syncPlayer(pl, o, dt);
    }
    for (const e of Game.enemies) {
      live.add(e);
      let o = this.actors.get(e);
      if (!o) { o = Object.assign({ kind: 'enemy' }, this.makeEnemy(e)); this.actors.set(e, o); }
      this.syncEnemy(e, o, dt);
    }
    if (Game.boss) {
      live.add(Game.boss);
      let o = this.actors.get(Game.boss);
      if (!o) { o = Object.assign({ kind: 'boss' }, this.makeBoss(Game.boss)); this.actors.set(Game.boss, o); }
      this.syncBoss(Game.boss, o, dt);
    }
    for (const pr of Game.projectiles) {
      live.add(pr);
      let o = this.actors.get(pr);
      if (!o) { o = Object.assign({ kind: 'proj' }, this.makeProjectile(pr)); this.actors.set(pr, o); }
      this.syncProjectile(pr, o, dt);
    }
    for (const pk of Game.pickups) {
      live.add(pk);
      let o = this.actors.get(pk);
      if (!o) { o = Object.assign({ kind: 'pick' }, this.makePickup(pk)); this.actors.set(pk, o); }
      this.syncPickup(pk, o, dt);
    }
    /* ölenleri temizle */
    for (const [k, o] of this.actors) {
      if (live.has(k)) continue;
      const root = o.g || (o.ch && o.ch.root);
      if (root) { root.parent && root.parent.remove(root); if (o.ch) o.ch.dispose(); else this.disposeObj(root); }
      if (o.pfx) { o.pfx.g.parent && o.pfx.g.parent.remove(o.pfx.g); this.disposeObj(o.pfx.g); }
      this.actors.delete(k);
    }

    this.syncParticles();
    this.syncRings();
    this.syncSlashes();

    this.renderer.render(this.scene, this.camera);
  },

  /* oyuncuya özel efektler: öfke halesi, parry parıltısı, kalkan yayı */
  makePlayerFx() {
    const g = new THREE.Group();
    const rage = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color('#ff4a1c'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
    }));
    rage.scale.set(150, 180, 1);
    const parry = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color('#ffe9b0'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
    }));
    parry.scale.set(200, 200, 1);
    const shield = new THREE.Mesh(new THREE.RingGeometry(52, 62, 26, 1, -1.1, 2.2), new THREE.MeshBasicMaterial({
      color: new THREE.Color('#9fb6ff'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    shield.rotation.x = -Math.PI / 2;
    g.add(rage, parry, shield);
    this.actorGroup.add(g);
    return { g, rage, parry, shield };
  },

  syncPlayer(p, o, dt) {
    let x = p.x, y = p.y;
    /* saldırıda gövde hamleyle birlikte ileri savrulur */
    if (p.state === 'attack') {
      const k = clamp(p.t / .18, 0, 1);
      const push = Math.sin(k * Math.PI) * (p.combo === 3 ? 26 : 16);
      x += Math.cos(p.face) * push; y += Math.sin(p.face) * push;
    }
    o.ch.root.position.set(x, 0, y);
    o.ch.root.rotation.y = Math.PI / 2 - p.face;
    o.ch.update(dt, p);

    const fx = o.pfx;
    fx.g.position.set(p.x, 0, p.y);
    fx.rage.position.y = 56;
    fx.rage.material.opacity = (p.rage >= 45 && !p.dead) ? .16 + Math.sin(p.t * 8) * .05 : 0;
    fx.parry.position.y = 56;
    fx.parry.material.opacity = clamp(p.parryFlash, 0, 1) * .5;
    fx.shield.visible = p.state === 'block';
    if (fx.shield.visible) {
      fx.shield.position.y = 34;
      fx.shield.rotation.z = p.face;
      fx.shield.material.color.set(p.parrying ? '#ffe9b0' : '#9fb6ff');
      fx.shield.material.opacity = p.parrying ? .8 : .4;
    }
  },

  /* ============================================================
     TEMİZLİK
     ============================================================ */
  clearGroup(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      g.remove(c);
      this.disposeObj(c);
    }
  },
  disposeObj(o) {
    o.traverse && o.traverse(c => {
      if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
      const m = c.material;
      if (!m) return;
      for (const mm of (Array.isArray(m) ? m : [m])) {
        /* yalnızca o nesneye özel üretilmiş dokular atılır */
        if (mm.map && mm.map.userData.perInstance) mm.map.dispose();
        mm.dispose();
      }
    });
  },

  /* bölge değişince canlıların 3B temsillerini at */
  clearActors() {
    for (const [k, o] of this.actors) {
      const root = o.g || (o.ch && o.ch.root);
      if (root) { root.parent && root.parent.remove(root); if (o.ch) o.ch.dispose(); else this.disposeObj(root); }
      if (o.pfx) { o.pfx.g.parent && o.pfx.g.parent.remove(o.pfx.g); this.disposeObj(o.pfx.g); }
    }
    this.actors.clear();
  }
};
