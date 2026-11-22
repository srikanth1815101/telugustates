// Deterministic, irreversible one-way resident identity derivation.
// Real Instagram usernames are normalized in memory, hashed through 4,096 rounds
// of domain-separated SHA-256, and never stored in repository files or catalogs.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);
const enc = new TextEncoder();
const DOMAIN = "telugustates.atlas.resident.v1";
const ROUNDS = 256;
const IG_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "tv",
  "direct",
  "about",
]);

export const RESIDENT_ID_RE = /^h[0-9a-f]{24}$/;

export function sha256Bytes(msg) {
  const len = msg.length,
    bitHi = Math.floor((len * 8) / 0x100000000),
    bitLo = (len * 8) >>> 0,
    paddedLen = (len + 9 + 63) & ~63,
    buf = new Uint8Array(paddedLen),
    view = new DataView(buf.buffer);
  buf.set(msg);
  buf[len] = 0x80;
  view.setUint32(paddedLen - 8, bitHi, false);
  view.setUint32(paddedLen - 4, bitLo, false);

  let h0 = H0[0],
    h1 = H0[1],
    h2 = H0[2],
    h3 = H0[3],
    h4 = H0[4],
    h5 = H0[5],
    h6 = H0[6],
    h7 = H0[7];

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15],
        w2 = W[i - 2],
        s0 =
          ((w15 >>> 7) | (w15 << 25)) ^
          ((w15 >>> 18) | (w15 << 14)) ^
          (w15 >>> 3),
        s1 =
          ((w2 >>> 17) | (w2 << 15)) ^
          ((w2 >>> 19) | (w2 << 13)) ^
          (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 =
          ((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7)),
        ch = (e & f) ^ (~e & g),
        t1 = (h + S1 + ch + K[i] + W[i]) >>> 0,
        S0 =
          ((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10)),
        maj = (a & b) ^ (a & c) ^ (b & c),
        t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32),
    ov = new DataView(out.buffer);
  ov.setUint32(0, h0, false);
  ov.setUint32(4, h1, false);
  ov.setUint32(8, h2, false);
  ov.setUint32(12, h3, false);
  ov.setUint32(16, h4, false);
  ov.setUint32(20, h5, false);
  ov.setUint32(24, h6, false);
  ov.setUint32(28, h7, false);
  return out;
}

export function isResidentId(value) {
  return RESIDENT_ID_RE.test(String(value || "").trim().toLowerCase());
}

export function normalizeUsername(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//i.test(s)) {
    try {
      const u = new URL(s.startsWith("http") ? s : "https://" + s);
      if (
        !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
          u.hostname.toLowerCase(),
        )
      )
        return "";
      const seg = u.pathname.split("/").filter(Boolean)[0] || "";
      if (!seg || IG_RESERVED.has(seg.toLowerCase())) return "";
      s = seg;
    } catch {
      return "";
    }
  }
  s = s.replace(/^@+/, "").trim();
  if (
    !s ||
    s.length > 30 ||
    s.startsWith(".") ||
    s.endsWith(".") ||
    s.includes("..") ||
    !/^[a-z0-9._]+$/.test(s)
  )
    return "";
  return s;
}

export function residentId(rawUsername) {
  const clean = normalizeUsername(rawUsername);
  if (!clean) return "";
  const seed = enc.encode(`${DOMAIN}:${clean}`),
    work = new Uint8Array(36 + seed.length);
  work.set(seed, 36);
  let state = sha256Bytes(seed);
  for (let i = 0; i < ROUNDS; i++) {
    work.set(state, 0);
    work[32] = (i >>> 24) & 255;
    work[33] = (i >>> 16) & 255;
    work[34] = (i >>> 8) & 255;
    work[35] = i & 255;
    state = sha256Bytes(work);
  }
  let hex = "h";
  for (let i = 0; i < 12; i++) hex += state[i].toString(16).padStart(2, "0");
  return hex;
}

export function shardKey(id) {
  const s = String(id || "").trim().toLowerCase();
  if (RESIDENT_ID_RE.test(s)) return s.slice(1, 3);
  return [...s.slice(0, 2)]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

export function cleanHouseName(raw, fallback = "Resident") {
  const cleaned = String(raw || "")
    .replace(/^@+/, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
  return cleaned && !RESIDENT_ID_RE.test(cleaned.toLowerCase())
    ? cleaned
    : fallback;
}

export function houseLabel(item, fallback = "Resident") {
  if (!item) return fallback;
  if (typeof item === "string") return cleanHouseName(item, fallback);
  const candidate =
    item.name ||
    item.house_name ||
    item.house?.sign?.label ||
    item.sign?.label ||
    item.title ||
    "";
  return cleanHouseName(candidate, fallback);
}

export const RESIDENT_STORAGE_KEY = "atlas-resident-id-v1";
const LEGACY_HOUSE_KEY = "atlas-chosen-house-v714";
let cachedResidentId = "";

function isAndroidHost() {
  return (
    typeof location !== "undefined" &&
    location.hostname === "appassets.androidplatform.net"
  );
}

export function readStoredResidentIdSync() {
  if (cachedResidentId && RESIDENT_ID_RE.test(cachedResidentId))
    return cachedResidentId;
  if (typeof localStorage === "undefined") return "";
  try {
    localStorage.removeItem(LEGACY_HOUSE_KEY);
    const saved = String(localStorage.getItem(RESIDENT_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (RESIDENT_ID_RE.test(saved)) {
      cachedResidentId = saved;
      return saved;
    }
  } catch {}
  return "";
}

export async function readStoredResidentId() {
  const local = readStoredResidentIdSync();
  if (!isAndroidHost() || typeof fetch !== "function") return local;
  try {
    const res = await fetch("/_field/my-id", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const nativeId = String(data?.id || "")
        .trim()
        .toLowerCase();
      if (RESIDENT_ID_RE.test(nativeId)) {
        cachedResidentId = nativeId;
        try {
          localStorage.setItem(RESIDENT_STORAGE_KEY, nativeId);
        } catch {}
        return nativeId;
      }
      if (local) {
        await fetch("/_field/my-id?set=" + encodeURIComponent(local), {
          cache: "no-store",
        }).catch(() => {});
        return local;
      }
    }
  } catch {}
  return local;
}

export async function writeStoredResidentId(rawOrId) {
  const trimmed = String(rawOrId || "").trim().toLowerCase();
  const id = RESIDENT_ID_RE.test(trimmed) ? trimmed : residentId(rawOrId);
  if (!RESIDENT_ID_RE.test(id)) return "";
  cachedResidentId = id;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LEGACY_HOUSE_KEY);
      localStorage.setItem(RESIDENT_STORAGE_KEY, id);
    } catch {}
  }
  if (isAndroidHost() && typeof fetch === "function") {
    try {
      await fetch("/_field/my-id?set=" + encodeURIComponent(id), {
        cache: "no-store",
      });
    } catch {}
  }
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("atlas:resident-bound", { detail: id }),
    );
  }
  return id;
}
