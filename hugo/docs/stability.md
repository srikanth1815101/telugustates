# 5.1.1 · Ground stability

This edition keeps the 61-district geographic atlas, the 300 frontage-first assignments and timber gates. There are no developed streets, houses, cultivated rows or livestock in the rendered landscape. The original resident records/assignments, frozen inputs and history are preserved. The older village fieldbooks describe retired visuals.

**Reproduce the reported location:** `#/field/lake/bank` → Nandyal, 16.038845° N, 78.371004° E. This is the upper bank, not the guide's separate walk-in-water start. The launcher exposes both. Stand without input; drag to orbit, start and release the joystick, then try both travellers and each detail tier. Stand, walk, run and jump use local terrain support; water depth/current and terrain materials are interpretations of the frozen atlas, not surveyed hydrology or legal boundaries.

## What changed

* Skeleton transforms now stay in model metres, not kilometres from the origin. The detached skeleton is updated during the collision motor's bounded substeps. Stopped feet settle instead of evaluating a new gait continuously. Both ankle targets lie on the local terrain planes; the common pelvis respects leg length on slopes. A patch swap updates the camera, support and contact references together, with no fictitious fall.
* Each generation of terrain, horizon, instances and near cover uses the same translated frame. Root heights come from the mesh triangles; roots within a plant clump follow the local gradient. Wind deformation varies continuously with height. Every tree LOD starts from supported wood; fork and crown components intersect. Wildlife is admitted only if its rendered habitat is permitted. Source water masks are not walls.
* Vegetation/mesh generation yields between batches; the launcher no longer forces Medium. Auto is adaptive. Manual Low, Medium and High remain available. Touch has a dead zone, real Jump control, capture cancellation and lifecycle reset. A recorder cancels a paused or changed-site run rather than saving misleading numbers.

## Repeatable checks

After `python -S scripts/prepare_site.py --check`, the following are offline:

```sh
hugo --minify -s site -d /absolute/path/to/public
python scripts/check_public_paths.py /absolute/path/to/public
python -m pytest -q
node tests/all_tiles.mjs /absolute/path/to/public
node tests/crown_contact.mjs
node tests/terrain_contact.mjs
node tests/uneven_frames.mjs
node tests/nature_walk.mjs
node tests/water_grade.mjs
node tests/ecology.mjs
# Browser tests: Node/playwright and Chromium must already be installed.
npx --no-install playwright test
```

`all_tiles` hashes and decodes the entire frozen tile catalogue with the production decoder. `crown_contact` floods triangle-surface voxels from the base. `terrain_contact` independently intersects indexed terrain geometry and compares actual transformed roots and skinned boots. `uneven_frames` checks collision, planted poses and support replacement under multiple draw cadences. `nature_walk` actually walks both shore transects and checks the state transitions. Older tests tied to roads, prebuilt houses, villagers, no-water-entry, or intentionally missing Low-tier travellers are superseded, not assertions about this edition.

In the **Workspace Files Android wrapper**, `qa/` contains additional tests that mount bytes from the signed APK. Start with `Test-report.md` in `Nature-Test` for release-specific measurements. Desktop software GL, tests of local asset routing and signature verification do not constitute a physical Android install or guarantee device performance. The final handset acceptance checklist is in that report.
