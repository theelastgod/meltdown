/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
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
