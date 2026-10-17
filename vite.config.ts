import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  optimizeDeps: {
    // Keep Vite's development scan scoped to Torque's entry page, not vendored demo apps.
    entries: ["index.html"],
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
