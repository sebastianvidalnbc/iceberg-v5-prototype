import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/iceberg-v5-prototype/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  server: {
    open: "/iceberg-v5-prototype/",
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        renderer: resolve(__dirname, "renderer.html"),
      },
    },
  },
});
