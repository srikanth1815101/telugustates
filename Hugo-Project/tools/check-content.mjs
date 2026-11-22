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
import {
  RESIDENT_ID_RE,
  isResidentId,
  normalizeUsername,
  residentId,
  sha256Bytes,
  shardKey,
} from "../static/js/resident-id.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-content-")),
  json = async (f) => JSON.parse(await fs.readFile(f));
try {
  for (const vec of [
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "తెలుగు రాష్ట్రాలు",
  ]) {
    assert.equal(
      Buffer.from(sha256Bytes(Buffer.from(vec, "utf8"))).toString("hex"),
      crypto.createHash("sha256").update(vec, "utf8").digest("hex"),
    );
  }
  assert.equal(
    residentId("@Palnadu_Demo01"),
    residentId("https://www.instagram.com/palnadu_demo01/"),
  );
  assert.equal(normalizeUsername("https://instagram.com/reel/xyz"), "");
  for (const f of await fs.readdir(path.join(root, "content/houses"))) {
    if (!f.endsWith(".md") || f === "_index.md") continue;
    assert(
      /^h[0-9a-f]{24}\.md$/.test(f),
      "House file must use one-way hashed ID: " + f,
    );
    const mdText = await fs.readFile(
      path.join(root, "content/houses", f),
      "utf8",
    );
    assert(
      !/^username\s*:/im.test(mdText),
      "House file must never store raw username: " + f,
    );
  }
  execFileSync("hugo", ["--source", root, "--destination", tmp, "--minify"]);
  const homeHtml = await fs.readFile(path.join(tmp, "index.html"), "utf8");
  assert(
    /id=["']?res-food["'\s>]/.test(homeHtml) &&
      /id=["']?res-currency["'\s>]/.test(homeHtml) &&
      /id=["']?res-gold["'\s>]/.test(homeHtml) &&
      !/id=["']?nr["'\s>]/.test(homeHtml) &&
      !homeHtml.includes(">02<"),
    "Home page header must show resources instead of 2 States / house count",
  );
  const all = await json(path.join(tmp, "catalog.json")),
    atlas = await json(path.join(tmp, "data/atlas.json"));
  atlas.districts = all.districts;
  const cells = new Set(),
    names = new Set(),
    ids = new Set(atlas.districts.map((d) => d.id));
  for (const r of all.houses) {
    residentDesign(r);
    assert(!names.has(r.u) && RESIDENT_ID_RE.test(r.u), r.u);
    assert(
      r.name &&
        !r.name.startsWith("@") &&
        !isResidentId(r.name) &&
        r.house.sign?.label === r.name,
      "House board must use nickname or house name for " + r.u,
    );
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
  for (const [u, , href, label] of directory) {
    assert(names.has(u));
    assert(label && !label.startsWith("@") && !isResidentId(label));
    const pagePath = path.join(tmp, decodeURIComponent(href), "index.html"),
      pageHtml = await fs.readFile(pagePath, "utf8");
    assert(!pageHtml.includes("@" + u), "Record page leaked @" + u);
  }
  const demoId = residentId("palnadu_demo01"),
    demoShard = await get("data/search/" + shardKey(demoId) + ".json");
  assert(demoShard[demoId]?.u === demoId, "One-way search shard lookup failed");
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
