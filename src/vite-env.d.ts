/// <reference types="vite/client" />

// Build-time constants injected via vite.config.ts `define`. See the
// DeployStatusPanel component for consumers.
declare const __GIT_COMMIT__: string;
declare const __GIT_COMMIT_FULL__: string;
declare const __GIT_COMMIT_DATE__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;
