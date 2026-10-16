import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true },
    prerender: {outputPath: "/index.html"},
  },
  vite: {
    base: "/jobcompass/",
  },
});