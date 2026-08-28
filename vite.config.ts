import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite is a local development tool, never a production application server.
// Loopback binding and an explicit dev-origin CORS policy reduce exposure while
// the separately tracked, approval-gated Vite major upgrade remains pending.
const localDevOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    cors: { origin: localDevOrigin },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    cors: { origin: localDevOrigin },
  },
});
