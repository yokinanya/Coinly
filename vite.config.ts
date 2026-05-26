import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        auth: "auth.html",
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@azure/msal-browser")) return "vendor-msal";
          if (id.includes("qrcode")) return "vendor-qrcode";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
