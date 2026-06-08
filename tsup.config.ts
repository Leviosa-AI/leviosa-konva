import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Consumers (leviosa-frontend, leviosa-rendering-server) provide these.
  external: ["react", "react-dom", "react-konva", "konva"],
  target: "es2022",
});
