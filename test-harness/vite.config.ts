import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test harness = Mendix stand-in.
 * Consumes @ascentia/face-auth-sdk from vendor/*.tgz (same artifact Mendix gets).
 * Deduplicate React so SDK overlays share the host React instance.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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
