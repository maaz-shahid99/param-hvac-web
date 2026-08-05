import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /v1 to the Cloud Server so the browser avoids CORS during
// local development. In production the app calls the cloud URL directly (set in
// the app's Settings / VITE_CLOUD_URL) and the server must allow that origin.
//
// The target is read via loadEnv, NOT process.env: Vite does not load .env files
// into process.env for the config itself, so a VITE_CLOUD_URL set in .env used to
// reach the client (import.meta.env) while the proxy silently kept pointing at
// localhost:8002. loadEnv keeps both halves on the same server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cloudUrl = env.VITE_CLOUD_URL || "http://localhost:8002";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/v1": {
          target: cloudUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
