import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    // PORT vem do harness de preview (autoPort) quando 8080 já está ocupada.
    port: Number(process.env.PORT) || 8080,
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    // Multi-page: um entry por HOST que precisa de <title>/Open Graph próprios.
    // Crawler de link (WhatsApp/Facebook) não roda JS, então meta tag por host
    // só funciona em HTML estático separado. Mesmo bundle JS nos dois; quem
    // decide o que renderizar é LANDING_HOSTS (src/lib/publicUrl.ts).
    // O nginx (infra/nginx.conf) escolhe o arquivo por $host.
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        netb2b: path.resolve(__dirname, "netb2b.html"),
      },
    },
    // IMPORTANT: do NOT manually split React / Radix / etc. into separate chunks.
    // The previous manualChunks config produced a circular dependency
    // (ui-vendor -> react-vendor -> ui-vendor) which, in production builds,
    // caused `ui-vendor` to evaluate before React exports were ready, throwing
    // `Cannot read properties of undefined (reading 'forwardRef')` and leaving
    // the app stuck on the boot loader (black screen + green spinner).
    // Letting Rollup decide chunking is safe and avoids this class of bug.
  },
}));
