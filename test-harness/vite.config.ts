import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test harness = temporary Mendix stand-in.
 * Resolves the local SDK source directly so we exercise the same public
 * entry Mendix will import from the future npm package.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@face-auth/sdk": path.resolve(__dirname, "../sdk/src"),
      // One React copy — avoids "Invalid hook call" when SDK mounts overlay.
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-runtime.js",
      ),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Allow ngrok / tunnel hosts for kiosk camera smoke tests over HTTPS.
    allowedHosts: [".ngrok-free.dev", ".ngrok.io", ".ngrok.app"],
    // Same-origin proxy: ngrok HTTPS → localhost:8000 (avoids mixed-content / phone localhost bug).
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
