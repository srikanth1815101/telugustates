import { url } from "./grid.js";
const sat = (v) => Math.max(0, Math.min(1, v));
export const defaults = {
  Master: 0.62,
  Music: 0.1,
  Effects: 0.83,
  Ambience: 0.2,
  Weather: 0.22,
  mute: false,
  music: false,
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
    this.samples = new Map();
    this.lastBird = -1e6;
    this.lastWater = -1e6;
    this.lastScore = -1e6;
  }
  set(k, v) {
    if (!(k in defaults)) return;
    this.settings[k] = typeof defaults[k] === "boolean" ? !!v : sat(+v || 0);
    try {
      localStorage.setItem("nature-mixer-v2", JSON.stringify(this.settings));
    } catch {}
    this.levels();
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
        this.ctx = new AudioContext();
        for (const k of ["Master", "Music", "Effects", "Ambience", "Weather"]) {
          this.graph[k] = this.ctx.createGain();
          this.graph[k].connect(
            k === "Master" ? this.ctx.destination : this.graph.Master,
          );
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
        for (const k of ["bird", "splash-1", "splash-2"]) this.load(k);
      }
      if (!this.isHidden && this.ctx.state === "suspended")
        await this.ctx.resume();
    } catch {}
    return this.ctx;
  }
  pause(flag) {
    this.isHidden = flag;
    this.levels();
    if (this.ctx) {
      if (flag) this.ctx.suspend().catch(() => {});
      else if (!this.settings.mute) this.ctx.resume().catch(() => {});
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
      for (let i = 0; i < b.numberOfChannels; i++)
        for (const v of b.getChannelData(i)) peak = Math.max(peak, Math.abs(v));
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
      land ? 0.57 : wet ? 0.48 : 0.4,
      side === "l" ? -0.12 : 0.12,
      (land ? 0.9 : 1) + ((seq % 3) - 1) * 0.038,
      mud ? 1600 : wet ? 4300 : hard ? 4700 : 3400,
      wet ? "water-contact" : "foot-" + type,
    );
  }
  tick({
    hour,
    weather,
    speed,
    water,
    animal,
    animalM = Infinity,
    pan = 0,
    roof = false,
    forest = false,
  }) {
    const c = this.ctx;
    if (
      !c ||
      c.state !== "running" ||
      this.isHidden ||
      this.settings.mute ||
      c.currentTime - this.last < 1
    )
      return;
    const t = (this.last = c.currentTime),
      i = this.step++,
      r = weather.rain;
    // No catch-all birds, periodically whistled wildlife, or omnipresent village/river sounds.
    if (
      hour >= 6 &&
      hour < 18.8 &&
      r < 0.3 &&
      animalM < 8 &&
      /(kingfisher|parakeet|tern|myna|sparrow|sunbird)/i.test(animal || "") &&
      t - this.lastBird > 29
    ) {
      if (
        this.sample(
          "bird",
          "Ambience",
          0.051 * (1 - animalM / 8) ** 2,
          pan,
          0.96,
          3800,
          "near-bird",
        )
      )
        this.lastBird = t;
    }
    if (water && speed < 0.1 && t - this.lastWater > 17) {
      if (
        this.sample(
          "splash-2",
          "Ambience",
          0.018,
          -0.1,
          0.73,
          1350,
          "near-water",
        )
      )
        this.lastWater = t;
    }
    if (r > 0.08 && i % 3 === 0)
      this.voice(
        "Weather",
        roof ? 630 : forest ? 840 : 650,
        430,
        2.6,
        0.019 * r,
        0,
        true,
        0,
        "local-rain",
      );
    if (this.settings.music && t - this.lastScore > 6) {
      const k = theme(hour, r, speed),
        f = 98 * 2 ** (motifs[k][i % 8] / 12);
      this.voice("Music", f, f, 2.0, 0.021, -0.1, false, 0, "optional-score");
      this.lastScore = t;
    }
  }
  dispose() {
    for (const s of this.voices) {
      try {
        s.stop();
      } catch {}
    }
    this.ctx?.close().catch(() => {});
  }
}
