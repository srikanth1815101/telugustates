// Node 20+, no dependencies. Build into a temporary directory; never write generated rows to content/.
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { residentDesign } from "../static/js/resident-design.js";
import { decodeAcre } from "../static/js/acre-codec.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-content-")),
  json = async (f) => JSON.parse(await fs.readFile(f));
try {
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  const all = await json(path.join(tmp, "catalog.json")),
    atlas = await json(path.join(tmp, "data/atlas.json"));
  atlas.districts = all.districts;
  const cells = new Set(),
    names = new Set(),
    ids = new Set(atlas.districts.map((d) => d.id));
  for (const r of all.houses) {
    residentDesign(r);
    assert(!names.has(r.u) && /^[a-z0-9_.]{1,30}$/.test(r.u), r.u);
    names.add(r.u);
    assert(!cells.has(r.c.join(",")) && r.c.every(Number.isInteger), r.u);
    cells.add(r.c.join(","));
    assert(
      ids.has(r.d) &&
        r.house.size_m.length === 3 &&
        r.house.parts.length &&
        ["demo", "community", "unreviewed"].includes(r.record_kind),
      r.u,
    );
    assert(
      /^#[\da-f]{6}$/i.test(r.house.wall_color) &&
        /^#[\da-f]{6}$/i.test(r.house.roof_color),
      r.u,
    );
  }
  for (const path of [
    ...Object.values(all.roads).flatMap((v) => v.paths),
    ...all.trails,
  ])
    assert(
      path.xy.length >= 2 &&
        path.xy.every((p) => p.length === 2 && p.every(Number.isFinite)),
      "Bad route",
    );
  // Check the same PUBLIC lookup, district totals and plot shards that feed both editions of the app.
  const { get } = await import("../static/js/grid.js");
  globalThis.fetch = async (u) => {
    const f = path.relative(path.join(root, "static"), fileURLToPath(u));
    return new Response(await fs.readFile(path.join(tmp, f)));
  };
  const published = await get("data/atlas.json"),
    directory = await get("data/directory.json");
  assert.equal(published.total, all.houses.length);
  assert.equal(directory.length, published.total);
  assert.equal(
    published.districts.reduce((n, d) => n + d.count, 0),
    published.total,
  );
  const flattened = (
    await Promise.all(
      published.plots.map((id) => get("data/plots/" + id + ".json")),
    )
  ).flat();
  assert.equal(flattened.length, names.size);
  for (const [u, , href] of directory) {
    assert(names.has(u));
    assert(
      await fs.stat(path.join(tmp, decodeURIComponent(href), "index.html")),
    );
  }
  assert.deepEqual(Object.keys(all.resources).sort(), [
    "currency",
    "food",
    "gold",
  ]);
  assert.deepEqual(
    Object.keys(all.languages.en).sort(),
    Object.keys(all.languages.te).sort(),
  );
  console.log(
    `${names.size} unique resident files / acres, ${ids.size} districts, ${all.trails.length} trails, ${all.places.length} places.`,
  );
  if (process.argv.includes("--tiles")) {
    const dir = path.join(root, "static/frozen"),
      hashes = await json(path.join(dir, "tiles.sha256.json"));
    for (const id of atlas.tiles) {
      const r = decodeAcre(
        await fs.readFile(path.join(dir, "tiles", id + ".bin")),
      );
      assert.equal(
        crypto.createHash("sha256").update(new Uint8Array(r)).digest("hex"),
        hashes[id],
        id,
      );
    }
    console.log(
      `${atlas.tiles.length} tiles match the original decoded TSA1 hashes.`,
    );
  }
} finally {
  await fs.rm(tmp, { force: true, recursive: true });
}
