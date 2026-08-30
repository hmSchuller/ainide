import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveBackendPort } from "@ainide/shared";

export function createViteConfig(portValue?: string) {
  const backendPort = resolveBackendPort(portValue);
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${backendPort}`,
        "/events": `ws://127.0.0.1:${backendPort}`,
        "/terminal": `ws://127.0.0.1:${backendPort}`,
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(loadEnv(mode, ".", "").PORT));
