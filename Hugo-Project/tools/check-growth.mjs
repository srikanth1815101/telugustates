// Grow a throw-away publication; compare its original coordinates and path arrays. Nothing is added to the source atlas.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { residentId } from "../static/js/resident-id.js";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-grow-")),
  copy = path.join(tmp, "Hugo-Project"),
  ledger = path.join(copy, "data/settlements.json");
try {
  await fs.cp(root, copy, {
    recursive: true,
    filter: (p) =>
      !["public", "resources", "node_modules", ".git"].some((k) =>
        path.relative(root, p).split(path.sep).includes(k),
      ),
  });
  let prior = JSON.parse(await fs.readFile(ledger));
  // Surface the child's own stderr as text. A failed settle used to arrive as
  // `Error: Command failed` wrapping a decimal byte dump of stderr, which named
  // neither the house nor the field and made this check unreadable in CI.
  const publish = () => {
    try {
      execFileSync(process.execPath, ["tools/settle.mjs"], {
        cwd: copy,
        stdio: "pipe",
      });
    } catch (e) {
      // execFileSync hands back Buffers (or {type:"Buffer",data:[…]} when the
      // call was serialised). String() on either yields "[object Object]", so
      // decode explicitly.
      const text = (b) =>
        b == null
          ? ""
          : typeof b === "string"
            ? b
            : Buffer.isBuffer(b)
              ? b.toString("utf8")
              : Array.isArray(b?.data)
                ? Buffer.from(b.data).toString("utf8")
                : String(b);
      const detail = [text(e.stdout), text(e.stderr)]
        .map((s) => s.trim())
        // One line: a workflow command ends at the first newline, and that is
        // exactly where the child's reason would otherwise land.
        .map((s) => s.replace(/\s*\n\s*/g, " | "))
        .filter(Boolean)
        .join(" | ");
      throw Error(
        "settle.mjs failed" + (detail ? ": " + detail : " (" + e.message + ")"),
      );
    }
  };
  let count = 0,
    firstId = "";
  // The last round has to reserve new sites, which settle.mjs only does when a
  // district cannot absorb a house into an existing hamlet -- either because it
  // has none, or because every hamlet it has is full.
  //
  // This used to hunt for districts that happened to satisfy that, which broke
  // the moment ordinary onboarding filled the last one. Waiting for the atlas to
  // run out of room is not a property worth depending on, so make the condition
  // true instead: fill every hamlet in two chosen districts, in this throw-away
  // copy only, then settle there. The source atlas is never touched, and the
  // new-site path is exercised whatever the real atlas holds.
  const census = (await fs.readdir(path.join(copy, "content/districts")))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((n) => /^\d+$/.test(n))
      .map(Number)
      .filter((d) => Number.isInteger(d) && prior.villages.some((v) => v.d === d))
      .sort((a, b) => {
        const own = (d) =>
          prior.villages.filter((v) => v.d === d).reduce(
            (n, v) => n + (v.capacity - Object.keys(v.homes).length),
            0,
          );
        // Cheapest to saturate first: fewest free berths left.
        return own(a) - own(b) || a - b;
      });
  assert.ok(
    census.length >= 2,
    "Need two districts with hamlets to exercise new-site reservation",
  );
  const starved = census.slice(0, 2);
  for (const d of starved)
    for (const v of prior.villages.filter((v) => v.d === d))
      v.capacity = Object.keys(v.homes).length;
  assert(
    starved.every((d) =>
      prior.villages
        .filter((v) => v.d === d)
        .every((v) => Object.keys(v.homes).length >= v.capacity),
    ),
    "Satellites must be full before settling new sites onto them",
  );
  await fs.writeFile(ledger, JSON.stringify(prior, null, 2) + "\n");
  for (const [districts, addedVillages] of [
    [[32, 32], 0],
    [[32, 32, 32, 32, 32, 32, 32, 32], 0],
    [[starved[0], starved[0], starved[1], starved[1]], 2],
  ]) {
    for (const d of districts) {
      const rawHandle =
          "test_join_" + (count < 2 ? "0_" + count : "1_" + (count - 2)),
        houseName = `Kiran${count + 1}`;
      count++;
      execFileSync(
        process.execPath,
        [
          "tools/add-house.mjs",
          "--username",
          rawHandle,
          "--district",
          String(d),
          "--name",
          houseName,
        ],
        { cwd: copy, stdio: "pipe" },
      );
      const hid = residentId(rawHandle);
      if (!firstId) firstId = hid;
      const mdText = await fs.readFile(
        path.join(copy, "content/houses", hid + ".md"),
        "utf8",
      );
      assert(!mdText.includes(rawHandle), "Raw username leaked to house .md");
      assert(mdText.includes(houseName), "House name missing from house .md");
    }
    publish();
    const next = JSON.parse(await fs.readFile(ledger));
    assert.equal(
      next.villages.length,
      prior.villages.length + addedVillages,
      "Exhaust suitable existing hamlets first",
    );
    for (const old of prior.villages) {
      const v = next.villages.find((v) => v.id === old.id);
      assert.deepEqual(v.square, old.square);
      assert.deepEqual(v.reserve, old.reserve);
      assert.deepEqual(v.hub, old.hub);
      assert.deepEqual(v.shade, old.shade);
      assert.deepEqual(v.paths.slice(0, old.paths.length), old.paths);
      for (const [u, r] of Object.entries(old.homes))
        assert.deepEqual(v.homes[u], r);
      assert(Object.keys(v.homes).length <= v.capacity);
    }
    prior = next;
  }
  const bytes = await fs.readFile(ledger);
  publish();
  assert.deepEqual(await fs.readFile(ledger), bytes);
  const src = path.join(copy, "content/houses", firstId + ".md");
  await fs.writeFile(
    src,
    (await fs.readFile(src, "utf8")).replace(
      /^homeLocation:.*$/m,
      "homeLocation: [0,0]",
    ),
  );
  assert.throws(() =>
    execFileSync(
      "hugo",
      ["--source", copy, "--destination", path.join(tmp, "bad")],
      { stdio: "pipe" },
    ),
  );
  console.log(
    JSON.stringify({
      temporaryJoins: count,
      existingPinAndPathChecks: true,
      allJoinedExistingVillages: true,
      noOpByteIdentical: true,
      conflictingPinsRejected: true,
    }),
  );
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
