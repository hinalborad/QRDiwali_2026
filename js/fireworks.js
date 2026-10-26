/* Fireworks engine — rockets, shells, ground crackers (anaar, chakri), sparkler and sky-writing. */
(function () {
  'use strict';

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.getElementById('fireworks');
  const ctx = canvas.getContext('2d');
  const flashEl = document.getElementById('flash');

  const FX = {
    W: 0, H: 0, S: 1, density: 1, hq: false,
    // Open sky above the text panel, in CSS pixels. app.js keeps it up to date.
    layout: { skyTop: 80, skyBottom: 400, panelLeft: 0, panelRight: 0 },
    onBurst: null, // called with the power of every shell that bursts
  };
  window.FX = FX;

  const MAX_PARTICLES = 5200;
  const particles = [];
  const rockets = [];
  const glows = [];
  const emitters = [];
  let flash = 0;
  let shownFlash = -1;
  let quietUntil = 0; // while a message is in the sky, other shells stay small and to the sides
  let wasEmpty = false;

  FX.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    FX.W = window.innerWidth;
    FX.H = window.innerHeight;
    canvas.width = Math.round(FX.W * dpr);
    canvas.height = Math.round(FX.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    FX.S = clamp(Math.min(FX.W, FX.H) / 600, 0.7, 1.35); // burst size follows the screen
    FX.density = (FX.W < 700 ? 0.6 : 1) * (reduceMotion ? 0.5 : 1); // fewer particles on phones
    FX.hq = FX.W >= 900 && !reduceMotion; // soft glow around stars on big screens
    wasEmpty = false;
  };
  FX.resize();

  /* ================= Particles ================= */
  function P(x, y, vx, vy, hue, o) {
    o = o || {};
    return {
      x, y, vx, vy, hue,
      sat: o.sat ?? 100,
      lit: o.lit ?? 62,
      white: o.white ?? 0, // starts white-hot, then shows its colour
      life: o.life ?? rand(1.1, 1.7),
      age: 0,
      born: 0,
      size: o.size ?? rand(1.3, 2.3) * FX.S,
      drag: o.drag ?? 0.962, // per 1/60 s: air slows the stars quickly, like real shells
      grav: o.grav ?? 95,
      tail: o.tail ?? 0.045, // streak length, in seconds of velocity
      trail: o.trail ?? 0, // chance per frame to shed a spark
      trailHue: o.trailHue ?? 40,
      flicker: o.flicker ?? false,
      halo: o.halo ?? false,
      split: o.split ?? 0, // time at which the star splits (crossette, sparkler branches)
      splitN: o.splitN ?? 4,
      splitV: o.splitV ?? 110,
      splitLife: o.splitLife ?? 0.75,
      crackle: o.crackle ?? 0, // time at which the star pops
      hueTo: o.hueTo ?? -1, // colour-changing stars
      hueAt: 0,
      fadeFrom: -1,
      form: null, // sky-writing: flies to a point, holds, then lets go
    };
  }

  function add(p, force) {
    if (force || particles.length < MAX_PARTICLES * FX.density) {
      particles.push(p);
      return p;
    }
    return null;
  }

  function removeAt(i) {
    particles[i] = particles[particles.length - 1];
    particles.pop();
  }

  // A point on a sphere seen flat: gives shells their dense, round edge.
  function sphere() {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return [r * Math.cos(th), r * Math.sin(th)];
  }

  function heart(t) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x / 17, -y / 17];
  }

  // f in [0, 1) walks the outline of a five-pointed star.
  function starPoint(f) {
    const e = Math.floor(f * 10);
    const g = f * 10 - e;
    const vertex = (i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.42 : 1;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const a = vertex(e);
    const b = vertex(e + 1);
    return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g];
  }

  /* ================= Shells ================= */
  const HUES = [0, 20, 42, 52, 120, 175, 200, 220, 275, 300, 325, 345];
  const BIG = ['chrys', 'willow', 'double', 'peony', 'palm', 'crackle', 'ring', 'chrys'];
  const MID = ['peony', 'ring', 'crossette', 'double', 'glitter', 'crackle', 'peony', 'heart', 'star'];
  const SMALL = ['peony', 'glitter', 'ring', 'peony'];

  FX.shell = function (power) {
    const list = power > 0.8 ? BIG : power > 0.5 ? MID : SMALL;
    const hue = pick(HUES);
    let hue2 = pick(HUES);
    if (hue2 === hue) hue2 = (hue + 160) % 360;
    return { type: pick(list), hue, hue2, power };
  };

  function explode(x, y, shell) {
    const S = FX.S;
    const { type, hue, hue2, power } = shell;
    const n = Math.round((55 + 115 * power) * FX.density);
    const sp = (160 + 200 * power) * S;
    const gold = type === 'willow' || type === 'palm' || type === 'glitter' || type === 'crackle';
    const star = (vx, vy, h, o) => add(P(x, y, vx, vy, h, o));

    glows.push({ x, y, r: (80 + 120 * power) * S, hue: gold ? 42 : hue, age: 0, life: 0.4 });
    flash = Math.min(1, flash + (reduceMotion ? 0.04 : 0.1) + (reduceMotion ? 0.1 : 0.28) * power);
    if (FX.onBurst) FX.onBurst(power);

    switch (type) {
      case 'form':
        formBurst(x, y, shell);
        break;

      case 'chrys':
        for (let i = 0; i < n; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.9, 1.05);
          star(dx * v, dy * v, hue, { white: 1, life: rand(1.5, 2.1), trail: 0.22, drag: 0.965, halo: true });
        }
        break;

      case 'willow':
        for (let i = 0; i < n * 0.85; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.75, 0.95);
          star(dx * v, dy * v, 42, {
            sat: 85, lit: 55, life: rand(2.6, 3.4), drag: 0.972, grav: 55,
            trail: 0.35, tail: 0.07, size: rand(1.4, 2.2) * S, flicker: true,
          });
        }
        break;

      case 'double':
        for (let i = 0; i < n * 0.45; i++) {
          const [dx, dy] = sphere(), v = sp * 0.5 * rand(0.9, 1.05);
          star(dx * v, dy * v, hue2, { white: 1, halo: true });
        }
        for (let i = 0; i < n * 0.75; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.95, 1.05);
          star(dx * v, dy * v, hue, { white: 1, halo: true });
        }
        break;

      case 'ring': {
        const m = Math.round(n * 0.6), tilt = rand(0.3, 1), rot = rand(0, Math.PI);
        const c = Math.cos(rot), s = Math.sin(rot);
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2;
          const rx = Math.cos(a) * sp, ry = Math.sin(a) * sp * tilt;
          star(rx * c - ry * s, rx * s + ry * c, hue, { white: 1, life: rand(1.2, 1.6), halo: true });
        }
        for (let i = 0; i < n * 0.25; i++) {
          const [dx, dy] = sphere(), v = sp * 0.35;
          star(dx * v, dy * v, hue2, { flicker: true, life: rand(0.8, 1.2) });
        }
        break;
      }

      case 'crossette': {
        const m = Math.round(12 + 10 * power);
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2 + rand(-0.1, 0.1), v = sp * 0.75;
          star(Math.cos(a) * v, Math.sin(a) * v, hue, {
            split: rand(0.45, 0.6), life: 2, size: 2.2 * S, trail: 0.3, trailHue: hue,
          });
        }
        break;
      }

      case 'glitter':
        for (let i = 0; i < n; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.6, 1);
          star(dx * v, dy * v, 48, { sat: 70, lit: 75, life: rand(1.6, 2.4), flicker: true, trail: 0.12, size: 1.3 * S });
        }
        break;

      case 'crackle':
        for (let i = 0; i < n * 0.75; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.85, 1);
          star(dx * v, dy * v, 48, { sat: 45, lit: 78, white: 1, life: 1.4, crackle: rand(0.55, 1), size: 1.6 * S });
        }
        break;

      case 'heart':
      case 'star': {
        const m = Math.round((60 + 50 * power) * FX.density);
        const rot = rand(-0.3, 0.3), c = Math.cos(rot), s = Math.sin(rot);
        const h = type === 'heart' ? pick([340, 350, 0, 320]) : hue;
        for (let i = 0; i < m; i++) {
          const [px, py] = type === 'heart' ? heart((i / m) * Math.PI * 2) : starPoint(i / m);
          star((px * c - py * s) * sp * 0.85, (px * s + py * c) * sp * 0.85, h, {
            white: 1, life: rand(1.3, 1.6), drag: 0.955, grav: 60, halo: true,
          });
        }
        break;
      }

      case 'palm': {
        const fronds = 7 + ((power * 4) | 0);
        for (let k = 0; k < fronds; k++) {
          const a = (k / fronds) * Math.PI * 2 + rand(-0.2, 0.2), v = sp * rand(0.7, 0.9);
          star(Math.cos(a) * v, Math.sin(a) * v, 38, {
            sat: 95, lit: 58, life: rand(1.6, 2.1), size: 3 * S, trail: 0.9, drag: 0.97, grav: 110, tail: 0.06,
          });
        }
        for (let i = 0; i < n * 0.3; i++) {
          const [dx, dy] = sphere(), v = sp * 0.45;
          star(dx * v, dy * v, hue, { white: 1 });
        }
        break;
      }

      default: { // peony — sometimes with stars that change colour mid-air
        const morph = Math.random() < 0.35;
        for (let i = 0; i < n; i++) {
          const [dx, dy] = sphere(), v = sp * rand(0.92, 1.04);
          const p = star(dx * v, dy * v, hue, { white: 1, halo: true });
          if (p && morph) { p.hueTo = hue2; p.hueAt = p.life * rand(0.45, 0.6); }
        }
      }
    }
  }

  // Sky-writing: every star flies from the burst to its own point, holds the shape, then lets go.
  function formBurst(x, y, shell) {
    const S = FX.S;
    for (const q of shell.points) {
      const p = add(P(x + rand(-3, 3), y + rand(-3, 3), 0, 0, q.h, {
        sat: q.s, lit: q.l, white: 1, size: shell.dot, tail: 0.03, drag: 0.975, grav: 28,
      }), true);
      const dur = rand(0.5, 0.75);
      const hold = shell.hold + rand(-0.15, 0.15);
      p.form = { sx: p.x, sy: p.y, tx: q.x, ty: q.y, cx: x, cy: y, dur, hold, release: shell.release };
      p.life = dur + hold + rand(1, 1.6);
    }
    for (let i = 0; i < 36 * FX.density; i++) {
      const [dx, dy] = sphere(), v = rand(100, 260) * S;
      add(P(x, y, dx * v, dy * v, 45, { sat: 60, lit: 80, flicker: true, life: rand(0.6, 1) }));
    }
    if (shell.release === 'burst') {
      setTimeout(() => {
        glows.push({ x, y, r: 260 * S, hue: 45, age: 0, life: 0.5 });
        flash = Math.min(1, flash + 0.45);
        if (FX.onBurst) FX.onBurst(1);
      }, (0.62 + shell.hold) * 1000);
    }
  }

  function splitStar(p) {
    const base = Math.atan2(p.vy, p.vx), v = p.splitV * FX.S;
    for (let q = 0; q < p.splitN; q++) {
      const a = base + Math.PI / 4 + (q * Math.PI * 2) / p.splitN;
      add(P(p.x, p.y, Math.cos(a) * v + p.vx * 0.3, Math.sin(a) * v + p.vy * 0.3, p.hue, {
        life: p.splitLife * rand(0.8, 1.2), flicker: true, white: 1, size: p.size * 0.8,
      }));
    }
  }

  function crackle(p) {
    for (let q = 0; q < 3; q++) {
      const a = rand(0, Math.PI * 2), v = rand(40, 100) * FX.S;
      add(P(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 50, {
        sat: 20, lit: 92, life: rand(0.1, 0.22), size: 1.3 * FX.S, drag: 0.85, grav: 0, tail: 0.02,
      }));
    }
  }

  /* ================= Launching ================= */
  // A rocket rises and bursts after exactly `dur` seconds — that is how bursts land on the beat.
  function launch(tx, ty, dur, shell, from) {
    if (dur < 0.2) { explode(tx, ty, shell); return; }
    const sx = from ? from[0] : clamp(tx + rand(-0.1, 0.1) * FX.W, 10, FX.W - 10);
    const sy = from ? from[1] : FX.H + 10;
    rockets.push({ sx, sy, tx, ty, t: 0, t0: performance.now(), dur, shell, x: sx, y: sy, wob: rand(0, 6.28) });
  }
  FX.launch = launch;

  // A spot in the open sky; beside the panel on wide screens, bursts may sit lower.
  FX.target = function (slot, slots) {
    slot = slot || 0;
    slots = slots || 1;
    const { W, H, S } = FX;
    const L = FX.layout;
    const x = slots > 1 ? W * 0.08 + ((slot + rand(0.2, 0.8)) / slots) * W * 0.84 : rand(0.1, 0.9) * W;
    const beside = x < L.panelLeft - 40 || x > L.panelRight + 40;
    const top = L.skyTop + 30 * S;
    const bottom = beside ? Math.max(L.skyBottom, H * 0.6) : Math.max(top + 60, L.skyBottom - 20 * S);
    return [x, rand(top, bottom)];
  };

  // Strength 0..1 of a beat decides how many shells go up and how big they are.
  FX.fire = function (strength, lead) {
    const power = clamp(0.3 + 0.7 * strength, 0.3, 1);
    let count = strength > 0.85 ? 3 : strength > 0.6 ? 2 : 1;
    if (FX.W < 700) count = Math.min(count, 2);
    if (performance.now() < quietUntil) {
      const x = Math.random() < 0.5 ? rand(0.04, 0.2) * FX.W : rand(0.8, 0.96) * FX.W;
      launch(x, FX.target()[1], lead, FX.shell(power * 0.6));
      return;
    }
    for (let i = 0; i < count; i++) {
      const [x, y] = FX.target(i, count);
      launch(x, y, lead, FX.shell(i > 0 ? power * 0.85 : power));
    }
  };

  /* ================= Sky-writing ================= */
  function textPoints(text, cx, cy, maxW, maxH) {
    const c = document.createElement('canvas').getContext('2d');
    const font = (px) => `700 ${px}px Poppins, 'Tiro Devanagari Hindi', 'Nirmala UI', sans-serif`;
    const width = (s, px) => { c.font = font(px); return c.measureText(s).width; };

    let lines = [text];
    let size = Math.min(maxH, (maxW / width(text, 100)) * 100);
    if (size < maxH * 0.62 && text.indexOf(' ') > 0) {
      // Two lines read better than one tiny line: split at the space nearest the middle.
      const mid = text.length / 2;
      let best = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      }
      lines = [text.slice(0, best), text.slice(best + 1)];
      const wide = Math.max(width(lines[0], 100), width(lines[1], 100)) / 100;
      size = Math.min(maxH / 2.2, maxW / wide);
    }
    size = Math.max(16, Math.floor(size));

    const lineH = size * 1.18;
    const w = Math.ceil(Math.max(...lines.map((l) => width(l, size)))) + 10;
    const h = Math.ceil(lineH * lines.length + size * 0.2);
    c.canvas.width = w; // resizing resets the context, so set the font afterwards
    c.canvas.height = h;
    c.font = font(size);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    lines.forEach((l, i) => c.fillText(l, w / 2, lineH * (i + 0.5) + size * 0.1));

    const data = c.getImageData(0, 0, w, h).data;
    const step = Math.max(3, Math.round(size / 16));
    const raw = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 140) raw.push([x, y]);
    }
    const budget = FX.density < 1 ? 1100 : 1800;
    for (let i = 0; i < Math.min(budget, raw.length); i++) {
      const j = i + ((Math.random() * (raw.length - i)) | 0);
      const t = raw[i]; raw[i] = raw[j]; raw[j] = t;
    }
    if (raw.length > budget) raw.length = budget;

    const hue0 = rand(0, 360);
    const pts = raw.map(([x, y]) => ({
      x: cx - w / 2 + x + rand(-0.25, 0.25) * step,
      y: cy - h / 2 + y + rand(-0.25, 0.25) * step,
      h: (hue0 + (x / w) * 300) % 360, s: 100, l: 66,
    }));
    return { pts, dot: Math.max(1.6, step * 0.62) };
  }

  FX.writeText = function (text, lead) {
    const L = FX.layout;
    const top = L.skyTop;
    const bottom = Math.max(top + 120, L.skyBottom);
    const cx = FX.W / 2;
    const cy = (top + bottom) / 2;
    const maxH = clamp((bottom - top) * 0.62, 48, 170);
    const maxW = Math.min(FX.W * 0.9, 1000);
    const { pts, dot } = textPoints(text, cx, cy, maxW, maxH);
    if (!pts.length) return;
    lead = lead == null ? 1 : lead;
    quietUntil = performance.now() + (lead + 3.4) * 1000;
    launch(cx, cy, lead, { type: 'form', points: pts, dot, hold: 2.2, release: 'fall', power: 0.9, hue: 45, hue2: 45 }, [cx, FX.H + 10]);
  };

  // A picture (the visitor's rangoli): points in -1..1 with their own colours.
  FX.writeImage = function (img, lead) {
    const R = Math.min(FX.W * 0.44, FX.H * 0.36, 300);
    const cx = FX.W / 2;
    const cy = Math.max(FX.H * 0.42, R + 70); // keep the top clear of the garland
    const pts = img.map((q) => ({ x: cx + q.x * R, y: cy + q.y * R, h: q.h, s: q.s, l: q.l }));
    lead = lead == null ? 1 : lead;
    quietUntil = performance.now() + (lead + 4.2) * 1000;
    launch(cx, cy, lead, { type: 'form', points: pts, dot: Math.max(1.8, R / 55), hold: 2.8, release: 'burst', power: 1, hue: 45, hue2: 45 }, [cx, FX.H + 10]);
  };

  /* ================= Ground crackers & sparkler ================= */
  FX.anaar = function (x, y, dur) {
    if (emitters.length < 6) emitters.push({ kind: 'anaar', x, y, age: 0, life: dur || 2.6, acc: 0 });
  };

  FX.chakri = function (x, y, dur) {
    if (emitters.length < 6) emitters.push({ kind: 'chakri', x, y, age: 0, life: dur || 3.2, acc: 0, ang: 0, hue: pick(HUES) });
  };

  function emitAnaar(e, power, dt) {
    const S = FX.S;
    e.acc += 240 * power * Math.max(0.5, FX.density) * dt;
    while (e.acc >= 1) {
      e.acc -= 1;
      const a = -Math.PI / 2 + rand(-0.3, 0.3), v = rand(0.55, 1) * (260 + 180 * power) * S;
      const coloured = Math.random() < 0.1;
      add(P(e.x + rand(-2, 2), e.y, Math.cos(a) * v, Math.sin(a) * v, coloured ? pick([120, 0, 300, 200]) : rand(35, 52), {
        sat: coloured ? 100 : 85, lit: coloured ? 60 : 72, white: 0.7, life: rand(0.7, 1.2),
        drag: 0.985, grav: 330, size: rand(1, 1.8) * S, tail: 0.025, flicker: Math.random() < 0.5,
      }));
    }
    if (Math.random() < 0.5) glows.push({ x: e.x, y: e.y, r: (10 + 40 * power) * S, hue: 42, age: 0, life: 0.08 });
  }

  function emitChakri(e, power, dt) {
    const S = FX.S;
    e.ang += dt * (10 + 10 * power);
    e.acc += 220 * power * Math.max(0.5, FX.density) * dt;
    const hue = (e.hue + e.age * 90) % 360;
    while (e.acc >= 1) {
      e.acc -= 1;
      const a = e.ang + (Math.random() < 0.5 ? 0 : Math.PI);
      const ox = Math.cos(a) * 9 * S, oy = Math.sin(a) * 3.5 * S; // seen from the side: a flat circle
      const tx = -Math.sin(a), ty = Math.cos(a) * 0.4; // sparks fly off along the spin
      const v = rand(140, 240) * S;
      add(P(e.x + ox, e.y + oy, tx * v + rand(-20, 20) * S, ty * v - rand(10, 60) * S, Math.random() < 0.7 ? hue : 45, {
        sat: 95, lit: 64, white: 0.6, life: rand(0.35, 0.65), drag: 0.93, grav: 160, size: rand(1, 1.6) * S, tail: 0.03,
      }));
    }
    glows.push({ x: e.x, y: e.y, r: 30 * S, hue, age: 0, life: 0.06 });
  }

  // Phuljhadi: a shower of hot sparks under the finger, some branching like the real thing.
  FX.sparkler = function (x, y) {
    const S = FX.S, n = Math.max(4, Math.round(8 * FX.density));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(60, 280) * S;
      const p = add(P(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(38, 55), {
        sat: 70, lit: 82, white: 0.8, life: rand(0.15, 0.45), size: rand(0.8, 1.5) * S,
        drag: 0.9, grav: 60, tail: 0.025, flicker: true,
      }));
      if (p && Math.random() < 0.1) { p.split = p.life * 0.6; p.splitN = 3; p.splitV = 45; p.splitLife = 0.16; }
    }
    glows.push({ x, y, r: 36 * S, hue: 45, age: 0, life: 0.08 });
  };

  /* ================= Simulation ================= */
  function update(dt) {
    const S = FX.S;

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t = (performance.now() - r.t0) / 1000; // wall clock, so a slow phone still bursts on the beat
      const p = Math.min(1, r.t / r.dur);
      const e = 1 - (1 - p) * (1 - p); // slows toward the top, like a real shell
      r.x = r.sx + (r.tx - r.sx) * p + Math.sin(r.t * 18 + r.wob) * 0.8 * S;
      r.y = r.sy + (r.ty - r.sy) * e;
      for (let k = 0; k < 2; k++) {
        add(P(r.x, r.y, rand(-20, 20) * S, rand(20, 80) * S, 35, {
          life: rand(0.3, 0.6), size: 1.1 * S, drag: 0.92, grav: 40, lit: 65, tail: 0.03, flicker: true,
        }));
      }
      if (p >= 1) {
        rockets.splice(i, 1);
        explode(r.tx, r.ty, r.shell);
      }
    }

    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.age += dt;
      if (e.age >= e.life) { emitters.splice(i, 1); continue; }
      const power = Math.sqrt(Math.sin((Math.PI * e.age) / e.life)); // swells, then dies down
      if (e.kind === 'anaar') emitAnaar(e, power, dt); else emitChakri(e, power, dt);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { removeAt(i); continue; }

      if (p.form) {
        const f = p.form;
        if (p.age < f.dur) {
          const e = 1 - Math.pow(1 - p.age / f.dur, 3);
          const nx = f.sx + (f.tx - f.sx) * e;
          const ny = f.sy + (f.ty - f.sy) * e;
          p.vx = (nx - p.x) / dt; // only used to draw the streak
          p.vy = (ny - p.y) / dt;
          p.x = nx;
          p.y = ny;
          continue;
        }
        if (p.age < f.dur + f.hold) {
          p.x = f.tx; p.y = f.ty; p.vx = 0; p.vy = 0;
          continue;
        }
        if (f.release === 'burst') {
          const dx = f.tx - f.cx, dy = f.ty - f.cy, d = Math.hypot(dx, dy) || 1, v = rand(140, 300) * S;
          p.vx = (dx / d) * v; p.vy = (dy / d) * v;
          p.drag = 0.955; p.grav = 90; p.white = 1; p.born = p.age;
        } else {
          p.vx = rand(-25, 25) * S; p.vy = rand(-15, 30) * S;
        }
        p.flicker = true;
        p.fadeFrom = p.age;
        p.form = null;
      }

      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * S * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.trail && Math.random() < p.trail * dt * 60) {
        add(P(p.x, p.y, p.vx * 0.1 + rand(-15, 15) * S, p.vy * 0.1 + rand(-15, 15) * S, p.trailHue, {
          life: rand(0.35, 0.7), size: 0.9 * S, drag: 0.9, grav: 60, lit: 60, tail: 0.02, flicker: true,
        }));
      }
      if (p.split && p.age >= p.split) { splitStar(p); removeAt(i); continue; }
      if (p.crackle && p.age >= p.crackle) { crackle(p); removeAt(i); continue; }
    }

    for (let i = glows.length - 1; i >= 0; i--) {
      glows[i].age += dt;
      if (glows[i].age >= glows[i].life) glows.splice(i, 1);
    }

    flash = Math.max(0, flash - dt * 1.8);
  }

  const groups = new Map();
  function queue(key, hi, si, li, alpha, width, x0, y0, x1, y1) {
    let g = groups.get(key);
    if (!g) {
      g = { style: `hsla(${hi},${si}%,${li * 3}%,${alpha})`, width, pts: [] };
      groups.set(key, g);
    }
    g.pts.push(x0, y0, x1, y1);
  }

  function draw() {
    const f = Math.round(flash * 100) / 100;
    if (f !== shownFlash) {
      flashEl.style.opacity = (f * 0.55).toFixed(2);
      shownFlash = f;
    }

    const empty = !particles.length && !rockets.length && !glows.length;
    if (empty && wasEmpty) return;
    wasEmpty = empty;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, FX.W, FX.H);
    ctx.globalCompositeOperation = 'lighter';

    for (const g of glows) {
      const k = 1 - g.age / g.life;
      const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grd.addColorStop(0, `hsla(${g.hue},100%,75%,${0.35 * k})`);
      grd.addColorStop(1, `hsla(${g.hue},100%,50%,0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }

    // Stars that share colour, alpha and width are drawn together with a single stroke call.
    groups.clear();
    const hq = FX.hq;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let left; // how much life (brightness) the star has left, 0..1
      if (p.form) left = 1;
      else if (p.fadeFrom >= 0) left = clamp(1 - (p.age - p.fadeFrom) / (p.life - p.fadeFrom), 0, 1);
      else left = 1 - p.age / p.life;

      let a = p.form ? 0.82 + Math.random() * 0.18 : p.fadeFrom >= 0 ? left : Math.min(1, left * 1.6);
      if (p.flicker && Math.random() < 0.35) a *= 0.15;
      const ai = Math.round(a * 20); // alpha in steps of 0.05
      if (ai <= 0) continue;

      const hot = p.white * Math.max(0, 1 - (p.age - p.born) * 7);
      let l = (p.lit + (96 - p.lit) * hot) * (0.65 + 0.35 * left);
      if (p.form && Math.random() < 0.015) l = 96; // glints in the written shape
      const h = p.hueTo >= 0 && p.age > p.hueAt ? p.hueTo : p.hue;
      const hi = Math.round(h) % 360, si = Math.round(p.sat), li = Math.round(l / 3); // lightness in steps of 3%
      const colour = (hi * 101 + si) * 34 + li;

      let dx = p.vx * p.tail, dy = p.vy * p.tail;
      if (dx * dx + dy * dy < 0.01) dx = 0.1; // a zero-length line draws nothing, so still stars get a tiny one
      const x0 = p.x - dx, y0 = p.y - dy;

      const wi = Math.max(1, Math.round(p.size * (0.6 + 0.4 * left) * 4)); // width in quarter pixels
      queue(((colour * 21 + ai) * 128 + wi) * 2, hi, si, li, ai / 20, wi / 4, x0, y0, p.x, p.y);
      if (hq && p.halo && left > 0.35) {
        const hai = Math.round(a * 6); // a soft glow at 0.12 of the alpha, in steps of 0.02
        if (hai > 0) {
          const wh = Math.round(p.size * 8); // four times as wide, in half pixels
          queue(((colour * 8 + hai) * 128 + wh) * 2 + 1, hi, si, li, hai / 50, wh / 2, x0, y0, p.x, p.y);
        }
      }
    }
    for (const g of groups.values()) {
      ctx.strokeStyle = g.style;
      ctx.lineWidth = g.width;
      ctx.beginPath();
      const q = g.pts;
      for (let k = 0; k < q.length; k += 4) {
        ctx.moveTo(q[k], q[k + 1]);
        ctx.lineTo(q[k + 2], q[k + 3]);
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,235,190,1)';
    for (const r of rockets) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 1.8 * FX.S, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  FX.step = function (dt) {
    if (dt > 0) update(dt);
    draw();
  };

  FX.stats = () => ({
    particles: particles.length,
    rockets: rockets.length,
    emitters: emitters.length,
    forming: particles.reduce((n, p) => n + (p.form ? 1 : 0), 0),
  });})();
