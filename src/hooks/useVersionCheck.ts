import { useQuery } from '@tanstack/react-query';

const CURRENT_VERSION = '1.0.0-beta.1';
const GITHUB_REPO = 'magnusfroste/pezcms';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  name: string;
}

function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease: string } {
  // Remove 'v' prefix if present
  const clean = version.replace(/^v/, '');
  
  // Split version and prerelease
  const [versionPart, prerelease = ''] = clean.split('-');
  const [major = 0, minor = 0, patch = 0] = versionPart.split('.').map(Number);
  
  return { major, minor, patch, prerelease };
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParsed = parseVersion(latest);
  const currentParsed = parseVersion(current);
  
  // Compare major.minor.patch
  if (latestParsed.major > currentParsed.major) return true;
  if (latestParsed.major < currentParsed.major) return false;
  
  if (latestParsed.minor > currentParsed.minor) return true;
  if (latestParsed.minor < currentParsed.minor) return false;
  
  if (latestParsed.patch > currentParsed.patch) return true;
  if (latestParsed.patch < currentParsed.patch) return false;
  
  // Same version number - compare prerelease
  // No prerelease is newer than any prerelease (1.0.0 > 1.0.0-beta.1)
  if (!latestParsed.prerelease && currentParsed.prerelease) return true;
  if (latestParsed.prerelease && !currentParsed.prerelease) return false;
  
  // Both have prerelease - compare alphabetically (beta.2 > beta.1)
  return latestParsed.prerelease > currentParsed.prerelease;
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    
    if (!response.ok) {
      // No releases yet or repo not found
      if (response.status === 404) return null;
      throw new Error('Failed to fetch release');
    }
    
    return response.json();
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const { data: latestRelease, isLoading } = useQuery({
    queryKey: ['github-release', GITHUB_REPO],
    queryFn: fetchLatestRelease,
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
    retry: false,
  });

  const latestVersion = latestRelease?.tag_name?.replace(/^v/, '') || null;
  const hasUpdate = latestVersion ? isNewerVersion(latestVersion, CURRENT_VERSION) : false;

  return {
    currentVersion: CURRENT_VERSION,
    latestVersion,
    latestReleaseUrl: latestRelease?.html_url || null,
    hasUpdate,
    isLoading,
  };
}
