/* Kurultay — canvas map renderer. Static terrain is painted once into a cache; territory,
   orders and pieces are drawn on top each frame. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const SQ3 = Math.sqrt(3);
  // corner k sits at angle 60k-30 degrees; each direction (E, NE, NW, W, SW, SE) shares two corners
  const CO = [0, 1, 2, 3, 4, 5].map((k) => { const a = ((60 * k - 30) * Math.PI) / 180; return [Math.cos(a), Math.sin(a)]; });
  const EDGE = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];

  const PAL = {
    deep: '#24485c', shallow: '#33657a', wave: 'rgba(214,232,236,0.16)',
    plains: '#a9b66a', forest: '#6e8b4b', hills: '#c49a5c', mountain: '#8f887e',
    tree: '#3e5b2f', treeHi: '#5d7e41', hill: '#7a5428', hillHi: '#ddb87c',
    rockLit: '#bbb1a1', rockDark: '#776e62', snow: '#f2ede2',
    river: '#3c7593', riverHi: '#5c9ab8', coast: 'rgba(38,30,18,0.55)', grid: 'rgba(40,32,20,0.10)',
    gold: '#f0c445', goldDark: '#7a5810', ink: '#1d1812', parch: '#efe4c8', colony: '#b8a06c', desert: '#dcc48e',
  };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
    return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }
  function lcg(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Renderer(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.S = 26;
    this.pad = 30;
    this.cam = { x: 0, y: 0, z: 1 };
    this.view = { w: 300, h: 300, dpr: 1 };
    this.ov = {}; // overlay: reach, plan, hover, selTile, flash
    this.banners = [];
    this.anims = [];   // marching banners and selection pulses
    this.glide = null; // camera tween
  }

  const now = () => (root.performance ? root.performance.now() : Date.now());
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  // Run frames while anything moves. onFrame (set by the UI) refreshes overlays and draws.
  Renderer.prototype.kick = function () {
    if (this.looping) return;
    this.looping = true;
    const frame = () => {
      const t = now();
      for (const a of this.anims) if (t >= a.t0 + a.dur && !a.finished) { a.finished = true; if (a.resolve) a.resolve(); }
      this.anims = this.anims.filter((a) => !a.finished);
      if (this.glide) {
        const k = Math.min(1, (t - this.glide.t0) / this.glide.dur), e = ease(k);
        this.cam.x = this.glide.x0 + (this.glide.x1 - this.glide.x0) * e;
        this.cam.y = this.glide.y0 + (this.glide.y1 - this.glide.y0) * e;
        if (k >= 1) this.glide = null;
      }
      if (this.onFrame) this.onFrame(); else this.draw();
      if (this.anims.length || this.glide) root.requestAnimationFrame(frame); else this.looping = false;
    };
    root.requestAnimationFrame(frame);
  };
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // A banner walks along the tile path; the real army at `hide` stays hidden until it arrives.
  // a field army: its crowd of figures with a small standard above, as one clickable box
  Renderer.prototype.drawArmy = function (g, x, y, u, color, n, opts) {
    // zoomed out, figures grow (up to ×1.6) and thin out so they stay readable
    const S = this.S, px = S * this.cam.z, scale = Math.max(1, Math.min(1.6, 44 / px));
    const tr = drawTroops(g, x, y + S * 0.22, S, color, u, Object.assign({ scale, cap: px < 24 ? 7 : px < 45 ? 12 : 26 }, opts));
    const bs = S * (px < 24 ? 0.85 : px < 45 ? 0.74 : 0.66);
    const b = drawBanner(g, x, tr.top - bs * 0.3, bs, color, n, { ready: opts.ready, selected: opts.selected, dim: opts.dim, flag: opts.flag });
    const x0 = Math.min(tr.x, b.x), y0 = Math.min(tr.y, b.y);
    return { x: x0, y: y0, w: Math.max(tr.x + tr.w, b.x + b.w) - x0, h: Math.max(tr.y + tr.h, b.y + b.h) - y0 };
  };
  Renderer.prototype.animateMarch = function (tiles, color, n, hide, speed, look) {
    if (!tiles || tiles.length < 2 || reduced()) return Promise.resolve();
    const pts = this.trail(tiles);
    const lens = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const dur = Math.max(420, Math.min(1600, 150 * (pts.length - 1))) * (speed || 1);
    return new Promise((resolve) => {
      this.anims.push({ kind: 'march', pts, lens, color, n, hide, look, t0: now(), dur, resolve });
      this.kick();
    });
  };
  Renderer.prototype.pulse = function (tile, color) {
    if (tile == null || tile < 0 || reduced()) return;
    this.anims.push({ kind: 'pulse', tile, color: color || '#fff6dc', t0: now(), dur: 420 });
    this.kick();
  };
  Renderer.prototype.glideTo = function (tile) {
    const p = this.center(tile);
    const x1 = this.nearX(p.x) - this.view.w / 2 / this.cam.z, y1 = p.y - this.view.h / 2 / this.cam.z;
    if (reduced()) { this.cam.x = x1; this.cam.y = y1; this.clamp(); return; }
    const save = { x: this.cam.x, y: this.cam.y };
    this.cam.x = x1; this.cam.y = y1; this.clamp();
    const target = { x: this.period() ? x1 : this.cam.x, y: this.cam.y };
    this.cam.x = save.x; this.cam.y = save.y;
    this.glide = { x0: save.x, y0: save.y, x1: target.x, y1: target.y, t0: now(), dur: 380 };
    this.kick();
  };

  Renderer.prototype.flagFor = function (owner) { const f = this.st && CC.flagOf(this.st, owner); return f ? flagImage(f, CC.colorOf(this.st, owner)) : null; };
  Renderer.prototype.setState = function (st) {
    const fresh = !this.st || this.st.mapSeed !== st.mapSeed || this.st.W !== st.W;
    this.st = st;
    if (fresh) { this.cache = null; this.buildTerrain(); }
  };

  Renderer.prototype.center = function (i) {
    const W = this.st.W, S = this.S, c = i % W, r = (i / W) | 0;
    return { x: this.pad + S * SQ3 * (c + 0.5 * (r & 1)) + (S * SQ3) / 2, y: this.pad + S + S * 1.5 * r };
  };
  Renderer.prototype.worldSize = function () {
    const S = this.S, st = this.st, P = this.period();
    return { w: P ? this.pad * 2 + P : this.pad * 2 + S * SQ3 * (st.W + 0.5), h: this.pad * 2 + S * (1.5 * (st.H - 1) + 2) };
  };
  // one turn around a cylinder map, in world units (0 when the map does not wrap)
  Renderer.prototype.period = function () { return this.st && this.st._wrap ? this.S * SQ3 * this.st.W : 0; };
  // the copy of world x nearest the middle of the view
  Renderer.prototype.nearX = function (x) { const P = this.period(); return P ? x + Math.round((this.cam.x + this.view.w / 2 / this.cam.z - x) / P) * P : x; };
  // tile centres along a path, unwrapped so a path over the seam runs on instead of jumping across the map
  Renderer.prototype.trail = function (path) {
    const P = this.period(), out = [];
    let shift = 0;
    for (const i of path) {
      const p = this.center(i), last = out[out.length - 1];
      let x = p.x + shift;
      if (P && last) { if (x - last.x > P / 2) { shift -= P; x -= P; } else if (last.x - x > P / 2) { shift += P; x += P; } }
      out.push({ x, y: p.y });
    }
    return out;
  };

  Renderer.prototype.pick = function (sx, sy) {
    const S = this.S, st = this.st;
    const wx = sx / this.cam.z + this.cam.x - this.pad - (S * SQ3) / 2;
    const wy = sy / this.cam.z + this.cam.y - this.pad - S;
    const q = ((SQ3 / 3) * wx - wy / 3) / S, r = ((2 / 3) * wy) / S;
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    const row = rz;
    let col = rx + (row - (row & 1)) / 2;
    if (st._wrap) col = ((col % st.W) + st.W) % st.W;
    if (row < 0 || row >= st.H || col < 0 || col >= st.W) return -1;
    return row * st.W + col;
  };

  Renderer.prototype.toScreen = function (wx, wy) { return { x: (this.nearX(wx) - this.cam.x) * this.cam.z, y: (wy - this.cam.y) * this.cam.z }; };

  Renderer.prototype.resize = function (w, h) {
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    this.view = { w, h, dpr };
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.clamp();
  };

  // full: show the whole map. Otherwise big maps open at a comfortable zoom (the turn start centres on the capital).
  Renderer.prototype.fit = function (full) {
    const ws = this.worldSize();
    const whole = Math.min(this.view.w / ws.w, this.view.h / ws.h);
    this.minZ = whole * 0.85;
    const comfy = 22 / this.S;
    let z = this.view.w < 600 ? Math.min(this.view.h / ws.h, whole * 2) : whole;
    if (!full) z = Math.max(z, Math.min(comfy, 3.2));
    this.cam.z = z;
    this.cam.x = (ws.w - this.view.w / z) / 2;
    this.cam.y = (ws.h - this.view.h / z) / 2;
  };
  Renderer.prototype.zoomAt = function (sx, sy, factor) {
    const z0 = this.cam.z, z1 = Math.max(this.minZ || 0.2, Math.min(3.2, z0 * factor));
    const wx = sx / z0 + this.cam.x, wy = sy / z0 + this.cam.y;
    this.cam.z = z1; this.cam.x = wx - sx / z1; this.cam.y = wy - sy / z1;
    this.clamp();
  };
  Renderer.prototype.pan = function (dx, dy) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.clamp(); };
  Renderer.prototype.clamp = function () {
    if (!this.st) return;
    const ws = this.worldSize(), vw = this.view.w / this.cam.z, vh = this.view.h / this.cam.z;
    const mx = Math.max(0, (vw - ws.w) / 2) + vw * 0.35, my = Math.max(0, (vh - ws.h) / 2) + vh * 0.35;
    const P = this.period();
    // a cylinder scrolls round forever: keep the camera within one turn of it
    if (P) this.cam.x = this.pad + ((((this.cam.x - this.pad) % P) + P) % P);
    else this.cam.x = Math.max(-mx, Math.min(ws.w - vw + mx, this.cam.x));
    this.cam.y = Math.max(-my, Math.min(ws.h - vh + my, this.cam.y));
  };
  Renderer.prototype.focus = function (i) {
    const p = this.center(i);
    this.cam.x = this.nearX(p.x) - this.view.w / 2 / this.cam.z;
    this.cam.y = p.y - this.view.h / 2 / this.cam.z;
    this.clamp();
  };

  function hexPath(g, x, y, s) {
    g.moveTo(x + s * CO[0][0], y + s * CO[0][1]);
    for (let k = 1; k < 6; k++) g.lineTo(x + s * CO[k][0], y + s * CO[k][1]);
    g.closePath();
  }

  // ------------------------------------------------------------ static terrain
  Renderer.prototype.buildTerrain = function () {
    const st = this.st, S = this.S, ws = this.worldSize();
    const P = this.period(), cw = P || ws.w;
    const k = Math.min(2, 4096 / cw, 4096 / ws.h);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(cw * k); cv.height = Math.ceil(ws.h * k);
    const g = cv.getContext('2d');
    g.scale(k, k);
    g.fillStyle = PAL.deep; g.fillRect(0, 0, cw, ws.h);
    for (const off of P ? [-P, 0, P] : [0]) {
    g.save(); g.translate(off - (P ? this.pad : 0), 0);
    const N = st.tiles.length;
    const nearLand = (i) => st._nb[i].some((j) => st.tiles[j].t !== 'water');
    for (let i = 0; i < N; i++) {
      const t = st.tiles[i], p = this.center(i);
      let col;
      if (t.t === 'water') col = nearLand(i) ? PAL.shallow : PAL.deep;
      else col = shade(PAL[t.t], (t.v - 0.5) * 0.12 + (t.e - 0.5) * 0.08);
      g.beginPath(); hexPath(g, p.x, p.y, S + 0.7); g.fillStyle = col; g.fill();
    }
    // speckle texture so flat colour reads as painted ground
    for (let i = 0; i < N; i++) {
      const t = st.tiles[i];
      if (t.t === 'water') continue;
      const p = this.center(i), R = lcg(i + 7);
      for (let n = 0; n < 7; n++) {
        const a = R() * Math.PI * 2, d = R() * S * 0.75;
        g.fillStyle = R() < 0.5 ? 'rgba(255,248,220,0.10)' : 'rgba(40,30,10,0.09)';
        g.fillRect(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2.2, 2.2);
      }
    }
    // waves
    g.strokeStyle = PAL.wave; g.lineWidth = 1.3; g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const t = st.tiles[i];
      if (t.t !== 'water' || t.v < 0.45) continue;
      const p = this.center(i), R = lcg(i);
      const x = p.x + (R() - 0.5) * S * 0.8, y = p.y + (R() - 0.5) * S * 0.6;
      g.beginPath(); g.arc(x - 4, y, 4, Math.PI * 1.1, Math.PI * 1.9); g.arc(x + 4, y, 4, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
    // grid and coastline
    g.lineWidth = 1; g.strokeStyle = PAL.grid;
    g.beginPath();
    for (let i = 0; i < N; i++) if (st.tiles[i].t !== 'water') { const p = this.center(i); hexPath(g, p.x, p.y, S); }
    g.stroke();
    g.strokeStyle = PAL.coast; g.lineWidth = 1.8; g.beginPath();
    for (let i = 0; i < N; i++) {
      if (st.tiles[i].t === 'water') continue;
      const p = this.center(i);
      for (let d = 0; d < 6; d++) {
        const j = st._nb6[i][d];
        if (j >= 0 && st.tiles[j].t !== 'water') continue;
        const [a, b] = EDGE[d];
        g.moveTo(p.x + S * CO[a][0], p.y + S * CO[a][1]); g.lineTo(p.x + S * CO[b][0], p.y + S * CO[b][1]);
      }
    }
    g.stroke();
    // rivers
    for (const path of st.rivers) {
      const pts = this.trail(path);
      const last = path[path.length - 1];
      if (st.tiles[last].t === 'water' && pts.length > 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        pts[pts.length - 1] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      const stroke = (w, c) => {
        g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
        for (let k2 = 1; k2 < pts.length - 1; k2++) {
          const m = { x: (pts[k2].x + pts[k2 + 1].x) / 2, y: (pts[k2].y + pts[k2 + 1].y) / 2 };
          g.quadraticCurveTo(pts[k2].x, pts[k2].y, m.x, m.y);
        }
        g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
      };
      stroke(S * 0.3, PAL.river);
      stroke(S * 0.12, PAL.riverHi);
    }
    // distant colonial lands: hatched like an old chart, beyond any army's reach
    g.save(); g.strokeStyle = 'rgba(90,64,30,0.32)'; g.lineWidth = 1.1;
    for (let i = 0; i < N; i++) {
      if (st.tiles[i].t !== 'colony') continue;
      const p = this.center(i);
      g.save(); g.beginPath(); hexPath(g, p.x, p.y, S + 0.5); g.clip();
      g.beginPath();
      for (let d = -S * 2; d < S * 2; d += S * 0.34) { g.moveTo(p.x + d - S, p.y - S); g.lineTo(p.x + d + S, p.y + S); }
      g.stroke(); g.restore();
    }
    g.restore();
    // relief and forests
    for (let i = 0; i < N; i++) {
      const t = st.tiles[i], p = this.center(i), R = lcg(i + 101);
      if (t.t === 'forest') {
        const spots = [[-0.35, -0.2], [0.3, -0.3], [-0.05, 0.12], [0.35, 0.3], [-0.38, 0.38]];
        for (const [dx, dy] of spots) {
          if (R() < 0.18) continue;
          const x = p.x + (dx + (R() - 0.5) * 0.15) * S, y = p.y + (dy + (R() - 0.5) * 0.15) * S, r = S * (0.15 + R() * 0.05);
          g.fillStyle = '#5b4a30'; g.fillRect(x - 1, y + r * 0.6, 2, r * 0.7);
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = PAL.tree; g.fill();
          g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fillStyle = PAL.treeHi; g.fill();
        }
      } else if (t.t === 'hills') {
        for (const [dx, dy, s] of [[-0.25, 0.05, 0.36], [0.27, 0.18, 0.3]]) {
          const x = p.x + dx * S, y = p.y + dy * S, r = s * S;
          g.beginPath(); g.arc(x, y + r * 0.35, r, Math.PI * 1.08, Math.PI * 1.92);
          g.fillStyle = PAL.hillHi; g.fill();
          g.lineWidth = 2; g.strokeStyle = PAL.hill; g.stroke();
        }
      } else if (t.t === 'desert') {
        // dunes
        g.lineWidth = 1.6; g.strokeStyle = 'rgba(150,112,52,0.55)';
        for (const [dx, dy] of [[-0.3, -0.15], [0.22, 0.05], [-0.1, 0.32]]) {
          const x = p.x + dx * S, y = p.y + dy * S;
          g.beginPath(); g.moveTo(x - S * 0.22, y + S * 0.05); g.quadraticCurveTo(x, y - S * 0.14, x + S * 0.22, y + S * 0.05); g.stroke();
        }
      } else if (t.t === 'mountain') {
        for (const [dx, dy, s] of [[-0.18, 0.2, 0.62], [0.28, 0.3, 0.46]]) {
          const x = p.x + dx * S, base = p.y + dy * S + S * 0.2, h = s * S * 1.1, w = s * S;
          g.beginPath(); g.moveTo(x - w * 0.6, base); g.lineTo(x, base - h); g.lineTo(x, base); g.closePath(); g.fillStyle = PAL.rockLit; g.fill();
          g.beginPath(); g.moveTo(x, base - h); g.lineTo(x + w * 0.6, base); g.lineTo(x, base); g.closePath(); g.fillStyle = PAL.rockDark; g.fill();
          g.beginPath(); g.moveTo(x - w * 0.2, base - h * 0.66); g.lineTo(x, base - h); g.lineTo(x + w * 0.2, base - h * 0.66); g.lineTo(x + w * 0.05, base - h * 0.72); g.lineTo(x - w * 0.06, base - h * 0.62); g.closePath();
          g.fillStyle = PAL.snow; g.fill();
          g.lineWidth = 1.2; g.strokeStyle = 'rgba(40,32,24,0.5)';
          g.beginPath(); g.moveTo(x - w * 0.6, base); g.lineTo(x, base - h); g.lineTo(x + w * 0.6, base); g.stroke();
        }
      }
      if (t.gold) drawGold(g, p.x + S * 0.32, p.y - S * 0.3, S);
    }
    g.restore();
    }
    this.cache = cv; this.cacheScale = k;
  };

  function drawGold(g, x, y, S) {
    const pts = [[0, 0, 1], [-0.16, 0.1, 0.8], [0.14, 0.12, 0.7]];
    for (const [dx, dy, s] of pts) {
      const cx = x + dx * S, cy = y + dy * S, r = S * 0.09 * s;
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath();
      g.fillStyle = PAL.gold; g.fill(); g.lineWidth = 1; g.strokeStyle = PAL.goldDark; g.stroke();
    }
  }

  // ------------------------------------------------------------ pieces
  function drawFarm(g, x, y, S) {
    const w = S * 0.62, h = S * 0.4;
    g.save(); g.translate(x, y + S * 0.18);
    g.beginPath(); g.moveTo(-w / 2 + 4, -h / 2); g.lineTo(w / 2 + 4, -h / 2); g.lineTo(w / 2 - 4, h / 2); g.lineTo(-w / 2 - 4, h / 2); g.closePath();
    g.fillStyle = '#e1c060'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#6e5420'; g.stroke();
    g.strokeStyle = 'rgba(110,84,32,0.7)'; g.lineWidth = 1.2; g.beginPath();
    for (let k = -2; k <= 2; k++) { const fx = (k * w) / 6; g.moveTo(fx + 4 - 1, -h / 2 + 2); g.lineTo(fx - 4 + 1, h / 2 - 2); }
    g.stroke();
    g.restore();
  }
  function drawMine(g, x, y, S) {
    g.save(); g.translate(x, y + S * 0.12);
    const r = S * 0.3;
    g.beginPath(); g.moveTo(-r * 1.2, r * 0.6); g.quadraticCurveTo(0, -r * 1.4, r * 1.2, r * 0.6); g.closePath();
    g.fillStyle = '#7b6a55'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#3a2f22'; g.stroke();
    g.beginPath(); g.moveTo(-r * 0.4, r * 0.6); g.lineTo(-r * 0.4, 0); g.arc(0, 0, r * 0.4, Math.PI, 0); g.lineTo(r * 0.4, r * 0.6); g.closePath();
    g.fillStyle = '#1e1912'; g.fill();
    g.restore();
    drawGold(g, x + S * 0.3, y - S * 0.12, S * 0.9);
  }

  // a port: a wooden jetty reaching toward the water, a crane and a pennant in the house colour
  function drawDock(g, x, y, S, color, water, center) {
    g.save(); g.translate(x, y);
    let ang = 0;
    if (water != null) { const q = center(water); ang = Math.atan2(q.y - y, q.x - x); }
    g.save(); g.rotate(ang);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-S * 0.1, -S * 0.16, S * 0.95, S * 0.36);
    g.fillStyle = '#8a5f34'; g.fillRect(-S * 0.12, -S * 0.2, S * 0.95, S * 0.34);
    g.strokeStyle = PAL.ink; g.lineWidth = 1.2; g.strokeRect(-S * 0.12, -S * 0.2, S * 0.95, S * 0.34);
    g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = 1;
    for (let k = 1; k < 6; k++) { const xx = -S * 0.12 + (k * S * 0.95) / 6; g.beginPath(); g.moveTo(xx, -S * 0.2); g.lineTo(xx, S * 0.14); g.stroke(); }
    for (const yy of [-S * 0.24, S * 0.18]) { g.beginPath(); g.arc(S * 0.75, yy, S * 0.05, 0, Math.PI * 2); g.fillStyle = '#5a3d22'; g.fill(); g.strokeStyle = PAL.ink; g.stroke(); }
    g.restore();
    // crane with a pennant
    g.strokeStyle = PAL.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-S * 0.18, S * 0.22); g.lineTo(-S * 0.18, -S * 0.5); g.lineTo(S * 0.12, -S * 0.42); g.stroke();
    g.beginPath(); g.moveTo(S * 0.12, -S * 0.42); g.lineTo(S * 0.12, -S * 0.22); g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(-S * 0.18, -S * 0.5); g.lineTo(-S * 0.42, -S * 0.44); g.lineTo(-S * 0.18, -S * 0.36); g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 1; g.stroke();
    g.restore();
  }
  function drawScaffold(g, x, y, S, color) {
    g.save(); g.translate(x, y + S * 0.1);
    g.strokeStyle = '#8a5f34'; g.lineWidth = Math.max(1.5, S * 0.07); g.lineCap = 'round';
    const w = S * 0.5, h = S * 0.55;
    g.beginPath();
    g.moveTo(-w / 2, h / 2); g.lineTo(-w / 2, -h / 2); g.moveTo(w / 2, h / 2); g.lineTo(w / 2, -h / 2);
    g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2);
    g.moveTo(-w / 2, h / 2); g.lineTo(w / 2, 0); g.moveTo(-w / 2, 0); g.lineTo(w / 2, -h / 2);
    g.stroke();
    g.strokeStyle = PAL.ink; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, -h / 2); g.lineTo(w / 2, -h / 2 - S * 0.3); g.stroke();
    g.beginPath(); g.moveTo(w / 2, -h / 2 - S * 0.3); g.lineTo(w / 2 + S * 0.24, -h / 2 - S * 0.22); g.lineTo(w / 2, -h / 2 - S * 0.14); g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
    g.restore();
  }
  function drawTower(g, x, y, S, color) {
    g.save(); g.translate(x, y + S * 0.12);
    const w = S * 0.36, h = S * 0.66;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, h * 0.5, w * 0.8, S * 0.08, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4a321b'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-w / 2, h / 2); g.lineTo(-w / 3, -h * 0.2); g.moveTo(w / 2, h / 2); g.lineTo(w / 3, -h * 0.2);
    g.moveTo(-w * 0.45, h * 0.3); g.lineTo(w * 0.38, -h * 0.05); g.moveTo(w * 0.45, h * 0.3); g.lineTo(-w * 0.38, -h * 0.05);
    g.stroke();
    g.fillStyle = '#9a7040'; g.strokeStyle = PAL.ink; g.lineWidth = 1.3;
    g.beginPath(); g.rect(-w / 2, -h * 0.46, w, h * 0.28); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(29,24,18,0.6)'; g.lineWidth = 1;
    g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(-w / 2 + (w * k) / 4, -h * 0.46); g.lineTo(-w / 2 + (w * k) / 4, -h * 0.18); } g.stroke();
    g.beginPath(); g.moveTo(-w / 2 - 3, -h * 0.46); g.lineTo(0, -h * 0.78); g.lineTo(w / 2 + 3, -h * 0.46); g.closePath();
    g.fillStyle = color; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 1.3; g.stroke();
    g.restore();
  }

  function drawCity(g, c, x, y, S, color, z, flag) {
    const lvl = c.walls;
    const w = S * (0.82 + lvl * 0.07), h = S * 0.42;
    g.save(); g.translate(x, y + S * 0.08);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, h * 0.62, w * 0.62, S * 0.12, 0, 0, Math.PI * 2); g.fill();
    const stone = lvl === 0 ? '#a07b4f' : '#d8cdb4', stoneDark = lvl === 0 ? '#6d5133' : '#8a7f69';
    // curtain wall with crenels
    g.beginPath();
    const top = -h * 0.2, cren = S * 0.08;
    g.moveTo(-w / 2, h * 0.55); g.lineTo(-w / 2, top);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const x0 = -w / 2 + (w * k) / n, x1 = -w / 2 + (w * (k + 0.5)) / n, x2 = -w / 2 + (w * (k + 1)) / n;
      g.lineTo(x0, top - cren); g.lineTo(x1, top - cren); g.lineTo(x1, top); g.lineTo(x2, top);
    }
    g.lineTo(w / 2, h * 0.55); g.closePath();
    g.fillStyle = stone; g.fill(); g.lineWidth = 1.5; g.strokeStyle = PAL.ink; g.stroke();
    // towers
    const towers = lvl === 0 ? [] : lvl === 1 ? [-w / 2, w / 2] : [-w / 2, 0, w / 2];
    for (const tx of towers) {
      const tw = S * 0.2, th = S * (0.62 + lvl * 0.06);
      g.beginPath(); g.rect(tx - tw / 2, h * 0.55 - th, tw, th);
      g.fillStyle = stone; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(tx - tw / 2 - 2, h * 0.55 - th); g.lineTo(tx, h * 0.55 - th - S * 0.2); g.lineTo(tx + tw / 2 + 2, h * 0.55 - th); g.closePath();
      g.fillStyle = color; g.fill(); g.stroke();
    }
    // keep with banner
    const kw = S * 0.28, kh = S * (0.55 + lvl * 0.08);
    g.beginPath(); g.rect(-kw / 2, h * 0.55 - kh, kw, kh); g.fillStyle = stoneDark; g.fill(); g.stroke();
    g.beginPath(); g.rect(-kw * 0.18, h * 0.55 - kh * 0.45, kw * 0.36, kh * 0.45); g.fillStyle = PAL.ink; g.fill();
    // a drawn flag is large enough to read (a little larger over a capital), on a pole tall enough to carry it
    const fw = S * (c.capital ? 0.78 : 0.64), fh = fw * CC.FLAG_H / CC.FLAG_W;
    const poleTop = h * 0.55 - kh - (flag ? Math.max(S * 0.42, fh + S * 0.08) : S * 0.42);
    g.beginPath(); g.moveTo(0, h * 0.55 - kh); g.lineTo(0, poleTop); g.lineWidth = 1.5; g.stroke();
    if (flag) {
      g.save(); g.imageSmoothingEnabled = false; g.drawImage(flag, 0, poleTop, fw, fh); g.restore();
      g.lineWidth = 1.2; g.strokeRect(0, poleTop, fw, fh);
    } else {
      g.beginPath(); g.moveTo(0, poleTop); g.lineTo(S * 0.34, poleTop + S * 0.08); g.lineTo(0, poleTop + S * 0.18); g.closePath();
      g.fillStyle = color; g.fill(); g.lineWidth = 1.2; g.stroke();
    }
    if (c.capital) {
      g.beginPath();
      const cy = poleTop - S * 0.06, cw = S * 0.13;
      g.moveTo(-cw, cy); g.lineTo(-cw, cy - cw); g.lineTo(-cw / 2, cy - cw * 0.5); g.lineTo(0, cy - cw * 1.2); g.lineTo(cw / 2, cy - cw * 0.5); g.lineTo(cw, cy - cw); g.lineTo(cw, cy); g.closePath();
      g.fillStyle = PAL.gold; g.fill(); g.lineWidth = 1; g.strokeStyle = PAL.goldDark; g.stroke();
    }
    g.restore();
    if (S * z >= 13) {
      g.save();
      g.font = `600 ${S * 0.4}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,16,10,0.85)'; g.lineJoin = 'round';
      const ty = y + S * 0.62;
      g.strokeText(c.name, x, ty); g.fillStyle = PAL.parch; g.fillText(c.name, x, ty);
      g.restore();
    }
  }

  // ---- troops: an army is drawn as a crowd of little figures, one look per unit type, more figures for bigger armies
  // unit index: 0 spear, 1 archer, 2 knight, 3 sword, 4 cannon. Figures stand on (x, y) and are h tall.
  const SKIN = '#e2c49b', STEEL = '#c9c6bd', WOOD = '#7a5428', HORSE = '#6b4a2e', IRON = '#34312d';
  function figBody(g, x, y, h, color, hood) {
    g.lineCap = 'round';
    g.strokeStyle = PAL.ink; g.lineWidth = h * 0.09;
    g.beginPath(); g.moveTo(x - h * 0.08, y); g.lineTo(x - h * 0.02, y - h * 0.32); g.moveTo(x + h * 0.08, y); g.lineTo(x + h * 0.02, y - h * 0.32); g.stroke();
    g.beginPath(); g.moveTo(x - h * 0.15, y - h * 0.3); g.lineTo(x + h * 0.15, y - h * 0.3); g.lineTo(x + h * 0.12, y - h * 0.68); g.lineTo(x - h * 0.12, y - h * 0.68); g.closePath();
    g.fillStyle = color; g.fill(); g.lineWidth = h * 0.05; g.stroke();
    g.beginPath(); g.arc(x, y - h * 0.8, h * 0.12, 0, Math.PI * 2); g.fillStyle = hood || STEEL; g.fill(); g.stroke();
  }
  function figSpear(g, x, y, h, color) {
    figBody(g, x, y, h, color);
    g.strokeStyle = WOOD; g.lineWidth = h * 0.06;
    g.beginPath(); g.moveTo(x + h * 0.2, y + h * 0.04); g.lineTo(x + h * 0.2, y - h * 1.22); g.stroke();
    g.beginPath(); g.moveTo(x + h * 0.2, y - h * 1.42); g.lineTo(x + h * 0.27, y - h * 1.2); g.lineTo(x + h * 0.13, y - h * 1.2); g.closePath(); g.fillStyle = STEEL; g.fill();
  }
  function figArcher(g, x, y, h, color) {
    figBody(g, x, y, h, color, '#5b4127');
    g.strokeStyle = WOOD; g.lineWidth = h * 0.07;
    g.beginPath(); g.arc(x + h * 0.08, y - h * 0.58, h * 0.36, -1.15, 1.15); g.stroke();
    g.strokeStyle = 'rgba(240,232,210,0.85)'; g.lineWidth = h * 0.025;
    g.beginPath(); g.moveTo(x + h * 0.08 + Math.cos(-1.15) * h * 0.36, y - h * 0.58 + Math.sin(-1.15) * h * 0.36); g.lineTo(x + h * 0.08 + Math.cos(1.15) * h * 0.36, y - h * 0.58 + Math.sin(1.15) * h * 0.36); g.stroke();
  }
  function figSword(g, x, y, h, color) {
    figBody(g, x, y, h, color);
    g.strokeStyle = STEEL; g.lineWidth = h * 0.07;
    g.beginPath(); g.moveTo(x + h * 0.14, y - h * 0.5); g.lineTo(x + h * 0.34, y - h * 1.02); g.stroke();
    g.beginPath(); g.moveTo(x - h * 0.3, y - h * 0.66); g.lineTo(x - h * 0.02, y - h * 0.66); g.lineTo(x - h * 0.04, y - h * 0.42); g.lineTo(x - h * 0.16, y - h * 0.3); g.lineTo(x - h * 0.28, y - h * 0.42); g.closePath();
    g.fillStyle = shade(color, -0.35); g.fill(); g.strokeStyle = '#efe4c8'; g.lineWidth = h * 0.04; g.stroke();
  }
  function figKnight(g, x, y, h, color) {
    g.lineCap = 'round'; g.strokeStyle = PAL.ink;
    // horse: legs, body, neck and head, tail
    g.lineWidth = h * 0.08;
    g.beginPath();
    for (const dx of [-0.28, -0.16, 0.18, 0.3]) { g.moveTo(x + dx * h, y - h * 0.36); g.lineTo(x + dx * h + (dx > 0 ? 0.04 : -0.02) * h, y); }
    g.stroke();
    g.beginPath(); g.ellipse(x, y - h * 0.44, h * 0.38, h * 0.15, 0, 0, Math.PI * 2); g.fillStyle = HORSE; g.fill(); g.lineWidth = h * 0.05; g.stroke();
    g.beginPath(); g.moveTo(x + h * 0.26, y - h * 0.5); g.lineTo(x + h * 0.44, y - h * 0.8); g.lineTo(x + h * 0.58, y - h * 0.74); g.lineTo(x + h * 0.5, y - h * 0.66); g.lineTo(x + h * 0.36, y - h * 0.42); g.closePath();
    g.fillStyle = HORSE; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - h * 0.36, y - h * 0.5); g.quadraticCurveTo(x - h * 0.52, y - h * 0.42, x - h * 0.48, y - h * 0.22); g.lineWidth = h * 0.07; g.stroke();
    // caparison in the house colour
    g.beginPath(); g.moveTo(x - h * 0.2, y - h * 0.58); g.lineTo(x + h * 0.16, y - h * 0.58); g.lineTo(x + h * 0.2, y - h * 0.3); g.lineTo(x - h * 0.24, y - h * 0.3); g.closePath();
    g.fillStyle = color; g.fill(); g.lineWidth = h * 0.04; g.stroke();
    // rider and lance
    g.beginPath(); g.moveTo(x - h * 0.1, y - h * 0.58); g.lineTo(x + h * 0.08, y - h * 0.58); g.lineTo(x + h * 0.05, y - h * 0.9); g.lineTo(x - h * 0.08, y - h * 0.9); g.closePath();
    g.fillStyle = shade(color, -0.25); g.fill(); g.stroke();
    g.beginPath(); g.arc(x - h * 0.01, y - h * 1.0, h * 0.11, 0, Math.PI * 2); g.fillStyle = STEEL; g.fill(); g.stroke();
    g.strokeStyle = WOOD; g.lineWidth = h * 0.05;
    g.beginPath(); g.moveTo(x - h * 0.3, y - h * 0.62); g.lineTo(x + h * 0.72, y - h * 1.18); g.stroke();
    g.beginPath(); g.moveTo(x + h * 0.52, y - h * 1.07); g.lineTo(x + h * 0.66, y - h * 1.0); g.lineTo(x + h * 0.6, y - h * 1.14); g.closePath(); g.fillStyle = color; g.fill();
  }
  function figCannon(g, x, y, h, color) {
    g.lineCap = 'round';
    g.strokeStyle = PAL.ink; g.lineWidth = h * 0.2;
    g.beginPath(); g.moveTo(x - h * 0.34, y - h * 0.22); g.lineTo(x + h * 0.42, y - h * 0.44); g.stroke();
    g.strokeStyle = IRON; g.lineWidth = h * 0.13; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = h * 0.03;
    g.beginPath(); g.moveTo(x - h * 0.3, y - h * 0.26); g.lineTo(x + h * 0.4, y - h * 0.47); g.stroke();
    g.beginPath(); g.moveTo(x - h * 0.4, y - h * 0.04); g.lineTo(x + h * 0.06, y - h * 0.26); g.lineTo(x + h * 0.1, y - h * 0.14); g.lineTo(x - h * 0.36, y + h * 0.02); g.closePath();
    g.fillStyle = color; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = h * 0.04; g.stroke();
    g.beginPath(); g.arc(x - h * 0.06, y - h * 0.12, h * 0.15, 0, Math.PI * 2); g.fillStyle = WOOD; g.fill(); g.lineWidth = h * 0.05; g.stroke();
    g.beginPath(); g.moveTo(x - h * 0.06, y - h * 0.27); g.lineTo(x - h * 0.06, y + h * 0.03); g.moveTo(x - h * 0.21, y - h * 0.12); g.lineTo(x + h * 0.09, y - h * 0.12); g.lineWidth = h * 0.025; g.stroke();
  }
  const FIG = [figSpear, figArcher, figKnight, figSword, figCannon];
  const SLOT = [0.42, 0.46, 0.92, 0.46, 0.86];  // width of each figure, in figure heights
  const ROW_ORDER = [4, 1, 0, 3, 2];             // back to front: cannons, archers, spears, swords, knights

  // how many figures of each type to show: grows with the square root of the army, so a crowd looks crowded
  function troopMix(u, cap) {
    const n = u.reduce((a, b) => a + b, 0);
    if (!n) return [0, 0, 0, 0, 0];
    const F = Math.min(cap || 26, n <= 3 ? n : Math.round(2.6 * Math.sqrt(n)));
    const out = u.map((k) => (k ? Math.max(1, Math.round((F * k) / n)) : 0));
    for (let guard = 0; out.reduce((a, b) => a + b, 0) > Math.max(F, out.filter(Boolean).length) && guard < 40; guard++) {
      let big = 0;
      for (let k = 1; k < out.length; k++) if (out[k] > out[big]) big = k;
      out[big]--;
    }
    return out;
  }
  // lay the figures out in rows inside a hex; returns the figure list and the block's bounds
  function troopLayout(u, S, seed, cap) {
    const mix = troopMix(u, cap), n = mix.reduce((a, b) => a + b, 0);
    const big = n > 12, h = S * (big ? 0.38 : 0.46), rowW = S * (big ? 1.55 : 1.25), dy = h * (big ? 0.3 : 0.42);
    const rnd = lcg(seed + 7);
    const rows = [[]];
    let w = 0;
    for (const k of ROW_ORDER) for (let c = 0; c < mix[k]; c++) {
      const sw = SLOT[k] * h;
      if (w + sw > rowW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
      rows[rows.length - 1].push({ k, sw }); w += sw;
    }
    const figs = [];
    const top = -((rows.length - 1) * dy) / 2;
    rows.forEach((row, r) => {
      const rw = row.reduce((a, f) => a + f.sw, 0);
      let x = -rw / 2 + (r % 2 ? h * 0.12 : 0);
      for (const f of row) { figs.push({ k: f.k, x: x + f.sw / 2 + (rnd() - 0.5) * h * 0.1, y: top + r * dy + (rnd() - 0.5) * h * 0.08 }); x += f.sw; }
    });
    const xs = figs.map((f) => f.x), half = Math.max(h * 0.4, ...xs.map((v) => Math.abs(v))) + h * 0.45;
    return { figs, h, half, top: top - h * 1.3, bottom: top + (rows.length - 1) * dy + h * 0.1, n };
  }
  // draw an army's crowd centred at (x, y); returns its bounding box
  function drawTroops(g, x, y, S, color, u, opts) {
    opts = opts || {};
    const L = troopLayout(u, S * (opts.scale || 1), opts.seed || 1, opts.cap);
    g.save(); g.translate(x, y);
    // the ground under a crowd darkens with its size
    g.fillStyle = `rgba(20,14,8,${Math.min(0.42, 0.18 + L.n * 0.016)})`;
    g.beginPath(); g.ellipse(0, L.bottom + L.h * 0.02, L.half * 0.98, L.h * 0.3 + (L.bottom - L.top - L.h * 1.4) * 0.35, 0, 0, Math.PI * 2); g.fill();
    if (opts.selected) { g.strokeStyle = '#fff6dc'; g.lineWidth = 2.2; g.stroke(); }
    if (opts.dim) g.globalAlpha = 0.55;
    const t = opts.walk != null ? opts.walk : null;
    L.figs.forEach((f, idx) => {
      const bob = t == null ? 0 : Math.abs(Math.sin(t * Math.PI * 7 + idx * 1.3)) * L.h * 0.08;
      FIG[f.k](g, f.x, f.y - bob, L.h, color);
    });
    g.restore();
    return { x: x - L.half, y: y + L.top, w: L.half * 2, h: L.bottom - L.top + L.h * 0.3, top: y + L.top };
  }
  // soldiers aboard: a broad transport with a striped sail and heads along the rail
  function drawTransport(g, x, y, S, color, n, opts) {
    g.save(); g.translate(x, y);
    if (opts.ready) { g.shadowColor = 'rgba(255,214,120,0.95)'; g.shadowBlur = 10; }
    const w = S * 1.05, h = S * 0.3;
    g.beginPath(); g.moveTo(-w / 2, -h * 0.1); g.quadraticCurveTo(0, h * 0.25, w / 2, -h * 0.25); g.lineTo(w / 2 - S * 0.16, h); g.lineTo(-w / 2 + S * 0.12, h); g.closePath();
    g.fillStyle = '#6a4a2a'; g.fill(); g.shadowBlur = 0; g.lineWidth = opts.selected ? 2.6 : 1.4; g.strokeStyle = opts.selected ? '#fff6dc' : PAL.ink; g.stroke();
    g.fillStyle = color; g.fillRect(-w / 2 + S * 0.1, h * 0.38, w - S * 0.24, h * 0.22);
    // heads and spear tips along the rail
    const heads = Math.min(7, 2 + Math.round(Math.sqrt(n)));
    for (let k = 0; k < heads; k++) {
      const hx = -w / 2 + S * 0.14 + (k + 0.5) * ((w - S * 0.3) / heads);
      g.beginPath(); g.arc(hx, -h * 0.08, S * 0.06, 0, Math.PI * 2); g.fillStyle = STEEL; g.fill(); g.lineWidth = 0.8; g.strokeStyle = PAL.ink; g.stroke();
      if (k % 2 === 0) { g.beginPath(); g.moveTo(hx + S * 0.04, -h * 0.05); g.lineTo(hx + S * 0.04, -S * 0.36); g.strokeStyle = WOOD; g.lineWidth = 1; g.stroke(); }
    }
    // square sail in stripes
    g.beginPath(); g.moveTo(0, -h * 0.1); g.lineTo(0, -S * 0.78); g.lineWidth = 1.6; g.strokeStyle = PAL.ink; g.stroke();
    const sw = S * 0.46, sh = S * 0.42, sy = -S * 0.74;
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#efe4c8' : color; g.fillRect(-sw / 2 + (k * sw) / 4, sy, sw / 4, sh); }
    g.strokeStyle = PAL.ink; g.lineWidth = 1.1; g.strokeRect(-sw / 2, sy, sw, sh);
    g.font = `700 ${S * 0.3}px "Alegreya Sans", "Gill Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(20,16,10,0.9)'; g.strokeText(String(n), 0, h * 0.62); g.fillStyle = '#fffaf0'; g.fillText(String(n), 0, h * 0.62);
    if (opts.dim) { g.globalAlpha = 0.35; g.fillStyle = '#15120e'; g.fillRect(-w / 2, sy, w, -sy + h); }
    g.restore();
    return { x: x - w / 2, y: y + sy, w, h: -sy + h };
  }
  const WASH = { hue: 0.7, tint: 0.22 };
  CC.WASH = WASH;
  // drawn flags as tiny canvases, cached by colour and design
  const flagCache = new Map();
  function flagImage(flag, hex) {
    flag = CC.fullFlag(flag);
    if (!flag || typeof document === 'undefined') return null;
    const key = hex + flag;
    let cv = flagCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = CC.FLAG_W; cv.height = CC.FLAG_H;
    const fg = cv.getContext('2d'), pal = CC.flagPalette(hex);
    for (let k = 0; k < flag.length; k++) { fg.fillStyle = pal[+flag[k]]; fg.fillRect(k % CC.FLAG_W, (k / CC.FLAG_W) | 0, 1, 1); }
    flagCache.set(key, cv);
    return cv;
  }
  CC.flagImage = flagImage;

  // ------------------------------------------------------------ battle scene for the report
  // The attacker's army stands on the left facing right, the defender's on the right facing left.
  // phase 0: everyone standing; phase 1: the fallen lie greyed on the field. k (0..1) eases between them.
  function drawBattle(cv, b, colors, k) {
    const g = cv.getContext('2d'), dpr = cv.width / cv.clientWidth || 1, W = cv.clientWidth, H = cv.clientHeight;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // sky and ground
    const sky = g.createLinearGradient(0, 0, 0, H * 0.42);
    sky.addColorStop(0, '#2b3446'); sky.addColorStop(1, '#6d6a62');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.42);
    const ground = { plains: ['#8d9a55', '#6b7a3c'], forest: ['#61794a', '#465c33'], hills: ['#a98a55', '#7c6436'] }[b.terrain] || ['#8d9a55', '#6b7a3c'];
    const gg = g.createLinearGradient(0, H * 0.4, 0, H);
    gg.addColorStop(0, ground[0]); gg.addColorStop(1, ground[1]);
    g.fillStyle = gg; g.fillRect(0, H * 0.4, W, H * 0.6);
    const R = lcg(b.tile + 7);
    if (b.terrain === 'hills') {
      g.fillStyle = 'rgba(70,52,28,0.35)';
      for (let x = -40; x < W + 40; x += 90) { g.beginPath(); g.ellipse(x + R() * 30, H * 0.43, 70, 22, 0, Math.PI, 0); g.fill(); }
    }
    if (b.terrain === 'forest') {
      for (let x = 6; x < W; x += 16 + R() * 10) {
        const y = H * 0.4 + R() * 6, r = 7 + R() * 5;
        g.fillStyle = '#3c5230'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }
    if (b.river) {
      g.fillStyle = 'rgba(90,140,180,0.85)';
      g.beginPath(); g.moveTo(W * 0.47, H * 0.4); g.quadraticCurveTo(W * 0.53, H * 0.7, W * 0.48, H); g.lineTo(W * 0.54, H); g.quadraticCurveTo(W * 0.58, H * 0.7, W * 0.51, H * 0.4); g.closePath(); g.fill();
    }
    // the town's walls behind the defenders
    if (b.cityName || b.tower) {
      const wx = W * 0.6, wy = H * 0.24, ww = W * 0.4, wh = H * 0.2 + (b.walls || 0) * H * 0.04;
      g.fillStyle = '#8f887e'; g.fillRect(wx, wy + H * 0.2 - wh + H * 0.02, ww, wh);
      g.fillStyle = '#6f685f';
      for (let x = wx; x < wx + ww; x += 12) g.fillRect(x, wy + H * 0.2 - wh + H * 0.02 - 6, 7, 6);
      g.fillStyle = colors[1]; g.fillRect(wx + ww * 0.5, wy + H * 0.2 - wh - 20, 14, 9);
      g.strokeStyle = '#2a2018'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(wx + ww * 0.5, wy + H * 0.2 - wh - 20); g.lineTo(wx + ww * 0.5, wy + H * 0.2 - wh + 4); g.stroke();
    }
    // figures: one per soldier, or one per few soldiers in a big battle
    const most = Math.max(sum5(b.att), sum5(b.def) + (b.militia || 0));
    const per = Math.max(1, Math.ceil(most / 36));
    const FRONT = [2, 3, 0, 1, 4]; // knights and swords in front, cannons at the back
    const side = (before, after, militia, color, dir) => {
      const list = [];
      for (const t of FRONT) {
        const n = Math.ceil((before[t] || 0) / per), dead = Math.min(n, Math.round(((before[t] || 0) - (after[t] || 0)) / per));
        for (let j = 0; j < n; j++) list.push({ t, dead: j < dead });
      }
      if (militia) for (let j = 0; j < Math.ceil(militia / per); j++) list.push({ t: 0, dead: false, militia: true });
      const rows = list.length > 24 ? 4 : list.length > 8 ? 3 : 2;
      const h = Math.min(H * 0.2, (W * 0.4) / Math.max(4, Math.ceil(list.length / rows)) / 0.62);
      const colW = h * 0.62, cx = W / 2;
      list.forEach((f, idx) => {
        const col = Math.floor(idx / rows), row = idx % rows;
        const depth = 0.55 + 0.45 * ((row + 1) / rows);
        const x = cx + dir * (W * 0.06 + col * colW + (row % 2) * colW * 0.4 + (f.t === 2 ? colW * 0.2 : 0));
        const y = H * 0.48 + (H * 0.46) * ((row + 1) / rows);
        const hh = h * depth;
        g.save(); g.translate(x, y); g.scale(dir, 1);
        if (f.dead && k > 0) {
          g.globalAlpha = 1 - 0.45 * k;
          g.translate(-hh * 0.1 * k, 0); g.rotate(-1.35 * k);
          FIG[f.t](g, 0, 0, hh, k > 0.5 ? '#6b6257' : color);
        } else FIG[f.t](g, 0, 0, hh, f.militia ? '#b7a98a' : color);
        g.restore();
      });
    };
    side(b.att, b.attAfter, 0, colors[0], -1);
    side(b.def, b.defAfter, b.militia, colors[1], 1);
    return per;
  }
  const sum5 = (u) => (u || []).reduce((a, x) => a + (x || 0), 0);
  CC.drawBattle = drawBattle;

  function drawBanner(g, x, y, S, color, n, opts) {
    const w = opts.flag ? S * 0.96 : S * (n >= 100 ? 1.12 : n >= 10 ? 0.92 : 0.72), h = S * 0.56;
    g.save(); g.translate(x, y);
    if (opts.ready) { g.shadowColor = 'rgba(255,214,120,0.95)'; g.shadowBlur = 10; }
    g.beginPath();
    g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h / 2 - 2); g.lineTo(0, h / 2 + S * 0.16); g.lineTo(-w / 2, h / 2 - 2); g.closePath();
    g.fillStyle = color; g.fill();
    g.shadowBlur = 0;
    if (opts.flag) { g.save(); g.clip(); g.imageSmoothingEnabled = false; g.drawImage(opts.flag, -w / 2, -h / 2, w, h + S * 0.16); g.restore(); }
    g.lineWidth = opts.selected ? 3 : 1.6; g.strokeStyle = opts.selected ? '#fff6dc' : PAL.ink; g.stroke();
    if (opts.ready) { g.lineWidth = 1.5; g.strokeStyle = '#ffd77a'; g.strokeRect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 6); }
    g.font = `700 ${S * 0.4}px "Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const light = !opts.flag && isLight(color);
    if (opts.flag) { g.lineWidth = Math.max(2, S * 0.12); g.lineJoin = 'round'; g.strokeStyle = 'rgba(20,16,10,0.92)'; g.strokeText(String(n), 0, 0.5); }
    g.fillStyle = light ? PAL.ink : '#fffaf0';
    g.fillText(String(n), 0, 0.5);
    if (opts.dim) { g.fillStyle = 'rgba(20,16,10,0.35)'; g.fillRect(-w / 2, -h / 2, w, h); }
    g.restore();
    return { x: x - w / 2, y: y - h / 2, w, h: h + S * 0.16 };
  }
  function isLight(hex) {
    if (hex[0] !== '#') return false;
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
  }

  function drawSwords(g, x, y, S, pct) {
    g.save(); g.translate(x, y);
    const col = pct >= 70 ? '#7fc35a' : pct >= 45 ? '#f0b13c' : '#e5533e';
    g.beginPath(); g.arc(0, 0, S * 0.36, 0, Math.PI * 2); g.fillStyle = 'rgba(20,16,10,0.82)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = col; g.stroke();
    g.font = `700 ${S * 0.3}px "Alegreya Sans", "Gill Sans", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    g.fillText(pct + '%', 0, 1);
    g.restore();
  }
  function drawShip(g, x, y, S, color, n, opts) {
    g.save(); g.translate(x, y);
    if (opts.ready) { g.shadowColor = 'rgba(255,214,120,0.95)'; g.shadowBlur = 10; }
    const w = S * 0.9, h = S * 0.28;
    // hull
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.lineTo(w / 2 - S * 0.14, h); g.lineTo(-w / 2 + S * 0.14, h); g.closePath();
    g.fillStyle = '#5a3d22'; g.fill(); g.shadowBlur = 0; g.lineWidth = opts.selected ? 2.6 : 1.4; g.strokeStyle = opts.selected ? '#fff6dc' : PAL.ink; g.stroke();
    g.fillStyle = PAL.ink;
    // warships show gun ports; merchant ships carry no guns but a cargo of gold
    if (!opts.merchant) for (let k = -1; k <= 1; k++) g.fillRect(k * S * 0.2 - S * 0.035, h * 0.28, S * 0.07, S * 0.06);
    // mast and sail in the owner's colour
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -S * 0.62); g.lineWidth = 1.6; g.strokeStyle = PAL.ink; g.stroke();
    g.beginPath(); g.moveTo(1, -S * 0.58); g.quadraticCurveTo(S * 0.38, -S * 0.32, 1, -S * 0.06); g.closePath();
    g.fillStyle = opts.merchant ? '#efe4c8' : color; g.fill(); g.lineWidth = 1.2; g.stroke();
    if (opts.merchant) {
      g.beginPath(); g.moveTo(1, -S * 0.4); g.quadraticCurveTo(S * 0.3, -S * 0.32, 1, -S * 0.24); g.closePath(); g.fillStyle = color; g.fill();
      g.beginPath(); g.moveTo(0, -S * 0.62); g.lineTo(-S * 0.2, -S * 0.56); g.lineTo(0, -S * 0.5); g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 1; g.stroke();
      g.beginPath(); g.arc(-S * 0.3, -S * 0.04, S * 0.09, 0, Math.PI * 2); g.fillStyle = PAL.gold; g.fill(); g.lineWidth = 1; g.strokeStyle = PAL.goldDark; g.stroke();
      g.strokeStyle = PAL.ink;
    }
    g.beginPath(); g.moveTo(-1, -S * 0.5); g.quadraticCurveTo(-S * 0.26, -S * 0.3, -1, -S * 0.1); g.closePath();
    g.fillStyle = '#efe4c8'; g.fill(); g.stroke();
    // count
    g.font = `700 ${S * 0.3}px "Alegreya Sans", "Gill Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(20,16,10,0.9)'; g.strokeText(String(n), 0, h * 0.55 + 1); g.fillStyle = '#fffaf0'; g.fillText(String(n), 0, h * 0.55 + 1);
    if (opts.dim) { g.globalAlpha = 0.35; g.fillStyle = '#15120e'; g.fillRect(-w / 2, -S * 0.62, w, S * 0.62 + h); }
    g.restore();
    return { x: x - w / 2, y: y - S * 0.62, w, h: S * 0.62 + h };
  }
  function drawMarket(g, x, y, S, name, value, z) {
    g.save(); g.translate(x, y);
    g.beginPath(); g.ellipse(0, S * 0.18, S * 0.62, S * 0.26, 0, 0, Math.PI * 2); g.fillStyle = '#c9b178'; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = PAL.ink; g.stroke();
    // a palm and a stack of gold
    g.beginPath(); g.moveTo(-S * 0.18, S * 0.18); g.quadraticCurveTo(-S * 0.24, -S * 0.15, -S * 0.1, -S * 0.42); g.lineWidth = 2; g.strokeStyle = '#6b4a24'; g.stroke();
    g.fillStyle = '#3f7a3a';
    for (const a of [-2.6, -1.9, -1.2, -0.5]) { g.beginPath(); g.ellipse(-S * 0.1 + Math.cos(a) * S * 0.16, -S * 0.42 + Math.sin(a) * S * 0.08, S * 0.16, S * 0.05, a, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(S * 0.22, S * 0.08, S * 0.15, 0, Math.PI * 2); g.fillStyle = PAL.gold; g.fill(); g.lineWidth = 1.2; g.strokeStyle = PAL.goldDark; g.stroke();
    g.fillStyle = PAL.goldDark; g.font = `800 ${S * 0.2}px "Alegreya Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', S * 0.22, S * 0.09);
    g.restore();
    if (S * z >= 11) {
      g.save();
      g.font = `600 ${S * 0.36}px "Alegreya Sans", "Gill Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,16,10,0.85)'; g.lineJoin = 'round';
      const label = `${CC.tr ? CC.tr(name) : name} · +${value}`;
      g.strokeText(label, x, y + S * 0.5); g.fillStyle = '#ffd77a'; g.fillText(label, x, y + S * 0.5);
      g.restore();
    }
  }

  // a colonial trading post: a moored buoy with an anchor, where a fleet docks to trade
  function drawPort(g, x, y, S, name, value, z) {
    g.save(); g.translate(x, y);
    g.beginPath(); g.arc(0, 0, S * 0.42, 0, Math.PI * 2); g.fillStyle = 'rgba(239,228,200,0.92)'; g.fill();
    g.lineWidth = 2.2; g.strokeStyle = PAL.gold; g.stroke(); g.lineWidth = 1; g.strokeStyle = PAL.ink; g.beginPath(); g.arc(0, 0, S * 0.46, 0, Math.PI * 2); g.stroke();
    // anchor
    g.strokeStyle = PAL.ink; g.lineWidth = Math.max(1.3, S * 0.07); g.lineCap = 'round';
    g.beginPath(); g.arc(0, -S * 0.2, S * 0.07, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -S * 0.13); g.lineTo(0, S * 0.24); g.moveTo(-S * 0.13, -S * 0.04); g.lineTo(S * 0.13, -S * 0.04); g.stroke();
    g.beginPath(); g.arc(0, S * 0.04, S * 0.2, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    g.restore();
    if (S * z >= 11) {
      g.save();
      g.font = `600 ${S * 0.36}px "Alegreya Sans", "Gill Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,16,10,0.85)'; g.lineJoin = 'round';
      const label = `${CC.tr ? CC.tr(name) : name} · +${value}`;
      g.strokeText(label, x, y + S * 0.52); g.fillStyle = '#ffd77a'; g.fillText(label, x, y + S * 0.52);
      g.restore();
    }
  }

  function drawFlag(g, x, y, S, color) {
    g.save(); g.translate(x, y);
    g.lineWidth = 2; g.strokeStyle = PAL.ink;
    g.beginPath(); g.moveTo(0, S * 0.35); g.lineTo(0, -S * 0.45); g.stroke();
    g.beginPath(); g.moveTo(0, -S * 0.45); g.lineTo(S * 0.42, -S * 0.3); g.lineTo(0, -S * 0.14); g.closePath();
    g.fillStyle = color; g.fill(); g.lineWidth = 1.4; g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------ frame
  Renderer.prototype.draw = function () {
    const g = this.ctx, st = this.st, S = this.S, { w, h, dpr } = this.view, cam = this.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAL.deep; g.fillRect(0, 0, w, h);
    if (!st || !this.cache) return;
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
    const ws = this.worldSize(), P = this.period(), copies = [];
    g.imageSmoothingEnabled = true;
    if (P) for (let n = Math.floor((cam.x - this.pad) / P) - 1; this.pad + n * P < cam.x + w / cam.z + S * 2; n++) { g.drawImage(this.cache, this.pad + n * P, 0, P, ws.h); copies.push(n * P); }
    else { g.drawImage(this.cache, 0, 0, ws.w, ws.h); copies.push(0); }
    this.banners = [];
    for (const ox of copies) { g.save(); g.translate(ox, 0); this.drawLayer(g, ox); g.restore(); }
  };
  // everything above the terrain, for the copy of the map shifted by ox
  Renderer.prototype.drawLayer = function (g, ox) {
    const st = this.st, S = this.S, { w, h } = this.view, cam = this.cam;
    const x0 = cam.x - ox - S * 2, y0 = cam.y - S * 2, x1 = cam.x - ox + w / cam.z + S * 2, y1 = cam.y + h / cam.z + S * 2;
    const vis = [];
    for (let i = 0; i < st.tiles.length; i++) { const p = this.center(i); if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) vis.push(i); }
    const ov = this.ov;

    // territory wash, one path per owner
    const byOwner = new Map();
    for (const i of vis) { const o = st.tiles[i].owner; if (o === -1 && st.tiles[i].b !== 'city') continue; if (!byOwner.has(o)) byOwner.set(o, []); byOwner.get(o).push(i); }
    for (const [o, list] of byOwner) {
      g.beginPath();
      for (const i of list) { const p = this.center(i); hexPath(g, p.x, p.y, S + 0.4); }
      const col = CC.colorOf(st, o);
      if (o < 0) { g.fillStyle = rgba(col, 0.3); g.fill(); continue; }
      // the house's own colour: its hue laid over the land (so forests and hills still show), then a light wash
      g.save();
      g.globalCompositeOperation = 'color'; g.fillStyle = rgba(col, WASH.hue); g.fill();
      g.globalCompositeOperation = 'source-over'; g.fillStyle = rgba(col, WASH.tint); g.fill();
      g.restore();
    }
    // borders
    for (const [o, list] of byOwner) {
      g.beginPath();
      const inset = S - 2.2;
      for (const i of list) {
        const p = this.center(i);
        for (let d = 0; d < 6; d++) {
          const j = st._nb6[i][d];
          if (j >= 0 && st.tiles[j].owner === o && !(o < 0)) continue;
          const [a, b] = EDGE[d];
          g.moveTo(p.x + inset * CO[a][0], p.y + inset * CO[a][1]); g.lineTo(p.x + inset * CO[b][0], p.y + inset * CO[b][1]);
        }
      }
      g.lineCap = 'round';
      g.lineWidth = 5; g.strokeStyle = 'rgba(20,14,8,0.35)'; g.stroke();
      g.lineWidth = 3; g.strokeStyle = CC.colorOf(st, o); g.stroke();
    }

    // reach veil for the army being ordered
    if (ov.reach) {
      g.beginPath();
      for (const i of vis) if (!(ov.reach.dist[i] <= ov.reach.mp)) { const p = this.center(i); hexPath(g, p.x, p.y, S + 0.5); }
      g.fillStyle = 'rgba(12,10,8,0.42)'; g.fill();
    }
    // enemy zones of control while planning a march
    if (ov.zoc && ov.zoc.size) {
      g.beginPath();
      for (const i of vis) if (ov.zoc.has(i)) { const p = this.center(i); hexPath(g, p.x, p.y, S - 1.5); }
      g.fillStyle = 'rgba(214,60,45,0.2)'; g.fill();
      g.setLineDash([3, 4]); g.lineWidth = 1.4; g.strokeStyle = 'rgba(240,120,100,0.55)'; g.stroke(); g.setLineDash([]);
    }
    // painted region
    if (ov.plan && ov.plan.region.length) {
      const pl = ov.plan, col = ov.planColor || '#ffffff';
      g.beginPath();
      for (const i of pl.region) if (!pl.bad.has(i)) { const p = this.center(i); hexPath(g, p.x, p.y, S - 1); }
      g.fillStyle = rgba(col, 0.42); g.fill();
      g.save(); g.clip();
      g.strokeStyle = 'rgba(255,250,235,0.35)'; g.lineWidth = 2;
      g.beginPath();
      for (let d = x0 - (y1 - y0); d < x1; d += 9) { g.moveTo(d, y0); g.lineTo(d + (y1 - y0), y1); }
      g.stroke(); g.restore();
      if (pl.bad.size) {
        g.beginPath();
        for (const i of pl.bad) { const p = this.center(i); hexPath(g, p.x, p.y, S - 1); }
        g.fillStyle = 'rgba(214,60,45,0.55)'; g.fill();
      }
      // outline of the whole region
      const set = new Set(pl.region);
      g.beginPath();
      for (const i of pl.region) {
        const p = this.center(i);
        for (let d = 0; d < 6; d++) {
          const j = st._nb6[i][d];
          if (j >= 0 && set.has(j)) continue;
          const [a, b] = EDGE[d];
          g.moveTo(p.x + S * CO[a][0], p.y + S * CO[a][1]); g.lineTo(p.x + S * CO[b][0], p.y + S * CO[b][1]);
        }
      }
      g.setLineDash([5, 4]); g.lineWidth = 2.2; g.strokeStyle = '#fff6dc'; g.stroke(); g.setLineDash([]);
    }
    if (ov.flash && ov.flash.tiles.length) {
      const f = ov.flash;
      g.beginPath();
      for (const i of f.tiles) { const p = this.center(i); hexPath(g, p.x, p.y, S - 1); }
      g.fillStyle = rgba(f.color, 0.5 * (f.alpha == null ? 1 : f.alpha)); g.fill();
      g.lineWidth = 2; g.strokeStyle = rgba('#fff6dc', 0.7 * (f.alpha == null ? 1 : f.alpha)); g.stroke();
    }

    // sea lanes: the possible trade routes, faint until a house sails them
    if ((st._lanes || []).length) {
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      const lane = (path) => { g.beginPath(); this.trail(path).forEach((p, k) => { if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); };
      for (const path of st._lanes) { lane(path); g.setLineDash([]); g.lineWidth = S * 0.22; g.strokeStyle = 'rgba(14,30,40,0.18)'; g.stroke(); }
      for (const path of st._lanes) { lane(path); g.setLineDash([S * 0.1, S * 0.28]); g.lineWidth = Math.max(1.4, S * 0.08); g.strokeStyle = 'rgba(239,228,200,0.42)'; g.stroke(); }
      g.restore();
    }
    // trade routes: dashed lines in the trader's colour, red where an enemy cuts them
    for (const r of ov.routes || []) {
      if (r.path.length < 2) continue;
      g.beginPath();
      this.trail(r.path).forEach((p, k) => { if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
      g.setLineDash(r.kind === 'caravan' ? [3, 5] : [8, 6]);
      g.lineWidth = 3.4; g.strokeStyle = 'rgba(20,14,8,0.45)'; g.stroke();
      g.lineWidth = 2; g.strokeStyle = r.ok ? rgba(r.color, 0.95) : 'rgba(229,83,62,0.95)'; g.stroke();
      g.setLineDash([]);
      if (!r.ok && r.blockAt != null) { const p = this.center(r.blockAt); g.beginPath(); g.arc(p.x, p.y, S * 0.5, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = 'rgba(229,83,62,0.95)'; g.stroke(); }
    }
    for (const reg of st._regions || []) {
      const p = this.center(reg.tile);
      g.save(); g.font = `italic 700 ${S * (cam.z < 0.6 ? 1.1 : 0.62)}px "IM Fell English SC", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,28,12,0.55)'; const rn = CC.tr ? CC.tr(reg.name) : reg.name; g.strokeText(rn, p.x, p.y); g.fillStyle = 'rgba(250,236,200,0.9)'; g.fillText(rn, p.x, p.y);
      g.restore();
    }
    for (const post of st._posts || []) { const p = this.center(post.tile); (post.colony ? drawPort : drawMarket)(g, p.x, p.y, S, post.name, post.value, cam.z); }
    // fleet course preview and bombardment targets
    if (ov.course && ov.course.length > 1) {
      g.beginPath();
      this.trail(ov.course).forEach((p, k) => { if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
      g.setLineDash([6, 5]); g.lineWidth = 3; g.strokeStyle = ov.courseOk ? '#fff6dc' : 'rgba(229,83,62,0.9)'; g.stroke(); g.setLineDash([]);
    }
    if (ov.fleetReach) {
      g.beginPath();
      for (const i of vis) if ((st.tiles[i].t === 'water' || st.tiles[i].river) && ov.fleetReach[i] > 0) { const p = this.center(i); hexPath(g, p.x, p.y, S - 2); }
      g.fillStyle = 'rgba(255,246,220,0.10)'; g.fill();
    }
    if (ov.landing) {
      g.beginPath();
      for (const i of ov.landing) { const p = this.center(i); hexPath(g, p.x, p.y, S - 3); }
      g.lineWidth = 2.4; g.setLineDash([5, 4]); g.strokeStyle = 'rgba(255,215,122,0.9)'; g.stroke(); g.setLineDash([]);
    }
    // marches queued for your next turn: dashed outlines with their number at the end
    if (ov.queued) ov.queued.list.forEach((q, k) => {
      g.beginPath();
      for (const i of q.region) { const p = this.center(i); hexPath(g, p.x, p.y, S - 3); }
      g.setLineDash([3, 4]); g.lineWidth = 2.2; g.strokeStyle = ov.queued.color; g.stroke(); g.setLineDash([]);
      const p = this.center(q.dest), r = S * 0.3;
      g.beginPath(); g.arc(p.x, p.y - S * 0.55, r, 0, Math.PI * 2); g.fillStyle = 'rgba(20,16,10,0.85)'; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = ov.queued.color; g.stroke();
      g.font = `700 ${Math.round(r * 1.3)}px "Alegreya Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff6dc'; g.fillText(String(k + 1), p.x, p.y - S * 0.55 + 1);
    });
    // starting sites while houses choose their capitals
    // markers keep a readable size on screen however far the map is zoomed out
    const zk = this.cam && this.cam.z ? 1 / this.cam.z : 1;
    for (const site of ov.sites || []) {
      const p = this.center(site.i);
      g.beginPath(); hexPath(g, p.x, p.y, S - 2);
      g.fillStyle = site.sel ? 'rgba(255,215,122,0.45)' : site.ok ? 'rgba(255,215,122,0.22)' : 'rgba(30,30,30,0.18)'; g.fill();
      g.lineWidth = site.sel ? 3.6 : 2.4; if (!site.ok) g.setLineDash([3, 4]);
      g.strokeStyle = site.ok ? 'rgba(255,215,122,0.95)' : 'rgba(210,200,180,0.45)'; g.stroke(); g.setLineDash([]);
      if (site.ok && S < 13 * zk) {
        g.beginPath(); g.arc(p.x, p.y, 13 * zk, 0, Math.PI * 2);
        g.lineWidth = (site.sel ? 4 : 2.6) * zk; g.strokeStyle = 'rgba(255,215,122,0.95)'; g.stroke();
        g.fillStyle = site.sel ? 'rgba(255,215,122,0.5)' : 'rgba(255,215,122,0.2)'; g.fill();
      }
      if (site.ok) {
        // a little tent: where a capital may rise
        const r = Math.max(S * 0.34, 7 * zk);
        g.beginPath(); g.moveTo(p.x - r, p.y + r * 0.6); g.lineTo(p.x, p.y - r * 0.8); g.lineTo(p.x + r, p.y + r * 0.6); g.closePath();
        g.fillStyle = 'rgba(255,240,200,0.92)'; g.fill(); g.lineWidth = Math.max(1.2, 1.2 * zk); g.strokeStyle = 'rgba(70,50,20,0.9)'; g.stroke();
        g.beginPath(); g.moveTo(p.x, p.y - r * 0.8); g.lineTo(p.x, p.y - r * 1.25); g.stroke();
      }
    }
    for (const i of ov.targets || []) {
      const p = this.center(i);
      g.beginPath(); hexPath(g, p.x, p.y, S - 2); g.lineWidth = 3; g.setLineDash([4, 3]); g.strokeStyle = 'rgba(240,110,70,0.95)'; g.stroke(); g.setLineDash([]);
    }

    // buildings
    for (const i of vis) {
      const t = st.tiles[i], p = this.center(i);
      if (t.b === 'farm') drawFarm(g, p.x, p.y, S);
      else if (t.b === 'mine') drawMine(g, p.x, p.y, S);
      else if (t.b === 'tower') drawTower(g, p.x, p.y, S, CC.colorOf(st, t.owner));
      else if (t.b === 'port') drawDock(g, p.x, p.y, S, CC.colorOf(st, t.owner), st._nb[i].find((j) => st.tiles[j].t === 'water'), this.center.bind(this));
    }
    // work in progress: scaffolding where something is being built
    for (const b of st.builds || []) {
      if (b.tile == null) continue;
      const p = this.center(b.tile);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      drawScaffold(g, p.x, p.y, S, CC.colorOf(st, b.owner));
    }
    for (const c of st.cities) {
      const p = this.center(c.tile);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      drawCity(g, c, p.x, p.y, S, CC.colorOf(st, c.owner), cam.z, this.flagFor(c.owner));
    }
    if (ov.coach && ov.coach.length) {
      g.save();
      g.shadowColor = 'rgba(255,214,120,0.9)'; g.shadowBlur = 12;
      g.beginPath();
      for (const i of ov.coach) { if (i < 0) continue; const p = this.center(i); hexPath(g, p.x, p.y, S - 2.5); }
      g.lineWidth = 3.5; g.strokeStyle = '#ffd77a'; g.setLineDash([7, 4]); g.stroke(); g.setLineDash([]);
      g.restore();
    }
    // order markers
    if (ov.plan) {
      for (const b of ov.plan.battles) { const p = this.center(b.tile); drawSwords(g, p.x - S * 0.42, p.y + S * 0.34, S, Math.round(b.p * 100)); }
      if (ov.plan.region.length || ov.plan.dest !== ov.plan.origin) {
        const p = this.center(ov.plan.dest); drawFlag(g, p.x - S * 0.1, p.y - S * 0.05, S, ov.planColor || '#fff');
      }
    }
    // armies
    const hidden = new Set(this.anims.filter((a) => a.kind === 'march').map((a) => a.hide));
    const px = S * cam.z; // on-screen hex size: tiny maps show plain banners, closer views show the crowd
    for (const a of st.armies) {
      const p = this.center(a.tile);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1 || hidden.has(a.tile)) continue;
      const inCity = st.tiles[a.tile].b === 'city' || st.tiles[a.tile].b === 'tower';
      const mine = ov.readyOwner === a.owner;
      const left = mine ? CC.movesLeft(a) : 0, full = a.sea ? CC.RULES.transportMP : CC.armyStats(a.u).mp;
      const color = CC.colorOf(st, a.owner), n = CC.sum(a.u);
      const look = { ready: mine && left > 0, selected: ov.selArmy === a.id, dim: mine && left <= 0, flag: this.flagFor(a.owner) };
      let r;
      if (a.sea) r = drawTransport(g, p.x, p.y + S * 0.12, S, color, n, look);
      // a garrison's banner stands left of the town, clear of the town's flag on the right
      else if (inCity || px < 10) r = drawBanner(g, p.x + (inCity ? (st.tiles[a.tile].b === 'city' && this.flagFor(st.tiles[a.tile].owner) ? -S * 0.7 : S * 0.66) : 0), p.y + (inCity ? -S * 0.42 : -S * 0.12), S, color, n, look);
      else r = this.drawArmy(g, p.x, p.y, a.u, color, n, Object.assign({ seed: a.id }, look));
      if (mine) {
        // steps left this turn, as a thin bar under the banner
        const bw = r.w - 4, y0 = r.y + r.h + 2;
        g.fillStyle = 'rgba(15,12,9,0.85)'; g.fillRect(r.x + 2, y0, bw, 4);
        g.fillStyle = left > 0 ? '#ffd77a' : '#6b5a44'; g.fillRect(r.x + 2, y0, bw * Math.min(1, left / full), 4);
      }
      this.banners.push({ id: a.id, ...r, x: r.x + ox });
    }
    const t = now();
    for (const an of this.anims) {
      const k = Math.min(1, Math.max(0, (t - an.t0) / an.dur));
      if (an.kind === 'march') {
        const total = an.lens[an.lens.length - 1], want = ease(k) * total;
        let j = 1;
        while (j < an.lens.length - 1 && an.lens[j] < want) j++;
        const seg = an.lens[j] - an.lens[j - 1] || 1, f = (want - an.lens[j - 1]) / seg;
        const x = an.pts[j - 1].x + (an.pts[j].x - an.pts[j - 1].x) * f;
        const y = an.pts[j - 1].y + (an.pts[j].y - an.pts[j - 1].y) * f;
        const bob = Math.abs(Math.sin(k * Math.PI * 7)) * 3;
        if (!an.look && !Array.isArray(an.n)) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x, y + S * 0.28, S * 0.32, S * 0.1, 0, 0, Math.PI * 2); g.fill(); }
        if (an.look === 'ship') drawShip(g, x, y + S * 0.1, S, an.color, an.n, { merchant: an.merchant });
        else if (an.look === 'transport') drawTransport(g, x, y + S * 0.12, S, an.color, CC.sum(an.n), {});
        else {
          const ow = st.players.findIndex((pl) => CC.colorOf(st, pl.id) === an.color), flag = ow >= 0 ? this.flagFor(ow) : null;
          if (Array.isArray(an.n) && px >= 10) this.drawArmy(g, x, y, an.n, an.color, CC.sum(an.n), { seed: 3, walk: k, flag });
          else drawBanner(g, x, y - S * 0.12 - bob, S, an.color, Array.isArray(an.n) ? CC.sum(an.n) : an.n, { ready: false, selected: false, flag });
        }
      } else if (an.kind === 'pulse') {
        const p = this.center(an.tile);
        g.save(); g.globalAlpha = 1 - k;
        g.beginPath(); hexPath(g, p.x, p.y, S * (0.9 + 0.45 * ease(k)));
        g.lineWidth = 3; g.strokeStyle = an.color; g.stroke();
        g.restore();
      }
    }
    for (const f of st.fleets || []) {
      const p = this.center(f.tile);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const mine = ov.readyOwner === f.owner;
      const left = mine ? CC.fleetMovesLeft(f) : 0;
      const r = drawShip(g, p.x, p.y + S * 0.1, S, CC.colorOf(st, f.owner), f.n, { ready: mine && (left > 0 || (!f.fired && !CC.isMerchant(f))), selected: ov.selFleet === f.id, dim: mine && left <= 0 && (f.fired || CC.isMerchant(f)), merchant: CC.isMerchant(f) });
      this.banners.push({ id: f.id, fleet: true, ...r, x: r.x + ox });
    }
    // hover and selection outlines
    const outline = (i, col, wdt) => { if (i < 0) return; const p = this.center(i); g.beginPath(); hexPath(g, p.x, p.y, S - 1.5); g.lineWidth = wdt; g.strokeStyle = col; g.stroke(); };
    if (ov.selTile != null) outline(ov.selTile, '#fff6dc', 3);
    if (ov.hover != null) outline(ov.hover, 'rgba(255,246,220,0.75)', 2);
  };

  // army banner under a screen point, if any
  // a fleet's ship under a screen point, if any
  Renderer.prototype.shipAt = function (sx, sy) {
    const wx = sx / this.cam.z + this.cam.x, wy = sy / this.cam.z + this.cam.y;
    for (let k = this.banners.length - 1; k >= 0; k--) {
      const b = this.banners[k];
      if (b.fleet && wx >= b.x - 3 && wx <= b.x + b.w + 3 && wy >= b.y - 3 && wy <= b.y + b.h + 3) return b.id;
    }
    return null;
  };
  Renderer.prototype.bannerAt = function (sx, sy) {
    const wx = sx / this.cam.z + this.cam.x, wy = sy / this.cam.z + this.cam.y;
    for (let k = this.banners.length - 1; k >= 0; k--) {
      const b = this.banners[k];
      if (!b.fleet && wx >= b.x - 2 && wx <= b.x + b.w + 2 && wy >= b.y - 2 && wy <= b.y + b.h + 2) return b.id;
    }
    return null;
  };

  CC.Renderer = Renderer;
  CC.rgba = rgba;
})(typeof window !== 'undefined' ? window : globalThis);
