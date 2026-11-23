// Proof that editing does not damage the world.
//
//   node admin/self-test.mjs
//
// The important guarantee of this editor is that a change touches only the
// lines it means to, and that an unchanged save writes nothing at all. Both are
// checked here against the real content tree, so a regression in the file
// writers shows up immediately instead of as a 300-line diff nobody reads.

import fs from "node:fs/promises";
import path from "node:path";
import { api } from "./lib/api.mjs";
import { buildCatalogResolved } from "./lib/catalog.mjs";
import { ROOT } from "./lib/content.mjs";

const C = path.join(ROOT, "Hugo-Project", "content");
const q = new URLSearchParams();
let failures = 0;
let checks = 0;

const pass = (name, detail = "") => {
  checks++;
  console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`);
};
const fail = (name, detail) => {
  checks++;
  failures++;
  console.log(`  ✗ ${name} — ${detail}`);
};
const expect = (name, actual, wanted) => {
  if (actual === wanted) pass(name);
  else fail(name, `expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
};

const read = (rel) => fs.readFile(path.join(C, rel), "utf8");

// Only the lines that differ, ignoring position.
const changedLines = (before, after) => {
  const b = before.split("\n");
  const a = after.split("\n");
  const removed = b.filter((l) => !a.includes(l));
  const added = a.filter((l) => !b.includes(l));
  return { removed, added };
};

console.log("\nTelugu States world editor — self test\n");

// ---- 1. round-trip integrity ----
console.log("1. Unchanged saves write nothing");
{
  const houses = await fs.readdir(path.join(C, "houses"));
  const id = houses.find((n) => n.endsWith(".md"))?.replace(/\.md$/, "");
  if (!id) {
    fail("find a house", "no house files");
  } else {
    const file = path.join("houses", id + ".md");
    const before = await read(file);
    const rec = await api("GET", `record/house/${id}`, q);
    const res = await api("POST", `house/${id}`, q, {
      wall_color: rec.body.data.wall_color,
      roof_color: rec.body.data.roof_color,
      archetype: rec.body.data.archetype,
      facing: rec.body.data.facing,
      size_m: rec.body.data.size_m,
      props: rec.body.data.props,
    });
    expect("house re-save is a no-op", res.body.saved, false);
    expect("house file untouched", (await read(file)) === before, true);
  }
}

// ---- 2. a change is one line ----
console.log("\n2. A colour change touches one line");
{
  const houses = await fs.readdir(path.join(C, "houses"));
  const id = houses.find((n) => n.endsWith(".md"))?.replace(/\.md$/, "");
  const file = path.join("houses", id + ".md");
  const before = await read(file);
  const rec = await api("GET", `record/house/${id}`, q);
  const original = rec.body.data.wall_color;

  const changed = original.toLowerCase() === "#c8b48f" ? "#d8c3a5" : "#c8b48f";
  const res = await api("POST", `house/${id}`, q, { wall_color: changed });
  expect("reports the change", res.body.changed?.join(","), "wall_color");

  const after = await read(file);
  const diff = changedLines(before, after);
  expect("exactly one line removed", diff.removed.length, 1);
  expect("exactly one line added", diff.added.length, 1);
  expect("the added line carries the new colour", diff.added[0].includes(changed), true);

  await api("POST", `house/${id}`, q, { wall_color: original });
  expect("restores byte-exact", (await read(file)) === before, true);
}

// ---- 3. species edit ----
console.log("\n3. Species colours edit in the body, one line");
{
  const file = path.join("world", "ecology.md");
  const before = await read(file);
  const catalogBefore = await buildCatalogResolved();
  const original = catalogBefore.world.ecology.trees.Mango.colour;

  const next = original === "#426f45" ? "#457a48" : "#426f45";
  const res = await api("POST", "species", q, { group: "trees", name: "Mango", colour: next });
  expect("species saved", res.body.saved, true);

  const after = await read(file);
  const diff = changedLines(before, after);
  expect("one line changed", diff.added.length, 1);

  // and the world sees it
  const catalogAfter = await buildCatalogResolved();
  expect("catalog reflects the new colour", catalogAfter.world.ecology.trees.Mango.colour.toLowerCase(), next);

  await api("POST", "species", q, { group: "trees", name: "Mango", colour: original });
  expect("restores byte-exact", (await read(file)) === before, true);
}

// ---- 4. calendar ----
console.log("\n4. Calendar edits");
{
  const file = path.join("world", "calendar.md");
  const before = await read(file);
  const res = await api("POST", "calendar", q, { defaultDayHours: 6 });
  expect("calendar saved", res.body.saved, true);
  await api("POST", "calendar", q, { defaultDayHours: 4 });
  expect("restores byte-exact", (await read(file)) === before, true);
}

// ---- 5. validation ----
console.log("\n5. Bad input is refused, not written");
{
  const houses = await fs.readdir(path.join(C, "houses"));
  const id = houses.find((n) => n.endsWith(".md"))?.replace(/\.md$/, "");
  const file = path.join("houses", id + ".md");
  const before = await read(file);

  const bad = [
    ["bad colour", { wall_color: "red" }],
    ["bad facing", { facing: "sideways" }],
    ["unknown prop", { props: ["not-a-prop"] }],
    ["oversized list", { size_m: [1, 2] }],
  ];
  for (const [name, body] of bad) {
    const res = await api("POST", `house/${id}`, q, body);
    expect(`${name} rejected`, res.status, 400);
  }
  expect("nothing was written", (await read(file)) === before, true);

  const traversal = await api("GET", "record/house/../../etc/passwd", q);
  expect("path traversal refused", traversal.status, 404);
}

// ---- 6. catalog parity ----
console.log("\n6. The preview catalog is complete");
{
  const catalog = await buildCatalogResolved();
  expect("has houses", catalog.houses.length > 0, true);
  expect("has 61 districts", catalog.districts.length, 61);
  expect("has both languages", Object.keys(catalog.languages).sort().join(","), "en,te");
  expect("has the calendar", !!catalog.world.calendar, true);
  expect("has tree species", Object.keys(catalog.world.ecology.trees).length > 0, true);
  const house = catalog.houses[0];
  expect("house has a cell", Array.isArray(house.c), true);
  expect("house has wall colour", /^#[0-9a-f]{6}$/i.test(house.house.wall_color), true);
  expect("house has a seed", Number.isInteger(house.house.seed), true);
}

console.log(
  failures
    ? `\n${failures} of ${checks} checks failed\n`
    : `\nAll ${checks} checks passed\n`,
);
process.exit(failures ? 1 : 0);
