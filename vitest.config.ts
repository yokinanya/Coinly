import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    env: {
      VITE_GOOGLE_DRIVE_CLIENT_ID: "test-google-client-id",
      VITE_ONEDRIVE_CLIENT_ID: "test-onedrive-client-id",
    },
  },
});
