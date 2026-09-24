/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ASSETS } from "./shared/assets/manifest";

export default defineConfig({
  plugins: [{
    name: "offline-art",
    apply: "build",
    generateBundle(_options, bundle) {
      // Change the worker whenever a bundle or reviewed art file changes, so an
      // installed browser runs precache again for this release.
      const revision = createHash("sha256").update(JSON.stringify([
        Object.keys(bundle).sort(), ASSETS.map((asset) => [asset.file, asset.sha256]),
      ])).digest("hex");
      const source = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8")
        .replace("const ART = [];", `const ART = ${JSON.stringify(ASSETS.map((asset) => `/assets/${asset.file}`))};`);
      this.emitFile({ type: "asset", fileName: "sw.js", source: `// Release ${revision}\n${source}` });
    },
  }],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@client": fileURLToPath(new URL("./client", import.meta.url)),
    },
  },
  server: { strictPort: true },
  build: { target: "es2022", sourcemap: true },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
