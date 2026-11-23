// The editor client.
//
// Keeps a working copy of the selected record, renders fields from a declarative
// description, and posts only the keys that actually changed. Nothing here
// invents data: every field maps to a key the engine reads.

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
};

const state = {
  index: [],
  selection: null,
  draft: null,
  dirty: new Set(),
  world: null,
};

// ---------- transport ----------

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

// ---------- toast ----------

let toastTimer;
function toast(message, isError = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("is-error", isError);
  node.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-visible"), isError ? 5200 : 2400);
}

// ---------- preview control ----------

// Fly the 3D preview to a cell so what you edit is what you see.
function flyTo(cell) {
  if (!cell || !Number.isFinite(cell[0])) return;
  const frame = $("#world");
  try {
    frame.contentWindow?.postMessage({ type: "atlas:fly", cell }, "*");
  } catch {
    /* preview not ready yet */
  }
}

function reloadPreview() {
  const frame = $("#world");
  frame.src = frame.src.split("?")[0] + "?t=" + Date.now();
  toast("Preview reloaded with your saved changes");
}

// ---------- rendering ----------

const KIND_LABEL = {
  house: "House",
  species: "Species",
  district: "District",
  trail: "Trail",
  place: "Place",
  roads: "Public works",
  village: "Village",
  calendar: "Calendar",
};

const GROUP_LABEL = { trees: "Trees", plants: "Plants", crops: "Crops", animals: "Animals" };

async function boot() {
  const [world, index] = await Promise.all([getJSON("/api/world"), getJSON("/api/index")]);
  state.world = world;
  state.index = index.rows;
  const c = world.counts;
  $("#status").textContent = `${c.houses} house${c.houses === 1 ? "" : "s"} · ${c.species} species · ${c.districts} districts`;
  renderNav();
}

function renderNav() {
  const nav = $("#nav");
  nav.replaceChildren();

  const byKind = (kind) => state.index.filter((r) => r.kind === kind);

  const section = (title, rows, render) => {
    if (!rows.length) return;
    nav.append(el("h3", { text: `${title} (${rows.length})` }));
    for (const row of rows) nav.append(render(row));
  };

  const rowButton = (row, extra) => {
    const btn = el(
      "button",
      {
        class: "row",
        type: "button",
        onclick: () => select(row),
        "data-key": `${row.kind}:${row.group || ""}:${row.id}`,
      },
      extra || null,
      el("span", { class: "name", text: row.label || row.id }),
      el("span", { class: "meta", text: row.meta || "" }),
    );
    return btn;
  };

  section(
    "Houses",
    byKind("house"),
    (row) =>
      rowButton(row, el("span", { class: "swatch", style: `background:${swatchFor(row)}` })),
  );

  // Species are grouped so the tree list stays readable.
  for (const group of ["trees", "plants", "crops", "animals"]) {
    const rows = state.index.filter((r) => r.kind === "species" && r.group === group);
    section(GROUP_LABEL[group], rows, (row) =>
      rowButton(row, el("span", { class: "swatch", style: `background:${swatchFor(row)}` })),
    );
  }

  section("Districts", byKind("district"), rowButton);
  section("Trails", byKind("trail"), rowButton);
  section("Places", byKind("place"), rowButton);
  section("Villages", byKind("village"), rowButton);
  section("Public works", byKind("roads"), rowButton);
  section("World", byKind("calendar"), rowButton);
}

function swatchFor(row) {
  if (row.kind === "species") {
    const spec = state.world?.ecology?.[row.group]?.[row.id];
    return spec?.colour || "#c9c3a8";
  }
  if (row.kind === "house") {
    const meta = state._houseSwatch?.[row.id];
    return meta || "#d8c3a5";
  }
  return "#cfd6c9";
}

// ---------- search ----------

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim().toLowerCase();
  searchTimer = setTimeout(() => (q ? showSearch(q) : renderNav()), 90);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("#search")) {
    e.preventDefault();
    $("#search").focus();
  }
  if (e.key === "Escape") {
    $("#search").value = "";
    renderNav();
  }
});

