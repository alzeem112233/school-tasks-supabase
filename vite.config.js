import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // Capacitor modules are only available inside the Android wrapper.
      // Keep them optional so the Vercel web build does not require native plugins.
      external: /^@capacitor\//,
      output: {
        entryFileNames: "assets/app-v172.js",
        chunkFileNames: "assets/[name]-v172.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "assets/index-v172.css";
          return "assets/[name][extname]";
        },
        manualChunks(id) {
          if (id.includes("@supabase")) return "supabase-vendor";
          return undefined;
        },
      },
    },
  },
});
