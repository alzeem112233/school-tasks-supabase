import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // Capacitor modules are only available inside the Android wrapper.
      // Keep them optional so the Vercel web build does not require native plugins.
      external: /^@capacitor\//,
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "assets/index.css";
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