function showSearch(q) {
  const nav = $("#nav");
  nav.replaceChildren();
  const hits = state.index
    .filter((r) => (r.search || r.label || "").toLowerCase().includes(q))
    .slice(0, 60);
  nav.append(el("h3", { text: `${hits.length} result${hits.length === 1 ? "" : "s"}` }));
  if (!hits.length) {
    nav.append(el("div", { class: "empty-row", text: "Nothing matched. Try a house name, a tree, or a district." }));
    return;
  }
  const list = el("div", { class: "results" });
  for (const row of hits)
    list.append(
      el(
        "button",
        { class: "row", type: "button", onclick: () => select(row) },
        el("span", { class: "kind", text: row.group ? GROUP_LABEL[row.group] : KIND_LABEL[row.kind] }),
        el("span", { class: "name", text: row.label || row.id }),
      ),
    );
  nav.append(list);
}

// ---------- selection ----------

async function select(row) {
  state.selection = row;
  state.dirty = new Set();
  document.querySelectorAll(".nav .row").forEach((n) => {
    n.classList.toggle("is-active", n.dataset.key === `${row.kind}:${row.group || ""}:${row.id}`);
  });

  if (row.cell) flyTo(row.cell);
  if (row.kind === "village" && row.cell) flyTo(row.cell);

  try {
    if (row.kind === "species") {
      const world = await getJSON("/api/world.json");
      state.world.ecology = world.ecology;
      state.draft = structuredClone(world.ecology[row.group][row.id]);
      renderSpecies(row, state.draft);
      return;
    }
    const rec = await getJSON(`/api/record/${row.kind}/${encodeURIComponent(row.id)}`);
    state.draft = structuredClone(rec.data);
    if (row.kind === "house") renderHouse(row, rec);
    else if (row.kind === "trail") renderTrail(row, rec);
    else if (row.kind === "place") renderPlace(row, rec);
    else if (row.kind === "district") renderDistrict(row, rec);
    else if (row.kind === "roads") renderRoads(row, rec);
    else if (row.kind === "village") renderVillage(row, rec);
    else if (row.kind === "calendar") renderCalendar(row, rec);
  } catch (error) {
    toast(error.message, true);
  }
}

// ---------- field builders ----------

function field(label, control, hint) {
  const wrap = el("div", { class: "field" }, el("label", { text: label }), el("div", { class: "control" }, control));
  if (!hint) return wrap;
  return el("div", {}, wrap, el("div", { class: "hint", text: hint }));
}

function textField(label, value, onChange, hint) {
  const input = el("input", { type: "text", value: value ?? "" });
  input.addEventListener("input", () => onChange(input.value));
  return field(label, input, hint);
}

function numberField(label, value, onChange, { min, max, step = 0.1, hint } = {}) {
  const input = el("input", { type: "number", value: value ?? 0, step });
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(n);
  });
  return field(label, input, hint);
}

function rangeField(label, value, onChange, { min = 0, max = 1, step = 0.01, hint, format } = {}) {
  const input = el("input", { type: "range", min, max, step, value });
  const out = el("span", { class: "readout", text: format ? format(value) : String(value) });
  input.addEventListener("input", () => {
    const n = Number(input.value);
    out.textContent = format ? format(n) : String(n);
    onChange(n);
  });
  return field(label, [input, out], hint);
}

function selectField(label, value, options, onChange, hint) {
  const select = el("select");
  for (const opt of options) {
    const o = el("option", { value: opt.value ?? opt, text: opt.label ?? opt });
    if ((opt.value ?? opt) === value) o.selected = true;
    select.append(o);
  }
  select.addEventListener("change", () => onChange(select.value));
  return field(label, select, hint);
}

// A calibrated palette taken from the logo so chosen colours stay on-brand,
// with a free colour picker for anything else.
const PALETTE = {
  wall: ["#dec99e", "#e8d9b8", "#d8c3a5", "#cbb894", "#e2cfae", "#d3c09b", "#c8b48f", "#efe3c8"],
  roof: ["#a45e42", "#b06b49", "#9c5237", "#c07a52", "#8f4a33", "#b5794f", "#a86845", "#c2913f"],
  leaf: ["#426f45", "#4a7f3f", "#3f7a50", "#5c8c42", "#6d9a4a", "#8da34f", "#a8c26a", "#94ab4c"],
  wood: ["#523424", "#6d4d35", "#7d5a3e", "#8a6746", "#5b3f2d", "#936e4b"],
};

