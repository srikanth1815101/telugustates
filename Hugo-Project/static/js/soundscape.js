import { url } from "./grid.js";
const sat = (v) => Math.max(0, Math.min(1, v));
export const defaults = {
  Master: 0.85,
  Music: 0.59,
  Effects: 0.68,
  Ambience: 0.77,
  Weather: 0.91,
  mute: false,
  music: true,
};
const motifs = {
  morning: [0, 4, 7, 11, 9, 7, 4, 2],
  day: [0, 7, 9, 4, 2, 4, 7, 2],
  evening: [0, 3, 7, 10, 7, 5, 3, 0],
  night: [0, 7, 3, 2, -2, 0, 5, 3],
  rain: [0, 2, 5, 3, 0, -2, 3, 2],
  explore: [0, 5, 7, 12, 9, 5, 2, 7],
};
export function theme(h, r, walk) {
  return r > 0.48
    ? "rain"
    : h < 5 || h >= 21
      ? "night"
      : h < 9
        ? "morning"
        : h >= 17
          ? "evening"
          : walk > 4
            ? "explore"
            : "day";
}
const calls = {
  kingfisher: [2460, 1.5, 0.12],
  peafowl: [620, 1.9, 0.52],
  parakeet: [1900, 1.45, 0.19],
  crow: [470, 0.67, 0.28],
  kite: [1270, 0.72, 0.42],
  egret: [720, 0.82, 0.24],
  cow: [170, 0.7, 0.68],
  buffalo: [113, 0.67, 0.82],
  goat: [393, 1.13, 0.27],
  dog: [248, 0.58, 0.13],
  cat: [630, 0.56, 0.31],
  hen: [430, 1.35, 0.15],
  rooster: [670, 0.74, 0.56],
  monkey: [550, 1.51, 0.18],
  deer: [310, 0.71, 0.17],
  frog: [140, 0.63, 0.16],
  cricket: [3900, 1.02, 0.1],
  owl: [350, 0.78, 0.39],
  bee: [173, 1.01, 0.41],
  bird: [1750, 1.43, 0.19],
};
export function animalCue(name, h, r) {
  const night = h < 6 || h > 19;
  if (night) return r > 0.2 ? "frog" : h < 4 ? "owl" : "cricket";
  const k = Object.keys(calls).find((k) =>
    String(name).toLowerCase().includes(k),
  );
  return k || "bird";
}
export class Soundscape {
  constructor() {
    this.settings = { ...defaults };
    try {
      const old = JSON.parse(localStorage.getItem("living-mixer-v1"));
      const a =
        JSON.parse(localStorage.getItem("field-audio-v3")) ||
        JSON.parse(localStorage.getItem("nature-mixer-v2")) ||
        (old ? { mute: old.mute, Master: old.Master } : {});
      for (const k in defaults)
        if (typeof a?.[k] === typeof defaults[k])
          this.settings[k] = typeof defaults[k] === "number" ? sat(a[k]) : a[k];
    } catch {}
    this.voices = new Set();
    this.events = [];
    this.max = 24;
    this.step = 0;
    this.last = -99;
    this.isHidden = false;
    this.graph = {};
    this.loops = {};
    this.meters = {};
    this.ear = 1;
    this.samples = new Map();
    this.lastBird = -1e6;
    this.lastWater = -1e6;
    this.lastScore = -1e6;
  }
  set(k, v) {
    if (!(k in defaults)) return;
    this.settings[k] = typeof defaults[k] === "boolean" ? !!v : sat(+v || 0);
    try {
      localStorage.setItem("field-audio-v3", JSON.stringify(this.settings));
    } catch {}
    this.levels();
  }
  restore() {
    this.settings = { ...defaults };
    this.set("mute", false);
  }
  levels() {
    if (!this.ctx) return;
    for (const k of ["Master", "Music", "Ambience", "Effects", "Weather"])
      this.graph[k].gain.setTargetAtTime(
        this.settings[k] *
          ((k === "Master" && (this.isHidden || this.settings.mute)) ||
          (k === "Music" && !this.settings.music)
            ? 0
            : 1),
        this.ctx.currentTime,
        0.12,
      );
  }
  async unlock() {
    try {
      if (!this.ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        try {
          this.ctx = new Context({
            latencyHint: "interactive",
            sampleRate: 32000,
          });
        } catch {
          this.ctx = new Context();
        }
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -7;
        this.limiter.knee.value = 4;
        this.limiter.ratio.value = 5;
        this.limiter.connect(this.ctx.destination);
        for (const k of ["Master", "Music", "Effects", "Ambience", "Weather"]) {
          this.graph[k] = this.ctx.createGain();
          const tap = this.ctx.createAnalyser();
          tap.fftSize = 1024;
          this.graph[k].connect(tap);
          tap.connect(k === "Master" ? this.limiter : this.graph.Master);
          this.meters[k] = tap;
        }
        this.noise = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 2,
          this.ctx.sampleRate,
        );
        const a = this.noise.getChannelData(0);
        let seed = 47;
        for (let i = 0; i < a.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          a[i] = seed / 2147483648 - 1;
        }
        this.levels();
        for (const kind of ["sand", "stone"])
          for (const side of ["l", "r"])
            for (const n of [1, 2, 3]) this.load(kind + side + n);
        for (const k of [
          "bird",
          "splash-1",
          "splash-2",
          "rainfall",
          "grove",
          "acre-song",
        ])
          this.load(k);
      }
      if (!this.isHidden && this.ctx.state !== "running")
        await this.ctx.resume();
    } catch {}
    return this.ctx;
  }
  pause(flag) {
    this.isHidden = flag;
    if (flag) this.silence();
    this.levels();
    if (this.ctx) {
      if (flag) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }
  }
  voice(
    bus,
    from,
    to,
    sec,
    amp,
    pan = 0,
    noisy = false,
    delay = 0,
    kind = "tone",
  ) {
    const c = this.ctx;
    if (
      !c ||
      c.state !== "running" ||
      this.isHidden ||
      this.voices.size >= this.max ||
      this.settings.mute
    )
      return;
    const s = noisy ? c.createBufferSource() : c.createOscillator(),
      g = c.createGain(),
      f = c.createBiquadFilter(),
      p = c.createStereoPanner(),
      t = c.currentTime + delay;
    f.type = "lowpass";
    f.frequency.value = noisy ? from : Math.min(5600, from * 4);
    if (noisy) {
      s.buffer = this.noise;
      s.loop = true;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + sec);
    } else {
      s.type = bus === "Music" ? "triangle" : "sine";
      s.frequency.setValueAtTime(from, t);
      s.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + sec);
    }
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, amp),
      t + Math.min(0.1, sec / 4),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    s.connect(f).connect(g).connect(p).connect(this.graph[bus]);
    this.voices.add(s);
    s.onended = () => {
      this.voices.delete(s);
      for (const n of [s, f, g, p]) n.disconnect();
    };
    s.start(t);
    s.stop(t + sec + 0.01);
    this.events.push(kind);
    if (this.events.length > 32) this.events.shift();
  }
  async load(id) {
    if (this.samples.has(id)) return;
    this.samples.set(id, null);
    try {
      const r = await fetch(url("library/walk/" + id + ".ogg"));
      if (!r.ok) throw Error(r.status);
      const b = await this.ctx.decodeAudioData(await r.arrayBuffer());
      let peak = 0.01;
      if (!["rainfall", "acre-song", "grove"].includes(id))
        for (let i = 0; i < b.numberOfChannels; i++)
          for (const v of b.getChannelData(i))
            peak = Math.max(peak, Math.abs(v));
      this.samples.set(id, { b, peak });
    } catch {
      this.samples.delete(id);
    }
  }
  sample(id, bus, amp, pan = 0, rate = 1, hz = 5200, label = id) {
    const c = this.ctx,
      a = this.samples.get(id);
    if (
      !c ||
      c.state !== "running" ||
      !a ||
      this.isHidden ||
      this.settings.mute ||
      this.voices.size >= this.max
    )
      return false;
    const s = c.createBufferSource(),
      g = c.createGain(),
      p = c.createStereoPanner(),
      f = c.createBiquadFilter();
    s.buffer = a.b;
    s.playbackRate.value = rate;
    g.gain.value = amp / a.peak;
    p.pan.value = Math.max(-1, Math.min(1, pan));
    f.type = "lowpass";
    f.Q.value = 0.58;
    f.frequency.value = hz;
    s.connect(f).connect(g).connect(p).connect(this.graph[bus]);
    this.voices.add(s);
    s.onended = () => {
      this.voices.delete(s);
      for (const n of [s, g, p, f]) n.disconnect();
    };
    s.start();
    this.events.push(label);
    if (this.events.length > 32) this.events.shift();
    return true;
  }
  footstep(type, land, seq) {
    const wet = type === "water",
      hard = type === "rock",
      mud = /mud/.test(type),
      side = seq % 2 ? "l" : "r",
      n = 1 + (Math.floor(seq / 2) % 3),
      id = wet
        ? "splash-" + (1 + (seq % 2))
        : (hard ? "stone" : "sand") + side + n;
    this.sample(
      id,
      "Effects",
      (land ? 0.46 : wet ? 0.33 : 0.29) * this.ear,
      side === "l" ? -0.12 : 0.12,
      (land ? 0.9 : 1) + ((seq % 3) - 1) * 0.038,
      mud ? 1600 : wet ? 4300 : hard ? 4700 : 3400,
      wet ? "water-contact" : "foot-" + type,
    );
  }
  // The beds run on the audio clock, not on animation ticks. Slow rendering never opens gaps in the rain or score.
  bed(id, bus, level, hz, pan = 0, rate = 1) {
    const c = this.ctx,
      buffer =
        id === "wind" || id === "flow" ? this.noise : this.samples.get(id)?.b;
    if (!buffer) return;
    let bed = this.loops[id];
    if (!bed) {
      if (level <= 0.0001) return;
      const src = c.createBufferSource(),
        filter = c.createBiquadFilter(),
        gain = c.createGain(),
        st = c.createStereoPanner();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = rate;
      filter.type = "lowpass";
      filter.Q.value = 0.55;
      filter.frequency.value = hz;
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(st).connect(this.graph[bus]);
      src.start();
      bed = this.loops[id] = { src, filter, gain, st };
      this.events.push(id);
    }
    const t = c.currentTime;
    bed.filter.frequency.setTargetAtTime(hz, t, 0.22);
    bed.gain.gain.setTargetAtTime(level, t, 0.25);
    bed.st.pan.setTargetAtTime(pan, t, 0.22);
  }
  silence() {
    for (const { gain } of Object.values(this.loops))
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }
  meter() {
    const levels = {};
    if (!this.ctx || this.ctx.state !== "running") return levels;
    const v = new Float32Array(1024);
    for (const [k, m] of Object.entries(this.meters)) {
      m.getFloatTimeDomainData(v);
      let sum = 0;
      for (const x of v) sum += x * x;
      levels[k] = Math.round(Math.sqrt(sum / v.length) * 100000) / 100000;
    }
    return levels;
  }
  tick({
    hour,
    weather,
    speed,
    waterGain = 0,
    waterPan = 0,
    animal,
    animalM = Infinity,
    pan = 0,
    roof = false,
    forest = false,
    cameraM = 0,
    heading = 0,
  }) {
    const c = this.ctx;
    if (!c || c.state !== "running" || this.isHidden || this.settings.mute)
      return;
    const t = c.currentTime,
      r = sat(weather.rain || 0),
      day = hour >= 5.7 && hour < 18.9,
      wind = sat(weather.wind || 0.28),
      wobble = 0.82 + 0.18 * Math.sin(t * 0.61 + Math.sin(t * 0.17));
    this.ear = 1 / (1 + 0.065 * Math.max(0, cameraM - 1));
    this.bed(
      "rainfall",
      "Weather",
      r > 0.015 ? (roof ? 0.71 : 1) * (0.24 + 0.64 * Math.sqrt(r)) : 0,
      (roof ? 2850 : 4500) + r * 4700,
    );
    this.bed("acre-song", "Music", this.settings.music ? 0.56 : 0, 11200);
    this.bed(
      "grove",
      "Ambience",
      day ? (forest ? 0.8 : 0.45) * (1 - 0.78 * r) : 0,
      forest ? 7600 : 5600,
      0.17 * Math.cos(heading - 0.7),
    );
    this.bed(
      "wind",
      "Ambience",
      (0.19 + 0.16 * wind + 0.08 * r) * wobble,
      1000 + 800 * wind,
      0.25 * Math.sin(heading + 0.5),
      0.92,
    );
    this.bed(
      "flow",
      "Ambience",
      0.64 * waterGain * (0.79 + 0.21 * Math.sin(t * 1.26)),
      2100 + 1800 * waterGain,
      waterPan,
      0.73,
    );
    if (t - this.last < 1.3) return;
    this.last = t;
    const i = this.step++;
    if (!day && i % 3 === 0 && r < 0.65) {
      for (let k = 0; k < 3; k++)
        this.voice(
          "Ambience",
          3060,
          3230,
          0.09,
          0.048,
          -0.34 * Math.cos(heading),
          false,
          k * 0.19,
          "field-insect",
        );
    }
    if (
      day &&
      r < 0.6 &&
      animalM < 28 &&
      /myna|kingfisher|tern|sparrow|parakeet|sunbird/i.test(animal || "") &&
      t - this.lastBird > 8
    ) {
      if (
        this.sample(
          "bird",
          "Ambience",
          0.18 / (1 + animalM * 0.075),
          pan,
          1,
          6400,
          "near-bird",
        )
      )
        this.lastBird = t;
    }
    if (waterGain > 0.15 && t - this.lastWater > 5) {
      if (
        this.sample(
          "splash-2",
          "Ambience",
          0.13 * waterGain,
          waterPan,
          0.72,
          2600,
          "shore-lap",
        )
      )
        this.lastWater = t;
    }
    if (this.events.length > 32) this.events.splice(0, this.events.length - 32);
  }
  dispose() {
    for (const s of this.voices) {
      try {
        s.stop();
      } catch {}
    }
    for (const b of Object.values(this.loops)) {
      b.src.stop();
      for (const n of Object.values(b)) n.disconnect();
    }
    this.ctx?.close().catch(() => {});
    if (shared === this) shared = null;
  }
}

let shared = null;
export const fieldMixer = () => (shared ??= new Soundscape());
export function primeFieldAudio() {
  const prime = () => {
    if (!document.hidden) fieldMixer().unlock();
  };
  // Listen before the lazy 3D import: the search submit or map tap may be the only trusted gesture.
  window.addEventListener("pointerdown", prime, {
    capture: true,
    passive: true,
  });
  window.addEventListener("keydown", prime, { capture: true });
}
