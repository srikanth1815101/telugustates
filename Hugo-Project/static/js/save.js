// Local save system (Phase 4) on IndexedDB via vendored idb — no servers,
// no accounts. Existing localStorage position/prefs stores are untouched;
// this is an additive slot store for life-sim state (inventory, crops,
// quests, economy) with JSON export/import for the player.
// @ts-check
import { openDB } from "../vendor/idb.mjs";

const DB_NAME = "atlas-life";
const STORE = "slots";
const SCHEMA = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbP = null;
function db() {
  if (!dbP)
    dbP = openDB(DB_NAME, SCHEMA, {
      upgrade(d) {
        d.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  return dbP;
}

/**
 * @typedef {{id: string, at: number, v: number, data: Record<string, unknown>}} Slot
 */

/** Read a save slot; returns null when absent or corrupt. */
export async function loadSlot(id = "default") {
  try {
    const rec = /** @type {Slot | undefined} */ (await (await db()).get(STORE, id));
    if (!rec || rec.v !== SCHEMA || typeof rec.data !== "object") return null;
    return rec;
  } catch {
    return null;
  }
}

/** Write a slot. `data` is a plain object keyed by subsystem. */
export async function saveSlot(id, data) {
  /** @type {Slot} */
  const rec = { id, at: Date.now(), v: SCHEMA, data };
  await (await db()).put(STORE, rec);
  return rec;
}

/** All slot metadata (newest first), without payloads. */
export async function listSlots() {
  try {
    const all = /** @type {Slot[]} */ (await (await db()).getAll(STORE));
    return all
      .map(({ id, at, v }) => ({ id, at, v }))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** Export a slot as a JSON string (player downloads/shares it). */
export async function exportSlot(id = "default") {
  const rec = await loadSlot(id);
  if (!rec) return null;
  return JSON.stringify({ app: "telugustates-life", v: SCHEMA, slot: rec });
}

/**
 * Import a previously exported JSON string. Returns the stored slot, or
 * null on any validation failure (never throws on bad player input).
 */
export async function importSlot(json, id = "default") {
  try {
    const parsed = JSON.parse(json);
    if (parsed?.app !== "telugustates-life" || parsed.v !== SCHEMA) return null;
    const rec = parsed.slot;
    if (!rec || typeof rec.id !== "string" || typeof rec.data !== "object")
      return null;
    return await saveSlot(id, rec.data);
  } catch {
    return null;
  }
}

/** Remove a slot (e.g. "New game"). */
export async function deleteSlot(id = "default") {
  try {
    await (await db()).delete(STORE, id);
    return true;
  } catch {
    return false;
  }
}
