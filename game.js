/* =========================================================================
   NEON BEAT RUNNER
   A rhythm endless-runner: the camera flies down a glowing zig-zag corridor
   and you tap in time with the beat to make it through every turn.
   Pure canvas 2D + a hand-rolled perspective projection, no dependencies.
   ========================================================================= */

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Canvas / DPR setup
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------------
  // Color themes (cycle every few levels, like the reference video)
  // ---------------------------------------------------------------------
  const THEMES = [
    { name: 'cyan',   glow: '#4CF3FF', glow2: '#1FA8FF', wall: '#0b3550', wallDark: '#04121e', accent: '#FFC060', sky1: '#020617', sky2: '#0a2540', text: '#eafcff' },
    { name: 'violet', glow: '#B98CFF', glow2: '#FF6FD8', wall: '#2b1140', wallDark: '#120a22', accent: '#FFD36E', sky1: '#0a0414', sky2: '#2a0f3a', text: '#f6ecff' },
    { name: 'sunset', glow: '#FF7A59', glow2: '#FFD24C', wall: '#3a1030', wallDark: '#170714', accent: '#7CF9FF', sky1: '#0d0510', sky2: '#3a1030', text: '#fff3ea' },
    { name: 'lime',   glow: '#B6FF4C', glow2: '#4CFFDA', wall: '#0f3320', wallDark: '#06180f', accent: '#FF6FA5', sky1: '#020a06', sky2: '#0d3320', text: '#eafff0' },
  ];

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  const CFG = {
    baseBPM: 124,
    bpmGrowthPerLevel: 3,
    maxBPM: 190,
    segLen: 3.2,
    pathWidth: 2.0,
    wallHeight: 1.35,
    camHeight: 1.05,
    camBack: 3.4,
    lookAhead: 2.2,
    fov: 1.55,
    drawSegments: 16,
    beatsPerLevel: 8,
    perfectWindow: 0.10,
    goodWindow: 0.20,
    startLives: 3,
    maxLives: 3,
  };

  // ---------------------------------------------------------------------
  // Audio (fully synthesized, no external files)
  // ---------------------------------------------------------------------
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (actx.state === 'suspended') actx.resume();
  }

  function click(freq, dur, gain, type) {
    if (!actx) return;
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function beatClick(strong) {
    click(strong ? 880 : 660, 0.09, strong ? 0.09 : 0.05, 'square');
  }
  function sfxPerfect() {
    click(1400, 0.12, 0.08, 'triangle');
    setTimeout(() => click(1800, 0.1, 0.05, 'triangle'), 40);
  }
  function sfxGood() {
    click(1000, 0.1, 0.06, 'triangle');
  }
  function sfxMiss() {
    click(160, 0.22, 0.09, 'sawtooth');
  }
  function sfxLevelUp() {
    [0, 1, 2].forEach((i) => setTimeout(() => click(660 + i * 220, 0.14, 0.07, 'triangle'), i * 70));
  }
  function sfxGameOver() {
    [0, 1, 2].forEach((i) => setTimeout(() => click(300 - i * 80, 0.3, 0.08, 'sawtooth'), i * 140));
  }

  // ---------------------------------------------------------------------
  // Math helpers
  // ---------------------------------------------------------------------
  const TAU = Math.PI * 2;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------------------
  // Path generation — a chain of nodes connected by straight segments that
  // turn left/right at (roughly) right angles, à la the reference video.
  // ---------------------------------------------------------------------
  const path = {
    nodes: [{ x: 0, y: 0, z: 0, heading: 0, turn: 0 }],
    lastSign: 1,
  };

  function genNextNode() {
    const prev = path.nodes[path.nodes.length - 1];
    let sign;
    const r = Math.random();
    if (r < 0.68) sign = -path.lastSign;       // alternate = classic zig-zag
    else sign = path.lastSign;                  // occasional repeat = sharper turn
    path.lastSign = sign;
    const mag = (75 + Math.random() * 30) * (Math.PI / 180); // 75°..105°
    const turn = sign * mag;
    const heading = prev.heading + turn;
    const node = {
      x: prev.x + Math.sin(heading) * CFG.segLen,
      y: 0,
      z: prev.z + Math.cos(heading) * CFG.segLen,
      heading,
      turn,
    };
    path.nodes.push(node);
  }
  function genStraightNode() {
    const prev = path.nodes[path.nodes.length - 1];
    path.nodes.push({
      x: prev.x + Math.sin(prev.heading) * CFG.segLen,
      y: 0,
      z: prev.z + Math.cos(prev.heading) * CFG.segLen,
      heading: prev.heading,
      turn: 0,
    });
  }
  genStraightNode(); // gentle straight opener before the zig-zag begins
  for (let i = 0; i < 40; i++) genNextNode();

  function ensurePathAhead(idx) {
    while (path.nodes.length < idx + CFG.drawSegments + 6) genNextNode();
  }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  const state = {
    mode: 'menu', // menu | playing | gameover
    themeIdx: 0,
    level: 1,
    score: 0,
    highScore: Number(localStorage.getItem('nbr_highscore') || 0),
    lives: CFG.startLives,
    combo: 0,
    beatsThisLevel: 0,
    bpm: CFG.baseBPM,
    beatInterval: 60 / CFG.baseBPM,
    epochStart: 0,       // real-clock time (audio clock) the current tempo epoch began
    epochBeatOffset: 0,  // fractional beat-count value carried over at epoch start
    pendingBeat: 1,       // next beat/turn event (index into path.nodes) awaiting judgement
    camYaw: 0,
    shake: 0,
    flashRed: 0,
    particles: [],
    floaters: [], // background decor shapes
    popups: [],   // "PERFECT!" style text popups
    tapPulse: 0,
    nextTapWindowOpen: false,
  };

  function theme() { return THEMES[state.themeIdx % THEMES.length]; }

  function genFloaters() {
    state.floaters = [];
    for (let i = 0; i < 70; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      state.floaters.push({
        x: side * (4 + Math.random() * 14),
        y: (Math.random() - 0.35) * 8,
        z: Math.random() * 140,
        s: 0.3 + Math.random() * 1.4,
        rot: Math.random() * TAU,
        kind: Math.floor(Math.random() * 3),
        hue: Math.random(),
      });
    }
  }
  genFloaters();

  function now() {
    return actx ? actx.currentTime : performance.now() / 1000;
  }

  function resetRun() {
    path.nodes = [{ x: 0, y: 0, z: 0, heading: 0, turn: 0 }];
    path.lastSign = 1;
    genStraightNode();
    for (let i = 0; i < 40; i++) genNextNode();
    state.level = 1;
    state.score = 0;
    state.lives = CFG.startLives;
    state.combo = 0;
    state.beatsThisLevel = 0;
    state.themeIdx = 0;
    state.bpm = CFG.baseBPM;
    state.beatInterval = 60 / state.bpm;
    state.epochStart = now() + 1.2; // small lead-in
    state.epochBeatOffset = 0;
    state.pendingBeat = 1;
    state.camYaw = 0;
    state.shake = 0;
    state.flashRed = 0;
    state.particles = [];
    state.popups = [];
    genFloaters();
  }

  function startGame() {
    ensureAudio();
    resetRun();
    state.mode = 'playing';
  }

  function endGame() {
    state.mode = 'gameover';
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem('nbr_highscore', String(state.highScore));
    }
    sfxGameOver();
  }

  // ---------------------------------------------------------------------
  // Beat / timeline
  // ---------------------------------------------------------------------
  // Fractional beat-count elapsed since the game started, continuous across
  // tempo changes (each level-up re-anchors the epoch instead of resetting it).
  function getBeatFloat() {
    return state.epochBeatOffset + (now() - state.epochStart) / state.beatInterval;
  }

  function timeInfo() {
    const beatFloat = Math.max(0, getBeatFloat());
    const beatIndex = Math.floor(beatFloat);
    const beatFrac = beatFloat - beatIndex; // 0 = just left a node, 1 = arriving next
    return { beatFloat, beatIndex, beatFrac };
  }

  function addPopup(text, color) {
    state.popups.push({ text, color, t: 0, life: 0.7 });
  }

  function spawnParticles(n, x, y, z, color) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + Math.random() * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 2,
        vz: (Math.random() - 0.5) * 1.5,
        life: 0.5 + Math.random() * 0.4,
        t: 0,
        color,
      });
    }
  }

  function judge(delta) {
    const abs = Math.abs(delta);
    if (abs <= CFG.perfectWindow) return 'perfect';
    if (abs <= CFG.goodWindow) return 'good';
    return 'miss';
  }

  function applyJudgement(result) {
    const th = theme();
    if (result === 'perfect') {
      state.combo++;
      const mult = 1 + Math.floor(state.combo / 10);
      state.score += 100 * mult;
      addPopup('PERFECT!', th.glow);
      sfxPerfect();
      const node = path.nodes[state.pendingBeat] || path.nodes[0];
      spawnParticles(14, node.x, 0.4, node.z, th.glow);
      state.tapPulse = 1;
    } else if (result === 'good') {
      state.combo++;
      const mult = 1 + Math.floor(state.combo / 10);
      state.score += 50 * mult;
      addPopup('GOOD', th.glow2);
      sfxGood();
      state.tapPulse = 1;
    } else {
      state.combo = 0;
      state.lives--;
      addPopup('MISS', '#ff4d6d');
      sfxMiss();
      state.shake = 1;
      state.flashRed = 1;
      if (state.lives <= 0) {
        setTimeout(endGame, 260);
      }
    }
  }

  // Resolves the currently-pending beat/turn event (path.nodes[state.pendingBeat])
  // with the given judgement, then advances to the next one and handles leveling.
  function resolveBeat(result) {
    ensurePathAhead(state.pendingBeat + 1);
    applyJudgement(result);
    state.pendingBeat++;
    state.beatsThisLevel++;
    if (state.beatsThisLevel >= CFG.beatsPerLevel) {
      state.beatsThisLevel = 0;
      levelUp();
    }
  }

  function levelUp() {
    state.level++;
    state.themeIdx++;
    // Re-anchor the tempo epoch at the current fractional beat so raising the
    // BPM doesn't cause the runner to jump or skip a beat.
    state.epochBeatOffset = getBeatFloat();
    state.epochStart = now();
    state.bpm = Math.min(CFG.maxBPM, CFG.baseBPM + (state.level - 1) * CFG.bpmGrowthPerLevel);
    state.beatInterval = 60 / state.bpm;
    sfxLevelUp();
    addPopup('LEVEL ' + state.level, theme().accent);
  }

  function handleTap() {
    if (state.mode === 'menu') { startGame(); return; }
    if (state.mode === 'gameover') { startGame(); return; }
    if (state.mode !== 'playing') return;

    const beatFloatNow = getBeatFloat();
    if (beatFloatNow < 0) return; // still in lead-in, ignore early taps

    const delta = (beatFloatNow - state.pendingBeat) * state.beatInterval;
    if (Math.abs(delta) <= CFG.goodWindow) {
      resolveBeat(judge(delta));
    }
    // Otherwise it's a stray tap nowhere near the upcoming beat — ignored,
    // the pending beat will either be hit later or auto-missed when its window closes.
  }

  // A miss (no tap before the window closes) is auto-detected every frame.
  function autoMissCheck() {
    if (state.mode !== 'playing') return;
    const beatFloatNow = getBeatFloat();
    let guard = 0;
    while ((beatFloatNow - state.pendingBeat) * state.beatInterval > CFG.goodWindow && guard < 8) {
      resolveBeat('miss');
      guard++;
    }
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  function onTapEvent(e) {
    if (e) e.preventDefault();
    handleTap();
  }
  canvas.addEventListener('pointerdown', onTapEvent, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      onTapEvent(e);
    }
  });

  // ---------------------------------------------------------------------
  // Camera / projection
  // ---------------------------------------------------------------------
  const cam = { x: 0, y: CFG.camHeight, z: -CFG.camBack, yaw: 0 };

  function focalLength() {
    return (H / 2) / Math.tan(CFG.fov / 2);
  }

  function worldToScreen(x, y, z) {
    // translate relative to camera
    let dx = x - cam.x;
    let dy = y - cam.y;
    let dz = z - cam.z;
    // rotate by -camYaw around Y axis
    const s = Math.sin(-cam.yaw), c = Math.cos(-cam.yaw);
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c;
    const cz = rz;
    if (cz < 0.05) return null;
    const f = focalLength();
    const sx = W / 2 + (rx / cz) * f;
    const sy = H / 2 - (dy / cz) * f + H * 0.16;
    return { x: sx, y: sy, z: cz };
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function clear() {
    const th = theme();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky1);
    g.addColorStop(1, th.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGroundGrid(baseZ) {
    const th = theme();
    ctx.save();
    ctx.strokeStyle = th.wall;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    const spacing = 3;
    const range = 60;
    const startZ = Math.floor((baseZ - 5) / spacing) * spacing;
    for (let i = 0; i < 40; i++) {
      const z = startZ + i * spacing;
      const p1 = worldToScreen(-range, 0, z);
      const p2 = worldToScreen(range, 0, z);
      if (!p1 || !p2) continue;
      if (p1.z > 90 && p2.z > 90) continue;
      ctx.globalAlpha = clamp(0.55 - p1.z / 140, 0, 0.55);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let i = -range; i <= range; i += spacing) {
      const p1 = worldToScreen(i, 0, baseZ - 4);
      const p2 = worldToScreen(i, 0, baseZ + 70);
      if (!p1 || !p2) continue;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFloaters(baseZ) {
    const th = theme();
    const items = state.floaters
      .map((f) => ({ f, z: ((f.z - baseZ) % 140 + 140) % 140 + baseZ }))
      .sort((a, b) => b.z - a.z);
    for (const { f, z } of items) {
      const p = worldToScreen(f.x, f.y, z);
      if (!p || p.z > 120) continue;
      const scr = (f.s * focalLength()) / p.z;
      if (scr < 1) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(f.rot + p.z * 0.002);
      ctx.globalAlpha = clamp(0.5 - p.z / 200, 0, 0.5);
      ctx.strokeStyle = f.kind === 0 ? th.glow : (f.kind === 1 ? th.glow2 : th.accent);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (f.kind === 0) {
        ctx.moveTo(0, -scr); ctx.lineTo(scr * 0.9, scr * 0.7); ctx.lineTo(-scr * 0.9, scr * 0.7); ctx.closePath();
      } else if (f.kind === 1) {
        ctx.rect(-scr * 0.6, -scr * 0.6, scr * 1.2, scr * 1.2);
      } else {
        ctx.moveTo(0, -scr); ctx.lineTo(scr, 0); ctx.lineTo(0, scr); ctx.lineTo(-scr, 0); ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function perp(heading) {
    return { x: Math.cos(heading), z: -Math.sin(heading) };
  }

  function drawPath(currentIdx, beatFrac) {
    const th = theme();
    const half = CFG.pathWidth / 2;
    const startIdx = Math.max(0, currentIdx - 1);
    const endIdx = Math.min(path.nodes.length - 2, currentIdx + CFG.drawSegments);

    // painter's algorithm: far to near
    for (let i = endIdx; i >= startIdx; i--) {
      const a = path.nodes[i];
      const b = path.nodes[i + 1];
      if (!a || !b) continue;
      const pa = perp(a.heading);
      const pb = perp(b.heading);
      const aL = { x: a.x - pa.x * half, y: 0, z: a.z - pa.z * half };
      const aR = { x: a.x + pa.x * half, y: 0, z: a.z + pa.z * half };
      const bL = { x: b.x - pb.x * half, y: 0, z: b.z - pb.z * half };
      const bR = { x: b.x + pb.x * half, y: 0, z: b.z + pb.z * half };

      const distFactor = clamp(1 - i / (currentIdx + CFG.drawSegments + 1), 0, 1);
      const alpha = clamp(0.25 + distFactor * 0.9, 0.15, 1);

      const sAL = worldToScreen(aL.x, aL.y, aL.z);
      const sAR = worldToScreen(aR.x, aR.y, aR.z);
      const sBL = worldToScreen(bL.x, bL.y, bL.z);
      const sBR = worldToScreen(bR.x, bR.y, bR.z);
      if (!sAL || !sAR || !sBL || !sBR) continue;

      // floor
      ctx.save();
      ctx.globalAlpha = alpha;
      const grad = ctx.createLinearGradient(sAL.x, sAL.y, sBL.x, sBL.y);
      grad.addColorStop(0, th.wallDark);
      grad.addColorStop(1, '#000005');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sAL.x, sAL.y); ctx.lineTo(sAR.x, sAR.y); ctx.lineTo(sBR.x, sBR.y); ctx.lineTo(sBL.x, sBL.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // walls (outer faces), height h
      const h = CFG.wallHeight;
      [[aL, bL, sAL, sBL, -1], [aR, bR, sAR, sBR, 1]].forEach(([wa, wb, swa, swb, side]) => {
        const waTop = worldToScreen(wa.x, h, wa.z);
        const wbTop = worldToScreen(wb.x, h, wb.z);
        if (!waTop || !wbTop) return;
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        const wg = ctx.createLinearGradient(swa.x, swa.y, swa.x, waTop.y);
        wg.addColorStop(0, th.wall);
        wg.addColorStop(1, th.wallDark);
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(swa.x, swa.y); ctx.lineTo(swb.x, swb.y); ctx.lineTo(wbTop.x, wbTop.y); ctx.lineTo(waTop.x, waTop.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // glowing edge lines along the floor edges
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = clamp(3.2 * (1 - distFactor * 0.4), 1, 4);
      ctx.strokeStyle = th.glow;
      ctx.shadowColor = th.glow;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(sAL.x, sAL.y); ctx.lineTo(sBL.x, sBL.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sAR.x, sAR.y); ctx.lineTo(sBR.x, sBR.y);
      ctx.stroke();
      ctx.restore();

      // corner accent bracket at node b
      if (i === endIdx - 1 || (i % 2 === 0)) {
        const mid = { x: (bL.x + bR.x) / 2, y: 0.02, z: (bL.z + bR.z) / 2 };
        const sMid = worldToScreen(mid.x, mid.y, mid.z);
        if (sMid) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = th.accent;
          ctx.lineWidth = 2;
          ctx.shadowColor = th.accent;
          ctx.shadowBlur = 8;
          const s = clamp(10 / Math.max(sMid.z, 1) * H * 0.03, 2, 14);
          ctx.beginPath();
          ctx.moveTo(sMid.x - s, sMid.y - s * 1.4);
          ctx.lineTo(sMid.x - s, sMid.y);
          ctx.lineTo(sMid.x + s, sMid.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // center light streak: brightest segment near the runner, trailing behind
    const runnerNode = path.nodes[currentIdx];
    const nextNode = path.nodes[currentIdx + 1];
    if (runnerNode && nextNode) {
      const cx = lerp(runnerNode.x, nextNode.x, beatFrac);
      const cz = lerp(runnerNode.z, nextNode.z, beatFrac);
      for (let i = Math.max(0, currentIdx - 4); i <= currentIdx; i++) {
        const a = path.nodes[i], b = path.nodes[i + 1];
        if (!a || !b) continue;
        const sa = worldToScreen(a.x, 0.03, a.z);
        const sb = (i === currentIdx) ? worldToScreen(cx, 0.03, cz) : worldToScreen(b.x, 0.03, b.z);
        if (!sa || !sb) continue;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = th.glow;
        ctx.shadowBlur = 22;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawParticles(dt) {
    const th = theme();
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.t += dt;
      if (p.t > p.life) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 2 * dt;
      const s = worldToScreen(p.x, p.y, p.z);
      if (!s) continue;
      const a = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || th.glow;
      ctx.shadowColor = p.color || th.glow;
      ctx.shadowBlur = 10;
      const r = clamp(60 / Math.max(s.z, 1), 1, 6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawHUD() {
    const th = theme();
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = `700 ${clamp(W * 0.024, 16, 26)}px Arial, sans-serif`;
    ctx.fillStyle = th.text;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 8;

    // score
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + state.score.toLocaleString(), 18, 16);

    // level
    ctx.textAlign = 'right';
    ctx.fillText('LEVEL: ' + state.level, W - 18, 16);

    // lives (hearts)
    ctx.textAlign = 'center';
    const heartSize = clamp(W * 0.022, 14, 22);
    const heartsW = CFG.maxLives * (heartSize + 6);
    let hx = W / 2 - heartsW / 2;
    ctx.shadowBlur = 0;
    for (let i = 0; i < CFG.maxLives; i++) {
      ctx.font = `${heartSize}px Arial`;
      ctx.fillStyle = i < state.lives ? '#ff4d6d' : 'rgba(255,255,255,0.18)';
      ctx.shadowColor = i < state.lives ? '#ff4d6d' : 'transparent';
      ctx.shadowBlur = i < state.lives ? 10 : 0;
      ctx.fillText('♥', hx + i * (heartSize + 6) + heartSize / 2, 40);
    }
    ctx.font = `700 ${clamp(W * 0.02, 13, 20)}px Arial, sans-serif`;
    ctx.fillStyle = th.text;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 6;
    ctx.fillText('LIVES', W / 2, 14);
    ctx.restore();

    // progress bar (level progress)
    const barW = clamp(W * 0.34, 160, 420);
    const barH = 8;
    const bx = W / 2 - barW / 2;
    const by = 66;
    ctx.save();
    roundRect(bx, by, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    const frac = clamp(state.beatsThisLevel / CFG.beatsPerLevel, 0, 1);
    roundRect(bx, by, barW * frac, barH, barH / 2);
    ctx.fillStyle = th.glow;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 10;
    ctx.fill();
    // marker
    ctx.beginPath();
    ctx.arc(bx + barW * frac, by + barH / 2, barH * 0.9, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();

    // combo
    if (state.combo > 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `700 ${clamp(W * 0.02, 14, 22)}px Arial, sans-serif`;
      ctx.fillStyle = th.accent;
      ctx.shadowColor = th.accent;
      ctx.shadowBlur = 10;
      ctx.fillText('COMBO x' + state.combo, W / 2, by + 20);
      ctx.restore();
    }

    // instructions + tap button
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 ${clamp(W * 0.026, 16, 28)}px Arial, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.92;
    ctx.fillText('TAP THE BEAT TO TURN!', W / 2, H - 118);
    ctx.restore();

    drawTapButton();
  }

  function drawTapButton() {
    const th = theme();
    const cx = W / 2, cy = H - 62;
    const baseR = clamp(W * 0.052, 34, 58);

    state.tapPulse = Math.max(0, state.tapPulse - 0.06);
    const { beatFrac } = state.mode === 'playing' ? timeInfo() : { beatFrac: 0 };
    const beatPulse = state.mode === 'playing' ? (1 - Math.abs(0.5 - (beatFrac > 0.85 ? beatFrac - 1 : beatFrac)) * 2) : 0;

    ctx.save();
    // outer rings
    for (let i = 0; i < 2; i++) {
      const rr = baseR + i * 14 + state.tapPulse * 20;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.strokeStyle = th.glow2;
      ctx.globalAlpha = 0.25 - i * 0.08 + state.tapPulse * 0.2;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // base circle
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, TAU);
    const rg = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR);
    rg.addColorStop(0, 'rgba(255,255,255,0.10)');
    rg.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.glow;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 14 + beatPulse * 18;
    ctx.stroke();

    // direction arrow reflecting upcoming turn
    let arrowRot = 0;
    if (state.mode === 'playing') {
      const idx = clamp(state.pendingBeat, 0, path.nodes.length - 2);
      const node = path.nodes[idx];
      if (node) arrowRot = clamp(node.turn, -0.9, 0.9) * 0.6;
    }
    ctx.translate(cx, cy);
    ctx.rotate(arrowRot);
    ctx.beginPath();
    const al = baseR * 0.55;
    ctx.moveTo(0, -al);
    ctx.lineTo(al * 0.55, al * 0.15);
    ctx.lineTo(al * 0.22, al * 0.15);
    ctx.lineTo(al * 0.22, al * 0.7);
    ctx.lineTo(-al * 0.22, al * 0.7);
    ctx.lineTo(-al * 0.22, al * 0.15);
    ctx.lineTo(-al * 0.55, al * 0.15);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.restore();
  }

  function drawPopups(dt) {
    const th = theme();
    for (let i = state.popups.length - 1; i >= 0; i--) {
      const p = state.popups[i];
      p.t += dt;
      if (p.t > p.life) { state.popups.splice(i, 1); continue; }
      const a = 1 - p.t / p.life;
      const y = H * 0.3 - p.t * 40;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = `900 ${clamp(W * 0.05, 26, 50)}px Arial, sans-serif`;
      ctx.fillStyle = p.color || th.glow;
      ctx.shadowColor = p.color || th.glow;
      ctx.shadowBlur = 20;
      ctx.fillText(p.text, W / 2, y);
      ctx.restore();
    }
  }

  function drawVignette() {
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (state.flashRed > 0) {
      ctx.fillStyle = `rgba(255,0,60,${state.flashRed * 0.28})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawMenu() {
    const th = theme();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = th.text;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 24;
    ctx.font = `900 ${clamp(W * 0.09, 34, 72)}px Arial, sans-serif`;
    ctx.fillText('NEON BEAT', W / 2, H * 0.32);
    ctx.fillText('RUNNER', W / 2, H * 0.32 + clamp(W * 0.095, 40, 78));

    ctx.font = `700 ${clamp(W * 0.026, 16, 24)}px Arial, sans-serif`;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.85 + Math.sin(performance.now() / 300) * 0.15;
    ctx.fillText('TAP / CLICK / SPACE TO START', W / 2, H * 0.62);

    ctx.globalAlpha = 0.7;
    ctx.font = `600 ${clamp(W * 0.018, 12, 16)}px Arial, sans-serif`;
    ctx.fillText('Tap in time with the pulsing beat to turn the corners.', W / 2, H * 0.68);
    ctx.fillText('Best score: ' + state.highScore.toLocaleString(), W / 2, H * 0.73);
    ctx.restore();
  }

  function drawGameOver() {
    const th = theme();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.shadowColor = '#ff4d6d';
    ctx.shadowBlur = 22;
    ctx.font = `900 ${clamp(W * 0.07, 30, 60)}px Arial, sans-serif`;
    ctx.fillText('GAME OVER', W / 2, H * 0.32);

    ctx.fillStyle = th.text;
    ctx.shadowColor = th.glow;
    ctx.font = `700 ${clamp(W * 0.035, 18, 32)}px Arial, sans-serif`;
    ctx.fillText('SCORE: ' + state.score.toLocaleString(), W / 2, H * 0.44);
    ctx.font = `600 ${clamp(W * 0.022, 13, 18)}px Arial, sans-serif`;
    ctx.fillText('BEST: ' + state.highScore.toLocaleString(), W / 2, H * 0.5);

    ctx.font = `700 ${clamp(W * 0.024, 15, 22)}px Arial, sans-serif`;
    ctx.globalAlpha = 0.85 + Math.sin(performance.now() / 300) * 0.15;
    ctx.fillText('TAP TO RESTART', W / 2, H * 0.62);
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Update / camera follow
  // ---------------------------------------------------------------------
  function updateCamera(dt) {
    if (state.mode !== 'playing') return;
    const { beatIndex, beatFrac } = timeInfo();
    const idx = clamp(beatIndex, 0, path.nodes.length - 2);
    ensurePathAhead(idx);
    const a = path.nodes[idx];
    const b = path.nodes[idx + 1];
    if (!a || !b) return;

    const runnerX = lerp(a.x, b.x, beatFrac);
    const runnerZ = lerp(a.z, b.z, beatFrac);
    // The runner faces the current segment's fixed heading (b.heading) for its
    // whole traversal — the camera then smoothly swings to catch up after each turn.
    const targetYaw = b.heading;

    // smooth yaw follow (shortest angular path)
    let diff = targetYaw - state.camYaw;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    state.camYaw += diff * clamp(dt * 6, 0, 1);

    const shakeX = (Math.random() - 0.5) * state.shake * 0.25;
    const shakeY = (Math.random() - 0.5) * state.shake * 0.15;

    cam.yaw = state.camYaw;
    cam.x = runnerX - Math.sin(cam.yaw) * CFG.camBack + shakeX;
    cam.z = runnerZ - Math.cos(cam.yaw) * CFG.camBack + shakeY;
    cam.y = CFG.camHeight;

    state.shake = Math.max(0, state.shake - dt * 3);
    state.flashRed = Math.max(0, state.flashRed - dt * 2.5);
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  let last = performance.now();
  function frame(tms) {
    const dt = Math.min(0.05, (tms - last) / 1000);
    last = tms;

    if (state.mode === 'playing') {
      autoMissCheck();
      updateCamera(dt);

      // beat click sound
      const { beatIndex, beatFrac } = timeInfo();
      if (beatIndex >= 0 && beatIndex !== state.lastClickedBeat) {
        state.lastClickedBeat = beatIndex;
        beatClick(beatIndex % CFG.beatsPerLevel === 0);
      }
    }

    clear();
    const baseIdx = state.mode === 'playing' ? clamp(timeInfo().beatIndex, 0, path.nodes.length - 2) : 0;
    if (state.mode !== 'playing') {
      cam.yaw = state.camYaw;
      cam.x = 0; cam.z = -CFG.camBack; cam.y = CFG.camHeight;
      state.camYaw += dt * 0.15;
    }
    drawGroundGrid(cam.z);
    drawFloaters(cam.z);
    if (path.nodes.length > 2) {
      const bf = state.mode === 'playing' ? timeInfo().beatFrac : (performance.now() / 4000) % 1;
      drawPath(baseIdx, bf);
    }
    drawParticles(dt);
    drawVignette();

    if (state.mode === 'menu') drawMenu();
    else if (state.mode === 'playing') drawHUD();
    else if (state.mode === 'gameover') { drawHUD(); drawGameOver(); }

    drawPopups(dt);

    requestAnimationFrame(frame);
  }
  state.lastClickedBeat = -1;
  requestAnimationFrame(frame);
})();
