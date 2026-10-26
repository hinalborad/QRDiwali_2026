/* Rangoli studio — draw with mirror symmetry, conjure a magic rangoli, save it, or light it up in the sky. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const COLORS = ['rainbow', '#ff2d95', '#ff8c00', '#ffd166', '#2ee88a', '#22d3ee', '#7c5cff', '#ffffff', '#ff3b3b'];
  const SYMS = [6, 8, 12, 16];
  const SIZES = [['S', 0.008], ['M', 0.014], ['L', 0.024]]; // brush width, as a share of the radius
  const PALETTES = [
    'rainbow',
    ['#ff2d95', '#ffd166', '#22d3ee', '#ffffff'],
    ['#ff8c00', '#ffd166', '#ff3b3b', '#2ee88a'],
    ['#7c5cff', '#22d3ee', '#ff2d95', '#ffd166'],
    ['#ffd166', '#ff8c00', '#ffffff', '#ff2d95'],
  ];

  const studio = $('studio');
  const stage = $('studioStage');
  const canvas = $('rangoliCanvas');
  const ctx = canvas.getContext('2d');
  const guide = $('rangoliGuide');
  const gctx = guide.getContext('2d');

  // Points are kept in -1..1 around the centre ([x, y, hue, angle]), so a drawing survives any resize.
  const st = { color: 'rainbow', brush: 'line', sym: 8, size: 1, hue: 0, strokes: [], cleared: null, cur: null, magic: null };

  const API = { open, close, onClose: null, onLaunch: null, toast: () => {} };
  window.RangoliStudio = API;

  /* ================= Open / close / layout ================= */
  function open() {
    studio.hidden = false;
    document.body.classList.add('studio-open');
    requestAnimationFrame(layout); // measure once it is visible
  }

  function close() {
    stopMagic();
    st.cur = null;
    studio.hidden = true;
    document.body.classList.remove('studio-open');
    if (API.onClose) API.onClose();
  }

  function layout() {
    if (studio.hidden) return;
    const r = stage.getBoundingClientRect();
    const size = Math.floor(Math.min(r.width - 24, r.height - 12));
    if (size < 60) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, guide]) {
      c.width = c.height = Math.round(size * dpr);
      c.style.width = c.style.height = size + 'px';
    }
    redraw();
    drawGuide();
  }
  window.addEventListener('resize', layout);

  /* ================= Drawing ================= */
  function paintBackground() {
    const S = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, '#1b2766');
    g.addColorStop(1, '#070b2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  function drawGuide() {
    const S = guide.width, r = S / 2;
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, S, S);
    gctx.strokeStyle = 'rgba(255, 209, 102, 0.12)';
    gctx.lineWidth = Math.max(1, S / 600);
    gctx.beginPath();
    const axes = st.sym * 2;
    for (let k = 0; k < axes; k++) {
      const a = (k / axes) * Math.PI * 2;
      gctx.moveTo(r, r);
      gctx.lineTo(r + Math.cos(a) * r, r + Math.sin(a) * r);
    }
    for (const f of [0.25, 0.5, 0.75, 0.98]) {
      gctx.moveTo(r + r * f, r);
      gctx.arc(r, r, r * f, 0, Math.PI * 2);
    }
    gctx.stroke();
  }

  // Runs `draw` once per mirrored copy: every rotation around the centre plus its reflection.
  function copies(sym, draw) {
    const r = canvas.width / 2;
    for (let k = 0; k < sym; k++) {
      const a = (k / sym) * Math.PI * 2;
      const c = Math.cos(a) * r, s = Math.sin(a) * r;
      ctx.setTransform(c, s, -s, c, r, r);
      draw();
      ctx.setTransform(c, s, s, -c, r, r);
      draw();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  const colourOf = (s, p) => (s.color === 'rainbow' ? `hsl(${Math.round(p[2])},100%,62%)` : s.color);

  // Every mark is drawn twice: a wide faint pass for the glow, then the bright core.
  function drawSeg(s, a, b) {
    ctx.strokeStyle = colourOf(s, b);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    copies(s.sym, () => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = s.w * 3.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = s.w;
      ctx.stroke();
    });
  }

  function dot(s, p, core, glow) {
    ctx.fillStyle = colourOf(s, p);
    copies(s.sym, () => {
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(p[0], p[1], glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(p[0], p[1], core, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function petal(s, p) {
    ctx.fillStyle = colourOf(s, p);
    copies(s.sym, () => {
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], s.w * 4.4, s.w * 2.1, p[3], 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], s.w * 3, s.w * 1.1, p[3], 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function mark(s, p, prev) {
    if (s.brush === 'dots') dot(s, p, s.w, s.w * 2.3);
    else if (s.brush === 'petal') petal(s, p);
    else if (prev) drawSeg(s, prev, p);
    else dot(s, p, s.w / 2, s.w * 1.7);
  }

  function addPoint(s, p) {
    mark(s, p, s.pts[s.pts.length - 1]);
    s.pts.push(p);
  }

  function redraw() {
    paintBackground();
    for (const s of st.strokes) s.pts.forEach((p, i) => mark(s, p, i ? s.pts[i - 1] : null));
  }

  /* ================= Finger / mouse input ================= */
  function toUnit(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
  }

  canvas.addEventListener('pointerdown', (e) => {
    stopMagic();
    canvas.setPointerCapture(e.pointerId);
    const [u, v] = toUnit(e);
    const s = { brush: st.brush, color: st.color, sym: st.sym, w: SIZES[st.size][1], pts: [] };
    st.cur = s;
    st.strokes.push(s);
    addPoint(s, [u, v, st.hue, 0]);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!st.cur) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of list.length ? list : [e]) extend(toUnit(ev));
  });

  const finish = () => { st.cur = null; };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  function extend([u, v]) {
    const s = st.cur;
    const last = s.pts[s.pts.length - 1];
    const dx = u - last[0], dy = v - last[1], dist = Math.hypot(dx, dy);
    const gap = s.brush === 'line' ? 0.006 : s.brush === 'dots' ? s.w * 3.4 : s.w * 6.5;
    if (dist < gap) return;
    if (s.brush === 'line') {
      st.hue = (st.hue + dist * 160) % 360;
      addPoint(s, [u, v, st.hue, 0]);
      return;
    }
    // Dots and petals sit at even spacing along the path; petals point the way you move.
    const steps = Math.floor(dist / gap), ang = Math.atan2(dy, dx);
    for (let i = 1; i <= steps; i++) {
      st.hue = (st.hue + gap * 160) % 360;
      addPoint(s, [last[0] + (dx * i * gap) / dist, last[1] + (dy * i * gap) / dist, st.hue, ang]);
    }
  }

  /* ================= Tools ================= */
  function undo() {
    stopMagic();
    if (st.strokes.length) st.strokes.pop();
    else if (st.cleared) { st.strokes = st.cleared; st.cleared = null; }
    redraw();
  }

  function clear() {
    stopMagic();
    if (st.strokes.length) st.cleared = st.strokes;
    st.strokes = [];
    redraw();
  }

  function setSym(n) {
    st.sym = n;
    $('symBtn').textContent = '✳️ ' + n;
    drawGuide();
  }

  /* ================= Magic rangoli ================= */
  // Builds one mirrored slice of a traditional pattern; the symmetry repeats it all the way round.
  function buildPlan(n) {
    const half = Math.PI / n;
    const pal = pick(PALETTES);
    const hue0 = rand(0, 360);
    let ci = 0;
    const colour = () => (pal === 'rainbow' ? 'rainbow' : pal[ci++ % pal.length]);
    const hueAt = (x, y) => (hue0 + Math.hypot(x, y) * 320) % 360;
    const at = (r, a, ang) => [r * Math.cos(a), r * Math.sin(a), (hue0 + r * 320) % 360, ang === undefined ? a : ang];
    const along = (count, fn) => Array.from({ length: count + 1 }, (_, i) => fn(i / count));

    const plan = [
      { brush: 'dots', color: colour(), w: 0.024, pts: [at(0, 0)] },
      { brush: 'petal', color: colour(), w: 0.02, pts: [at(0.09, 0)] },
    ];
    const kinds = ['dotring', 'wave', 'petals', 'scallop', 'circle', 'leaves', 'spikes'];
    let r = 0.19;
    let prev = '';
    while (r < 0.84) {
      let kind = pick(kinds);
      while (kind === prev) kind = pick(kinds);
      prev = kind;
      const color = colour();

      if (kind === 'dotring') {
        const count = Math.max(1, Math.round((r * half) / 0.05));
        plan.push({ brush: 'dots', color, w: 0.012, pts: along(count, (f) => at(r, f * half)) });
        r += 0.09;
      } else if (kind === 'wave') {
        const amp = rand(0.025, 0.05), m = pick([1, 2]);
        plan.push({ brush: 'line', color, w: 0.011, pts: along(24, (f) => at(r + amp * Math.cos(m * n * f * half), f * half)) });
        r += 0.1 + amp;
      } else if (kind === 'circle') {
        plan.push({ brush: 'line', color, w: 0.008, pts: along(16, (f) => at(r, f * half)) });
        r += 0.06;
      } else if (kind === 'petals') {
        const w = rand(0.017, 0.026);
        plan.push({ brush: 'petal', color, w, pts: [at(r + w * 3, 0), at(r + w * 2, half)] });
        r += w * 6 + 0.04;
      } else if (kind === 'leaves') {
        const w = rand(0.014, 0.02);
        plan.push({ brush: 'petal', color, w, pts: [at(r + w * 1.5, half / 2, half / 2 + Math.PI / 2)] });
        r += w * 3 + 0.05;
      } else if (kind === 'scallop') {
        const x0 = r, y0 = 0, x1 = r * Math.cos(half), y1 = r * Math.sin(half);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const rad = Math.hypot(x1 - x0, y1 - y0) / 2;
        const start = Math.atan2(y0 - my, x0 - mx);
        const out = Math.atan2(my, mx);
        const sign = Math.cos(start + Math.PI / 2 - out) > 0 ? 1 : -1; // bulge away from the centre
        plan.push({
          brush: 'line', color, w: 0.01,
          pts: along(20, (f) => {
            const a = start + sign * Math.PI * f, x = mx + rad * Math.cos(a), y = my + rad * Math.sin(a);
            return [x, y, hueAt(x, y), 0];
          }),
        });
        r += rad + 0.07;
      } else { // spikes, like rays of a diya
        const len = rand(0.05, 0.09);
        plan.push({ brush: 'line', color, w: 0.009, pts: along(6, (f) => at(r + len * f, 0)) });
        plan.push({ brush: 'line', color, w: 0.009, pts: along(6, (f) => at(r + len * 0.7 * f, half)) });
        r += len + 0.05;
      }
    }
    const count = Math.max(2, Math.round((0.93 * half) / 0.04));
    plan.push({ brush: 'dots', color: colour(), w: 0.01, pts: along(count, (f) => at(0.93, f * half)) });
    return plan;
  }

  function magic() {
    clear();
    setSym(pick([8, 12, 16]));
    const plan = buildPlan(st.sym);
    const m = { si: 0, pi: 0, stroke: null, raf: 0 };
    st.magic = m;
    const step = () => {
      if (st.magic !== m) return;
      for (let budget = 3; budget > 0 && m.si < plan.length; budget--) {
        const src = plan[m.si];
        if (!m.stroke) {
          m.stroke = { brush: src.brush, color: src.color, sym: st.sym, w: src.w, pts: [] };
          st.strokes.push(m.stroke);
        }
        addPoint(m.stroke, src.pts[m.pi++]);
        if (m.pi >= src.pts.length) { m.si++; m.pi = 0; m.stroke = null; }
      }
      if (m.si < plan.length) m.raf = requestAnimationFrame(step);
      else st.magic = null;
    };
    m.raf = requestAnimationFrame(step);
  }

  function stopMagic() {
    if (!st.magic) return;
    cancelAnimationFrame(st.magic.raf);
    st.magic = null;
  }

  /* ================= Save & light it up ================= */
  function dataUrlToBlob(url) {
    const bin = atob(url.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }

  function save() {
    stopMagic();
    const S = canvas.width, pad = Math.round(S * 0.16);
    const out = document.createElement('canvas');
    out.width = S;
    out.height = S + pad;
    const c = out.getContext('2d');
    c.fillStyle = '#070b2a';
    c.fillRect(0, 0, S, S + pad);
    c.drawImage(canvas, 0, 0);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#f2c66d';
    c.font = `${Math.round(pad * 0.36)}px 'DM Serif Display', Georgia, serif`;
    c.fillText('Happy Diwali 2026 🪔', S / 2, S + pad * 0.42);
    c.fillStyle = 'rgba(255, 247, 230, 0.7)';
    c.font = `400 ${Math.round(pad * 0.19)}px Poppins, sans-serif`;
    c.fillText('My digital rangoli', S / 2, S + pad * 0.76);

    // Built synchronously so the phone's share sheet still counts as a response to the tap.
    const blob = dataUrlToBlob(out.toDataURL('image/png'));
    const name = 'my-diwali-rangoli.png';
    if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && typeof File === 'function') {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'My Diwali Rangoli' }).catch((err) => {
          if (!err || err.name !== 'AbortError') download(blob, name);
        });
        return;
      }
    }
    download(blob, name);
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    API.toast('Saved your rangoli 🎨');
  }

  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  // Reads the bright parts of the drawing back as coloured points for the fireworks engine.
  function samplePoints() {
    const M = 128, off = document.createElement('canvas'); // one cell ≈ one spark, so lines stay continuous
    off.width = off.height = M;
    const c = off.getContext('2d');
    c.drawImage(canvas, 0, 0, M, M);
    const d = c.getImageData(0, 0, M, M).data;
    const pts = [];
    for (let y = 0; y < M; y++) {
      for (let x = 0; x < M; x++) {
        const i = (y * M + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (Math.max(r, g, b) < 140) continue; // skips the navy floor and the faint glow
        const [h, s, l] = hsl(r, g, b);
        pts.push({ x: (x + 0.5) / (M / 2) - 1, y: (y + 0.5) / (M / 2) - 1, h, s: s < 15 ? s : Math.max(70, s), l: clamp(l, 55, 85) });
      }
    }
    const budget = window.innerWidth < 700 ? 1400 : 2200;
    for (let i = 0; i < Math.min(budget, pts.length); i++) {
      const j = i + ((Math.random() * (pts.length - i)) | 0);
      const t = pts[i]; pts[i] = pts[j]; pts[j] = t;
    }
    if (pts.length > budget) pts.length = budget;
    return pts;
  }

  function lightItUp() {
    stopMagic();
    const pts = samplePoints();
    if (pts.length < 40) {
      API.toast('Draw a little more first — or tap ✨ Magic');
      return;
    }
    close();
    if (API.onLaunch) API.onLaunch(pts);
  }

  /* ================= Wiring ================= */
  const swatches = $('swatches');
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (c === 'rainbow' ? ' rainbow' : '');
    if (c !== 'rainbow') b.style.setProperty('--c', c);
    b.setAttribute('aria-label', c === 'rainbow' ? 'Rainbow colours' : 'Colour ' + c);
    b.setAttribute('aria-pressed', String(c === st.color));
    b.addEventListener('click', () => {
      st.color = c;
      swatches.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    swatches.appendChild(b);
  });

  const brushButtons = studio.querySelectorAll('[data-brush]');
  brushButtons.forEach((b) => b.addEventListener('click', () => {
    st.brush = b.dataset.brush;
    brushButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  $('symBtn').addEventListener('click', () => setSym(SYMS[(SYMS.indexOf(st.sym) + 1) % SYMS.length]));
  $('sizeBtn').addEventListener('click', () => {
    st.size = (st.size + 1) % SIZES.length;
    $('sizeBtn').textContent = '● ' + SIZES[st.size][0];
  });
  $('studioClose').addEventListener('click', close);
  $('studioUndo').addEventListener('click', undo);
  $('magicBtn').addEventListener('click', magic);
  $('clearBtn').addEventListener('click', clear);
  $('saveBtn').addEventListener('click', save);
  $('launchBtn').addEventListener('click', lightItUp);

  window.addEventListener('keydown', (e) => {
    if (studio.hidden) return;
    if (e.key === 'Escape') close();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
})();