function colourField(label, value, onChange, palette, hint) {
  const colour = el("input", { type: "color", value: value || "#ffffff" });
  const hex = el("span", { class: "hex", text: (value || "").toUpperCase() });
  colour.addEventListener("input", () => {
    hex.textContent = colour.value.toUpperCase();
    onChange(colour.value);
    paintCurrent(colour.value);
  });
  const swatches = el("div", { class: "palette" });
  const paintCurrent = (current) =>
    swatches.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("is-current", b.dataset.hex === (current || "").toLowerCase());
    });
  for (const hexValue of palette) {
    swatches.append(
      el("button", {
        type: "button",
        "data-hex": hexValue,
        style: `background:${hexValue}`,
        title: hexValue,
        "aria-label": hexValue,
        onclick: () => {
          colour.value = hexValue;
          hex.textContent = hexValue.toUpperCase();
          onChange(hexValue);
          paintCurrent(hexValue);
        },
      }),
    );
  }
  paintCurrent((value || "").toLowerCase());
  return el(
    "div",
    {},
    field(label, [colour, hex], hint),
    swatches,
    el("div", { class: "hint", text: "Or pick from the logo palette above." }),
  );
}

function chipsField(label, values, options, onChange, hint) {
  const chosen = new Set(values || []);
  const wrap = el("div", { class: "chips" });
  for (const opt of options) {
    const chip = el(
      "button",
      { class: "chip", type: "button", "aria-pressed": String(chosen.has(opt)) },
      el("span", { class: "dot" }),
      document.createTextNode(opt.replace(/-/g, " ")),
    );
    chip.addEventListener("click", () => {
      if (chosen.has(opt)) chosen.delete(opt);
      else chosen.add(opt);
      chip.setAttribute("aria-pressed", String(chosen.has(opt)));
      onChange([...chosen]);
    });
    wrap.append(chip);
  }
  return el(
    "div",
    {},
    el("div", { class: "group", text: label }),
    el("div", { style: "padding:4px 0 6px" }, wrap),
    hint ? el("div", { class: "hint", style: "margin-left:0", text: hint }) : null,
  );
}

// ---------- panels ----------

function panelHead(row, rec, extras = []) {
  return el(
    "div",
    { class: "panel-head" },
    el("div", { class: "eyebrow", text: row.group ? GROUP_LABEL[row.group] : KIND_LABEL[row.kind] }),
    el("h2", { text: row.label || row.id }),
    rec?.file ? el("div", { class: "file", text: rec.file }) : null,
    extras.length ? el("div", { class: "actions" }, extras) : null,
  );
}

function saveBar(label) {
  const status = el("span", { class: "clean", text: "No changes" });
  const save = el("button", { class: "primary", type: "button", text: "Save" });
  save.disabled = true;
  save.addEventListener("click", async () => {
    if (!state.dirty.size) return;
    save.disabled = true;
    try {
      await commit(label);
      status.textContent = "Saved";
      status.className = "clean";
    } catch (error) {
      toast(error.message, true);
    } finally {
      save.disabled = !state.dirty.size;
    }
  });
  const bar = el("div", { class: "save-bar" }, status, save);
  state.refreshBar = () => {
    const n = state.dirty.size;
    status.textContent = n ? `${n} change${n === 1 ? "" : "s"} not saved` : "No changes";
    status.className = n ? "dirty" : "clean";
    save.disabled = !n;
  };
  return bar;
}

function markDirty(key) {
  state.dirty.add(key);
  state.refreshBar?.();
}

