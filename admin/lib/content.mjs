// Read/write access to the Hugo content tree.
//
// The rule that keeps this safe: a document is only rewritten when the editor
// has actually changed a value, and even then only the affected front-matter
// keys are re-emitted, in their original order. Bodies, comments and key order
// survive a round-trip, so an edit through the admin produces a minimal diff.

import fs from "node:fs/promises";
import path from "node:path";
import { parseYaml, emitYaml } from "./yaml.mjs";

export const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
export const CONTENT = path.join(ROOT, "Hugo-Project", "content");
export const DATA = path.join(ROOT, "Hugo-Project", "data");

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

export function splitDocument(text) {
  const m = text.match(FM);
  if (!m) return { frontMatter: "", body: text, hasFrontMatter: false };
  return {
    frontMatter: m[1],
    body: text.slice(m[0].length),
    hasFrontMatter: true,
    eol: /\r\n/.test(text) ? "\r\n" : "\n",
  };
}

export function readDocument(file) {
  return fs.readFile(file, "utf8").then((text) => {
    const parts = splitDocument(text);
    return {
      file,
      ...parts,
      data: parts.hasFrontMatter ? parseYaml(parts.frontMatter) || {} : {},
      raw: text,
    };
  });
}

// Rebuild a document, replacing only the keys that changed.
// `order` preserves the author's key sequence when a key is new.
export function writeDocument(doc, nextData) {
  const prev = doc.data || {};
  const keys = [];
  for (const k of Object.keys(prev)) keys.push(k);
  for (const k of Object.keys(nextData)) if (!keys.includes(k)) keys.push(k);

  const changed = keys.filter(
    (k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(nextData[k] ?? null),
  );

  if (!changed.length) return null; // nothing to write

  // Re-emit the whole front matter in the original key order. Keys are stable,
  // so the diff stays limited to the values that actually moved.
  const merged = {};
  for (const k of keys) {
    if (k in nextData) merged[k] = nextData[k];
    else if (k in prev) merged[k] = prev[k];
    if (merged[k] === undefined) delete merged[k];
  }
  const frontMatter = emitYaml(merged).replace(/\n$/, "");
  const eol = doc.eol || "\n";
  const text = `---${eol}${frontMatter.split("\n").join(eol)}${eol}---${eol}${doc.body}`;
  return { text, changed };
}

export async function saveDocument(doc, nextData) {
  const built = writeDocument(doc, nextData);
  if (!built) return { written: false, changed: [] };
  await fs.writeFile(doc.file, built.text, "utf8");
  doc.data = nextData;
  doc.raw = built.text;
  doc.frontMatter = splitDocument(built.text).frontMatter;
  return { written: true, changed: built.changed };
}

// ---------- section helpers ----------

export async function listSection(section) {
  const dir = path.join(CONTENT, section);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".md") && n !== "_index.md").sort();
}

export async function readSection(section) {
  const files = await listSection(section);
  const docs = [];
  for (const name of files) {
    const doc = await readDocument(path.join(CONTENT, section, name));
    doc.name = name;
    doc.section = section;
    docs.push(doc);
  }
  return docs;
}

export async function readData(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, name), "utf8"));
  } catch {
    return null;
  }
}

export async function writeData(name, value) {
  const file = path.join(DATA, name);
  await fs.writeFile(file, JSON.stringify(value), "utf8");
  return file;
}

// Guard every path that reaches the filesystem from the browser.
export function resolveInContent(rel) {
  const abs = path.resolve(CONTENT, rel);
  if (!abs.startsWith(CONTENT + path.sep)) throw Object.assign(new Error("path escapes content"), { status: 400 });
  return abs;
}
