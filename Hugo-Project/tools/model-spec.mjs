// Shared spec for the procedural GLB pipeline: which models exist, what
// nodes they must expose, and their triangle budgets. Used by both
// make-models.mjs (build) and check-assets.mjs (CI).
// @ts-check

/** cat → triangle budget per model (master prompt Phase 2 budgets). */
export const BUDGET = {
  vehicle: 3000,
  building: 4000,
  prop: 500,
  animal: 800,
  tool: 300,
  item: 360,
  crop: 800, // four growth stages share one GLB (≈4 props)
};

/**
 * name → { cat, required nodes, crop stages? }
 * `required` nodes must exist as named nodes in the GLB (they are looked
 * up at runtime for wheel spin/steer and crop stage visibility).
 */
export const MODELS = {
  // vehicle — wheel nodes sit on the physics axle positions (x ±0.78,
  // z ±1.05, front = +z) so visuals line up with the raycast wheels.
  buggy: {
    cat: "vehicle",
    required: [
      "chassis",
      "hood",
      "seat",
      "steering",
      "wheel_fl",
      "wheel_fr",
      "wheel_rl",
      "wheel_rr",
    ],
  },
  // buildings / props
  fence: { cat: "prop", required: ["fence"] },
  cot: { cat: "building", required: ["cot"] },
  shed: { cat: "building", required: ["shed"] },
  well: { cat: "building", required: ["well"] },
  threshing: { cat: "prop", required: ["threshing"] },
  stall: { cat: "building", required: ["stall"] },
  // animals
  cow: { cat: "animal", required: ["cow"] },
  goat: { cat: "animal", required: ["goat"] },
  chicken: { cat: "animal", required: ["chicken"] },
  // tools (hand + baked hotbar art)
  hoe: { cat: "tool", required: ["hoe"] },
  sickle: { cat: "tool", required: ["sickle"] },
  rod: { cat: "tool", required: ["rod"] },
  hammer: { cat: "tool", required: ["hammer"] },
  can: { cat: "tool", required: ["can"] },
  seeds: { cat: "tool", required: ["seeds"] },
  // crops — stage0..stage3 children toggled at runtime
  crop_ragi: { cat: "crop", required: ["stage0", "stage1", "stage2", "stage3"] },
  crop_paddy: { cat: "crop", required: ["stage0", "stage1", "stage2", "stage3"] },
  crop_chilli: { cat: "crop", required: ["stage0", "stage1", "stage2", "stage3"] },
  crop_vegetable: {
    cat: "crop",
    required: ["stage0", "stage1", "stage2", "stage3"],
  },
  crop_cotton: { cat: "crop", required: ["stage0", "stage1", "stage2", "stage3"] },
  // marketable items — these double as the baked inventory icons
  item_paddy: { cat: "item", required: ["item_paddy"] },
  item_rice: { cat: "item", required: ["item_rice"] },
  item_ragi: { cat: "item", required: ["item_ragi"] },
  item_chilli: { cat: "item", required: ["item_chilli"] },
  item_cotton: { cat: "item", required: ["item_cotton"] },
  item_fish: { cat: "item", required: ["item_fish"] },
  item_milk: { cat: "item", required: ["item_milk"] },
  item_egg: { cat: "item", required: ["item_egg"] },
  item_vegetable: { cat: "item", required: ["item_vegetable"] },
  item_seeds: { cat: "item", required: ["item_seeds"] },
};

/** Inventory kind → baked icon/model name (icons come from these). */
export const KIND_MODEL = {
  paddy: "item_paddy",
  rice: "item_rice",
  ragi: "item_ragi",
  chilli: "item_chilli",
  cotton: "item_cotton",
  fish: "item_fish",
  milk: "item_milk",
  egg: "item_egg",
  vegetable: "item_vegetable",
  seeds: "item_seeds",
};

/** Inventory kind → world crop model (growth stages on the plot). */
export const CROP_MODEL = {
  ragi: "crop_ragi",
  paddy: "crop_paddy",
  chilli: "crop_chilli",
  vegetable: "crop_vegetable",
  cotton: "crop_cotton",
};
