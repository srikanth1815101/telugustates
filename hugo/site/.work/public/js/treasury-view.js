import { ink } from "./walk-icons.js";
import { get } from "./grid.js";
import { msg } from "./messages.js";
let treasury = null;
const el = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
export async function mountTreasury() {
  const [state, geo] = await Promise.all([
    get("living/public/treasury.json"),
    get("living/public/geography.json"),
  ]);
  treasury = state;
  const paint = () => {
    const b = document.querySelector("#balances"),
      c = document.querySelector("#condition");
    if (!b) return;
    b.replaceChildren();
    for (const [k, n] of [
      ...Object.entries(treasury.balances),
      ["residents", geo.allocatedCommunity],
      ["homes", geo.allocatedCommunity],
      ["acres", geo.allocatedCommunity],
      ["villages", geo.villages],
    ]) {
      const v = el("div", "");
      v.className = "resource resource-" + k;
      const emblem = el("i", "");
      emblem.innerHTML = ink(k);
      v.append(emblem);
      v.append(
        el(
          "strong",
          new Intl.NumberFormat(document.documentElement.lang).format(n),
        ),
        el("span", msg("econ." + k)),
      );
      b.append(v);
    }
    c.textContent =
      status() +
      " · " +
      verified() +
      " · " +
      msg(treasury.sharesVerified ? "econ.verifiedShares" : "econ.noShares");
  };
  function verified() {
    return (
      msg("econ.last") + ": " + (treasury.lastVerified || msg("econ.never"))
    );
  }
  function status() {
    return (
      msg("econ." + treasury.condition) +
      (treasury.foodDays === null
        ? ""
        : " · " + msg("econ.days", { n: treasury.foodDays }))
    );
  }
  function detail(box) {
    box.replaceChildren(
      el("h2", msg("home.resources")),
      el("p", status() + " · " + verified()),
      el("p", msg("econ.policy")),
      el("p", msg("econ.use", { n: treasury.dailyFoodNeed })),
      el(
        "p",
        msg(treasury.sharesVerified ? "econ.verifiedShares" : "econ.noShares"),
      ),
    );
    const dl = el("dl", "");
    for (const [k, n] of Object.entries(treasury.balances))
      dl.append(el("dt", msg("econ." + k)), el("dd", n));
    box.append(dl, el("h3", msg("econ.history")));
    if (!treasury.history.length) box.append(el("p", msg("econ.empty")));
    else {
      const t = el("table", ""),
        hdr = el("tr", "");
      for (const k of ["at", "resource", "change", "balance"])
        hdr.append(el("th", msg("econ." + k)));
      t.append(hdr);
      for (const row of treasury.history.slice(-40).reverse()) {
        const tr = el("tr", "");
        for (const v of [
          row.at.slice(0, 10),
          msg("econ." + row.resource),
          row.amount,
          row.balance,
        ])
          tr.append(el("td", v));
        t.append(tr);
      }
      box.append(t);
    }
    box.append(
      el("p", msg("econ.projects", { n: treasury.projects.length })),
      el("h3", msg("geo.measures")),
    );
    const sizes = el("dl", "");
    for (const k of [
      "areaKm2",
      "generatedCells",
      "claimableCapacity",
      "allocatedCommunity",
      "remainingEligible",
    ])
      sizes.append(
        el("dt", msg("geo." + k)),
        el(
          "dd",
          new Intl.NumberFormat(document.documentElement.lang).format(geo[k]),
        ),
      );
    box.append(sizes, el("p", msg("geo.reserveHelp")));
  }
  document.addEventListener("living:home-painted", paint);
  document.addEventListener("living:economy", (e) => detail(e.detail));
  const page = document.querySelector("#economy-page");
  if (page) {
    const draw = () => detail(page);
    draw();
    window.addEventListener("languagechange-atlas", draw);
  }
  paint();
}
