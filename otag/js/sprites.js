/* ============================================================
   sprites.js : karakter çizim sayfasının (4x3) dilimlenmesi
   Sayfa 1254x1254 px, hücre 313.5 x 418 px.
   Her poz için gövde sınırları ölçüldü; kırpma ve ayak noktası
   bu sınırlardan hesaplanıyor ki karakter zeminde sabit dursun.
   ============================================================ */
'use strict';

const Sprites = {
  img: null, ready: false,
  CW: 1254 / 4, CH: 1254 / 3,
  frames: {},

  /* poz : [sütun, satır, gövde x0, y0, x1, y1]  (hücre içi piksel) */
  BODY: {
    idle:      [0, 0,  32, 116, 279, 358],
    angry:     [1, 0,  18, 150, 300, 360],
    happy:     [2, 0,  10, 125, 272, 400],
    confused:  [3, 0,  21, 121, 271, 378],
    love:      [0, 1,  36,  88, 295, 335],
    sad:       [1, 1,  60,  99, 267, 333],
    surprised: [2, 1,  58,  93, 274, 337],
    sleep:     [3, 1,  19, 111, 288, 338],
    rage:      [0, 2,  29,  33, 299, 320],
    block:     [1, 2,  37,  30, 285, 330],
    spin:      [2, 2,  13,  48, 307, 329],
    dead:      [3, 2,   2,  37, 303, 329],
  },

  load(cb) {
    const im = new Image();
    im.onload = () => {
      this.img = im; this.ready = true;
      this.CW = im.width / 4; this.CH = im.height / 3;
      this.build();
      cb && cb();
    };
    im.onerror = () => { console.warn('sprite sayfası yüklenemedi'); this.ready = false; cb && cb(); };
    /* tek dosyalık sürümde görsel base64 olarak gömülüdür */
    im.src = window.OTAG_SHEET_URI || 'assets/otag_sheet.png';
  },

  build() {
    const PAD = 16;
    /* gövde ölçüleri 313.5x418'lik hücreye göre alındı; sayfa yeniden
       boyutlandırılırsa ölçek burada düzeltilir */
    const kx = this.CW / 313.5, ky = this.CH / 418;
    for (const k in this.BODY) {
      let [c, r, bx0, by0, bx1, by1] = this.BODY[k];
      bx0 *= kx; bx1 *= kx; by0 *= ky; by1 *= ky;
      const cx = c * this.CW, cy = r * this.CH;
      const x0 = clamp(bx0 - PAD, 0, this.CW), y0 = clamp(by0 - PAD, 0, this.CH);
      const x1 = clamp(bx1 + PAD, 0, this.CW), y1 = clamp(by1 + PAD * .4, 0, this.CH);
      this.frames[k] = {
        sx: cx + x0, sy: cy + y0, sw: x1 - x0, sh: y1 - y0,
        /* ayak noktası: kırpılan görüntü içinde 0..1 */
        ax: ((bx0 + bx1) / 2 - x0) / (x1 - x0),
        ay: (by1 - y0) / (y1 - y0),
        ratio: (x1 - x0) / (y1 - y0)
      };
    }
    /* boyama için yardımcı tuval */
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d');
  },

  /* Karakteri çizer.
     x,y  : dünyadaki AYAK noktası
     h    : hedef yükseklik (piksel)
     opt  : {flip, alpha, rot, flash:'#fff', flashAmt:0..1, squash:{x,y}} */
  draw(ctx, pose, x, y, h, opt = {}) {
    if (!this.ready) { this.fallback(ctx, x, y, h, opt); return; }
    const f = this.frames[pose] || this.frames.idle;
    const w = h * f.ratio;
    const sx = (opt.squash ? opt.squash.x : 1), sy = (opt.squash ? opt.squash.y : 1);
    ctx.save();
    ctx.globalAlpha = opt.alpha === undefined ? 1 : opt.alpha;
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.scale((opt.flip ? -1 : 1) * sx, sy);
    const dx = -w * f.ax, dy = -h * f.ay;

    if (opt.flash > 0.01) {
      const sc = this.scratch, sc2 = this.sctx;
      const pw = Math.max(2, Math.ceil(f.sw)), ph = Math.max(2, Math.ceil(f.sh));
      if (sc.width !== pw || sc.height !== ph) { sc.width = pw; sc.height = ph; }
      sc2.clearRect(0, 0, pw, ph);
      sc2.globalCompositeOperation = 'source-over';
      sc2.drawImage(this.img, f.sx, f.sy, f.sw, f.sh, 0, 0, pw, ph);
      sc2.globalCompositeOperation = 'source-atop';
      sc2.globalAlpha = clamp(opt.flash, 0, 1);
      sc2.fillStyle = opt.flashColor || '#ffffff';
      sc2.fillRect(0, 0, pw, ph);
      sc2.globalAlpha = 1; sc2.globalCompositeOperation = 'source-over';
      ctx.drawImage(sc, dx, dy, w, h);
    } else {
      ctx.drawImage(this.img, f.sx, f.sy, f.sw, f.sh, dx, dy, w, h);
    }
    ctx.restore();
  },

  /* görsel yüklenmezse oyun yine de oynanabilsin */
  fallback(ctx, x, y, h, opt = {}) {
    const w = h * .75;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#7a2320';
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w / 2, 0); ctx.lineTo(-w / 2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8ddcf';
    ctx.fillRect(-w * .18, -h * .45, w * .36, h * .12);
    ctx.restore();
  },

  /* zemine gölge */
  shadow(ctx, x, y, r, alpha = .38, squash = .38) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * squash, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
};
