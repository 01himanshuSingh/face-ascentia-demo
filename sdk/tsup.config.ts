import { defineConfig } from "tsup";

/**
 * Library build for Mendix / npm.
 * React stays external (peerDependency). MediaPipe is bundled into dist.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2020",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  external: ["react", "react-dom", "react/jsx-runtime"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
