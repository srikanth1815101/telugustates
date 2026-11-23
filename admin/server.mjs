// The world editor server.
//
//   node admin            (or: npm --prefix admin start)
//
// Serves three things on one port:
//   /            the editor UI
//   /api/*       read + write the Hugo content tree
//   /preview/*   the real, unmodified 3D engine, with the two Hugo-generated
//                JSON files synthesised in Node (see lib/catalog.mjs)
//
// Nothing in Hugo-Project is modified or rebuilt. The engine files are served
// byte-for-byte as they ship, so what the editor shows is what the site shows.

import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readData } from "./lib/content.mjs";
import { buildCatalogResolved } from "./lib/catalog.mjs";
import { api } from "./lib/api.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, "public");
const STATIC = path.join(ROOT, "Hugo-Project", "static");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".gz": "application/gzip",
  ".bin": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const mime = (file) => MIME[path.extname(file).toLowerCase()] || "application/octet-stream";

async function sendFile(res, file, extraHeaders = {}) {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return send(res, 404, "Not found");
  }
  if (stat.isDirectory()) return send(res, 404, "Not found");
  res.writeHead(200, {
    "content-type": mime(file),
    "content-length": stat.size,
    "cache-control": "no-cache",
    ...extraHeaders,
  });
  createReadStream(file).pipe(res);
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-cache" });
  res.end(body);
}

const json = (res, status, value) => send(res, status, JSON.stringify(value), "application/json; charset=utf-8");

// Hugo normally renders these two; the editor renders them per request so an
// edit is visible on the next reload with no build step.
async function synthesized(req, res, which) {
  if (which === "catalog.json") {
    const catalog = await buildCatalogResolved();
    return json(res, 200, catalog);
  }
  if (which === "app-version.json") {
    const rel = (await readData("app_release.json")) || {};
    return json(res, 200, {
      versionCode: rel.versionCode ?? 0,
      versionName: rel.versionName ?? "0.0.0",
      engineHash: "admin-preview",
      apkUrl: "about:blank",
      releaseMetaUrl: "about:blank",
      domains: [],
      catalogPath: "/catalog.json",
    });
  }
  return send(res, 404, "Not found");
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        return res.end();
      }

      // ---- API ----
      if (pathname.startsWith("/api/")) {
        const body = req.method === "POST" || req.method === "PUT" ? await readBody(req) : null;
        const result = await api(req.method, pathname.slice(5), url.searchParams, body);
        return json(res, result.status || 200, result.body ?? null);
      }

      // ---- preview: synthesized Hugo output ----
      if (pathname === "/preview/catalog.json" || pathname === "/preview/app-version.json")
        return synthesized(req, res, pathname.replace("/preview/", ""));

      // ---- preview: the engine, untouched ----
      if (pathname === "/preview" || pathname === "/preview/")
        return sendFile(res, path.join(HERE, "public", "preview.html"));

      if (pathname.startsWith("/preview/")) {
        const rel = pathname.slice("/preview/".length);
        const abs = path.resolve(STATIC, rel);
        if (!abs.startsWith(STATIC + path.sep)) return send(res, 403, "Forbidden");
        return sendFile(res, abs);
      }

      // ---- editor UI ----
      if (pathname === "/" || pathname === "/index.html")
        return sendFile(res, path.join(UI, "index.html"));

      const abs = path.resolve(UI, "." + pathname);
      if (!abs.startsWith(UI + path.sep)) return send(res, 403, "Forbidden");
      return sendFile(res, abs);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error(error);
      return json(res, status, { error: error.message || String(error) });
    }
  });
}

// Start listening when run directly (`node admin/server.mjs`) or through the
// root launcher (`node admin.mjs`), but stay importable for tests.
const startedDirectly =
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ||
  String(process.argv[1] || "").endsWith("admin.mjs");
if (startedDirectly) {
  const port = Number(process.env.PORT || process.argv[2] || 4173);
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`\n  Telugu States world editor\n`);
    console.log(`  editor   http://localhost:${port}/`);
    console.log(`  preview  http://localhost:${port}/preview/\n`);
    console.log(`  content  ${path.join(ROOT, "Hugo-Project", "content")}\n`);
  });
}
