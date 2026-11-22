import { residentDesign } from "./resident-design.js";
import { curvedPoints } from "./curves.js";
let cache,
  bypassHttpCache = false;
export function resetCatalogCache() {
  cache = null;
  bypassHttpCache = true;
}
export async function records(url, ll, project) {
  return (cache ??= (async () => {
    const res = await fetch(
      url("catalog.json"),
      bypassHttpCache ? { cache: "no-store" } : undefined,
    );
    if (!res.ok) throw Error("Hugo content catalog unavailable");
    const j = await res.json(),
      rows = j.houses.map(residentDesign),
      active = rows,
      shards = Object.create(null),
      plots = {},
      scenes = {},
      counts = {},
      byUser = new Map(rows.map((r) => [r.u, r])),
      directory = rows
        .map((r) => [r.u, r.d, r.href])
        .sort((a, b) => a[0].localeCompare(b[0]));
    for (const r of rows) {
      const [lon, lat] = ll(project, r.c[0] + 0.5, r.c[1] + 0.5);
      r.lat = lat;
      r.lon = lon;
      r.homeLL = ll(project, ...r.house.centre);
      const k = Array.from(r.u.slice(0, 2), (c) =>
          c.charCodeAt(0).toString(16),
        ).join(""),
        tile = r.c.map((n) => Math.floor(n / 256)).join("_");
      (shards[k] ??= Object.create(null))[r.u] = r;
      const row = [...r.c, r.u, r.s, r.d, r.house];
      (plots[tile] ??= []).push(row);
      for (const k of new Set([
        tile,
        r.house.centre.map((n) => Math.floor(n / 256)).join("_"),
      ]))
        (scenes[k] ??= []).push(row);
      counts[r.d] = (counts[r.d] || 0) + 1;
    }
    const trails = j.trails.map((t) => ({
      ...t,
      xy: curvedPoints(t.xy, t.id, t.w),
    }));
    for (const t of trails) t.ll = t.xy.map((p) => ll(project, ...p));
    for (const v of Object.values(j.roads))
      v.paths = v.paths.map((p, i) => {
        if (p.surveyed || p.id?.startsWith("lane-") || p.id?.startsWith("field-")) return p; // junction coordinates are identity, not smoothing suggestions
        let pts = p.xy;
        const r = byUser.get(p.owner);
        if (p.snap_ends && r)
          pts = [r.house.door, ...pts.slice(1, -1), r.house.gate];
        return { ...p, xy: curvedPoints(pts, p.owner || String(i), p.w) };
      });
    const zero = () => ({ community: 0, demo: 0, unreviewed: 0 }),
      recordStats = {
        schema: 1,
        byHandle: Object.create(null),
        byDistrict: Object.fromEntries(j.districts.map((d) => [d.id, zero()])),
        totals: zero(),
      };
    for (const r of active) {
      let k = r.record_kind || "unreviewed";
      recordStats.totals[k]++;
      recordStats.byDistrict[r.d][k]++;
      recordStats.byHandle[r.u] = k;
    }
    // New plots receive a default gate path unless the editor provides an owned entrance.
    const owned = new Set(
      Object.values(j.roads)
        .flatMap((v) => v.paths)
        .filter((p) => p.owner)
        .map((p) => p.owner),
    );
    for (const r of rows)
      if (!owned.has(r.u)) {
        const v = (j.roads[r.d] ??= {
          paths: [],
          poles: [],
          spans: [],
          services: [],
          lit: false,
        });
        v.paths.push({
          type: "entrance",
          owner: r.u,
          w: r.house.path_width_m,
          xy: [r.house.door, r.house.gate],
        });
      }
    for (const [id, bundle] of Object.entries(j.roads))
      bundle.homes = counts[id] || 0;
    const places = j.places.map((p) => {
      const point = p.point || p.cell.map((n) => n + 0.5),
        [lon, lat] = ll(project, ...point);
      return { ...p, point, lon, lat, yaw: p.yaw || 0 };
    });
    return {
      home: j.home || null,
      districts: j.districts,
      resources: j.resources,
      world: j.world,
      languages: j.languages,
      active,
      counts,
      shards,
      plots,
      scenes,
      directory,
      trails,
      roads: j.roads,
      places,

      recordStats,
    };
  })());
}
