import { get } from "./grid.js";
let tables, loading;
export function loadMessages() {
  return (loading ??= Promise.all(
    ["en", "te"].map((lang) => get("i18n/" + lang + ".json")),
  ).then(([en, te]) => {
    tables = { en, te };
  }));
}
export function reloadMessages() {
  loading = null;
  return loadMessages();
}
export function msg(id, args = {}) {
  const lang = document.documentElement.lang === "te" ? "te" : "en";
  const s = tables?.[lang]?.[id];
  if (typeof s !== "string") throw Error("Missing localized message: " + id);
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    Object.hasOwn(args, k) ? String(args[k]) : "{" + k + "}",
  );
}
export function bindMessages(root) {
  for (const [attribute, key] of [
    ["data-msg", null],
    ["data-msg-aria", "aria-label"],
    ["data-msg-title", "title"],
  ])
    for (const e of root.querySelectorAll("[" + attribute + "]")) {
      const v = msg(e.getAttribute(attribute));
      if (key) e.setAttribute(key, v);
      else e.textContent = v;
    }
}