async function commit() {
  const row = state.selection;
  const body = {};
  for (const key of state.dirty) body[key] = state.pending[key];
  if (!Object.keys(body).length) return;

  if (row.kind === "house") {
    const result = await postJSON(`/api/house/${encodeURIComponent(row.id)}`, body);
    toast(result.saved ? `Saved ${result.changed.join(", ")}` : "No change");
  } else if (row.kind === "species") {
    const result = await postJSON(`/api/species`, { group: row.group, name: row.id, ...body });
    toast(result.saved ? `Saved ${row.label}` : "No change");
  } else if (row.kind === "trail") {
    const result = await postJSON(`/api/trail/${encodeURIComponent(row.id)}`, body);
    toast(result.saved ? `Saved ${result.changed.join(", ")}` : "No change");
  } else if (row.kind === "place") {
    const result = await postJSON(`/api/place/${encodeURIComponent(row.id)}`, body);
    toast(result.saved ? `Saved ${result.changed.join(", ")}` : "No change");
  } else if (row.kind === "district") {
    const result = await postJSON(`/api/district/${encodeURIComponent(row.id)}`, body);
    toast(result.saved ? `Saved ${result.changed.join(", ")}` : "No change");
  } else if (row.kind === "calendar") {
    const result = await postJSON(`/api/calendar`, body);
    toast(result.saved ? "Saved calendar" : "No change");
  }
  state.dirty.clear();
  state.refreshBar?.();
  await boot();
}

// House -----------------------------------------------------------------------

function renderHouse(row, rec) {
  state.pending = {};
  const p = state.draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };

  const body = el("div", { class: "panel-body" });

  body.append(el("div", { class: "group", text: "Identity" }));
  body.append(
    textField(
      "Name",
      p.house_name ?? p.title,
      (v) => {
        p.house_name = v;
        set("house_name", v);
      },
      "Shown on the signboard and in the directory.",
    ),
  );

  body.append(el("div", { class: "group", text: "House" }));
  body.append(
    selectField(
      "Archetype",
      p.archetype,
      [
        "pillared-tile",
        "balcony-stair",
        "courtyard",
        "single-storey",
        "verandah",
        "terraced",
      ],
      (v) => {
        p.archetype = v;
        set("archetype", v);
      },
    ),
  );
  body.append(
    selectField("Facing", p.facing, ["north", "south", "east", "west"], (v) => {
      p.facing = v;
      set("facing", v);
    }),
  );

  const size = p.size_m || [11, 9, 4.2];
  const sizeRow = el("div", { class: "field" }, el("label", { text: "Size (m)" }));
  const sizeControls = el("div", { class: "control" });
  ["width", "depth", "height"].forEach((axis, i) => {
    const input = el("input", { type: "number", step: "0.1", value: size[i] });
    input.addEventListener("input", () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      const next = [...(p.size_m || size)];
      next[i] = n;
      p.size_m = next;
      set("size_m", next);
    });
    sizeControls.append(input);
  });
  sizeRow.append(sizeControls);
  body.append(sizeRow);

  body.append(el("div", { class: "group", text: "Colours" }));
  body.append(
    colourField(
      "Wall",
      p.wall_color,
      (v) => {
        p.wall_color = v;
        set("wall_color", v);
      },
      PALETTE.wall,
    ),
  );
  body.append(
    colourField(
      "Roof",
      p.roof_color,
      (v) => {
        p.roof_color = v;
        set("roof_color", v);
      },
      PALETTE.roof,
    ),
  );
  body.append(
    colourField(
      "Sign wood",
      p.sign?.wood,
      (v) => {
        p.sign = { ...(p.sign || {}), wood: v };
        set("wood_color", v);
      },
      PALETTE.wood,
    ),
  );

  body.append(el("div", { class: "group", text: "Surroundings" }));
  body.append(
    chipsField("Props", p.props, PROP_LIST, (v) => {
      p.props = v;
      set("props", v);
    }),
  );

  body.append(el("div", { class: "group", text: "Grounds" }));
  body.append(
    rangeField(
      "Weathering",
      p.building?.weathering ?? 0.35,
      (v) => {
        p.building = { ...(p.building || {}), weathering: v };
        set("weathering", v);
      },
      { min: 0, max: 1, step: 0.01, format: (n) => n.toFixed(2) },
    ),
  );
  body.append(
    numberField(
      "Path width",
      p.building?.path_width_m ?? 1.3,
      (v) => {
        p.building = { ...(p.building || {}), path_width_m: v };
        set("path_width_m", v);
      },
      { min: 0.6, max: 4, step: 0.05, hint: "Metres. The walk from the gate to the door." },
    ),
  );

  if (rec.cell)
    body.append(
      el("p", {
        class: "note",
        text: `Acre cell ${rec.cell.join(", ")}. Position comes from data/settlements.json, so it is not edited here.`,
      }),
    );

  paintInspector(panelHead(row, rec, [lookAtButton(rec.cell)]), body.append(saveBar()) || body);
}

