// Surgical editing of YAML documents.
//
// The editor must produce a *minimal* diff: changing one colour should touch
// one line, not reformat the file. A general YAML round-trip cannot promise
// that (quoting, indent style, list dash position all vary), so instead this
// module keeps the original line structure and rewrites only the lines whose
// scalar values actually changed.
//
// Every mutation follows the same shape:
//   1. locate the line that owns a key (by walking the original text)
//   2. replace just its value, preserving indentation, quoting style and comments
//   3. leave every other byte untouched
//
// Anything the editor cannot locate is reported, never guessed at.

import { parseYaml } from "./yaml.mjs";

const indentOf = (line) => line.length - line.trimStart().length;
const isSeqLine = (line) => /^\s*-(?: |$)/.test(line);
const isNestedPairLine = (line) => /^\s*- - /.test(line);

// Split a line into indent / key / value while ignoring "#" inside quotes.
function splitEntry(line) {
  const indent = indentOf(line);
  const body = line.slice(indent);
  if (isSeqLine(body)) return { indent, dash: true, raw: body };
  let q = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ":" && (i + 1 === body.length || /\s/.test(body[i + 1]))) {
      return {
        indent,
        key: body.slice(0, i).trim(),
        after: body.slice(i + 1),
        colonAt: i,
        raw: body,
      };
    }
  }
  return { indent, raw: body };
}

function quoteStyle(original) {
  const t = String(original).trim();
  if (t.startsWith("'")) return "single";
  if (t.startsWith('"')) return "double";
  return "plain";
}

function renderScalar(value, style, like) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    // Preserve the author's float style: 8.0 stays 8.0, not 8.
    if (like !== undefined && /^-?\d+\.\d+$/.test(String(like).trim()) && Number.isInteger(value))
      return value.toFixed(1);
    if (!Number.isFinite(value)) return value > 0 ? ".inf" : value < 0 ? "-.inf" : ".nan";
    return String(value);
  }
  const s = String(value);
  // Keep the author's quoting habit where it is still valid.
  if (style === "single" && !s.includes("'")) return `'${s}'`;
  if (style === "double") return JSON.stringify(s);
  const needsQuotes =
    s === "" ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    /^[-+]?(\d|\.\d)/.test(s) ||
    /[:#\[\]{}&*!|>'"%@`,]/.test(s) ||
    /^\s|\s$/.test(s);
  return needsQuotes ? (s.includes("'") ? JSON.stringify(s) : `'${s}'`) : s;
}

