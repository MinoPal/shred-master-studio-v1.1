import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    exclude: [
      "@coderline/alphatab",
      "neural-amp-modeler-wasm",
      "neural-amp-modeler-wasm/engine"
    ],
  },
});