const PROP_LIST = [
  "shade-tree",
  "banana-clump",
  "kitchen-garden",
  "cattle-shed",
  "tulsi-pot",
  "water-pot",
  "swing",
  "cart",
  "hay-stack",
  "flower-pots",
  "well",
  "grindstone",
];

function lookAtButton(cell) {
  return el("button", {
    class: "ghost",
    type: "button",
    text: "◎ Look at it",
    onclick: () => flyTo(cell),
  });
}

// Species ---------------------------------------------------------------------

function renderSpecies(row, draft) {
  state.pending = {};
  const p = draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };
  const body = el("div", { class: "panel-body" });
  const isAnimal = row.group === "animals";

  body.append(el("div", { class: "group", text: "Form" }));
  if (!isAnimal) {
    body.append(
      textField("Form", p.form, (v) => {
        p.form = v;
        set("form", v);
      }, "dome, palm, feather, banana…"),
    );
    body.append(
      numberField("Height", p.height, (v) => {
        p.height = v;
        set("height", v);
      }, { min: 0.2, max: 60, step: 0.1, hint: "Metres." }),
    );
    body.append(
      rangeField("Spread", p.spread ?? 1, (v) => {
        p.spread = v;
        set("spread", v);
      }, { min: 0.1, max: 4, step: 0.01, format: (n) => `${n.toFixed(2)}×` }),
    );
    if (p.branches !== undefined)
      body.append(
        numberField("Branches", p.branches, (v) => {
          p.branches = v;
          set("branches", v);
        }, { min: 0, max: 40, step: 1 }),
      );
  } else if (p.size !== undefined)
    body.append(
      numberField("Size", p.size, (v) => {
        p.size = v;
        set("size", v);
      }, { min: 0.1, max: 8, step: 0.05 }),
    );

  body.append(el("div", { class: "group", text: "Colours" }));
  body.append(
    colourField("Foliage", p.colour, (v) => {
      p.colour = v;
      set("colour", v);
    }, PALETTE.leaf, isAnimal ? "Body colour." : "The main canopy colour in the world."),
  );
  body.append(
    colourField("Accent", p.accent, (v) => {
      p.accent = v;
      set("accent", v);
    }, PALETTE.leaf),
  );

  if (p.fruit !== undefined)
    body.append(
      chipsField("Fruit", p.fruit ? ["fruit"] : [], ["fruit"], (v) => {
        p.fruit = v.length > 0;
        set("fruit", p.fruit);
      }),
    );

  body.append(saveBar());
  paintInspector(panelHead(row, null), body);
}

// Trail -----------------------------------------------------------------------

function renderTrail(row, rec) {
  state.pending = {};
  const p = state.draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };
  const body = el("div", { class: "panel-body" });

  body.append(el("div", { class: "group", text: "Trail" }));
  body.append(textField("Title", p.title, (v) => { p.title = v; set("title", v); }));
  body.append(
    textField("Surface", p.surface, (v) => { p.surface = v; set("surface", v); }, "earth, stone, boardwalk"),
  );
  body.append(
    numberField("Width", p.width_m, (v) => { p.width_m = v; set("width_m", v); }, { min: 0.4, max: 8, step: 0.05, hint: "Metres." }),
  );
  body.append(
    textField("Goal", p.goal, (v) => { p.goal = v; set("goal", v); }, "lookout, grove, river…"),
  );

  body.append(el("div", { class: "group", text: `Path (${(p.points || []).length} points)` }));
  body.append(
    el("p", {
      class: "note",
      text: "Points live in grid cells. Use “Look at it” to fly the preview to the trailhead, then edit the coordinates below.",
    }),
  );
  const first = (p.points || [])[0] || [0, 0];
  const last = (p.points || [])[p.points.length - 1] || [0, 0];
  const pts = el("div", { class: "control", style: "display:block" });
  for (const [label, index] of [["Start", 0], ["End", -1]]) {
    const pt = index === 0 ? first : last;
    const rowEl = el(
      "div",
      { class: "field" },
      el("label", { text: label }),
      el("div", { class: "control" },
        ...[0, 1].map((axis) => {
          const input = el("input", { type: "number", step: "0.5", value: pt[axis] });
          input.addEventListener("input", () => {
            const points = (p.points || []).map((q) => [...q]);
            const target = index === -1 ? points.length - 1 : index;
            points[target][axis] = Number(input.value);
            p.points = points;
            set("points", points);
          });
          return input;
        }),
      ),
    );
    pts.append(rowEl);
  }
  body.append(pts);

  body.append(saveBar());
  paintInspector(
    panelHead(row, rec, [lookAtButton(first.map((v) => Math.floor(v)))]),
    body,
  );
}

