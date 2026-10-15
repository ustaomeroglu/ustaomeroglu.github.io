/* Kurultay — sound effects, synthesised with the Web Audio API (no audio files).
   Browsers only allow sound after the first click or key press, so the context starts then. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const Sfx = { on: true, vol: 0.7 };
  CC.Sfx = Sfx;
  let ctx = null, out = null, wet = null, noise = null, D = null;

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    out = ctx.createGain(); out.gain.value = Sfx.vol;
    out.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a short stone-hall reverb from decaying noise
    const conv = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.7);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < irLen; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3); }
    conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.3;
    wet.connect(conv); conv.connect(out);
    return ctx;
  }
  function unlock() { const c = init(); if (c && c.state === 'suspended') c.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => root.addEventListener(ev, unlock, { capture: true, passive: true }));

  // ------------------------------------------------------------ building blocks
  function env(t, a, peak, d) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(D);
    return g;
  }
  function send(node, amount) { if (!amount) return; const s = ctx.createGain(); s.gain.value = amount; node.connect(s); s.connect(wet); }

  function tone(t, f, o) {
    const a = o.a || 0.004, d = o.d || 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + a + d);
    let node = osc;
    if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; node.connect(f2); node = f2; }
    const g = env(t, a, o.g || 0.1, d);
    node.connect(g);
    send(g, o.verb);
    osc.start(t); osc.stop(t + a + d + 0.05);
  }

  function hiss(t, o) {
    const a = o.a || 0.004, d = o.d || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + a + d);
    const g = env(t, a, o.g || 0.1, d);
    src.connect(f); f.connect(g);
    send(g, o.verb);
    src.start(t, Math.random() * 1.5, a + d + 0.05);
  }

  // filtered noise that swells and holds, for crowds and wind
  function pad(t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const hold = t + o.a + o.s, end = hold + o.d;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.g, t + o.a);
    if (o.wobble) for (let x = t + o.a + 0.15; x < hold; x += 0.15) g.gain.linearRampToValueAtTime(o.g * (0.55 + Math.random() * 0.7), x);
    g.gain.linearRampToValueAtTime(o.g * 0.8, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f); f.connect(g); g.connect(D);
    send(g, o.verb);
    src.start(t, Math.random()); src.stop(end + 0.05);
  }

  // a brass voice: sawtooth through an opening low-pass filter
  function brass(t, f, len, g, o) {
    o = o || {};
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator();
    osc.type = 'sawtooth'; osc2.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.985, t); osc.frequency.linearRampToValueAtTime(f, t + 0.06);
    osc2.frequency.setValueAtTime(f, t); osc2.detune.value = 7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.dark ? 400 : 600, t);
    lp.frequency.linearRampToValueAtTime(o.dark ? 900 : 1900, t + 0.08);
    lp.frequency.linearRampToValueAtTime(o.dark ? 700 : 1300, t + len);
    const v = ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(g, t + 0.05);
    v.gain.setValueAtTime(g * 0.85, t + len);
    v.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.28);
    osc.connect(lp); osc2.connect(lp); lp.connect(v); v.connect(D);
    send(v, o.verb == null ? 0.35 : o.verb);
    osc.start(t); osc2.start(t); osc.stop(t + len + 0.35); osc2.stop(t + len + 0.35);
  }

  function clash(t, g) {
    const f0 = 850 + Math.random() * 700;
    [1, 2.76, 5.4, 8.93].forEach((r, k) => tone(t, f0 * r, { type: k ? 'sine' : 'triangle', g: (g || 0.05) / (k + 1), a: 0.001, d: 0.22 + Math.random() * 0.2, verb: 0.25 }));
    hiss(t, { type: 'highpass', f: 3500, g: (g || 0.05) * 1.2, a: 0.001, d: 0.04 });
  }
  function arrow(t, g) {
    hiss(t, { f: 3800, to: 700, q: 5, g: g || 0.05, a: 0.03, d: 0.3 });
    tone(t + 0.33, 190, { to: 90, g: (g || 0.05) * 0.9, d: 0.07 });
    hiss(t + 0.33, { type: 'lowpass', f: 700, g: (g || 0.05) * 0.8, d: 0.05 });
  }
  function step(t, g) {
    hiss(t, { type: 'lowpass', f: 200 + Math.random() * 70, q: 0.8, g: g, a: 0.004, d: 0.085 });
    hiss(t + 0.008, { f: 1500 + Math.random() * 700, q: 1.4, g: g * 0.18, d: 0.045 });
  }

  // ------------------------------------------------------------ the sounds
  const SOUNDS = {
    click(t) { tone(t, 1300, { type: 'triangle', g: 0.035, a: 0.002, d: 0.04 }); },
    paint(t) { tone(t, 560 + Math.random() * 90, { g: 0.045, a: 0.003, d: 0.07 }); hiss(t, { f: 2600, q: 2, g: 0.012, d: 0.03 }); },
    erase(t) { tone(t, 360, { to: 250, g: 0.04, a: 0.003, d: 0.08 }); },
    deny(t) { tone(t, 196, { type: 'square', lp: 700, g: 0.045, d: 0.09 }); tone(t + 0.1, 147, { type: 'square', lp: 600, g: 0.045, d: 0.15 }); },
    select(t) { // chainmail rustle and a hand on the sword
      for (let k = 0; k < 5; k++) hiss(t + k * 0.022 + Math.random() * 0.01, { type: 'highpass', f: 5200, g: 0.03, d: 0.05 });
      tone(t + 0.02, 2300, { type: 'triangle', g: 0.015, d: 0.15 });
    },
    town(t) { tone(t, 587, { g: 0.05, d: 0.6, verb: 0.3 }); tone(t, 1174, { g: 0.02, d: 0.4 }); tone(t + 0.13, 880, { g: 0.04, d: 0.7, verb: 0.3 }); },
    march(t, o) {
      const dur = o.dur || 1.2, g = 0.24;
      for (let x = 0; x < dur; x += 0.25) {
        for (let k = 0; k < 3; k++) step(t + x + k * 0.04 + Math.random() * 0.02, g * (0.7 + Math.random() * 0.4));
        if (Math.random() < 0.6) hiss(t + x + 0.12, { type: 'highpass', f: 6500, g: 0.014, d: 0.06 });
      }
    },
    gallop(t, o) {
      const dur = o.dur || 1.2;
      for (let x = 0; x < dur; x += 0.4) for (const off of [0, 0.075, 0.15]) {
        hiss(t + x + off, { type: 'lowpass', f: 420, q: 1, g: 0.26, a: 0.003, d: 0.07 });
        tone(t + x + off, 95, { to: 60, g: 0.07, d: 0.06 });
      }
    },
    battle(t, o) {
      const dur = o.dur || 2.2, g = o.small ? 0.5 : 1;
      if (!o.small) { brass(t, 147, 0.5, 0.05, { dark: true, verb: 0.5 }); brass(t, 220, 0.5, 0.03, { dark: true, verb: 0.5 }); }
      pad(t + 0.1, { f: 480, q: 0.6, g: 0.09 * g, a: 0.3, s: dur - 0.6, d: 0.6, wobble: true, verb: 0.2 });
      pad(t + 0.1, { type: 'lowpass', f: 140, g: 0.12 * g, a: 0.35, s: dur - 0.6, d: 0.7 });
      const clashes = Math.round(dur * (o.small ? 3 : 5));
      for (let k = 0; k < clashes; k++) clash(t + 0.25 + Math.random() * (dur - 0.4), 0.05 * g);
      const arrows = Math.round(dur * (o.small ? 1 : 2));
      for (let k = 0; k < arrows; k++) arrow(t + 0.1 + Math.random() * (dur - 0.5), 0.045 * g);
    },
    victory(t) {
      [[392, 0, 0.13], [523, 0.15, 0.13], [659, 0.3, 0.13], [784, 0.45, 0.6]].forEach(([f, dt, len]) => brass(t + dt, f, len, 0.06));
      brass(t + 0.45, 392, 0.6, 0.04); brass(t + 0.45, 196, 0.6, 0.04, { dark: true });
    },
    defeat(t) {
      brass(t, 220, 0.35, 0.05, { dark: true }); brass(t + 0.4, 208, 0.35, 0.05, { dark: true }); brass(t + 0.8, 165, 0.9, 0.055, { dark: true });
      tone(t + 0.8, 82, { g: 0.08, d: 1.2 });
    },
    capture(t) {
      SOUNDS.victory(t);
      pad(t + 0.2, { f: 1100, q: 0.7, g: 0.06, a: 0.25, s: 0.7, d: 0.8, wobble: true, verb: 0.3 });
      for (let k = 0; k < 3; k++) tone(t + 0.9 + k * 0.25, 660, { g: 0.04, d: 0.9, verb: 0.4 });
    },
    build(t) {
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.19 + Math.random() * 0.02;
        hiss(tt, { f: 900, q: 4, g: 0.2, a: 0.002, d: 0.07 });
        tone(tt, 210, { to: 160, g: 0.07, d: 0.08 });
      }
    },
    upgrade(t) { SOUNDS.build(t); tone(t + 0.62, 1046, { g: 0.035, d: 0.8, verb: 0.4 }); tone(t + 0.62, 1568, { g: 0.02, d: 0.6, verb: 0.4 }); },
    recruit(t) {
      for (const dt of [0, 0.16, 0.32]) { tone(t + dt, 125, { to: 55, g: 0.22, d: 0.28 }); hiss(t + dt, { type: 'lowpass', f: 500, g: 0.08, d: 0.08 }); }
      brass(t + 0.42, 220, 0.22, 0.035, { dark: true });
      brass(t + 0.42, 330, 0.22, 0.02, { dark: true });
    },
    coins(t, o) {
      const n = o.n || 5;
      for (let k = 0; k < n; k++) {
        const f = 2500 + Math.random() * 1500, tt = t + k * 0.065 + Math.random() * 0.02;
        tone(tt, f, { g: 0.03, a: 0.001, d: 0.14 }); tone(tt, f * 1.49, { g: 0.012, a: 0.001, d: 0.1 });
      }
    },
    cannon(t, o) { // a ragged volley of booms rolling across the water
      const n = Math.max(1, Math.min(6, o.n || 2));
      for (let k = 0; k < n; k++) {
        const tt = t + k * 0.16 + Math.random() * 0.08;
        tone(tt, 70 + Math.random() * 20, { to: 32, g: 0.32, a: 0.003, d: 0.55, verb: 0.4 });
        hiss(tt, { type: 'lowpass', f: 900, to: 120, g: 0.28, a: 0.002, d: 0.5, verb: 0.35 });
        hiss(tt, { type: 'highpass', f: 2500, g: 0.05, a: 0.001, d: 0.06 });
      }
    },
    waves(t) { pad(t, { type: 'lowpass', f: 600, g: 0.07, a: 0.35, s: 0.4, d: 0.7, wobble: true }); hiss(t + 0.3, { f: 1800, to: 700, q: 0.8, g: 0.04, a: 0.2, d: 0.5 }); },
    horn(t) { brass(t, 196, 0.32, 0.055, { verb: 0.5 }); brass(t + 0.38, 294, 0.6, 0.06, { verb: 0.5 }); },
    bell(t) { tone(t, 392, { g: 0.06, d: 1.4, verb: 0.4 }); tone(t, 788, { g: 0.025, d: 1.0, verb: 0.3 }); tone(t, 1180, { g: 0.012, d: 0.6 }); },
    fanfare(t) {
      SOUNDS.victory(t);
      [[523, 1.15, 0.13], [659, 1.3, 0.13], [784, 1.45, 0.13], [1046, 1.6, 0.9]].forEach(([f, dt, len]) => brass(t + dt, f, len, 0.055));
      brass(t + 1.6, 523, 0.9, 0.04); brass(t + 1.6, 262, 0.9, 0.04, { dark: true });
    },
  };

  let lastPaint = 0;
  Sfx.play = function (name, o) {
    if (!Sfx.on) return;
    o = o || {};
    const c = init();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const fn = SOUNDS[name];
    if (!fn) return;
    if (name === 'paint' || name === 'erase') { const now = performance.now(); if (now - lastPaint < 45) return; lastPaint = now; }
    D = out;
    if (o.vol != null && o.vol !== 1) { D = ctx.createGain(); D.gain.value = o.vol; D.connect(out); }
    try { fn(c.currentTime + 0.01, o); } catch (e) { /* a missing node feature should never break the game */ }
  };
  Sfx.setVolume = function (v) { Sfx.vol = v; if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.02); };
  Sfx.setOn = function (on) { Sfx.on = on; if (on) unlock(); };
})(typeof window !== 'undefined' ? window : globalThis);
