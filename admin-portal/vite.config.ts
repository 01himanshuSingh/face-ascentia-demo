import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Admin Portal — desk UI for plant-scoped registration review.
 * Dev server proxies /api → FastAPI on localhost:8000 (same pattern as test-harness).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true,
    // ngrok free/paid hostnames (same allowlist as test-harness)
    allowedHosts: [".ngrok-free.dev", ".ngrok.io", ".ngrok.app"],
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