// Place -----------------------------------------------------------------------

function renderPlace(row, rec) {
  state.pending = {};
  const p = state.draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };
  const body = el("div", { class: "panel-body" });

  body.append(el("div", { class: "group", text: "Landmark" }));
  body.append(textField("Title", p.title, (v) => { p.title = v; set("title", v); }));
  body.append(
    textField("Kind", p.place?.kind, (v) => { p.place = { ...(p.place || {}), kind: v }; set("kind", v); }),
  );

  body.append(el("div", { class: "group", text: "Position" }));
  const cell = p.place?.cell || [0, 0];
  const cellRow = el("div", { class: "field" }, el("label", { text: "Cell" }));
  const cellControls = el("div", { class: "control" });
  [0, 1].forEach((axis) => {
    const input = el("input", { type: "number", value: cell[axis] });
    input.addEventListener("input", () => {
      const next = [...(p.place?.cell || cell)];
      next[axis] = Number(input.value);
      p.place = { ...(p.place || {}), cell: next };
      set("cell", next);
    });
    cellControls.append(input);
  });
  cellRow.append(cellControls);
  body.append(cellRow);
  body.append(
    textField("Note", p.place?.note, (v) => { p.place = { ...(p.place || {}), note: v }; set("note", v); }),
  );

  body.append(saveBar());
  paintInspector(panelHead(row, rec, [lookAtButton(cell)]), body);
}

// District --------------------------------------------------------------------

function renderDistrict(row, rec) {
  state.pending = {};
  const p = state.draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };
  const body = el("div", { class: "panel-body" });
  const d = p.district || {};

  body.append(el("div", { class: "group", text: "Identity" }));
  body.append(textField("Title", p.title, (v) => { p.title = v; set("title", v); }));
  body.append(textField("Name", d.name, (v) => { d.name = v; p.district = d; set("name", v); }));
  body.append(
    textField("Telugu", d.te, (v) => { d.te = v; p.district = d; set("te", v); }, d.te_status || "వికాసం"),
  );
  body.append(
    selectField("State", d.state, ["Telangana", "Andhra Pradesh"], (v) => {
      d.state = v;
      p.district = d;
      set("state", v);
    }),
  );
  body.append(
    numberField("Capacity", d.capacity, (v) => { d.capacity = v; p.district = d; set("capacity", v); },
      { min: 0, max: 500, step: 1, hint: "How many followers this district can host." }),
  );

  body.append(
    el("p", { class: "note", text: "The acre pool in this file is generated by the planner. The editor leaves it untouched." }),
  );
  body.append(saveBar());
  paintInspector(panelHead(row, rec), body);
}

// Roads -----------------------------------------------------------------------

function renderRoads(row, rec) {
  const body = el("div", { class: "panel-body" });
  const net = state.draft.network || {};
  body.append(
    el("p", { class: "note" , text: "Funded public works only. Houses, lanes and squares are generated from the village register, so they are not edited here." }),
  );
  body.append(el("div", { class: "group", text: "Works" }));
  body.append(field("Homes served", el("span", { class: "hex", text: String(net.homes ?? 0) })));
  body.append(field("Cells per home", el("span", { class: "hex", text: String(net.cellsPerHome ?? 0) })));
  body.append(field("Lighting", el("span", { class: "hex", text: net.lit ? "yes" : "no" })));
  body.append(field("Poles", el("span", { class: "hex", text: String((net.poles || []).length) })));
  body.append(field("Spans", el("span", { class: "hex", text: String((net.spans || []).length) })));
  paintInspector(panelHead(row, rec), body);
}

