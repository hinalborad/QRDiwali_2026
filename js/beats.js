/* Beat map — decodes the track once and finds the moments where a firework should burst. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function decode(arrayBuffer) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error('Web Audio is not supported'));
    // 22 kHz is plenty for finding beats and halves the memory needed on phones.
    const ctx = new Offline(1, 22050, 22050);
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  function analyze(buf) {
    const sr = buf.sampleRate;
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
    const hop = Math.max(64, Math.round(sr / 86)); // ~86 frames per second
    const frames = Math.floor(buf.length / hop);
    const fps = sr / hop;
    if (frames < 16) return null;

    // Energy per frame: bass (kick drum, dhol) and the full band.
    const low = new Float32Array(frames);
    const full = new Float32Array(frames);
    const rms = new Float32Array(frames);
    const a = 1 - Math.exp((-2 * Math.PI * 150) / sr); // one-pole low-pass at 150 Hz
    let lp = 0;
    let idx = 0;
    for (let f = 0; f < frames; f++) {
      let el = 0;
      let ef = 0;
      for (let j = 0; j < hop; j++, idx++) {
        const x = (ch0[idx] + ch1[idx]) * 0.5;
        lp += a * (x - lp);
        el += lp * lp;
        ef += x * x;
      }
      low[f] = Math.log1p((1000 * el) / hop);
      full[f] = Math.log1p((1000 * ef) / hop);
      rms[f] = Math.sqrt(ef / hop);
    }

    // Onset strength: how sharply the energy rises over the last few frames.
    const odf = new Float32Array(frames);
    let maxO = 0;
    let maxLoud = 1e-9;
    for (let f = 3; f < frames; f++) {
      const pl = (low[f - 1] + low[f - 2] + low[f - 3]) / 3;
      const pf = (full[f - 1] + full[f - 2] + full[f - 3]) / 3;
      odf[f] = 0.65 * Math.max(0, low[f] - pl) + 0.35 * Math.max(0, full[f] - pf);
      if (odf[f] > maxO) maxO = odf[f];
    }
    for (let f = 0; f < frames; f++) if (rms[f] > maxLoud) maxLoud = rms[f];
    if (maxO === 0) return null;

    // Keep the peaks that stand out from their surroundings.
    const ps = new Float64Array(frames + 1);
    for (let f = 0; f < frames; f++) ps[f + 1] = ps[f] + odf[f];
    const half = Math.round(fps * 0.6);
    const gap = Math.round(fps * 0.2);
    const loc = 3;
    const peaks = [];
    let last = -1e9;
    for (let f = loc; f < frames - loc; f++) {
      const v = odf[f];
      if (v <= 0) continue;
      const lo = Math.max(0, f - half);
      const hi = Math.min(frames, f + half + 1);
      const mean = (ps[hi] - ps[lo]) / (hi - lo);
      if (v < mean * 1.5 + 0.06 * maxO) continue;
      let isPeak = true;
      for (let k = f - loc; k <= f + loc; k++) if (odf[k] > v) { isPeak = false; break; }
      if (!isPeak || f - last < gap) continue;
      peaks.push({ t: f / fps, v, loud: rms[f] / maxLoud });
      last = f;
    }

    // Loudness envelope, 20 values per second.
    const envFps = 20;
    const envLen = Math.max(1, Math.ceil(buf.duration * envFps));
    const env = new Float32Array(envLen);
    for (let i = 0; i < envLen; i++) {
      const f0 = Math.floor((i / envFps) * fps);
      const f1 = Math.min(frames, Math.floor(((i + 1) / envFps) * fps));
      let m = 0;
      for (let f = f0; f < f1; f++) m = Math.max(m, rms[f]);
      env[i] = m / maxLoud;
    }

    const sorted = peaks.map((p) => p.v).sort((x, y) => x - y);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] || maxO;
    const beats = peaks.map((p) => ({ t: p.t, s: clamp(0.65 * (p.v / p90) + 0.35 * p.loud, 0.1, 1) }));

    // Fill long held notes with gentle shells so the sky never goes dark.
    const out = [];
    let prev = 0;
    for (const b of beats.concat([{ t: buf.duration, end: true }])) {
      const g = b.t - prev;
      if (g > 1.5) {
        const steps = Math.floor(g / 0.75);
        for (let k = 1; k < steps; k++) {
          const t = prev + (g * k) / steps;
          const lv = env[Math.min(envLen - 1, Math.floor(t * envFps))];
          if (lv > 0.12) out.push({ t, s: 0.2 + 0.35 * lv });
        }
      }
      if (!b.end) out.push(b);
      prev = b.t;
    }
    if (!out.length) return null;
    return { duration: buf.duration, beats: out, env, envFps };
  }

  window.Beats = {
    analyze: (arrayBuffer) => decode(arrayBuffer).then(analyze),
  };
})();
