import { defineConfig } from "vite";

import { dependencies } from "./package.json";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/main.ts",
      name: "PackageManagerCli",
      fileName: "cli",
      formats: ["es"],
    },
    rollupOptions: {
      external: [...Object.keys(dependencies)],
    },
  },
});
