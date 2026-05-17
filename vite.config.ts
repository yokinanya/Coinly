import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        auth: "auth.html",
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("metis-ui")) return "vendor-metis";
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
