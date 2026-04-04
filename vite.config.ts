import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const isLovableSandbox = Boolean(process.env.LOVABLE_SANDBOX);

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    hmr: isLovableSandbox
      ? {
          protocol: "wss",
          clientPort: 443,
        }
      : undefined,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@templates": path.resolve(__dirname, "./templates"),
    },
  },
}));
