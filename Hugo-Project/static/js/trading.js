// Trading (Phase 5): deterministic daily route offers layered on the
// seeded economy — the route premium beats the plain market spread, and
// every execution moves BOTH goods and rupees (inventory-checked).
// @ts-check

/**
 * @param {{economy: any, inventory: any,
 *          onEvent?: (type: string, payload: any) => void}} deps
 */
export function createTrading(deps) {
  const { economy, inventory } = deps;
  const emit = deps.onEvent ?? (() => {});
  const ROUTE_RATE = 0.94; // route sell/buy rate vs market 0.86 / 1.00

  return {
    /** Three offers for `day`, pure in (seed, day). */
    offers(day) {
      const kinds = ["paddy", "rice", "chilli", "fish", "cotton", "ragi"];
      const out = [];
      for (let i = 0; i < 3; i++) {
        const ki = (day * 3 + i * 5 + 1) % kinds.length;
        const kind = kinds[ki];
        const market = economy.price(kind, day);
        if (market == null) continue;
        const side = (day + i) % 2 === 0 ? "sell" : "buy";
        out.push({
          id: `${day}-${i}`,
          kind,
          side,
          qty: 2 + ((day + i * 7) % 5),
          // Route price: better than the plain market gives you.
          price:
            side === "sell"
              ? Math.round(market * ROUTE_RATE)
              : Math.round(market * ROUTE_RATE),
          market,
        });
      }
      return out;
    },

    /** Execute an offer: validated against inventory/wallet, then settled. */
    execute(offer, day) {
      if (!offer || String(offer.id).split("-")[0] !== String(day))
        return { ok: false, why: "stale-offer" };
      if (offer.side === "buy") {
        // We BUY from the village route: pay rupees, receive goods.
        const r = economy.buy(offer.kind, offer.qty, day, ROUTE_RATE);
        if (!r.ok) return r;
        const got = inventory.add(offer.kind, offer.qty);
        if (got < offer.qty) {
          economy.sell(offer.kind, offer.qty - got, day); // refund shortfall
          return { ok: false, why: "bag-full", got };
        }
        emit("trade", { side: "buy", kind: offer.kind, qty: offer.qty });
        return { ok: true, ...r };
      }
      // We SELL to the route: goods out, rupees in at the premium rate.
      if (!inventory.has(offer.kind, offer.qty))
        return { ok: false, why: "no-goods" };
      const r = economy.sell(offer.kind, offer.qty, day, ROUTE_RATE);
      if (!r.ok) return r;
      inventory.remove(offer.kind, offer.qty);
      emit("trade", { side: "sell", kind: offer.kind, qty: offer.qty });
      return { ok: true, ...r };
    },
  };
}
