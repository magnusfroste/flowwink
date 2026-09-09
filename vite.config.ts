import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";

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

/**
 * Runtime-overridable Supabase config. Every `import.meta.env.VITE_SUPABASE_*`
 * access in src/ is compiled to a `__FLOWWINK_RUNTIME__.<key>` lookup — a
 * global assembled by index.html from (a) the values baked in at build time
 * (Vite's %VITE_*% HTML replacement) and (b) /runtime-config.js overrides.
 * This lets one Docker image serve any Supabase instance: the container
 * entrypoint regenerates runtime-config.js from container env vars on every
 * start, so self-hosted deployments (Easypanel) switch instances with a
 * restart instead of a rebuild. On Vercel and `vite dev`,
 * public/runtime-config.js sets no overrides and the baked values apply —
 * behavior is unchanged.
 *
 * NB: the define value must be an entity name (dotted identifier chain) —
 * esbuild's dep-optimizer pass rejects arbitrary expressions. Vitest is
 * unaffected (vitest.config.ts does not extend this config).
 *
 * NB2: the baked values reach index.html through the __BAKED_VITE_*__
 * placeholders + the plugin below — NOT Vite's %VITE_*% HTML replacement,
 * which resolves through `define` and would circularly insert the define
 * string itself instead of the value.
 */
const RUNTIME_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
];

const RUNTIME_ENV_DEFINES = Object.fromEntries(
  RUNTIME_ENV_KEYS.map((key) => [`import.meta.env.${key}`, `__FLOWWINK_RUNTIME__.${key}`]),
);

function bakedEnvHtmlPlugin(mode: string): Plugin {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  return {
    name: "flowwink-baked-env-html",
    transformIndexHtml(html) {
      return html.replace(/__BAKED_(VITE_[A-Z_]+)__/g, (_, key) => {
        // Same precedence as Vite itself: real process env beats .env files.
        const value = process.env[key] ?? fileEnv[key] ?? "";
        if (/["\\]/.test(value)) throw new Error(`${key} must not contain quotes/backslashes`);
        return value;
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  plugins: [react(), bakedEnvHtmlPlugin(mode)],
  resolve: {
    dedupe: ["react", "react-dom", "@codemirror/state", "@codemirror/view"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@templates": path.resolve(__dirname, "./templates"),
    },
  },
  define: {
    ...RUNTIME_ENV_DEFINES,
    __GIT_COMMIT__: JSON.stringify(GIT_COMMIT),
    __GIT_COMMIT_FULL__: JSON.stringify(GIT_COMMIT_FULL),
    __GIT_COMMIT_DATE__: JSON.stringify(GIT_COMMIT_DATE),
    __GIT_BRANCH__: JSON.stringify(GIT_BRANCH),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
}));
