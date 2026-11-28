// Shared types for the atlas runtime. New modules opt in to checking with a
// `// @ts-check` pragma; legacy modules stay untyped until they are migrated.

/** One terrain tile row: the frozen TSA1 archive record (see static/frozen/TILE-FORMAT.md). */
export interface TileRecord {
  tx: number;
  ty: number;
  /** Acre-cell elevation samples, row-major, +y north. */
  z: Int16Array | number[];
  /** Optional wet/cover channels shipped with the tile. */
  water?: Uint8Array | number[];
  cover?: Uint8Array | number[];
}

/** Public resident record as it appears in catalog.json (privacy-safe: no handles). */
export interface ResidentRecord {
  /** One-way hashed house id, `h` + 24 hex chars. Never changes. */
  u: string;
  /** Display house name or nickname chosen by the resident. */
  name: string;
  /** Fractional atlas cell of the assigned acre (south-west corner). */
  c: [number, number];
  /** Fractional cell of the house centre. */
  homeLocation?: [number, number];
  /** Immutable acre alias (same value as c in published records). */
  acreLocation?: [number, number];
  /** Stable village id, e.g. "v32-01". Not a district. */
  villageId?: string;
  /** District id 1..61. */
  d: number;
  /** Ground elevation in metres. */
  z?: number;
  lat?: number;
  lon?: number;
  record_kind?: "demo" | "community" | "unreviewed" | string;
  added?: string;
  house?: ResidentHouse;
}

export interface ResidentHouse {
  archetype: string;
  size_m: [number, number, number];
  facing?: string;
  wall_color?: string;
  roof_color?: string;
  props?: string[];
  sign?: { label?: string };
  seed?: number;
}

/** Versioned device-local save (Layer 3). Never written to Git. */
export interface SaveSchema {
  /** Integer schema version; migrations run in order. */
  v: number;
  /** One-way resident id this save belongs to. */
  resident: string;
  /** ISO timestamp of the last autosave. */
  savedAt: string;
  position?: {
    x: number;
    y: number;
    yaw?: number;
    third?: boolean;
    room?: string;
  };
  inventory?: InventoryStack[];
  crops?: CropRecord[];
  placed?: PlacedObject[];
  quests?: Record<string, unknown>;
  balance?: { food: number; currency: number; gold: number };
  settings?: Record<string, unknown>;
}

export interface InventoryStack {
  item: string;
  qty: number;
  durability?: number;
}

export interface CropRecord {
  /** Acre cell the crop grows on. */
  cell: [number, number];
  type: string;
  /** World-calendar day the seed went in. */
  sown: number;
  stage: "tilled" | "sown" | "growing" | "mature" | "harvested";
}

export interface PlacedObject {
  item: string;
  cell: [number, number];
  /** Local offset inside the cell, metres. */
  offset: [number, number];
  yaw: number;
}
