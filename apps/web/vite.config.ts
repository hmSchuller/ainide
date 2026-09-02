import { resolveBackendPort } from "@ainide/shared";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export function createViteConfig(portValue?: string) {
  const backendPort = resolveBackendPort(portValue);
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${backendPort}`,
        "/events": `ws://127.0.0.1:${backendPort}`,
        "/acp-events": `ws://127.0.0.1:${backendPort}`,
        "/terminal": `ws://127.0.0.1:${backendPort}`,
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(loadEnv(mode, ".", "").PORT));