// Village ---------------------------------------------------------------------

function renderVillage(row, rec) {
  const body = el("div", { class: "panel-body" });
  const v = state.world.villages.find((x) => x.id === row.id);
  if (!v) {
    body.append(el("p", { class: "note", text: "Village register not found." }));
    paintInspector(panelHead(row, rec), body);
    return;
  }
  body.append(el("div", { class: "group", text: "Register" }));
  body.append(field("District", el("span", { class: "hex", text: String(v.district) })));
  body.append(field("Homes", el("span", { class: "hex", text: `${v.homes} / ${v.capacity}` })));
  body.append(field("Lanes", el("span", { class: "hex", text: String(v.paths) })));
  body.append(field("Square", el("span", { class: "hex", text: `${v.square?.side ?? "?"} cells` })));
  body.append(
    el("p", {
      class: "note",
      text: "Village squares and lanes are laid out by tools/settle.mjs so they stay collision-clean. Change capacity on the district, then re-run the settler.",
    }),
  );
  paintInspector(
    panelHead(row, rec, [v.hub ? lookAtButton(v.hub.map(Math.floor)) : null].filter(Boolean)),
    body,
  );
}

// Calendar --------------------------------------------------------------------

function renderCalendar(row, rec) {
  state.pending = {};
  const p = state.draft;
  const set = (key, value) => {
    state.pending[key] = value;
    markDirty(key);
  };
  const body = el("div", { class: "panel-body" });

  body.append(el("div", { class: "group", text: "Time" }));
  body.append(
    numberField("Day hours", p.defaultDayHours, (v) => { p.defaultDayHours = v; set("defaultDayHours", v); },
      { min: 1, max: 24, step: 1, hint: "Simulated hours an in-world day covers." }),
  );
  body.append(
    numberField("Year length", p.yearRealDays, (v) => { p.yearRealDays = v; set("yearRealDays", v); },
      { min: 1, max: 365, step: 1, hint: "Real days per simulated year." }),
  );
  body.append(
    numberField("Weather window", p.weatherWindowSeconds, (v) => { p.weatherWindowSeconds = v; set("weatherWindowSeconds", v); },
      { min: 60, max: 86400, step: 60, hint: "Seconds between weather rolls." }),
  );
  body.append(
    numberField("Seed", p.seed, (v) => { p.seed = v; set("seed", v); }, { min: 0, max: 1e9, step: 1 }),
  );

  body.append(saveBar());
  paintInspector(panelHead(row, rec), body);
}

// ---------- paint ----------

function paintInspector(...nodes) {
  const inspector = $("#inspector");
  inspector.replaceChildren(...nodes.flat().filter(Boolean));
  inspector.scrollTop = 0;
  state.refreshBar?.();
}

// ---------- layout ----------

$("#reload-preview").addEventListener("click", reloadPreview);
$("#toggle-preview").addEventListener("click", () => {
  document.body.classList.toggle("no-preview");
});

// Drag the divider to trade space between the preview and the fields.
const resizer = $("#resizer");
resizer.addEventListener("pointerdown", (down) => {
  resizer.classList.add("is-dragging");
  resizer.setPointerCapture(down.pointerId);
  const inspector = $("#inspector");
  const move = (e) => {
    const right = window.innerWidth - e.clientX;
    inspector.style.width = Math.max(300, Math.min(720, right)) + "px";
  };
  const up = () => {
    resizer.classList.remove("is-dragging");
    resizer.removeEventListener("pointermove", move);
    resizer.removeEventListener("pointerup", up);
  };
  resizer.addEventListener("pointermove", move);
  resizer.addEventListener("pointerup", up);
});

boot().catch((error) => {
  $("#status").textContent = "failed to load";
  toast(error.message, true);
});
