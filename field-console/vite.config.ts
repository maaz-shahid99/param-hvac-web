import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The console talks to an appliance over the LAN; the user enters that URL on the
// Connect screen (stored per-browser). For local dev against a cloud server on the
// same host, the dev proxy forwards /v1 + /firmware so you can leave the URL blank.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/v1": { target: process.env.VITE_CLOUD_URL || "http://localhost:8002", changeOrigin: true },
      "/firmware": { target: process.env.VITE_CLOUD_URL || "http://localhost:8002", changeOrigin: true },
    },
  },
});
