import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /v1 to the Cloud Server so the browser avoids CORS during
// local development. In production the app calls the cloud URL directly (set in
// the app's Settings / VITE_CLOUD_URL) and the server must allow that origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: process.env.VITE_CLOUD_URL || "http://localhost:8002",
        changeOrigin: true,
      },
    },
  },
});
