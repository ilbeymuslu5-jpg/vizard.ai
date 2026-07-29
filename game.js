/* =========================================================================
   NEON ZIGZAG — a rhythm zig-zag runner.
   A glowing line races along an elevated neon path floating over a synth
   grid. Tap on the beat to turn 90 degrees at every corner; miss and you
   fall off the edge. Rendered with Three.js, music synthesized in WebAudio.
   ========================================================================= */

(() => {
  'use strict';

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------
  const CFG = {
    pathWidth: 2.2,
    blockDepth: 6,          // how far the path blocks extend downward
    baseSpeed: 5.2,         // units / second at level 1
    speedPerLevel: 0.45,
    maxSpeed: 9.5,
    bpm: 126,
    minRunBeats: 2,         // segment lengths measured in beats
    maxRunBeats: 4,
    beatsPerLevel: 28,      // level length in beats of travel
    perfectDist: 0.55,      // max distance from corner for PERFECT
    goodDist: 1.25,         // max distance from corner for GOOD
    startLives: 3,
    fallTime: 1.1,          // seconds of falling before respawn
    invulnTime: 1.4,
    gridY: -3.6,
    drawAhead: 90,          // path generated this far ahead of the head
    keepBehind: 40,         // path kept alive this far behind the head
  };

  // Two travel directions (classic zig-zag): +X and -Z.
  const DIR_A = new THREE.Vector3(1, 0, 0);
  const DIR_B = new THREE.Vector3(0, 0, -1);
  // The camera looks roughly along the diagonal between them.
  const DIAG = new THREE.Vector3(1, 0, -1).normalize();

  // Color themes — the world shifts palette on level-up, like the video:
  // cyan world first, then violet, then sunset orange, then teal-green.
  const THEMES = [
    { glow: 0x4df3ff, accent: 0xffb84d, side: 0x0d2f4a, sideAccent: 0x9a2fd0,
      bg: 0x030714, fog: 0x041022, grid1: 0x1ad0e0, grid2: 0x0a4a66,
      debris: [0x4df3ff, 0xffa93d, 0x9a5cff] },
    { glow: 0xc46bff, accent: 0xffc44d, side: 0x2a1150, sideAccent: 0xff4fd8,
      bg: 0x0a0418, fog: 0x140a2e, grid1: 0xb050ff, grid2: 0x3c1470,
      debris: [0xc46bff, 0xff8a3d, 0x4df3ff] },
    { glow: 0xffa14d, accent: 0xff5f7a, side: 0x3a1430, sideAccent: 0xd23fd8,
      bg: 0x140510, fog: 0x2a0a20, grid1: 0xff7ad0, grid2: 0x701c50,
      debris: [0xffa14d, 0xff5f9a, 0xc46bff] },
    { glow: 0x53ffd0, accent: 0xffd76e, side: 0x0c3a30, sideAccent: 0x3fa8ff,
      bg: 0x03110d, fog: 0x06221c, grid1: 0x2ae8b8, grid2: 0x0a5a48,
      debris: [0x53ffd0, 0xffd76e, 0x4da2ff] },
  ];

  // -----------------------------------------------------------------------
  // Renderer / scene
  // -----------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 260);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xbfe8ff, 1.1);
  keyLight.position.set(-3, 8, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xff70d8, 0.5);
  rimLight.position.set(6, 3, -6);
  scene.add(rimLight);

  // -----------------------------------------------------------------------
  // Shared materials (recolored on theme change)
  // -----------------------------------------------------------------------
  const matTop = new THREE.MeshLambertMaterial({ color: 0x05080f });
  const matSide = new THREE.MeshLambertMaterial({ color: THEMES[0].side });
  const matSideAccent = new THREE.MeshBasicMaterial({ color: THEMES[0].sideAccent });
  const matGlow = new THREE.MeshBasicMaterial({ color: THEMES[0].glow });
  const matAccent = new THREE.MeshBasicMaterial({ color: THEMES[0].accent });
  const matTrail = new THREE.MeshBasicMaterial({ color: 0xaefcff });
  const debrisMats = THEMES[0].debris.map(c =>
    new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
  const debrisFillMat = new THREE.MeshLambertMaterial({
    color: 0x0a1a2e, transparent: true, opacity: 0.9 });

  // Radial glow texture for sprites
  function makeGlowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(90,230,255,0.45)');

  // -----------------------------------------------------------------------
  // Grid floor (two layered grids, snapped to camera so they look infinite)
  // -----------------------------------------------------------------------
  let gridA = null, gridB = null;
  function buildGrids(theme) {
    if (gridA) { scene.remove(gridA); gridA.geometry.dispose(); gridA.material.dispose(); }
    if (gridB) { scene.remove(gridB); gridB.geometry.dispose(); gridB.material.dispose(); }
    gridA = new THREE.GridHelper(360, 120, theme.grid1, theme.grid1);
    gridA.material.transparent = true;
    gridA.material.opacity = 0.65;
    gridA.position.y = CFG.gridY;
    scene.add(gridA);
    gridB = new THREE.GridHelper(360, 30, theme.grid2, theme.grid2);
    gridB.material.transparent = true;
    gridB.material.opacity = 0.85;
    gridB.position.y = CFG.gridY - 0.02;
    scene.add(gridB);
  }

  // -----------------------------------------------------------------------
  // Path generation
  // Each "run" is a straight stretch: { start, dir, len, group, corner }
  // corner = world position of the turn at the END of the run.
  // -----------------------------------------------------------------------
  const runs = [];
  let genCursor = new THREE.Vector3(0, 0, 0);
  let genDir = DIR_B.clone();          // first run heads "into" the screen
  let genTotal = 0;                    // total generated path length

  function beatLen() {
    return speedForLevel(state.level) * (60 / CFG.bpm);
  }

  function speedForLevel(level) {
    return Math.min(CFG.maxSpeed, CFG.baseSpeed + (level - 1) * CFG.speedPerLevel);
  }

  function makeRun(start, dir, len) {
    const w = CFG.pathWidth, d = CFG.blockDepth;
    const end = start.clone().addScaledVector(dir, len);
    const group = new THREE.Group();

    // Main block: stretched along dir, extended half a width at both ends
    // so consecutive runs join seamlessly at corners.
    const alongX = Math.abs(dir.x) > 0.5;
    const sx = alongX ? len + w : w;
    const sz = alongX ? w : len + w;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(sx, d, sz),
      [matSide, matSide, matTop, matSide, matSide, matSide]);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    block.position.set(mid.x, -d / 2, mid.z);
    group.add(block);

    // Neon edge strips along the two top edges. Each strip is exactly `len`
    // long but shifted half a path-width along the run, so the strips of
    // consecutive runs join into one continuous outline around the zig-zag
    // (outer edges wrap the outer corners, inner edges meet at the inner
    // corners — no crossings on the walkable top).
    const stripT = 0.1, stripH = 0.07;
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    for (const s of [-1, 1]) {
      const shift = s * (w / 2) * (alongX ? 1 : -1);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? len : stripT, stripH, alongX ? stripT : len),
        matGlow);
      strip.position.set(
        mid.x + perp.x * s * (w / 2 - stripT / 2) + dir.x * shift,
        stripH / 2,
        mid.z + perp.z * s * (w / 2 - stripT / 2) + dir.z * shift);
      group.add(strip);
    }

    // Magenta/violet accent line lower on both side faces (same shift trick).
    for (const s of [-1, 1]) {
      const shift = s * (w / 2) * (alongX ? 1 : -1);
      const acc = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? len : 0.06, 0.1, alongX ? 0.06 : len),
        matSideAccent);
      acc.position.set(
        mid.x + perp.x * s * (w / 2 + 0.03) + dir.x * shift,
        -1.1,
        mid.z + perp.z * s * (w / 2 + 0.03) + dir.z * shift);
      group.add(acc);
    }

    // Orange L-bracket on the top surface hugging the outer corner of the
    // upcoming turn (the yellow corner marks in the video).
    const nextDir = alongX ? DIR_B : DIR_A;
    const bl = 0.8, bt = 0.14;
    const outer = end.clone()
      .addScaledVector(nextDir, -w / 2)
      .addScaledVector(dir, w / 2);
    const inward = new THREE.Vector3().subVectors(end, outer).normalize();
    const ic = outer.clone().addScaledVector(inward, 0.3); // L corner point
    const armD = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? bl : bt, 0.05, alongX ? bt : bl), matAccent);
    armD.position.copy(ic).addScaledVector(dir, -(bl / 2 - bt / 2));
    armD.position.y = 0.06;
    const armN = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? bt : bl, 0.05, alongX ? bl : bt), matAccent);
    armN.position.copy(ic).addScaledVector(nextDir, bl / 2 - bt / 2);
    armN.position.y = 0.06;
    group.add(armD); group.add(armN);

    scene.add(group);
    return { start: start.clone(), dir: dir.clone(), len, group, corner: end };
  }

  function generatePath() {
    while (genTotal < state.traveled + CFG.drawAhead) {
      const beats = CFG.minRunBeats +
        Math.floor(Math.random() * (CFG.maxRunBeats - CFG.minRunBeats + 1));
      const len = Math.max(CFG.pathWidth * 1.6, beats * beatLen());
      runs.push(makeRun(genCursor, genDir, len));
      genCursor = genCursor.clone().addScaledVector(genDir, len);
      genDir = (genDir === DIR_A || genDir.equals(DIR_A)) ? DIR_B.clone() : DIR_A.clone();
      genTotal += len;
    }
    // Drop runs far behind the head.
    while (runs.length > 2) {
      const r = runs[0];
      const behind = r.corner.clone().sub(head.pos).dot(DIAG);
      if (behind < -CFG.keepBehind) {
        scene.remove(r.group);
        r.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        runs.shift();
      } else break;
    }
  }

  // Is a point on the path (within any nearby run rectangle)?
  function onPath(p) {
    const half = CFG.pathWidth / 2 + 0.05;
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      const rel = p.clone().sub(r.start);
      const along = rel.dot(r.dir);
      const perp = Math.abs(rel.x * -r.dir.z + rel.z * r.dir.x); // 2D cross
      if (along >= -half && along <= r.len + half && perp <= half) return true;
    }
    return false;
  }

  // Distance from a point to the nearest corner (for turn grading).
  function nearestCornerDist(p) {
    let best = Infinity;
    for (const r of runs) {
      const d = Math.hypot(p.x - r.corner.x, p.z - r.corner.z);
      if (d < best) best = d;
    }
    return best;
  }

  // -----------------------------------------------------------------------
  // The line (head + trail)
  // -----------------------------------------------------------------------
  const head = {
    pos: new THREE.Vector3(0, 0.14, 0),
    dir: DIR_B.clone(),
    vy: 0,
  };

  const headMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.26, 0.34), matTrail);
  scene.add(headMesh);

  // Soft glow sprite + faint bubble around the head (like the video).
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, opacity: 0.9 }));
  headGlow.scale.set(2.6, 2.6, 1);
  scene.add(headGlow);
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x7de8ff, transparent: true,
      opacity: 0.07, depthWrite: false }));
  scene.add(bubble);

  // Trail: one stretched box per straight stretch.
  const trail = [];
  let curTrail = null;

  function startTrailRun() {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matTrail);
    mesh.scale.set(0.26, 0.18, 0.26);
    scene.add(mesh);
    curTrail = { mesh, start: head.pos.clone(), dir: head.dir.clone() };
    trail.push(curTrail);
    while (trail.length > 26) {
      const t = trail.shift();
      scene.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
  }

  function updateTrailRun() {
    if (!curTrail) return;
    const len = Math.max(0.26, head.pos.clone().sub(curTrail.start).dot(curTrail.dir));
    const alongX = Math.abs(curTrail.dir.x) > 0.5;
    curTrail.mesh.scale.set(alongX ? len : 0.26, 0.18, alongX ? 0.26 : len);
    const mid = curTrail.start.clone().addScaledVector(curTrail.dir, len / 2);
    curTrail.mesh.position.set(mid.x, 0.1, mid.z);
  }

  // -----------------------------------------------------------------------
  // Sparks (little particles streaming off the head / bursting at turns)
  // -----------------------------------------------------------------------
  const SPARK_N = 240;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_N * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = [];
  for (let i = 0; i < SPARK_N; i++) sparks.push({ life: 0, vel: new THREE.Vector3() });
  const sparkMat = new THREE.PointsMaterial({
    color: 0x9df3ff, size: 0.09, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(sparkGeo, sparkMat));
  let sparkCursor = 0;

  function spawnSpark(pos, spread, up) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARK_N;
    s.life = 0.5 + Math.random() * 0.6;
    sparkPos[sparks.indexOf(s) * 3] = pos.x + (Math.random() - 0.5) * 0.2;
    sparkPos[sparks.indexOf(s) * 3 + 1] = pos.y + 0.1;
    sparkPos[sparks.indexOf(s) * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;
    s.vel.set((Math.random() - 0.5) * spread,
      Math.random() * up,
      (Math.random() - 0.5) * spread);
  }

  function updateSparks(dt) {
    for (let i = 0; i < SPARK_N; i++) {
      const s = sparks[i];
      if (s.life <= 0) { sparkPos[i * 3 + 1] = -999; continue; }
      s.life -= dt;
      s.vel.y -= 2.2 * dt;
      sparkPos[i * 3] += s.vel.x * dt;
      sparkPos[i * 3 + 1] += s.vel.y * dt;
      sparkPos[i * 3 + 2] += s.vel.z * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Floating debris — neon wireframe shards drifting beside the path
  // -----------------------------------------------------------------------
  const DEBRIS_N = 46;
  const debris = [];

  function debrisGeometry(kind) {
    switch (kind) {
      case 0: return new THREE.TetrahedronGeometry(0.9 + Math.random() * 1.6);
      case 1: return new THREE.BoxGeometry(0.7 + Math.random(), 0.7 + Math.random(), 0.7 + Math.random());
      case 2: return new THREE.TorusGeometry(0.9 + Math.random() * 0.8, 0.07, 8, 26);
      case 3: return new THREE.CircleGeometry(0.8 + Math.random() * 0.8, 6);
      default: return new THREE.OctahedronGeometry(0.6 + Math.random() * 1.2);
    }
  }

  function placeDebris(d, aheadMin, aheadMax) {
    const along = state.traveled + aheadMin + Math.random() * (aheadMax - aheadMin);
    const side = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 22);
    const perp = new THREE.Vector3(-DIAG.z, 0, DIAG.x);
    d.group.position.copy(DIAG.clone().multiplyScalar(along))
      .addScaledVector(perp, side)
      .setY(-5 + Math.random() * 13);
    d.spin.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
    d.drift = (Math.random() - 0.5) * 0.35;
  }

  function buildDebris() {
    for (const d of debris) scene.remove(d.group);
    debris.length = 0;
    for (let i = 0; i < DEBRIS_N; i++) {
      const kind = Math.floor(Math.random() * 5);
      const geo = debrisGeometry(kind);
      const group = new THREE.Group();
      const mat = debrisMats[i % debrisMats.length];
      if (kind !== 2) {
        const fill = new THREE.Mesh(geo, debrisFillMat);
        group.add(fill);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat));
      } else {
        group.add(new THREE.Mesh(geo,
          new THREE.MeshBasicMaterial({ color: mat.color, transparent: true, opacity: 0.85 })));
      }
      const d = { group, spin: new THREE.Vector3(), drift: 0 };
      placeDebris(d, -20, 110);
      scene.add(group);
      debris.push(d);
    }
  }

  function updateDebris(dt) {
    for (const d of debris) {
      d.group.rotation.x += d.spin.x * dt;
      d.group.rotation.y += d.spin.y * dt;
      d.group.rotation.z += d.spin.z * dt;
      d.group.position.y += d.drift * dt;
      const behind = d.group.position.dot(DIAG) - state.traveled;
      if (behind < -30) placeDebris(d, 60, 130);
    }
  }

  // -----------------------------------------------------------------------
  // Ambient dust particles
  // -----------------------------------------------------------------------
  const DUST_N = 200;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_N * 3);
  const dustCol = new Float32Array(DUST_N * 3);
  function seedDust(theme) {
    const cols = theme.debris.map(c => new THREE.Color(c));
    for (let i = 0; i < DUST_N; i++) {
      const along = state.traveled - 20 + Math.random() * 140;
      const perp = new THREE.Vector3(-DIAG.z, 0, DIAG.x);
      const p = DIAG.clone().multiplyScalar(along)
        .addScaledVector(perp, (Math.random() - 0.5) * 56);
      dustPos[i * 3] = p.x;
      dustPos[i * 3 + 1] = -4 + Math.random() * 14;
      dustPos[i * 3 + 2] = p.z;
      const c = cols[Math.floor(Math.random() * cols.length)];
      dustCol[i * 3] = c.r; dustCol[i * 3 + 1] = c.g; dustCol[i * 3 + 2] = c.b;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dustPts);

  function updateDust() {
    for (let i = 0; i < DUST_N; i++) {
      const along = dustPos[i * 3] * DIAG.x + dustPos[i * 3 + 2] * DIAG.z;
      if (along - state.traveled < -25) {
        const perp = new THREE.Vector3(-DIAG.z, 0, DIAG.x);
        const p = DIAG.clone().multiplyScalar(state.traveled + 100 + Math.random() * 30)
          .addScaledVector(perp, (Math.random() - 0.5) * 56);
        dustPos[i * 3] = p.x;
        dustPos[i * 3 + 1] = -4 + Math.random() * 14;
        dustPos[i * 3 + 2] = p.z;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Audio — synth beat + SFX, all generated with WebAudio
  // -----------------------------------------------------------------------
  let actx = null, master = null, schedTimer = null, nextStep = 0, stepIdx = 0;

  function ensureAudio() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.42;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  }

  function osc(type, freq, t0, dur, vol, dest, glideTo) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, hp) {
    const len = Math.ceil(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur);
  }

  const BASS = [55, 55, 65.4, 49, 55, 55, 82.4, 73.4]; // A1 A1 C2 G1 A1 A1 E2 D2

  function scheduleStep(idx, t) {
    const inBar = idx % 8;               // 8 eighth-notes per bar
    if (inBar % 2 === 0) osc('sine', 150, t, 0.16, 0.9, master, 48);   // kick
    noise(t, 0.05, inBar % 2 === 1 ? 0.25 : 0.12, 6000);               // hats
    if (inBar === 4) noise(t, 0.16, 0.3, 1600);                        // snare-ish
    osc('sawtooth', BASS[(idx >> 1) % BASS.length], t, 0.22, 0.16);    // bassline
    if (idx % 16 === 14)                                               // sparkle stab
      osc('triangle', 880 + 220 * ((idx >> 4) % 3), t, 0.3, 0.12);
  }

  function startMusic() {
    ensureAudio();
    stepIdx = 0;
    nextStep = actx.currentTime + 0.1;
    if (schedTimer) clearInterval(schedTimer);
    schedTimer = setInterval(() => {
      const stepDur = 60 / CFG.bpm / 2;  // eighth notes
      while (nextStep < actx.currentTime + 0.14) {
        scheduleStep(stepIdx, nextStep);
        state.beatPhase = stepIdx / 2;
        nextStep += stepDur;
        stepIdx++;
      }
    }, 30);
  }

  function stopMusic() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  }

  const sfx = {
    turn() { if (actx) { osc('square', 660, actx.currentTime, 0.09, 0.2); } },
    perfect() {
      if (!actx) return;
      const t = actx.currentTime;
      osc('sine', 880, t, 0.16, 0.3);
      osc('sine', 1318, t + 0.07, 0.22, 0.3);
    },
    good() { if (actx) osc('sine', 988, actx.currentTime, 0.15, 0.25); },
    fall() {
      if (!actx) return;
      osc('sawtooth', 420, actx.currentTime, 0.6, 0.35, master, 60);
      noise(actx.currentTime, 0.4, 0.25, 500);
    },
    levelUp() {
      if (!actx) return;
      const t = actx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => osc('triangle', f, t + i * 0.09, 0.25, 0.28));
    },
  };

  // -----------------------------------------------------------------------
  // HUD
  // -----------------------------------------------------------------------
  const el = id => document.getElementById(id);
  const hud = el('hud'), scoreEl = el('score'), levelEl = el('level');
  const hearts = Array.from(document.querySelectorAll('#lives .heart'));
  const progressFill = el('progressFill'), progressNotch = el('progressNotch');
  const popup = el('popup'), levelFlash = el('levelFlash'), tapCircle = el('tapCircle');
  const overlay = el('overlay'), title = el('title'), subtitle = el('subtitle');
  const bigMsg = el('bigMsg'), finalScore = el('finalScore'), promptEl = el('prompt');

  let shownScore = 0;
  function updateHUD() {
    shownScore += (state.score - shownScore) * 0.25;
    if (Math.abs(state.score - shownScore) < 1) shownScore = state.score;
    scoreEl.textContent = 'SCORE: ' + Math.round(shownScore).toLocaleString('en-US');
    levelEl.textContent = 'LEVEL: ' + state.level;
    hearts.forEach((h, i) => h.classList.toggle('lost', i >= state.lives));
    const p = Math.min(100, state.levelProgress * 100);
    progressFill.style.width = p + '%';
    progressNotch.style.left = p + '%';
  }

  function showPopup(kind) {
    popup.textContent = kind === 'perfect' ? 'PERFECT!' : 'GOOD!';
    popup.className = '';
    void popup.offsetWidth;               // restart CSS animation
    popup.className = 'show ' + kind;
  }

  function showLevelFlash(text) {
    levelFlash.textContent = text;
    levelFlash.className = '';
    void levelFlash.offsetWidth;
    levelFlash.className = 'show';
  }

  function pulseTapCircle() {
    tapCircle.classList.remove('pulse');
    void tapCircle.offsetWidth;
    tapCircle.classList.add('pulse');
  }

  // -----------------------------------------------------------------------
  // Camera — per-level view mode: chase cam, high cam, top-down cam
  // -----------------------------------------------------------------------
  const camModes = [
    { back: 7.5, height: 4.6, ahead: 6.5 },   // low chase (early video frames)
    { back: 9.5, height: 7.2, ahead: 7.5 },   // higher, further back
    { back: 2.0, height: 17.5, ahead: 2.8 },  // top-down (late video frames)
  ];
  const camCur = { back: 7.5, height: 4.6, ahead: 6.5 };
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;

  function updateCamera(dt) {
    const mode = camModes[(state.level - 1) % camModes.length];
    const k = Math.min(1, dt * 1.2);
    camCur.back += (mode.back - camCur.back) * k;
    camCur.height += (mode.height - camCur.height) * k;
    camCur.ahead += (mode.ahead - camCur.ahead) * k;

    const targetPos = head.pos.clone()
      .addScaledVector(DIAG, -camCur.back)
      .add(new THREE.Vector3(0, camCur.height, 0));
    const targetLook = head.pos.clone().addScaledVector(DIAG, camCur.ahead);

    if (!camInit) { camPos.copy(targetPos); camLook.copy(targetLook); camInit = true; }
    const f = Math.min(1, dt * 4.5);
    camPos.lerp(targetPos, f);
    camLook.lerp(targetLook, f);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  // -----------------------------------------------------------------------
  // Game state
  // -----------------------------------------------------------------------
  const state = {
    mode: 'menu',           // menu | play | fall | over
    score: 0,
    lives: CFG.startLives,
    level: 1,
    traveled: 0,            // distance along the diagonal, used for culling
    levelProgress: 0,
    beatPhase: 0,
    fallT: 0,
    invuln: 0,
    respawn: null,          // { pos, dir }
    scoreTick: 0,
  };

  function applyTheme(theme) {
    scene.background = new THREE.Color(theme.bg);
    scene.fog = new THREE.Fog(theme.fog, 26, 150);
    matSide.color.setHex(theme.side);
    matSideAccent.color.setHex(theme.sideAccent);
    matGlow.color.setHex(theme.glow);
    matAccent.color.setHex(theme.accent);
    debrisMats.forEach((m, i) => m.color.setHex(theme.debris[i % theme.debris.length]));
    buildGrids(theme);
  }

  function resetGame() {
    // Clear path + trail
    for (const r of runs) {
      scene.remove(r.group);
      r.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    runs.length = 0;
    for (const t of trail) { scene.remove(t.mesh); t.mesh.geometry.dispose(); }
    trail.length = 0;
    curTrail = null;

    genCursor = new THREE.Vector3(0, 0, 0);
    genDir = DIR_B.clone();
    genTotal = 0;

    head.pos.set(0, 0.14, 0);
    head.dir = DIR_B.clone();
    head.vy = 0;

    state.score = 0;
    shownScore = 0;
    state.lives = CFG.startLives;
    state.level = 1;
    state.traveled = 0;
    state.levelProgress = 0;
    state.fallT = 0;
    state.invuln = 0;
    camInit = false;

    applyTheme(THEMES[0]);
    buildDebris();
    seedDust(THEMES[0]);
    generatePath();
    startTrailRun();
    updateHUD();
  }

  function levelUp() {
    state.level++;
    state.levelProgress = 0;
    showLevelFlash('LEVEL ' + state.level);
    sfx.levelUp();
    applyTheme(THEMES[(state.level - 1) % THEMES.length]);
  }

  function loseLife() {
    state.lives--;
    updateHUD();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    // Respawn on the run nearest to where we fell, just after its start.
    let best = runs[0], bestD = Infinity;
    for (const r of runs) {
      const d = Math.hypot(head.pos.x - r.corner.x, head.pos.z - r.corner.z);
      if (d < bestD) { bestD = d; best = r; }
    }
    state.respawn = {
      pos: best.start.clone().addScaledVector(best.dir, Math.min(1.2, best.len * 0.3)).setY(0.14),
      dir: best.dir.clone(),
    };
  }

  function doRespawn() {
    head.pos.copy(state.respawn.pos);
    head.dir = state.respawn.dir.clone();
    head.vy = 0;
    state.mode = 'play';
    state.invuln = CFG.invulnTime;
    startTrailRun();
  }

  function gameOver() {
    state.mode = 'over';
    stopMusic();
    const best = Math.max(state.score, +(localStorage.getItem('nz_best') || 0));
    localStorage.setItem('nz_best', best);
    title.classList.add('hidden');
    subtitle.classList.add('hidden');
    bigMsg.textContent = 'GAME OVER';
    bigMsg.classList.remove('hidden');
    finalScore.textContent =
      'SCORE: ' + state.score.toLocaleString('en-US') +
      '   BEST: ' + best.toLocaleString('en-US');
    finalScore.classList.remove('hidden');
    promptEl.textContent = 'TAP TO RETRY';
    overlay.classList.remove('hidden');
  }

  function startGame() {
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    resetGame();
    state.mode = 'play';
    startMusic();
  }

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------
  function turn() {
    if (state.mode !== 'play') return;
    // Grade the turn by distance to the nearest corner.
    const d = nearestCornerDist(head.pos);
    head.dir = Math.abs(head.dir.x) > 0.5 ? DIR_B.clone() : DIR_A.clone();
    startTrailRun();
    pulseTapCircle();
    for (let i = 0; i < 10; i++) spawnSpark(head.pos, 2.4, 2.2);

    if (d <= CFG.perfectDist) {
      state.score += 250;
      showPopup('perfect');
      sfx.perfect();
    } else if (d <= CFG.goodDist) {
      state.score += 100;
      showPopup('good');
      sfx.good();
    } else {
      state.score += 25;
      sfx.turn();
    }
  }

  function onTap(e) {
    if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.type === 'keydown' && e.repeat) return;
    ensureAudio();
    if (state.mode === 'menu' || state.mode === 'over') {
      title.classList.remove('hidden');
      subtitle.classList.remove('hidden');
      bigMsg.classList.add('hidden');
      finalScore.classList.add('hidden');
      startGame();
    } else if (state.mode === 'play') {
      turn();
    }
  }
  window.addEventListener('pointerdown', onTap);
  window.addEventListener('keydown', onTap);

  // -----------------------------------------------------------------------
  // Main loop
  // -----------------------------------------------------------------------
  let lastT = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (state.mode === 'play') {
      const speed = speedForLevel(state.level);
      head.pos.addScaledVector(head.dir, speed * dt);
      state.traveled = head.pos.dot(DIAG);
      updateTrailRun();
      generatePath();

      // Score / progress tick with distance.
      state.scoreTick += speed * dt;
      const bl = beatLen();
      while (state.scoreTick >= bl) {
        state.scoreTick -= bl;
        state.score += 10;
        state.levelProgress += 1 / CFG.beatsPerLevel;
        if (state.levelProgress >= 1) levelUp();
      }

      if (state.invuln > 0) state.invuln -= dt;

      // Fell off the edge?
      if (state.invuln <= 0 && !onPath(head.pos)) {
        state.mode = 'fall';
        state.fallT = 0;
        sfx.fall();
        for (let i = 0; i < 30; i++) spawnSpark(head.pos, 4, 3);
      }

      // Steady stream of sparks behind the head.
      if (Math.random() < 0.5) spawnSpark(head.pos, 0.5, 0.8);
    } else if (state.mode === 'fall') {
      state.fallT += dt;
      head.vy -= 22 * dt;
      head.pos.y += head.vy * dt;
      head.pos.addScaledVector(head.dir, speedForLevel(state.level) * 0.4 * dt);
      if (state.fallT >= CFG.fallTime) {
        loseLife();
        if (state.mode !== 'over') doRespawn();
      }
    }

    // Visual bits that always animate.
    headMesh.position.copy(head.pos);
    headMesh.rotation.y += dt * 2;
    headGlow.position.copy(head.pos);
    const beatPulse = 1 + 0.12 * Math.max(0, Math.sin(state.beatPhase * Math.PI * 2));
    headGlow.scale.set(2.6 * beatPulse, 2.6 * beatPulse, 1);
    bubble.position.copy(head.pos);
    bubble.scale.setScalar(1 + 0.06 * Math.sin(now / 300));

    updateSparks(dt);
    updateDebris(dt);
    updateDust();
    updateCamera(dt);

    // Keep the grid centered under the camera (snapped so lines don't swim).
    if (gridA) {
      const cell = 12; // multiple of both grids' cell sizes, so lines don't swim
      gridA.position.x = Math.round(camPos.x / cell) * cell;
      gridA.position.z = Math.round(camPos.z / cell) * cell;
      gridB.position.x = gridA.position.x;
      gridB.position.z = gridA.position.z;
    }

    if (state.mode === 'play' || state.mode === 'fall') updateHUD();
    renderer.render(scene, camera);
  }

  // -----------------------------------------------------------------------
  // Boot: show the menu over an idle attract scene.
  // -----------------------------------------------------------------------
  applyTheme(THEMES[0]);
  buildDebris();
  seedDust(THEMES[0]);
  generatePath();
  startTrailRun();
  requestAnimationFrame(frame);

  // Debug hook (open the page with #debug to poke at the game from devtools).
  if (location.hash === '#debug') {
    window.NZ = { state, head, runs, levelUp, applyTheme, THEMES, nearestCornerDist };
  }
})();
