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
    residentId("@TeluguStates.Csrgo"),
    residentId("https://www.instagram.com/telugustates.csrgo/"),
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
  // One read of the ledger, used both to validate the running balance against
  // content/resources/*.md and to check what the home page actually prints.
  const ledger = JSON.parse(
      await fs.readFile(path.join(root, "data/resource_ledger.json"), "utf8"),
    ),
    entries = ledger?.entries ?? [];
  assert(Array.isArray(entries) && entries.length > 0,
    "data/resource_ledger.json must list at least one batch");
  const homeHtml = await fs.readFile(path.join(tmp, "index.html"), "utf8");
  const legalHtml = await fs.readFile(
    path.join(tmp, "legal/index.html"),
    "utf8",
  );
  const worldJs = await fs.readFile(path.join(tmp, "js/world.js"), "utf8");
  const entryJs = await fs.readFile(path.join(tmp, "js/entry.js"), "utf8");
  assert(
    /id=["']?res-food["'\s>]/.test(homeHtml) &&
      /id=["']?res-currency["'\s>]/.test(homeHtml) &&
      /id=["']?res-gold["'\s>]/.test(homeHtml) &&
      /resource-rates/.test(homeHtml) &&
      /#i-like/.test(homeHtml) &&
      /#i-comment/.test(homeHtml) &&
      /#i-share/.test(homeHtml) &&
      homeHtml.includes("A living Telugu world, shaped together") &&
      homeHtml.includes("1 Home + 1 Acre") &&
      homeHtml.includes("treasury-card") &&
      !homeHtml.includes("VOL. 01") &&
      !homeHtml.includes("The land atlas") &&
      !/id=["']?economy["'\s>]/.test(homeHtml) &&
      !/id=["']?nr["'\s>]/.test(homeHtml) &&
      !homeHtml.includes(">02<"),
    "Home page header must show editorial hero card, 1 Home + 1 Acre pillar, treasury resources + 1=1 icon rates without bottom #economy card",
  );
  // The ledger is collapsed on purpose: only the newest batch may be printed in
  // the hero, and the rest must arrive through the button so the page does not
  // grow with every batch. A regression that inlines them all would otherwise
  // pass silently, because the markup would still be valid.
  {
    // Count the inline rows rather than matching date strings: two batches can
    // share a date, so looking for text would be ambiguous. Exactly one batch
    // may be printed in the hero, and it must be the newest.
    const inline = [...homeHtml.matchAll(/class=["']?ledger-date["']?>([^<]+)</g)].map(
      (m) => m[1],
    );
    assert.equal(
      inline.length,
      1,
      `Hero must print exactly one batch inline, found ${inline.length}`,
    );
    assert.equal(
      inline[0],
      entries[0].date,
      "The batch printed inline must be the newest one",
    );
    assert(
      /id=["']?ledger-all-btn["'\s>]/.test(homeHtml),
      "The collapsed ledger needs a button to open the full history",
    );
    // The dialog reads its rows from the generated ledger.json, so that file
    // must exist and carry every batch.
    const ledgerJson = JSON.parse(
      await fs.readFile(path.join(tmp, "ledger.json"), "utf8"),
    );
    assert.equal(
      ledgerJson?.entries?.length,
      entries.length,
      `ledger.json should hold all ${entries.length} batches`,
    );
    assert(
      entries.every((e, i) => ledgerJson.entries[i].date === e.date),
      "ledger.json must keep the ledger order, newest first",
    );
  }
  assert(
    legalHtml.includes("entertainment") &&
      legalHtml.includes("Non-Political, Non-Religious") &&
      legalHtml.includes("OpenStreetMap") &&
      legalHtml.includes("Copernicus"),
    "Standalone /legal/ page must include entertainment disclaimer, neutrality statement, and open-data credits",
  );
  assert(
    !worldJs.includes("holding-resident") &&
      worldJs.includes("holding-claim") &&
      !entryJs.includes("app-boot-sync"),
    "3D holding menu must prompt for own username (no household dropdown) and Android boot must not blank screen",
  );
  // Every district body must be one YAML flow sequence of [x, y, elevation]
  // integer triples. A block sequence of the same triples parses differently
  // through transform.Unmarshal in catalog.html, and the failure surfaces far
  // away as "non-numeric cell coordinate: \"- [2336\"" inside residentDesign.
  // Keep the source in the shape the template is known to read.
  for (const f of (await fs.readdir(path.join(root, "content/districts"))).filter(
    (n) => n.endsWith(".md") && /^\d+$/.test(n.slice(0, -3)),
  )) {
    const text = await fs.readFile(
        path.join(root, "content/districts", f),
        "utf8",
      ),
      body = text.slice(text.indexOf("\n---", 3) + 4),
      poolText = body
        .split("\n")
        .filter((l) => !l.trim().startsWith("#"))
        .join("\n")
        .trim();
    if (!poolText) continue;
    assert(
      !/^\s*-\s/m.test(poolText),
      `District ${f} pool must be a flow sequence, not a block sequence; ` +
        "a block list is read back as strings by catalog.html",
    );
    assert(
      /^\s*\[\s*\[/.test(poolText) && /\]\s*\]\s*$/.test(poolText),
      `District ${f} pool must be one bracketed flow sequence of triples`,
    );
    for (const m of poolText.matchAll(/\[\s*([^\][]+?)\s*\]/g))
      assert(
        /^-?\d+\s*,\s*-?\d+\s*,\s*-?\d+$/.test(m[1]),
        `District ${f} pool entry is not an integer triple: [${m[1]}]`,
      );
  }
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
        !/nilayam/i.test(r.name) &&
        r.house.sign?.label === r.name,
      "House board must use plain name for " + r.u,
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
  const founderId = residentId("telugustates.csrgo"),
    founderShard = await get("data/search/" + shardKey(founderId) + ".json");
  assert(
    founderShard[founderId]?.u === founderId &&
      founderShard[founderId]?.name === "Srikanth" &&
      founderShard[founderId]?.d === 32 &&
      founderShard[founderId]?.record_kind === "community",
    "One-way search shard lookup failed for founding household",
  );
  const appVer = await json(path.join(tmp, "app-version.json"));
  assert(
    Array.isArray(appVer.domains) &&
      appVer.domains.includes("https://telugustates.csrgo.com") &&
      !JSON.stringify(appVer).includes("netlify"),
    "app-version.json domain configuration invalid",
  );
  assert.deepEqual(Object.keys(all.resources).sort(), [
    "currency",
    "food",
    "gold",
  ]);
  // The home page shows a ledger of every batch beside the live treasury, so
  // the two have to agree. Re-derive the running balance from data/resource_ledger.json
  // and compare against the published totals: a batch that updates one without
  // the other fails here instead of drifting silently.
  {
    const int = (e, k) => {
      assert(Number.isInteger(e[k]), `Ledger ${e.date} needs an integer ${k}`);
      return e[k];
    };
    // Rows are stored newest-first for display; walk them oldest-first exactly
    // the way the treasury was updated: add the reactions, charge for the
    // residents already standing, floor food at zero and pay any shortfall out
    // of currency.
    const run = { food: 0, currency: 0, gold: 0 };
    let houses = 0;
    for (const e of [...entries].reverse()) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ""),
        "Ledger entry needs a YYYY-MM-DD date: " + JSON.stringify(e.date));
      for (const k of ["houses_before", "houses_added", "likes", "comments", "shares",
                       "food_cut", "food_spill", "food", "currency", "gold"])
        int(e, k);
      // The house count is cumulative and must stay consistent batch to batch.
      assert.equal(e.houses_before, houses,
        `Ledger ${e.date}: houses_before should be ${houses}`);
      houses += e.houses_added;

      const before = run.food;
      run.food += e.likes - e.houses_before - e.food_cut;
      const spill = run.food < 0 ? -run.food : 0;
      run.food += spill;                       // floor at zero, never negative
      assert.equal(spill, e.food_spill,
        `Ledger ${e.date}: shortfall should be ${spill}, not ${e.food_spill}`);
      assert.equal(run.food - before, e.food,
        `Ledger ${e.date}: food delta does not follow from its own numbers`);

      run.currency += e.comments - e.food_spill;
      assert.equal(e.currency, e.comments - e.food_spill,
        `Ledger ${e.date}: currency delta is not comments minus the shortfall`);
      run.gold += e.shares;
      assert.equal(e.gold, e.shares,
        `Ledger ${e.date}: gold delta is not the shares reported`);
      assert(run.food >= 0, `Ledger ${e.date}: food went negative`);
    }
    assert.equal(houses, all.houses.length,
      `Ledger accounts for ${houses} houses; the atlas holds ${all.houses.length}`);
    assert.equal(run.food, all.resources.food,
      `Ledger food total ${run.food} does not match content/resources/food.md`);
    assert.equal(run.currency, all.resources.currency,
      "Ledger currency total does not match content/resources/currency.md");
    assert.equal(run.gold, all.resources.gold,
      "Ledger gold total does not match content/resources/gold.md");
  }
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
