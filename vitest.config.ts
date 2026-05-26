import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    env: {
      VITE_GOOGLE_DRIVE_CLIENT_ID: "test-google-client-id",
      VITE_ONEDRIVE_CLIENT_ID: "test-onedrive-client-id",
    },
  },
});
