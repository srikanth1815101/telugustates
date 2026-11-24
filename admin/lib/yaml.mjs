// A small YAML subset parser/emitter, sufficient for Hugo front matter and the
// world content files. Supports nested maps, lists (block and flow), scalars,
// quoted strings, comments and multi-line flow collections.
//
// It is deliberately not a general YAML implementation: the editor must write
// files back in a form Hugo reads identically, and a narrow, predictable subset
// is far easier to round-trip without silently corrupting a person's world.

const indentOf = (line) => line.length - line.trimStart().length;
const stripComment = (s) => {
  // Remove a trailing comment that is not inside quotes.
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
};

function parseScalar(raw) {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "[]") return [];
  if (s === "{}") return {};
  if (/^[[{]/.test(s)) return parseFlow(s);
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s.replace(/^"|"$/g, (m) => m));
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (/^-?(0|[1-9]\d*)$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (/^-?(0|[1-9]\d*)\.\d+([eE][-+]?\d+)?$/.test(s) || /^-?(0|[1-9]\d*)[eE][-+]?\d+$/.test(s))
    return Number(s);
  if (/^-?\.(inf|Inf|INF)$/.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  return s;
}

// Flow collections: [a, b, c] and {k: v, ...} possibly spanning lines.
function parseFlow(src) {
  let i = 0;
  const ws = () => {
    while (i < src.length && /[\s,]/.test(src[i])) i++;
  };
  function value(stopAt) {
    ws();
    if (src[i] === "[") {
      i++;
      const out = [];
      for (;;) {
        ws();
        if (src[i] === "]") {
          i++;
          return out;
        }
        if (i >= src.length) return out;
        out.push(value("]"));
        ws();
      }
    }
    if (src[i] === "{") {
      i++;
      const out = {};
      for (;;) {
        ws();
        if (src[i] === "}") {
          i++;
          return out;
        }
        if (i >= src.length) return out;
        const k = scalar(stopAt);
        ws();
        if (src[i] === ":") i++;
        out[k] = value("}");
        ws();
      }
    }
    return scalar(stopAt);
  }
  function scalar() {
    ws();
    const start = i;
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      while (i < src.length) {
        if (q === '"' && src[i] === "\\") i += 2;
        else if (src[i] === q) {
          i++;
          break;
        } else i++;
      }
      return parseScalar(src.slice(start, i));
    }
    while (i < src.length && !/[,\]}]/.test(src[i])) i++;
    return parseScalar(src.slice(start, i));
  }
  return value(null);
}

// Split "key: rest" honouring quotes.
function splitKey(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ":" && (i + 1 === line.length || /\s/.test(line[i + 1]))) {
      const k = line.slice(0, i).trim().replace(/^["']|["']$/g, "");
      return [k, line.slice(i + 1)];
    }
  }
  return null;
}

// Collect a possibly multi-line flow collection starting at lines[idx].
function collectFlow(lines, idx, first) {
  let text = first;
  let depth = 0;
  let q = null;
  const scan = () => {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === "\\" && q === '"') i++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
    }
  };
  scan();
  while (depth > 0 && idx + 1 < lines.length) {
    idx++;
    text += " " + lines[idx].trim();
    scan();
  }
  return [text, idx];
}

