// Deterministic economy (Phase 4): seeded PRNG daily prices and a wallet
// with validated transactions. Same seed + same day ⇒ same prices on every
// device — no server, no hidden randomness.
// @ts-check

/** Mulberry32 — tiny, seedable, uniform enough for price jitter. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_CATALOG = {
  paddy: { base: 42, vol: 0.18 },
  rice: { base: 58, vol: 0.12 },
  ragi: { base: 36, vol: 0.15 },
  cotton: { base: 74, vol: 0.22 },
  chilli: { base: 96, vol: 0.3 },
  fish: { base: 120, vol: 0.25 },
  milk: { base: 34, vol: 0.1 },
  egg: { base: 7, vol: 0.12 },
};

/**
 * @param {{seed?: number, rupees?: number, catalog?: typeof DEFAULT_CATALOG}} [opts]
 */
export function createEconomy(opts = {}) {
  const seed = opts.seed ?? 20260101;
  const catalog = opts.catalog ?? DEFAULT_CATALOG;
  let rupees = opts.rupees ?? 500;
  /** @type {Array<{day: number, kind: string, qty: number, side: string, total: number}>} */
  const ledger = [];

  /** Price of `kind` on world `day` — pure function of (seed, day, kind). */
  const price = (kind, day) => {
    const entry = catalog[kind];
    if (!entry) return null;
    // Per-good, per-day jitter: hash seed with day and kind index.
    const ki = Object.keys(catalog).indexOf(kind);
    const r = mulberry32(seed ^ ((day * 2654435761 + ki * 40503) >>> 0));
    r(); // warm-up
    const swing = (r() * 2 - 1) * entry.vol;
    return Math.max(1, Math.round(entry.base * (1 + swing)));
  };

  return {
    price,
    rupees: () => rupees,
    ledger: () => ledger.slice(),
    /**
     * Buy qty of kind on `day`. Returns {ok, total} or {ok:false, why}.
     * Deterministic: same args ⇒ same result.
     */
    buy(kind, qty, day) {
      const p = price(kind, day);
      if (p == null) return { ok: false, why: "unknown-good" };
      if (!Number.isInteger(qty) || qty <= 0)
        return { ok: false, why: "bad-qty" };
      const total = p * qty;
      if (total > rupees) return { ok: false, why: "insufficient-funds" };
      rupees -= total;
      ledger.push({ day, kind, qty, side: "buy", total });
      return { ok: true, total, price: p };
    },
    /** Sell qty of kind on `day` at 86% of the day price (market spread). */
    sell(kind, qty, day) {
      const p = price(kind, day);
      if (p == null) return { ok: false, why: "unknown-good" };
      if (!Number.isInteger(qty) || qty <= 0)
        return { ok: false, why: "bad-qty" };
      const total = Math.round(p * 0.86) * qty;
      rupees += total;
      ledger.push({ day, kind, qty, side: "sell", total });
      return { ok: true, total, price: Math.round(p * 0.86) };
    },
    serialise() {
      return { seed, rupees, ledger };
    },
    restore(data) {
      if (data && typeof data === "object") {
        if (Number.isFinite(data.rupees)) rupees = data.rupees;
        if (Array.isArray(data.ledger)) ledger.length = 0, ledger.push(...data.ledger.filter((e) => e && Number.isFinite(e.total)));
      }
      return this;
    },
  };
}
