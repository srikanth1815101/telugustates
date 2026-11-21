// Project-maintained classes of published virtual plots. They are not Instagram badges or analytics.
export function recordKind(stats, u) {
  return Object.hasOwn(stats.byHandle, u) ? stats.byHandle[u] : "unreviewed";
}
export function recordName(k, tr) {
  if (k === "demo") return tr("Demo plot", "నమూనా ప్లాట్");
  if (k === "community") return tr("Community plot", "కమ్యూనిటీ ప్లాట్");
  return tr("Unreviewed plot", "పరిశీలించని ప్లాట్");
}
export function recordCounts(c, tr) {
  return [
    c.demo + " " + tr("demo", "నమూనా"),
    c.community + " " + tr("community", "కమ్యూనిటీ"),
    ...(c.unreviewed
      ? [c.unreviewed + " " + tr("unreviewed", "పరిశీలించనివి")]
      : []),
  ].join(" · ");
}
