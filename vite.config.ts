import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "./manifest.json",
      watchFilePaths: ["manifest.json"],
      additionalInputs: [
        "src/sidepanel/index.html",
        "src/background/service-worker.ts",
        "src/content/tradingview-scraper.ts",
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