// Replace the value portion of a "key: value" line.
function setLineValue(line, value) {
  const entry = splitEntry(line);
  if (entry.dash || entry.key === undefined) return null;
  const afterRaw = entry.after;
  const trailing = afterRaw.match(/\s+#.*$/); // keep a trailing comment
  const comment = trailing ? trailing[0] : "";
  const hadSpace = /^\s/.test(afterRaw);
  const oldValue = afterRaw.replace(/\s+#.*$/, "").trim();
  const style = oldValue ? quoteStyle(oldValue) : "plain";
  const rendered = renderScalar(value, style, oldValue);
  const indent = " ".repeat(entry.indent);
  return `${indent}${entry.key}:${hadSpace || rendered ? " " : ""}${rendered}${comment}`;
}

// Find the [start, end) line range of a key's block within `lines`.
function keyRange(lines, key, { from = 0, to = lines.length, minIndent } = {}) {
  for (let i = from; i < to; i++) {
    const entry = splitEntry(lines[i]);
    if (entry.dash || entry.key !== key) continue;
    if (minIndent !== undefined && entry.indent < minIndent) continue;
    const indent = entry.indent;
    const valueInline = entry.after.replace(/\s+#.*$/, "").trim() !== "";
    if (valueInline) return { start: i, end: i + 1, indent, inline: true };
    let end = to;
    for (let j = i + 1; j < to; j++) {
      if (!lines[j].trim()) continue;
      const ind = indentOf(lines[j]);
      // A sequence may sit at the same indent as its key.
      if (ind > indent || (ind === indent && isSeqLine(lines[j]))) continue;
      end = j;
      break;
    }
    return { start: i, end, indent, inline: false };
  }
  return null;
}

// ---- public operations ------------------------------------------------------

// Apply a flat patch to a YAML document held as text.
// Returns { text, changed: [keys], missing: [keys] }.
export function patchDoc(text, patch) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const changed = [];
  const missing = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const range = keyRange(lines, key);
    if (!range) {
      missing.push(key);
      continue;
    }
    const before = lines.slice(range.start, range.end).join("\n");
    if (range.inline) {
      const replaced = setLineValue(lines[range.start], value);
      if (replaced === null) {
        missing.push(key);
        continue;
      }
      lines[range.start] = replaced;
    } else {
      // Replace a block value (list or map) with a freshly rendered one.
      const originalBlock = lines.slice(range.start, range.end);
      const rendered = renderBlock(key, value, range.indent, lines[range.start], originalBlock);
      lines.splice(range.start, range.end - range.start, ...rendered);
    }
    if (lines.slice(range.start, range.start + 1).join("\n") !== before.split("\n")[0] || !range.inline)
      changed.push(key);
  }

  // Report only keys whose text actually differs.
  const after = lines.join("\n");
  const realChanged = [];
  for (const key of changed) {
    const ranged = keyRange(after.split("\n"), key);
    if (!ranged) continue;
    const now = after.split("\n").slice(ranged.start, ranged.end).join("\n");
    const was = text.split("\n");
    const oldRange = keyRange(was, key);
    const before = oldRange ? was.slice(oldRange.start, oldRange.end).join("\n") : "";
    if (now !== before) realChanged.push(key);
  }

  return { text: after, changed: realChanged, missing };
}

// Render a whole block (list or map) at a given indent, keeping the original
// key line so its indentation and comment survive.
function renderBlock(key, value, indent, keyLine, originalLines = []) {
  const pad = " ".repeat(indent);
  const out = [];
  const childPad = pad; // these files indent sequences at the key's own level
  const compact = originalLines.some(isNestedPairLine) ||
    (Array.isArray(value) && value.every((v) => Array.isArray(v) && v.length === 2));

  if (Array.isArray(value)) {
    for (const item of value) {
      if (compact && Array.isArray(item)) {
        // "- - x" / "  - y": preserve the compact pair form these files use.
        item.forEach((v, n) => {
          out.push(n === 0 ? childPad + "- - " + renderScalar(v, "plain") : childPad + "  - " + renderScalar(v, "plain"));
        });
        continue;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item);
        entries.forEach(([k, v], n) => {
          const head = n === 0 ? childPad + "- " : childPad + "  ";
          out.push(`${head}${k}: ${renderScalar(v, "plain")}`);
        });
      } else if (Array.isArray(item)) {
        out.push(childPad + "- " + "[" + item.map((v) => renderScalar(v, "plain")).join(", ") + "]");
      } else {
        out.push(childPad + "- " + renderScalar(item, "plain"));
      }
    }
    return [keyLine, ...out];
  }

  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (v && typeof v === "object") {
        out.push(`${childPad}${k}:`);
        out.push(...renderBlock(k, v, indent + 4, `${childPad}${k}:`).slice(1));
      } else out.push(`${childPad}${k}: ${renderScalar(v, "plain")}`);
    }
    return [keyLine, ...out];
  }

  return [setLineValue(keyLine, value) ?? keyLine];
}

function linesStyleSeqsAtSameIndent(keyLine) {
  return true; // these content files use the same indent as the parent key
}

// Convenience: patch a nested path like ["trees", "Mango"].
export function patchNested(text, pathKeys, patch) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let from = 0;
  let to = lines.length;
  let indent = 0;
  for (const key of pathKeys) {
    const range = keyRange(lines, key, { from, to, minIndent: indent });
    if (!range) return { text, changed: [], missing: [key] };
    from = range.start + 1;
    to = range.end;
    indent = range.indent + 1;
  }
  const slice = lines.slice(from, to).join("\n");
  const patched = patchDoc(slice, patch);
  if (!patched.changed.length) return { text, changed: [], missing: patched.missing };
  const next = [...lines.slice(0, from), ...patched.text.split("\n"), ...lines.slice(to)];
  return { text: next.join("\n"), changed: patched.changed, missing: patched.missing };
}

export { splitEntry, keyRange };

// Reassemble a document: original front matter, new body.
export function keepDoc(doc, nextBody) {
  const eol = doc.eol || "\n";
  const fm = doc.frontMatter.split("\n").join(eol);
  return `---${eol}${fm}${eol}---${eol}${nextBody}`;
}
