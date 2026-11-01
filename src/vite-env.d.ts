/// <reference types="vite/client" />

// Build-time constants injected via vite.config.ts `define`. See the
// DeployStatusPanel component for consumers.
declare const __GIT_COMMIT__: string;
declare const __GIT_COMMIT_FULL__: string;
declare const __GIT_COMMIT_DATE__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;
/** 'vercel' | 'docker' | 'source' — how this build is deployed (vite.config.ts). */
declare const __DEPLOY_KIND__: string;
/** owner/repo this build came from, '' when unknown. */
declare const __SOURCE_REPO__: string;
