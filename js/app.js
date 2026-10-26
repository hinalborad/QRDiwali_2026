/* Diwali celebration — the opening, the music-synced show, countdown and the scene around it. */
(() => {
  'use strict';

  /* ================= Settings — change these if needed ================= */
  const CONFIG = {
    diwali: new Date(2026, 10, 8, 0, 0, 0), // Diwali (Lakshmi Puja): Sunday 8 Nov 2026 — months are 0-based
    music: 'diwali.mp3',
    flight: 1.1, // seconds a rocket climbs, so it bursts exactly on the beat
    writeEvery: 26, // seconds between messages written in the sky
    groundEvery: 9, // seconds between anaar / chakri on the ground
    finaleEvery: 60, // seconds between grand finales
  };

  const FESTIVAL = [
    { day: new Date(2026, 10, 6), name: 'Dhanteras' },
    { day: new Date(2026, 10, 7), name: 'Choti Diwali' },
    { day: new Date(2026, 10, 8), name: 'Diwali', main: true },
    { day: new Date(2026, 10, 9), name: 'Govardhan Puja' },
    { day: new Date(2026, 10, 10), name: 'Bhai Dooj' },
  ];

  const GREETINGS = [
    ['शुभ दीपावली', 'Hindi', 'hi'],
    ['શુભ દિવાળી', 'Gujarati', 'gu'],
    ['दीपावलीच्या हार्दिक शुभेच्छा', 'Marathi', 'mr'],
    ['শুভ দীপাবলি', 'Bengali', 'bn'],
    ['தீபாவளி நல்வாழ்த்துகள்', 'Tamil', 'ta'],
    ['దీపావళి శుభాకాంక్షలు', 'Telugu', 'te'],
    ['ದೀಪಾವಳಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', 'Kannada', 'kn'],
    ['ദീപാവലി ആശംസകൾ', 'Malayalam', 'ml'],
    ['ਦੀਵਾਲੀ ਦੀਆਂ ਵਧਾਈਆਂ', 'Punjabi', 'pa'],
    ['ଶୁଭ ଦୀପାବଳି', 'Odia', 'or'],
    ['دیوالی مبارک', 'Urdu', 'ur'],
  ];

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const f1 = (v) => v.toFixed(1);
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const music = $('music');
  music.loop = true; // background music: the clip repeats for as long as the page is open

  const el = {
    panel: $('panel'),
    intro: $('intro'),
    toast: $('toast'),
    sound: $('soundBtn'),
    full: $('fullBtn'),
    countdown: $('countdown'),
    festival: $('festival'),
    greetText: $('greetText'),
    diyas: $('diyas'),
    floorGlow: $('floorGlow'),
  };

  const state = {
    mode: 'intro', // intro → sync (beat map known) or free (no beat map)
    showT: 0, // seconds of show so far
    nextWrite: 3.5,
    writeIdx: 0,
    nextGround: 6,
    groundIdx: 0,
    nextFinale: 45,
    loops: 0, // times the clip has started over
    lastAudio: 0,
    beatLoop: 0, // which repeat of the clip the next beat belongs to
    beatIdx: 0,
    freeIn: 0,
    studioOpen: false,
    userRangoli: null,
  };
  const track = { url: '', analysis: null };

  /* ================= Layout ================= */
  function measure() {
    if (window.innerWidth !== FX.W || window.innerHeight !== FX.H) FX.resize(); // resizing clears the canvas
    const r = el.panel.getBoundingClientRect();
    const top = window.innerWidth < 600 ? 64 : 72;
    FX.layout = { skyTop: top, skyBottom: Math.max(top + 140, r.top - 6), panelLeft: r.left, panelRight: r.right };
    // The horizon — distant lights and the wet floor — sits behind the countdown.
    const c = el.countdown.getBoundingClientRect();
    document.documentElement.style.setProperty('--horizon', `${Math.round(c.top + c.height * 0.45)}px`);
  }

  let toastTimer = 0;
  let skyBusyUntil = 0; // while a message or rangoli is in the sky, tips wait so they never cover it
  function toast(msg, ms) {
    const wait = skyBusyUntil - performance.now();
    if (wait > 0) { setTimeout(() => toast(msg, ms), wait + 200); return; }
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms || 4200);
  }

  /* ================= Music & beat map ================= */
  async function loadTrack() {
    try {
      const res = await fetch(CONFIG.music);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      // One download serves both the player and the beat analysis.
      track.url = URL.createObjectURL(blob);
      if (!music.getAttribute('src')) music.src = track.url;
      track.analysis = await Beats.analyze(await new Response(blob).arrayBuffer());
      if (track.analysis && state.mode === 'free') startSync();
    } catch (err) {
      console.warn('No beat map — fireworks will play free-style.', err);
    }
  }

  function loopDuration() {
    return isFinite(music.duration) && music.duration > 1 ? music.duration : track.analysis.duration;
  }

  function startSync() {
    const beats = track.analysis.beats;
    state.mode = 'sync';
    state.loops = 0;
    state.lastAudio = music.currentTime;
    state.beatLoop = 0;
    state.beatIdx = beats.findIndex((b) => b.t > music.currentTime + 0.05);
    if (state.beatIdx < 0) { state.beatIdx = 0; state.beatLoop = 1; }
  }

  // Launches each rocket `flight` seconds ahead of its beat, carrying on across loops of the clip.
  function scheduleSync() {
    const beats = track.analysis.beats;
    const dur = loopDuration();
    const t = music.currentTime;
    if (t + 0.3 < state.lastAudio) state.loops++; // the clip started over
    state.lastAudio = t;
    const now = state.loops * dur + t;
    for (let guard = 0; guard < 64; guard++) {
      const b = beats[state.beatIdx];
      const at = state.beatLoop * dur + b.t;
      if (at - CONFIG.flight > now) break;
      if (++state.beatIdx >= beats.length) { state.beatIdx = 0; state.beatLoop++; }
      const lead = at - now;
      if (lead > -0.08) direct(b.s, Math.max(0, lead));
    }
  }

  function scheduleFree(dt) {
    state.freeIn -= dt;
    if (state.freeIn <= 0) {
      state.freeIn = rand(0.35, 0.85);
      direct(rand(0.25, 1), CONFIG.flight);
    }
  }

  /* ================= The show ================= */
  // Decides what each beat becomes: a normal shell, a message in the sky, ground crackers or a finale.
  function direct(strength, lead) {
    const at = state.showT + lead;
    if (at >= state.nextFinale && strength > 0.45) {
      state.nextFinale = at + CONFIG.finaleEvery;
      state.nextWrite = Math.max(state.nextWrite, at + 6);
      finale(lead);
      return;
    }
    if (at >= state.nextWrite && (strength > 0.5 || at > state.nextWrite + 4)) {
      state.nextWrite = at + CONFIG.writeEvery;
      skyWrite(lead);
      return;
    }
    if (at >= state.nextGround && strength > 0.35) {
      state.nextGround = at + CONFIG.groundEvery * rand(0.8, 1.25);
      setTimeout(() => ground(false), lead * 1000);
    }
    FX.fire(strength, lead);
  }

  function nextMessage() {
    const list = ['HAPPY DIWALI', 'शुभ दीपावली'];
    if (state.userRangoli) list.push(state.userRangoli); // the visitor's own rangoli returns to the sky
    list.push('JAI DIWALI');
    return list[state.writeIdx++ % list.length];
  }

  function skyWrite(lead) {
    skyBusyUntil = performance.now() + (lead + 3.8) * 1000;
    setTimeout(() => el.toast.classList.remove('show'), Math.max(0, lead - 0.2) * 1000); // keep the message clear
    const m = nextMessage();
    if (typeof m === 'string') FX.writeText(m, lead);
    else spotlightRangoli(m, lead);
  }

  let spotTimer = 0;
  function spotlightRangoli(points, lead) {
    skyBusyUntil = performance.now() + (lead + 4.6) * 1000;
    FX.writeImage(points, lead);
    document.body.classList.add('spotlight'); // dim the text so the rangoli owns the sky
    clearTimeout(spotTimer);
    spotTimer = setTimeout(() => document.body.classList.remove('spotlight'), (lead + 4.6) * 1000);
  }

  function finale(lead) {
    for (let i = 0; i < 14; i++) {
      setTimeout(() => {
        const [x, y] = FX.target(i % 4, 4);
        FX.launch(x, y, Math.max(0.35, lead + i * 0.04), FX.shell(rand(0.75, 1)));
      }, i * 110);
    }
    setTimeout(() => ground(true), Math.max(0, lead - 0.3) * 1000);
  }

  // Where each diya's wick is, for the anaar and chakri on the ground.
  function diyaSpots() {
    return Array.from(el.diyas.children).filter((d) => d.offsetWidth > 0).map((d) => { // only the diyas shown on this screen
      const r = d.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom - r.width * 0.68, bottom: r.bottom };
    });
  }

  function ground(big) {
    const spots = diyaSpots();
    if (!spots.length || state.studioOpen) return;
    state.groundIdx++;
    if (big) {
      spots.forEach((p, i) => { if (i % 2 === 0) FX.anaar(p.x, p.y, 3); });
      return;
    }
    if (state.groundIdx % 3 === 0 && spots.length > 1) {
      const i = (Math.random() * (spots.length - 1)) | 0;
      FX.chakri((spots[i].x + spots[i + 1].x) / 2, spots[i].bottom - 6, 3.2);
      return;
    }
    const a = spots[(Math.random() * spots.length) | 0];
    FX.anaar(a.x, a.y, rand(2.2, 3));
    const b = spots[(Math.random() * spots.length) | 0];
    if (b !== a && Math.random() < 0.6) FX.anaar(b.x, b.y, rand(2.2, 3));
  }

  // Bursts make the floor glow and the diyas breathe with the music.
  let pulse = 0;
  let shownPulse = -1;
  FX.onBurst = (power) => { pulse = Math.max(pulse, power); };
  function applyPulse(dt) {
    if (state.mode === 'intro') return;
    pulse *= Math.pow(0.03, dt);
    const p = Math.round(pulse * 50) / 50;
    if (p === shownPulse) return;
    shownPulse = p;
    el.floorGlow.style.opacity = (0.65 + p * 0.35).toFixed(2);
    el.diyas.style.setProperty('--pulse', p.toFixed(2));
  }

  /* ================= Opening: light the diya ================= */
  function lightUp() {
    // The tap is what lets phones play sound, so the music starts right here.
    if (!music.getAttribute('src')) music.src = track.url || CONFIG.music;
    const playing = music.play();
    if (playing && playing.catch) playing.catch(() => toast('Tap 🔇 to turn the music on'));
    if (navigator.vibrate) navigator.vibrate(25);

    el.intro.classList.add('lit');
    state.mode = track.analysis ? 'sync' : 'free';
    if (state.mode === 'sync') startSync();
    el.sound.hidden = false;
    el.full.hidden = !document.fullscreenEnabled;

    // The light spreads: hanging diyas, distant lights and the floor come on as the intro fades.
    setTimeout(() => { el.intro.classList.add('reveal'); document.body.classList.add('started'); }, 700);
    setTimeout(() => { el.intro.hidden = true; measure(); }, 2200);
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        const [x, y] = FX.target(i, 3);
        FX.launch(x, y, 0.8 + i * 0.12, FX.shell(0.9));
      }
    }, 600);
    const tips = coarse
      ? ['Tap the sky for fireworks 🎆', 'Drag your finger for a sparkler ✨', 'Tap a diya to light an anaar 🪔']
      : ['Click the sky for fireworks 🎆', 'Drag for a sparkler ✨ · Space to launch', 'Click a diya to light an anaar 🪔'];
    // Timed around the first message in the sky (it lands about 4 s in) so they never overlap.
    [1400, 8500, 13500].forEach((at, i) => setTimeout(() => toast(tips[i], 3000), at));
  }
  $('introDiya').addEventListener('click', lightUp, { once: true });

  /* ================= Sound, full screen, visibility ================= */
  function setSoundIcon() {
    const on = !music.paused && !music.muted;
    el.sound.textContent = on ? '🔊' : '🔇';
    el.sound.setAttribute('aria-label', on ? 'Mute music' : 'Play music');
  }
  el.sound.addEventListener('click', () => {
    if (music.paused) {
      music.muted = false;
      music.play().catch(() => toast('Could not start the music'));
    } else {
      music.muted = !music.muted; // the show keeps its rhythm even while muted
    }
    setSoundIcon();
  });
  ['play', 'pause', 'volumechange'].forEach((ev) => music.addEventListener(ev, setSoundIcon));
  music.addEventListener('play', () => { if (track.analysis && state.mode !== 'intro') startSync(); });
  music.addEventListener('error', () => {
    if (music.src.startsWith('blob:')) {
      music.src = CONFIG.music; // fall back to streaming the file directly
      if (state.mode !== 'intro') music.play().catch(() => {});
    } else {
      toast('Music file not found — put diwali.mp3 next to index.html', 6000);
    }
  });

  function toggleFull() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  el.full.addEventListener('click', toggleFull);

  let resumeOnReturn = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeOnReturn = !music.paused;
      music.pause();
    } else if (resumeOnReturn) {
      resumeOnReturn = false;
      music.play().catch(() => {});
    }
  });

  /* ================= Gestures ================= */
  function launchAt(x, y) {
    FX.launch(x, Math.min(y, FX.H * 0.85), 0.65, FX.shell(rand(0.55, 0.95)), [x + rand(-30, 30), FX.H + 10]);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  const ignore = (e) => state.mode === 'intro' || state.studioOpen || (e.target.closest && e.target.closest('button, a, input'));

  let drag = null;
  window.addEventListener('pointerdown', (e) => {
    if (ignore(e)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.moved += Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved > 12) FX.sparkler(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved <= 12) launchAt(e.clientX, e.clientY);
    drag = null;
  });
  window.addEventListener('pointercancel', () => { drag = null; });

  window.addEventListener('keydown', (e) => {
    if (state.studioOpen || state.mode === 'intro') return;
    if (e.key === ' ' && !(e.target.closest && e.target.closest('button, a'))) {
      e.preventDefault();
      const [x, y] = FX.target();
      FX.launch(x, y, 0.9, FX.shell(rand(0.5, 1)));
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFull();
    }
  });

  // Shake the phone for a burst (works where motion data is available without a prompt, e.g. Android).
  let lastShake = 0;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || state.mode === 'intro' || state.studioOpen) return;
    const now = performance.now();
    if (Math.hypot(a.x, a.y, a.z) > 24 && now - lastShake > 1500) {
      lastShake = now;
      for (let i = 0; i < 4; i++) {
        const [x, y] = FX.target(i, 4);
        FX.launch(x, y, 0.5 + i * 0.1, FX.shell(1));
      }
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    }
  });

  /* ================= Rangoli studio ================= */
  $('drawBtn').addEventListener('click', () => {
    state.studioOpen = true;
    RangoliStudio.open();
  });
  RangoliStudio.toast = toast;
  RangoliStudio.onClose = () => {
    state.studioOpen = false;
    if (state.mode === 'sync') startSync();
  };
  RangoliStudio.onLaunch = (points) => {
    state.userRangoli = points;
    spotlightRangoli(points, 0.9);
    state.nextWrite = Math.max(state.nextWrite, state.showT + 10);
  };

  /* ================= Countdown & the five days ================= */
  const cd = { d: $('cd-d'), h: $('cd-h'), m: $('cd-m'), s: $('cd-s') };
  let shownDay = '';
  let celebrated = false;

  function setNum(node, v) {
    const txt = String(v).padStart(2, '0');
    if (node.textContent === txt) return;
    node.textContent = txt;
    node.classList.remove('pop');
    void node.offsetWidth; // restart the animation
    node.classList.add('pop');
  }

  function renderFestival(now) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    el.festival.textContent = '';
    for (const f of FESTIVAL) {
      const t = f.day.getTime();
      const li = document.createElement('li');
      let cls = 'fday';
      if (f.main) cls += ' main';
      if (t === today.getTime()) { cls += ' today'; li.setAttribute('aria-current', 'date'); }
      else if (t < today.getTime()) cls += ' past';
      li.className = cls;
      const date = document.createElement('span');
      date.className = 'fdate';
      date.textContent = `${f.day.getDate()} ${f.day.toLocaleDateString('en-GB', { month: 'short' })}`;
      const name = document.createElement('span');
      name.className = 'fname';
      name.textContent = f.name;
      li.append(date, name);
      el.festival.appendChild(li);
    }
  }

  function tick() {
    const now = new Date();
    if (now.toDateString() !== shownDay) {
      shownDay = now.toDateString();
      renderFestival(now);
    }
    const diff = CONFIG.diwali.getTime() - now.getTime();
    if (diff <= 0) {
      if (celebrated) return;
      celebrated = true;
      el.countdown.classList.add('done');
      el.countdown.textContent = '';
      const msg = document.createElement('div');
      msg.className = 'its-diwali';
      msg.textContent = -diff < 3 * 86400000 ? '🪔 It’s Diwali! 🪔' : '✨ Happy Diwali & a Prosperous New Year ✨';
      el.countdown.appendChild(msg);
      measure();
      if (state.mode !== 'intro') finale(1);
      return;
    }
    const total = Math.floor(diff / 1000);
    setNum(cd.d, Math.floor(total / 86400));
    setNum(cd.h, Math.floor((total % 86400) / 3600));
    setNum(cd.m, Math.floor((total % 3600) / 60));
    setNum(cd.s, total % 60);
  }

  /* ================= Greetings in many languages ================= */
  function fitGreeting() {
    const t = el.greetText;
    t.style.fontSize = '';
    const room = el.panel.clientWidth - 70, need = t.scrollWidth;
    if (need > room) t.style.fontSize = `${(parseFloat(getComputedStyle(t).fontSize) * room) / need}px`;
  }

  function startGreetings() {
    let i = 0;
    fitGreeting();
    setInterval(() => {
      el.greetText.classList.add('out');
      setTimeout(() => {
        i = (i + 1) % GREETINGS.length;
        const [text, name, lang] = GREETINGS[i];
        el.greetText.textContent = text;
        el.greetText.lang = lang;
        el.greetText.dir = lang === 'ur' ? 'rtl' : 'ltr';
        el.greetText.title = name;
        fitGreeting();
        el.greetText.classList.remove('out');
      }, 450);
    }, 3200);
  }

  /* ================= The scene ================= */
  const TAU = Math.PI * 2;
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

  // Building blocks of a mandala centred on (0, 0), as SVG markup.
  const ring = {
    circle: (r, cls) => `<circle r="${r}" class="${cls}"/>`,
    petals(n, r0, r1, width, cls) {
      const half = (Math.PI / n) * width, rc = (r0 + r1) / 2;
      let d = '';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const [x0, y0] = polar(r0, a), [x1, y1] = polar(r1, a);
        const [xa, ya] = polar(rc, a - half), [xb, yb] = polar(rc, a + half);
        d += `M${f1(x0)} ${f1(y0)}Q${f1(xa)} ${f1(ya)} ${f1(x1)} ${f1(y1)}Q${f1(xb)} ${f1(yb)} ${f1(x0)} ${f1(y0)}Z`;
      }
      return `<path d="${d}" class="${cls}"/>`;
    },
    dots(n, r, size, cls) {
      let s = '';
      for (let k = 0; k < n; k++) {
        const [x, y] = polar(r, (k / n) * TAU);
        s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${size}" class="${cls}"/>`;
      }
      return s;
    },
    scallops(n, r, depth, cls) {
      let d = '';
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
        const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1), [xm, ym] = polar(r + depth * 2, (a0 + a1) / 2);
        d += `M${f1(x0)} ${f1(y0)}Q${f1(xm)} ${f1(ym)} ${f1(x1)} ${f1(y1)}`;
      }
      return `<path d="${d}" class="${cls}"/>`;
    },
    rays(n, r0, r1, cls) {
      let d = '';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, [x0, y0] = polar(r0, a), [x1, y1] = polar(r1, a);
        d += `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
      }
      return `<path d="${d}" class="${cls}"/>`;
    },
  };

  // The rangoli on the floor, seen in perspective under the diyas.
  function buildFloorMandala() {
    $('floorMandala').innerHTML = [
      ring.circle(7, 'm-fill'),
      ring.petals(8, 7, 24, 0.95, 'm-line m-tint'),
      ring.petals(8, 10, 20, 0.5, 'm-violet'),
      ring.circle(26, 'm-line'),
      ring.dots(32, 30, 1, 'm-dot'),
      ring.petals(16, 33, 52, 0.85, 'm-line m-tint2'),
      ring.circle(54, 'm-violet'),
      ring.scallops(32, 56, 2.6, 'm-line'),
      ring.rays(96, 62, 70, 'm-faint'),
      ring.circle(72, 'm-line'),
      ring.petals(32, 74, 92, 0.8, 'm-line m-tint'),
      ring.dots(64, 95, 0.9, 'm-dot'),
      ring.circle(98, 'm-line'),
    ].join('');
  }

  // Out-of-focus diyas along the horizon, each with its reflection in the wet floor.
  function buildBokeh() {
    const small = window.innerWidth < 700;
    const colours = ['rgba(255,196,110,.85)', 'rgba(255,160,80,.8)', 'rgba(255,214,150,.8)', 'rgba(255,140,90,.75)', 'rgba(255,180,120,.7)', 'rgba(255,150,170,.55)'];
    let html = '';
    for (let i = 0; i < (small ? 24 : 42); i++) {
      const vars = `--x:${rand(-2, 102).toFixed(1)}%;--up:${rand(2, small ? 46 : 64).toFixed(0)}px;--s:${rand(8, small ? 34 : 46).toFixed(0)}px;`
        + `--o:${rand(0.35, 0.9).toFixed(2)};--c:${colours[(Math.random() * colours.length) | 0]};--tw:${rand(2.5, 6).toFixed(1)}s`;
      html += `<span class="bk" style="${vars}"></span><span class="bk ref" style="${vars}"></span>`;
    }
    for (let i = 0; i < (small ? 9 : 16); i++) { // sharp little flames far away
      const vars = `--x:${rand(3, 97).toFixed(1)}%;--up:${rand(1, 8).toFixed(0)}px;--s:${rand(4, 8).toFixed(0)}px;--o:${rand(0.6, 1).toFixed(2)};--tw:${rand(1.5, 3).toFixed(1)}s`;
      html += `<span class="bk spark" style="${vars}"></span><span class="bk ref spark" style="${vars}"></span>`;
    }
    $('bokeh').innerHTML = html;
  }

  function buildStars() {
    const small = window.innerWidth < 700;
    let html = '';
    for (let i = 0; i < (small ? 36 : 70); i++) {
      const size = rand(0.8, 2).toFixed(1);
      html += `<span class="star" style="left:${rand(0, 100).toFixed(1)}%;top:${rand(0, 55).toFixed(1)}%;width:${size}px;height:${size}px;--d:${rand(2.5, 6).toFixed(1)}s;--delay:${rand(-6, 0).toFixed(1)}s"></span>`;
    }
    $('stars').innerHTML = html;
  }

  function buildSparkles() {
    let html = '';
    for (let i = 0; i < (window.innerWidth < 700 ? 12 : 22); i++) {
      const dur = rand(7, 14);
      html += `<i style="--x:${rand(5, 115).toFixed(1)}%;--h:${rand(5, 11).toFixed(0)}px;--dur:${dur.toFixed(1)}s;--delay:${(-rand(0, dur)).toFixed(1)}s"></i>`;
    }
    $('sparkles').innerHTML = html;
  }

  // A gold chain with a diamond pendant and a little diya at the end.
  function hangingSVG(L) {
    const a = Math.round(L * 0.42), p = a + 22, b = a + 44, d = L - 14;
    let s = `<svg width="40" height="${L + 4}" viewBox="0 0 40 ${L + 4}" aria-hidden="true">`;
    s += `<path d="M20 0V${a}" class="chain"/>`;
    for (let y = 12; y < a - 6; y += 14) s += `<path d="M20 ${y - 3}l2.6 3-2.6 3-2.6-3z" class="bead"/>`;
    s += `<circle cx="20" cy="${p}" r="24" fill="url(#gPendantGlow)"/>`;
    s += `<path d="M20 ${a}l13 22-13 22-13-22z" class="pend"/>`;
    s += `<path d="M20 ${a + 9}l7.6 13-7.6 13-7.6-13z" fill="url(#gGold)"/>`;
    s += `<circle cx="20" cy="${p}" r="2" fill="#fff6d8"/>`;
    s += `<path d="M20 ${b}V${d - 8}" class="chain"/>`;
    for (let y = b + 10; y < d - 12; y += 12) s += `<circle cx="20" cy="${y}" r="1.4" class="bead"/>`;
    s += `<path d="M20 ${d - 8}L8 ${d}M20 ${d - 8}L32 ${d}" class="chain"/>`;
    s += `<path d="M6 ${d}C9 ${d + 13} 31 ${d + 13} 34 ${d}Z" fill="url(#gBronzeBody)"/>`;
    s += `<ellipse cx="20" cy="${d}" rx="14" ry="2.6" fill="url(#gBronzeRim)"/>`;
    return s + '</svg>';
  }

  function buildHangings() {
    const box = $('hangings');
    const spots = window.innerWidth >= 700 ? [[4, 0.36], [11, 0.25], [89, 0.25], [96, 0.36]] : [[8, 0.3], [92, 0.3]];
    box.textContent = '';
    spots.forEach(([x, share], i) => {
      const L = Math.round(Math.max(150, window.innerHeight * share));
      const h = document.createElement('div');
      h.className = 'hang';
      h.style.cssText = `--x:${x}%;--swing:${rand(5, 8).toFixed(1)}s;--delay:${(-rand(0, 6)).toFixed(1)}s;--light:${(0.6 + i * 0.25).toFixed(2)}s`;
      h.innerHTML = hangingSVG(L)
        + `<span class="glow" style="top:${L - 50}px"></span>`
        + `<span class="fw" style="top:${L - 30}px"><span class="flame"></span></span>`;
      box.appendChild(h);
    });
  }

  // The carved bronze diya. Its shapes go into the page's <defs> once and every diya reuses them.
  const DIYA_BODY = 'M14 64A136 26 0 0 0 286 64C284 128 236 184 150 184C64 184 16 128 14 64Z';

  // The bowl as a round, lathe-turned shape: for each depth, the circle's radius and where it sits on screen.
  const BOWL = (() => {
    const rows = [];
    for (let i = 0; i <= 240; i++) {
      const s = i / 240, u = 1 - s;
      const x = u * u * u * 14 + 3 * u * u * s * 16 + 3 * u * s * s * 64 + s * s * s * 150;
      const y = u * u * u * 64 + 3 * u * u * s * 128 + 3 * u * s * s * 184 + s * s * s * 184;
      rows.push({ r: 150 - x, yc: y, yf: y + 0.19 * (150 - x) });
    }
    return rows;
  })();

  // The circle of the bowl whose front-most point is at height yf.
  function sectionAt(yf) {
    for (let i = 1; i < BOWL.length; i++) {
      const a = BOWL[i - 1], b = BOWL[i];
      if (b.yf < a.yf) break; // past the deepest point of the bowl
      if (b.yf >= yf) {
        const k = Math.max(0, (yf - a.yf) / (b.yf - a.yf || 1));
        return { r: a.r + (b.r - a.r) * k, yc: a.yc + (b.yc - a.yc) * k };
      }
    }
    return BOWL[BOWL.length - 1];
  }

  // A point on the bowl, `phi` radians round from the front, on the circle whose front point is at height yf.
  function onBowl(phi, yf) {
    const sec = sectionAt(yf), p = Math.max(-1.57, Math.min(1.57, phi));
    return [150 + sec.r * Math.sin(p), sec.yc + 0.19 * sec.r * Math.cos(p)];
  }

  // Wraps a flat drawing round the bowl, centred on angle phi0 and height yf0, so motifs narrow and
  // turn away towards the sides like real carving on a round pot.
  function wrap(points, phi0, yf0, rRef, close) {
    let d = '';
    points.forEach(([px, py], i) => {
      const [x, y] = onBowl(phi0 + px / rRef, yf0 + py);
      d += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`;
    });
    return close ? `${d}Z` : d;
  }

  // A line scored round the bowl at height yf.
  function scoredRing(yf) {
    let d = '';
    for (let i = 0; i <= 48; i++) {
      const [x, y] = onBowl(-1.57 + (3.14 * i) / 48, yf);
      d += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`;
    }
    return d;
  }

  // Outline of a lotus petal: a rounded base rising to a point, W wide and H tall, upwards from (0, 0).
  function petal(W, H, n = 16) {
    const half = (t) => (W / 2) * (t < 0.5 ? Math.sqrt(Math.sin(Math.PI * t)) : Math.pow(2 * (1 - t), 0.8));
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      left.push([-half(i / n), (-H * i) / n]);
      right.push([half(i / n), (-H * i) / n]);
    }
    return left.concat(right.reverse());
  }

  // Small, repeatable irregularities, so the carving looks hand-made rather than machine-perfect.
  let seed = 11;
  const jitter = (a) => { seed = (seed * 16807) % 2147483647; return ((seed / 2147483647) * 2 - 1) * a; };

  function buildDiyaArt() {
    const back = [], front = [], cuts = [];
    const N = 11, step = 0.29;
    for (let k = 0; k < N; k++) {
      const phi = (k - (N - 1) / 2) * step + jitter(0.01);
      const centre = k === (N - 1) / 2;
      const W = (centre ? 36 : 29) * (1 + jitter(0.04)), H = (centre ? 64 : 52) * (1 + jitter(0.03));
      const base = 172 + jitter(0.8), rRef = sectionAt(base - H * 0.45).r;
      // A band of raised lotus petals, the one facing us larger, each with a carved inner line and vein.
      front.push(wrap(petal(W, H), phi, base, rRef, true));
      cuts.push(wrap(petal(W * 0.56, H * 0.66).map(([x, y]) => [x, y - H * 0.12]), phi, base, rRef, true));
      cuts.push(wrap([[0, -H * 0.18], [0, -H * 0.86]], phi, base, rRef, false));
      if (centre) cuts.push(wrap(petal(W * 0.32, H * 0.4).map(([x, y]) => [x, y - H * 0.18]), phi, base, rRef, true));
      // Smaller petals peeping out from behind, between the big ones.
      if (k < N - 1) {
        const bH = 40 * (1 + jitter(0.04)), bW = 22 * (1 + jitter(0.04));
        back.push(wrap(petal(bW, bH), phi + step / 2, base - 10, sectionAt(base - 10 - bH * 0.45).r, true));
      }
    }
    let beads = ''; // raised beads under the lip, narrower as the bowl turns away
    for (let i = 0; i < 36; i++) {
      const phi = -1.5 + (3 * i) / 35, [x, y] = onBowl(phi, 96), r = 2.5 * (1 + jitter(0.06));
      beads += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(Math.max(0.3, r * Math.cos(phi)))}" ry="${f1(r)}"/>`;
    }
    let rope = ''; // a twisted-rope band
    for (let i = 0; i < 64; i++) {
      const phi = -1.52 + (3.04 * i) / 63 + jitter(0.004);
      const [x0, y0] = onBowl(phi - 0.014, 101.5), [x1, y1] = onBowl(phi + 0.014, 108);
      rope += `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
    }
    let flutes = ''; // fluting round the base
    for (let i = 0; i < 40; i++) {
      const phi = -1.45 + (2.9 * i) / 39, [x0, y0] = onBowl(phi, 174.5), [x1, y1] = onBowl(phi, 179.5);
      flutes += `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
    }
    const scored = cuts.join('') + [91.5, 100.5, 108.8, 173.5, 180].map(scoredRing).join('') + rope + flutes;
    document.querySelector('.defs defs').insertAdjacentHTML('beforeend', `
      <path id="diyaBody" d="${DIYA_BODY}"/>
      <clipPath id="cpDiyaBody"><path d="${DIYA_BODY}"/></clipPath>
      <g id="reliefBack"><path d="${back.join('')}"/></g>
      <g id="reliefFront"><path d="${front.join('')}"/></g>
      <g id="reliefBeads">${beads}</g>
      <g id="reliefCuts"><path d="${scored}"/></g>
      <linearGradient id="gRelief" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="286" y2="0">
        <stop offset="0" stop-color="#3a1c05"/><stop offset=".15" stop-color="#7d4716"/><stop offset=".32" stop-color="#c78a38"/>
        <stop offset=".45" stop-color="#f0c46c"/><stop offset=".52" stop-color="#ffe09a"/><stop offset=".62" stop-color="#d79c45"/>
        <stop offset=".82" stop-color="#7a4516"/><stop offset="1" stop-color="#3a1c05"/>
      </linearGradient>
      <linearGradient id="gReliefBack" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="286" y2="0">
        <stop offset="0" stop-color="#2c1404"/><stop offset=".15" stop-color="#653812"/><stop offset=".32" stop-color="#a8722c"/>
        <stop offset=".45" stop-color="#d8a85a"/><stop offset=".52" stop-color="#e9bf72"/><stop offset=".62" stop-color="#b57f36"/>
        <stop offset=".82" stop-color="#5f3410"/><stop offset="1" stop-color="#2c1404"/>
      </linearGradient>
      <linearGradient id="gPetalRound" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffecbe" stop-opacity=".28"/><stop offset=".55" stop-color="#ffecbe" stop-opacity="0"/>
        <stop offset="1" stop-color="#190a02" stop-opacity=".3"/>
      </linearGradient>
      <radialGradient id="gBead" cx=".38" cy=".32" r=".7">
        <stop offset="0" stop-color="#fff4cc"/><stop offset=".45" stop-color="#d9a04d"/><stop offset="1" stop-color="#6e3c12"/>
      </radialGradient>
      <filter id="fSoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1"/></filter>
      <filter id="fHammer" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/>
        <feColorMatrix type="matrix" values="0 0 0 0 .14  0 0 0 0 .07  0 0 0 0 .02  0 0 0 1.8 -.85"/>
      </filter>`);
  }

  // Bronze bowl: raised carving that catches the light and casts soft shadows, scored lines with a bright
  // far edge, a lightly hammered surface, a glowing inside and a twisted cotton wick.
  function diyaSVG() {
    let twists = '';
    for (let y = 60; y > 16; y -= 5) twists += `M147.6 ${y}L152.4 ${y - 3}`;
    return `<svg class="bowl" viewBox="0 0 300 215" aria-hidden="true">
      <ellipse cx="150" cy="205" rx="118" ry="8" fill="#000" opacity=".45"/>
      <ellipse cx="150" cy="190" rx="50" ry="9" fill="url(#gFoot)"/>
      <ellipse cx="150" cy="186.5" rx="44" ry="6" fill="#c58a3a" opacity=".85"/>
      <path d="M108 188A42 6 0 0 0 192 188" fill="none" stroke="#3a1a05" stroke-width="1" opacity=".6"/>
      <use href="#diyaBody" fill="url(#gBronzeBody)"/>
      <g clip-path="url(#cpDiyaBody)">
        <rect x="0" y="36" width="300" height="152" fill="#000" filter="url(#fHammer)" opacity=".32"/>
        <use href="#reliefBack" x="1.3" y="1.7" fill="#1a0a02" opacity=".6" filter="url(#fSoft)"/>
        <use href="#reliefBack" x="-.6" y="-.8" fill="#ffe7ad" opacity=".55"/>
        <use href="#reliefBack" fill="url(#gReliefBack)"/>
        <use href="#reliefFront" x="1.6" y="2.1" fill="#1a0a02" opacity=".65" filter="url(#fSoft)"/>
        <use href="#reliefFront" x="-.7" y="-.9" fill="#fff0c0" opacity=".7"/>
        <use href="#reliefFront" fill="url(#gRelief)"/>
        <use href="#reliefFront" fill="url(#gPetalRound)"/>
        <use href="#reliefBeads" x=".8" y="1" fill="#1a0a02" opacity=".6"/>
        <use href="#reliefBeads" fill="url(#gBead)"/>
        <use href="#reliefCuts" x=".45" y=".55" fill="none" stroke="#ffe2a0" stroke-width=".75" opacity=".45"/>
        <use href="#reliefCuts" fill="none" stroke="#2e1404" stroke-width="1" opacity=".62"/>
        <use href="#diyaBody" fill="url(#gBronzeShade)"/>
      </g>
      <ellipse cx="150" cy="64" rx="136" ry="26" fill="url(#gBronzeRim)"/>
      <ellipse cx="150" cy="64.6" rx="131" ry="24.2" fill="none" stroke="#3a1a05" stroke-width="1" opacity=".5"/>
      <ellipse cx="150" cy="65.1" rx="131" ry="24.2" fill="none" stroke="#fff0c0" stroke-width=".7" opacity=".45"/>
      <path d="M18 68A133 25 0 0 0 282 68" fill="none" stroke="#fff0c0" stroke-width="1.3" opacity=".55"/>
      <ellipse cx="150" cy="66" rx="121" ry="20" fill="url(#gInterior)"/>
      <ellipse class="inner-light" cx="150" cy="68" rx="112" ry="17" fill="url(#gInteriorGlow)"/>
      <ellipse cx="150" cy="65" rx="124" ry="21.5" fill="none" stroke="#fff1c4" stroke-width="1" opacity=".55"/>
      <path d="M150 66C146 52 154 38 150 22C149 17 151 13 150 10" fill="none" stroke="#f3e7cf" stroke-width="5" stroke-linecap="round"/>
      <path d="${twists}" fill="none" stroke="#bfa57d" stroke-width=".9"/>
      <circle cx="150" cy="11" r="2.8" fill="#2b1d12"/>
    </svg>`;
  }

  // A row of brass diyas on the floor, with a big one in the middle; tap one to light an anaar.
  // All nine are built once; CSS shows how many fit, so the row adapts instantly when the screen changes.
  function buildDiyas() {
    for (const kind of ['d4', 'd3', 'd2', 'd1', 'hero', 'd1', 'd2', 'd3', 'd4']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `diya ${kind}`;
      b.style.setProperty('--f', `${rand(0.12, 0.22).toFixed(2)}s`);
      b.setAttribute('aria-label', 'Light an anaar from this diya');
      b.innerHTML = `<span class="glow"></span>${diyaSVG()}<span class="fw"><span class="flame"></span></span>`;
      let last = 0;
      b.addEventListener('click', () => {
        if (state.mode === 'intro') return;
        const now = performance.now();
        if (now - last < 1800) return;
        last = now;
        const r = b.getBoundingClientRect();
        FX.anaar(r.left + r.width / 2, r.bottom - r.width * 0.68, 2.6); // from the wick
        b.classList.remove('flare');
        void b.offsetWidth;
        b.classList.add('flare');
      });
      el.diyas.appendChild(b);
    }
  }

  /* ================= Main loop ================= */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!state.studioOpen) {
      if (state.mode !== 'intro') {
        state.showT += dt;
        if (state.mode === 'sync' && !music.paused) scheduleSync();
        else scheduleFree(dt);
      }
      FX.step(dt);
      applyPulse(dt);
    }
    requestAnimationFrame(frame);
  }

  /* ================= Start ================= */
  buildDiyaArt();
  buildStars();
  buildBokeh();
  buildFloorMandala();
  buildHangings();
  buildSparkles();
  buildDiyas();
  $('introDiya').querySelector('.glow').insertAdjacentHTML('afterend', diyaSVG());
  tick();
  setInterval(tick, 1000);
  startGreetings();
  measure();

  let lastSize = [window.innerWidth, window.innerHeight];
  window.addEventListener('resize', () => {
    measure();
    // Rebuild the chains for a really different screen (rotation, another device), not when a URL bar slides.
    const [w, h] = lastSize;
    if (window.innerWidth !== w || Math.abs(window.innerHeight - h) > h * 0.15) {
      lastSize = [window.innerWidth, window.innerHeight];
      buildHangings();
    }
  });
  if (document.fonts) {
    document.fonts.load('700 48px Poppins', 'HAPPY DIWALI शुभ दीपावली').catch(() => {});
    document.fonts.ready.then(measure).catch(() => {});
  }
  loadTrack();
  requestAnimationFrame(frame);

  window.DiwaliDebug = { state, track }; // handy for checking the beat map from the browser console
})();
