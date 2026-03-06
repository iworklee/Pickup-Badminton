import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: { outDir: "../dist" },
  base: "./",
  server: { proxy: { "/api": { target: "http://localhost:80", changeOrigin: true }, "/ws": { target: "ws://localhost:80", ws: true } } },
});
