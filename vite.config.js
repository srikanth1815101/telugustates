// Vite builds static/js/entry.js (and its dynamic imports) into
// Hugo-Project/static/dist/ as plain ESM. Hugo picks /dist/entry.js when it
// exists and falls back to the unbundled /js/entry.js otherwise, so the
// repository always stays servable with no build step at all.
//
// Constraints that must never be broken:
//  * Runtime stays offline: no CDN, no bare-specifier imports that need an
//    import map — every dependency lives in static/vendor/ (see LICENSES.json).
//  * Emitted JS must sit exactly ONE directory deep (dist/*.js, no nesting):
//    grid.js computes the asset root as new URL("../", import.meta.url), which
//    resolves to the site root only from /dist/.
//  * output entry file keeps the fixed name entry.js (the Hugo template looks
//    for exactly that file).
import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      // Single Three.js instance for libs that import the bare "three" id.
      three: resolve(root, "Hugo-Project/static/vendor/three.module.min.js"),
    },
  },
  build: {
    outDir: resolve(root, "Hugo-Project/static/dist"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    assetsDir: "",
    rollupOptions: {
      input: resolve(root, "Hugo-Project/static/js/entry.js"),
      output: {
        format: "es",
        entryFileNames: "entry.js",
        chunkFileNames: "[name]-[hash].js",
        manualChunks: undefined,
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
