import { ink } from "./walk-icons.js";
import { get } from "./grid.js";
import { msg } from "./messages.js";
const el = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
export async function mountTreasury() {
  const [state, atlas] = await Promise.all([
    get("living/resources.json"),
    get("data/atlas.json"),
  ]);
  const rows = ["food", "currency", "gold", "homes"].map((k) => [
    k,
    k === "homes" ? atlas.total : (state[k] ?? 0),
  ]);
  const paint = () => {
    const b = document.querySelector("#balances"),
      c = document.querySelector("#condition");
    if (!b) return;
    b.replaceChildren();
    for (const [k, n] of rows) {
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
    c.textContent = msg("home.treasuryNote");
  };
  function detail(box) {
    box.replaceChildren(el("h2", msg("home.resources")));
    const list = el("dl", "");
    for (const [k, n] of rows)
      list.append(
        el("dt", msg("econ." + k)),
        el(
          "dd",
          new Intl.NumberFormat(document.documentElement.lang).format(n),
        ),
      );
    box.append(list, el("p", msg("home.treasuryNote")));
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
