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
  const publish = () =>
    execFileSync(process.execPath, ["tools/settle.mjs"], {
      cwd: copy,
      stdio: "pipe",
    });
  let count = 0,
    firstId = "";
  for (const [districts, addedVillages] of [
    [[32, 32], 0],
    [[32, 32, 32, 32, 32, 32, 32, 32], 0],
    [[17, 17, 44, 44], 2],
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