export function parseYaml(text) {
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = [];
  for (const raw of rawLines) {
    const body = stripComment(raw.replace(/\t/g, "  "));
    if (!body.trim() || body.trim() === "---" || body.trim() === "...") continue;
    lines.push(body);
  }

  let i = 0;
  function block(indent) {
    // Decide list vs map from the first significant line at this indent.
    if (i >= lines.length) return null;
    const first = lines[i];
    if (indentOf(first) < indent) return null;
    const isList = /^\s*-(?: |$)/.test(first);
    if (isList) {
      const out = [];
      while (i < lines.length) {
        const line = lines[i];
        const ind = indentOf(line);
        if (ind < indent || !/^\s*-(?: |$)/.test(line)) break;
        const after = line.slice(ind + 1);
        const rest = after.trimStart();
        if (!rest) {
          i++;
          const v = block(indent + 1);
          out.push(v);
          continue;
        }
        // "- key: value" starts an inline map whose keys align after the dash.
        const kv = splitKey(rest);
        if (kv) {
          const childIndent = ind + 1 + (after.length - rest.length);
          lines[i] = " ".repeat(childIndent) + rest;
          const v = block(childIndent);
          out.push(v);
          continue;
        }
        i++;
        const [flowText, last] = /^[[{]/.test(rest) ? collectFlow(lines, i - 1, rest) : [rest, i - 1];
        i = last + 1;
        out.push(parseScalar(flowText));
      }
      return out;
    }
    const out = {};
    while (i < lines.length) {
      const line = lines[i];
      const ind = indentOf(line);
      if (ind < indent) break;
      if (ind > indent) {
        // Unexpected deeper line without a parent key: skip defensively.
        i++;
        continue;
      }
      if (/^\s*-/.test(line)) break;
      const kv = splitKey(line);
      if (!kv) {
        i++;
        continue;
      }
      const [key, restRaw] = kv;
      const rest = restRaw.trim();
      i++;
      if (rest === "") {
        const next = lines[i];
        if (next === undefined) {
          out[key] = null;
          continue;
        }
        // A block sequence may sit at the same indent as its parent key -- this
        // is the style Hugo itself emits, so it must be handled explicitly.
        const nextIndent = indentOf(next);
        const isSeqAtSameIndent = nextIndent === indent && /^\s*-(?: |$)/.test(next);
        if (nextIndent > indent || isSeqAtSameIndent) out[key] = block(nextIndent);
        else out[key] = null;
        continue;
      }
      if (/^[[{]/.test(rest)) {
        const [flowText, last] = collectFlow(lines, i - 1, rest);
        i = last + 1;
        out[key] = parseScalar(flowText);
        continue;
      }
      if (/^[|>][-+]?$/.test(rest)) {
        // Block scalar: gather more-indented lines.
        const chunk = [];
        while (i < lines.length && indentOf(lines[i]) > indent) chunk.push(lines[i]);
        out[key] = chunk.map((l) => l.trim()).join(rest.startsWith(">") ? " " : "\n");
        continue;
      }
      out[key] = parseScalar(rest);
    }
    return out;
  }

  if (!lines.length) return {};
  return block(indentOf(lines[0]));
}

// ---------- emitter ----------

const needsQuote = (s) =>
  s === "" ||
  /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
  /^[-+]?(\d|\.\d)/.test(s) ||
  /[:#\[\]{}&*!|>'"%@`,]/.test(s) ||
  /^\s|\s$/.test(s);

function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return value > 0 ? ".inf" : value < 0 ? "-.inf" : ".nan";
    return String(value);
  }
  const s = String(value);
  if (needsQuote(s)) return JSON.stringify(s);
  return s;
}

const isScalar = (v) => v === null || typeof v !== "object";
const flowSafe = (v) =>
  Array.isArray(v) &&
  v.every(isScalar) &&
  v.length <= 4 &&
  v.every((x) => x === null || typeof x !== "string" || x.length < 24);

function emitValue(value, indent, out) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      out.push(pad + "[]");
      return;
    }
    if (flowSafe(value)) {
      out.push(pad + "[" + value.map(scalar).join(", ") + "]");
      return;
    }
    for (const item of value) {
      if (isScalar(item)) out.push(pad + "- " + scalar(item));
      else if (Array.isArray(item)) {
        if (flowSafe(item)) out.push(pad + "- " + "[" + item.map(scalar).join(", ") + "]");
        else {
          out.push(pad + "-");
          emitValue(item, indent + 2, out);
        }
      } else {
        const keys = Object.keys(item).filter((k) => item[k] !== undefined);
        if (!keys.length) {
          out.push(pad + "- {}");
          continue;
        }
        keys.forEach((k, n) => {
          const v = item[k];
          const head = n === 0 ? pad + "- " : pad + "  ";
          if (isScalar(v)) out.push(head + k + ": " + scalar(v));
          else if (flowSafe(v)) out.push(head + k + ": [" + v.map(scalar).join(", ") + "]");
          else {
            out.push(head + k + ":");
            emitValue(v, indent + 4, out);
          }
        });
      }
    }
    return;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined);
  if (!keys.length) {
    out.push(pad + "{}");
    return;
  }
  for (const k of keys) {
    const v = value[k];
    if (isScalar(v)) out.push(pad + k + ": " + scalar(v));
    else if (flowSafe(v)) out.push(pad + k + ": [" + v.map(scalar).join(", ") + "]");
    else {
      out.push(pad + k + ":");
      emitValue(v, indent + 2, out);
    }
  }
}

export function emitYaml(value) {
  const out = [];
  emitValue(value, 0, out);
  return out.join("\n") + "\n";
}

export { parseScalar };
