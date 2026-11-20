import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://localhost:" + (process.env.PORT || 4000);
const proxied = ["/api", "/uploads", "/torob", "/emalls", "/feeds", "/sitemap.xml", "/robots.txt"];

export default defineConfig({
  root: "client",
  plugins: [react()],
  css: { postcss: {} },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5173, proxy: Object.fromEntries(proxied.map((p) => [p, api])) },
});
