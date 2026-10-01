import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 1500, // Porta il limite a 1.5MB per evitare avvisi superflui sui chunk pesanti
    },
    optimizeDeps: {
      exclude: ["@coderline/alphatab"],
    },
  },
});