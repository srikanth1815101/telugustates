import { residentDesign } from "./resident-design.js";
import { curvedPoints } from "./curves.js";
let cache;
export async function records(url, ll, project) {
  return (cache ??= (async () => {
    const res = await fetch(url("catalog.json"));
    if (!res.ok) throw Error("Hugo content catalog unavailable");
    const j = await res.json(),
      rows = j.houses.map(residentDesign),
      active = rows,
      shards = Object.create(null),
      plots = {},
      counts = {},
      byUser = new Map(rows.map((r) => [r.u, r])),
      directory = rows
        .map((r) => [r.u, r.d, r.href])
        .sort((a, b) => a[0].localeCompare(b[0]));
    for (const r of rows) {
      const [lon, lat] = ll(project, r.c[0] + 0.5, r.c[1] + 0.5);
      r.lat = lat;
      r.lon = lon;
      const k = Array.from(r.u.slice(0, 2), (c) =>
          c.charCodeAt(0).toString(16),
        ).join(""),
        tile = r.c.map((n) => Math.floor(n / 256)).join("_");
      (shards[k] ??= Object.create(null))[r.u] = r;
      (plots[tile] ??= []).push([...r.c, r.u, r.s, r.d, r.house]);
      counts[r.d] = (counts[r.d] || 0) + 1;
    }
    const trails = j.trails.map((t) => ({
      ...t,
      xy: curvedPoints(t.xy, t.id, t.w),
    }));
    for (const t of trails) t.ll = t.xy.map((p) => ll(project, ...p));
    for (const v of Object.values(j.roads))
      v.paths = v.paths.map((p, i) => {
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
          xy: curvedPoints(
            [r.house.door, r.house.gate],
            r.u,
            r.house.path_width_m,
          ),
        });
      }
    const places = j.places.map((p) => {
      const point = p.point || p.cell.map((n) => n + 0.5),
        [lon, lat] = ll(project, ...point);
      return { ...p, point, lon, lat, yaw: p.yaw || 0 };
    });
    return {
      districts: j.districts,
      resources: j.resources,
      world: j.world,
      languages: j.languages,
      active,
      counts,
      shards,
      plots,
      directory,
      trails,
      roads: j.roads,
      places,

      recordStats,
    };
  })());
}
