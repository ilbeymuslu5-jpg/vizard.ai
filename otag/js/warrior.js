/* ============================================================
   warrior.js : gerçek 3B karakter modeli (Meshy AI taraması)

   assets/warrior/otag-warrior.glb — kullanıcının gönderdiği yüksek
   çözünürlüklü taramadan tools/finalize-warrior.mjs ile indirgenmiş,
   oyuna hazır tek parça (8.3k üçgen, gömülü JPEG doku, KTX2/meshopt
   gerektirmez — düz THREE.GLTFLoader ile açılır).

   Model tek parça (kol/kalkan/mızrak ayrı düğüm değil) olduğu için
   animasyon gövde bütünü üzerinde katı dönüşümlerle yapılır: eğilme,
   sıçrama, sersemleme, dönüş, ölüp devrilme — js/character3d.js'teki
   prosedürel modelin "gövde" hareketleriyle aynı mantık.

   Yüklenemezse (ağ/dosya sorunu) Game, oyuncuyu eski prosedürel
   CharModel'e düşürür — bkz. render3d.js.
   ============================================================ */
'use strict';

const Warrior = {
  ready: false, failed: false, failReason: null, geo: null, baseMat: null,

  load(cb) {
    if (!window.THREE || !THREE.GLTFLoader) {
      this.failed = true; this.failReason = 'THREE.GLTFLoader yok (vendor/three.min.js eski?)';
      cb && cb(); return;
    }
    const loader = new THREE.GLTFLoader();
    const uri = window.OTAG_WARRIOR_URI || 'assets/warrior/otag-warrior.glb';
    if (!window.OTAG_WARRIOR_URI) console.info('[OTAĞ] OTAG_WARRIOR_URI gömülü değil, dosyadan fetch deneniyor:', uri);
    const done = gltf => {
      let mesh = null;
      gltf.scene.traverse(o => { if (o.isMesh) mesh = o; });
      if (!mesh) { this.failed = true; this.failReason = 'GLB içinde mesh bulunamadı'; cb && cb(); return; }
      this.geo = mesh.geometry;
      this.geo.computeBoundingSphere();
      this.baseMat = mesh.material;
      this.baseMat.map.anisotropy = 4;
      this.ready = true;
      cb && cb();
    };
    const fail = e => {
      this.failReason = (e && (e.message || e.type)) || String(e);
      console.warn('Otağ modeli yüklenemedi, prosedürel modele dönülüyor:', e);
      this.failed = true; cb && cb();
    };
    if (uri.startsWith('data:')) {
      const bin = atob(uri.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      loader.parse(arr.buffer, '', done, fail);
    } else {
      loader.load(uri, done, undefined, fail);
    }
  },

  /* ---------------------------------------------------------- */
  build(opt = {}) {
    const S = opt.h || 112;
    const elder = !!opt.elder;

    const mat = this.baseMat.clone();
    if (elder) mat.color = new THREE.Color(.7, .68, .74);

    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.scale.setScalar(S);

    const body = new THREE.Group();
    body.add(mesh);
    const root = new THREE.Group();
    root.add(body);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 26),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .42, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(.26 * S);
    shadow.position.y = 1.2;
    root.add(shadow);

    const ghost = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (typeof CharModel !== 'undefined' && CharModel.tex.ghost) || null,
      transparent: true, depthWrite: false, opacity: 0
    }));
    ghost.scale.set(.3 * S, .38 * S, 1);
    ghost.visible = false;
    root.add(ghost);

    const inst = {
      root, body, mesh, mat, shadow, ghost, S,
      walkT: 0,
      a: { tilt: 0, pitch: 0, spin: 0, lift: 0, squashY: 1 },
      update: (dt, s) => Warrior.update(inst, dt, s),
      dispose: () => { mat.dispose(); }
    };
    return inst;
  },

  update(inst, dt, s) {
    const a = inst.a, S = inst.S;
    const st = s.state || 'idle', t = s.t || 0;
    const dead = !!s.dead;

    let tilt = 0, pitch = 0, lift = 0, squashY = 1, spin = a.spin;

    if (dead) {
      pitch = -1.4; lift = -.06 * S - Math.min(.09 * S, (s.deadT || 0) * .06 * S); tilt = .5;
    } else switch (st) {
      case 'run': {
        inst.walkT += dt * 13;
        const w = inst.walkT;
        lift = Math.abs(Math.sin(w)) * .05 * S;
        tilt = Math.sin(w) * .1;
        pitch = .14;
        squashY = 1 - Math.abs(Math.sin(w * 2)) * .05;
        break;
      }
      case 'idle': {
        inst.walkT += dt * 2.2;
        lift = Math.sin(inst.walkT) * .012 * S;
        squashY = 1 + Math.sin(inst.walkT) * .02;
        tilt = Math.sin(inst.walkT * .6) * .025;
        break;
      }
      case 'attack': {
        const heavy = s.combo === 3;
        const wind = heavy ? .16 : .09, dur = heavy ? .34 : .26;
        if (t < wind) { const q = t / wind; pitch = -.28 * q; tilt = .16 * q; }
        else {
          const q = clamp((t - wind) / (dur - wind), 0, 1);
          const punch = Math.sin(q * Math.PI);
          pitch = -.28 + punch * (heavy ? 1.0 : .75);
          tilt = .16 - punch * .26;
          lift = punch * (heavy ? .045 * S : .018 * S);
          squashY = 1 + punch * .06;
        }
        break;
      }
      case 'block': {
        pitch = .3; lift = -.03 * S; squashY = .93;
        if (s.parrying) { lift = .01 * S; squashY = 1.03; }
        break;
      }
      case 'dash': {
        pitch = .5; lift = .035 * S; squashY = .9;
        break;
      }
      case 'spin': {
        spin += dt * 22;
        pitch = .08; lift = (.045 + Math.sin(t * 22) * .018) * S;
        break;
      }
      case 'hurt': {
        pitch = -.45; tilt = -.28; lift = .01 * S;
        break;
      }
    }

    const rate = st === 'attack' || st === 'spin' || dead ? 26 : 12;
    a.tilt = damp(a.tilt, tilt, rate, dt);
    a.pitch = damp(a.pitch, pitch, rate, dt);
    a.lift = damp(a.lift, lift, rate, dt);
    a.squashY = damp(a.squashY, squashY, rate, dt);
    a.spin = st === 'spin' ? spin : damp(a.spin, 0, 10, dt);

    const sq = s.squash || { x: 1, y: 1 };
    inst.body.position.y = a.lift;
    inst.body.rotation.set(a.pitch * .55, a.spin, a.tilt);
    inst.body.scale.set(sq.x, a.squashY * sq.y, sq.x);

    const fl = clamp(s.hurtFlash || 0, 0, 1);
    inst.mat.emissive.setRGB(fl * .5, fl * .1, fl * .07);

    const alpha = (s.iframe > 0 && st !== 'dash' && !dead) ? (Math.sin(t * 40) > 0 ? .45 : 1) : 1;
    if (inst._alpha !== alpha) {
      inst._alpha = alpha;
      const tr = alpha < .999;
      if (inst.mat.transparent !== tr) { inst.mat.transparent = tr; inst.mat.needsUpdate = true; }
      inst.mat.opacity = alpha;
    }

    inst.shadow.material.opacity = .42 * (dead ? Math.max(0, 1 - (s.deadT || 0) / 1.5) : 1);

    if (dead) {
      const d = s.deadT || 0;
      inst.ghost.visible = d > .35 && !!inst.ghost.material.map;
      inst.ghost.position.set(0, (.4 + d * .3) * S, 0);
      inst.ghost.material.opacity = clamp((d - .35) * 1.6, 0, 1) * clamp(2.4 - d * .7, 0, .8);
    } else if (inst.ghost.visible) inst.ghost.visible = false;
  }
};
