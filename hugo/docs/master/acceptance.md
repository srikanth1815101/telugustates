# Integrated acceptance · 70001

The owner requested one integrated evaluation through O, not an installation or sign-off after each part. The [sequential work log](integration.md), [current test results](../../REPORT.md) and the supplied [master](combined-v7.md) apply. The register below was the **60002 snapshot**, not the status of the integrated branch. Software checks do not sign off a physical Android device. No verified engagement data or permission to publish was supplied; those are not simulated to make a test pass.

| Gate | Where to check | Release distinction |
|---|---|---|
| A: touch, camera, HUD | `browser/part-a-field.cjs`, `browser/part-a-village.cjs`, `tests/walk_geometry.mjs` | Real rendered geometry and scripted simultaneous touches; physical device test remains open. |
| B–F: access, light, climate, audio, crops | `tests/integrated/`; `browser/living-accept.cjs` | Derived from stable data and shared simulation. Lighting comparison is explicitly private. |
| G–K: public copy, nature, immersive, trails, shared state | `browser/living-accept.cjs`, `browser/living-populated.cjs`, `debug/gallery/` | No public demo households, secret state or made-up place replicas. Native-language review remains open. |
| L–M: treasury and funded work | `scripts/update_economy.py --check`, `tests/integrated/test_treasury.py` | Auditable empty real ledger; corrections, spending and daily charges exercised only in isolated fixtures. |
| N–O: cost, package, recovery, presentation | `REPORT.md`, `docs/source-rebuild.md`, delivered `Living-World/` | Private test build, not production deployment, hardware acceptance or launch approval. |

---

## Historical register at 60002 (superseded)

# Combined v7 acceptance register

The owner-supplied [41,717-byte consolidated master](combined-v7.md) is the specification. SHA-256 `a444c0776314859f2a53d76318dd2bc31529793216b74078c3acf13bc28d5f4e`. It replaces the previously incomplete transcript. Every numbered rule, subsection, bullet, table and definition in that file applies; this index is **not** a substitute for the requirements. No `AGENTS.md` was found in the checkout or its applicable parents. Work stays in A→O order. Do not mark software emulation as a phone, use demos for the treasury, or record a pass without testing it.

| Part | Scope in the supplied master | State |
|---|---|---|
| A | Lines 42–81: Mobile Controls, Camera, Character And Clean Hud | 60002 integrates A1–A5 changes. Lab evidence in REPORT.md; physical acceptance OPEN. Do not start B on a lab result alone. |
| B | Lines 82–127: Resident Homes, Village Footpaths, Electricity | Pending sequential acceptance; prior features are not a sign-off. |
| C | Lines 128–138: Shared Day/Night And Lighting | Pending sequential acceptance; prior features are not a sign-off. |
| D | Lines 139–151: Regional Weather, Seasons, Puddles And Runoff | Pending sequential acceptance; prior features are not a sign-off. |
| E | Lines 152–164: Audio, Ambience And Music | Pending sequential acceptance; prior features are not a sign-off. |
| F | Lines 165–182: Geographically Appropriate Nature And Agriculture | Pending sequential acceptance; prior features are not a sign-off. |
| G | Lines 183–206: Production Copy, Home, Settings And Data | Pending sequential acceptance; prior features are not a sign-off. |
| H | Lines 207–216: Nature-First World Design | Pending sequential acceptance; prior features are not a sign-off. |
| I | Lines 217–236: Immersive Mode, Search And Featured Landscapes | Pending sequential acceptance; prior features are not a sign-off. |
| J | Lines 237–247: Organic Trails And Village Evolution | Pending sequential acceptance; prior features are not a sign-off. |
| K | Lines 248–258: Persistent World Clock, Seasons And Weather | Pending sequential acceptance; prior features are not a sign-off. |
| L | Lines 259–311: Instagram-Powered Community Economy | Pending sequential acceptance; prior features are not a sign-off. |
| M | Lines 312–320: Accurate World Counters And Development | Pending sequential acceptance; prior features are not a sign-off. |
| N | Lines 321–330: Static Architecture, Performance And State | Pending sequential acceptance; prior features are not a sign-off. |
| O | Lines 331–395: Final Ui, Validation, Documentation And Delivery | Pending sequential acceptance; prior features are not a sign-off. |

The earlier record-classification experiment is partial development work only. **Production must hide demos unless explicitly in developer mode** (G, M); a home page showing “300 demo” is not production acceptance. Global rules 0.1–0.10 and the resolved conflicts remain in force.
