/**
 * Small, unobtrusive build/commit hash badge so operators can verify the
 * frontend that actually shipped on any environment (dev, prod, self-hosted).
 * Values come from the build-time `define` block in vite.config.ts.
 */
const commit = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'unknown';
const commitFull = typeof __GIT_COMMIT_FULL__ !== 'undefined' ? __GIT_COMMIT_FULL__ : '';
const branch = typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : '';
const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

export function BuildBadge({ className = '' }: { className?: string }) {
  const title = [
    commitFull && `commit ${commitFull}`,
    branch && `branch ${branch}`,
    buildTime && `built ${buildTime}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className={`text-[11px] text-muted-foreground/70 font-mono select-all ${className}`}
      title={title}
      data-build-commit={commit}
      data-build-time={buildTime}
    >
      build {commit}
      {buildTime ? ` · ${buildTime.slice(0, 10)}` : ''}
    </div>
  );
}
