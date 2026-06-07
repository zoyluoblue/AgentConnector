import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// npm scripts run from studio/, so process.cwd() === studio/.
const root = process.cwd();

export default defineConfig({
  main: {
    // node-pty (a native dep) must stay external so it's loaded from node_modules at runtime.
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(root, "src/main/index.ts") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(root, "src/preload/index.ts") } },
  },
  renderer: {
    root: resolve(root, "src/renderer"),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(root, "src/renderer/index.html") } },
  },
});
