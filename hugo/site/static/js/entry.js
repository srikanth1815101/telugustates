import { dev } from "./edition.js";
import { url } from "./grid.js";
if (dev) {
  const target = document.querySelector("#public-home"),
    rec = document.querySelector("#review-record");
  if (target) {
    const r = await fetch(url("review/index.html"));
    if (!r.ok) throw Error("Missing review layout");
    const t = new DOMParser()
      .parseFromString(await r.text(), "text/html")
      .querySelector("#review-shell");
    document.querySelector("#world")?.remove();
    const fragment = t.content.cloneNode(true);
    for (const el of fragment.querySelectorAll("[src]"))
      el.src = new URL(el.getAttribute("src"), r.url).href;
    target.replaceWith(fragment);
  } else if (rec) {
    document
      .querySelector("#no-public-house")
      .replaceWith(rec.content.cloneNode(true));
  } else if (document.querySelector("#review-shell"))
    document
      .querySelector("#review-shell")
      .replaceWith(
        document.querySelector("#review-shell").content.cloneNode(true),
      );
  for (const l of document.querySelectorAll("a[href]")) {
    const a = new URL(l.href, location.href);
    if (
      a.origin === location.origin &&
      (a.hash.startsWith("#/u/") ||
        a.hash.startsWith("#/plot/") ||
        l.matches(".brand,.back"))
    ) {
      a.searchParams.set("dev", "1");
      l.href = a.href;
    }
  }
  await import("./app.js");
} else {
  document.body.classList.add("public-edition", "paper-map");
  await import("./public-home.js");
}
