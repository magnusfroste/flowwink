import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

const isLovableSandbox = Boolean(process.env.LOVABLE_SANDBOX);

/**
 * Read the current git commit at build time so the Deploy Status panel can
 * show which frontend revision is live. Falls back gracefully in sandboxes
 * where `git` isn't available or the workspace isn't a git checkout.
 */
function readGit(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const GIT_COMMIT = process.env.VITE_GIT_COMMIT || readGit("git rev-parse --short HEAD", "unknown");
const GIT_COMMIT_FULL = process.env.VITE_GIT_COMMIT_FULL || readGit("git rev-parse HEAD", "unknown");
const GIT_COMMIT_DATE = process.env.VITE_GIT_COMMIT_DATE || readGit("git log -1 --format=%cI", "");
const GIT_BRANCH = process.env.VITE_GIT_BRANCH || readGit("git rev-parse --abbrev-ref HEAD", "unknown");
const BUILD_TIME = new Date().toISOString();

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
    dedupe: ["react", "react-dom", "@codemirror/state", "@codemirror/view"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@templates": path.resolve(__dirname, "./templates"),
    },
  },
  define: {
    __GIT_COMMIT__: JSON.stringify(GIT_COMMIT),
    __GIT_COMMIT_FULL__: JSON.stringify(GIT_COMMIT_FULL),
    __GIT_COMMIT_DATE__: JSON.stringify(GIT_COMMIT_DATE),
    __GIT_BRANCH__: JSON.stringify(GIT_BRANCH),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
}));
