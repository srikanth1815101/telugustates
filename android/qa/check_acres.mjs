// All 300 assignments, not a sample. Uses the production fence builder from a restored checkout.
// node check_acres.mjs /path/to/full-restore
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import assert from "node:assert/strict";
const root = resolve(process.argv[2]),
  dir = join(root, "site/static"),
  load = (p) => JSON.parse(fs.readFileSync(join(dir, p))),
  { boundaries, acreEntry, fenceAt } = await import(
    pathToFileURL(join(dir, "js/acre-edge.js"))
  ),
  {
    SIDE,
    ACRE: U,
    inHouse,
  } = await import(pathToFileURL(join(dir, "js/metres.js"))),
  rows = load("data/atlas.json").plots.flatMap((k) =>
    load("data/plots/" + k + ".json"),
  ),
  seen = new Set(),
  gates = new Set(),
  plane = { ground: () => 0, xyz: (x, y, h) => [x * U, h, -y * U] };
let minWidth = 100;
for (const [X, Y, u, , d, h] of rows) {
  assert(!seen.has(u));
  seen.add(u);
  const group = boundaries(plane, rows, { x: X + 0.5, y: Y + 0.5 }, 0),
    B = group.userData.blocks,
    [dx, dy] = SIDE[h.facing],
    [x, y] = h.gate;
  gates.add(x + "," + y);
  const p = acreEntry([X, Y], h.facing, false, h.gate);
  assert.deepEqual([Math.floor(p.x), Math.floor(p.y)], [X, Y]);
  assert(!fenceAt(B, p.x, p.y));
  for (let l = -2; l <= 2; l += 0.1)
    assert(!fenceAt(B, x + (dy * l) / U, y + (dx * l) / U));
  assert(
    fenceAt(B, x + (dy * 2.8) / U, y + (dx * 2.8) / U) &&
      fenceAt(B, x - (dy * 2.8) / U, y - (dx * 2.8) / U),
  );
  // Verify the resident mesh's matching collision footprints too, not just the adjoining rails.
  for (let side = -2; side <= 2.0001; side += 0.25)
    for (let back = -2; back <= 0.01; back += 0.25) {
      assert(
        !inHouse(
          h,
          x + (dy * side + dx * back) / U,
          y + (dx * side + dy * back) / U,
          0.39,
        ),
        u + " gate pillar overlaps the walkable aperture",
      );
    }
  assert(group.userData.stones.some(([i, j]) => i === X && j === Y));
  assert(!fenceAt(B, x + (dy * 17) / U, y + (dx * 17) / U), "no fence grid");
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
}
assert.equal(seen.size, 300);
console.log(
  `All ${seen.size} original assigned acres: in-cell arrival and clear 4 m opening in the short frontage at its recorded gate; rails on both sides; ${gates.size} distinct recorded gate points. No reseed or mutation.`,
);
