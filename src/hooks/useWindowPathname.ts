import { useSyncExternalStore } from 'react';

/**
 * The current path for providers that sit OUTSIDE the router (theme,
 * branding). One subscription for the whole app: history.pushState and
 * replaceState are wrapped once, not once per provider.
 */
const listeners = new Set<() => void>();
let patched = false;

function patchHistory() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const notify = () => listeners.forEach((l) => l());
  const push = history.pushState;
  const replace = history.replaceState;
  history.pushState = function (...args) { push.apply(this, args); notify(); };
  history.replaceState = function (...args) { replace.apply(this, args); notify(); };
  window.addEventListener('popstate', notify);
}

function subscribe(listener: () => void) {
  patchHistory();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWindowPathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/');
}
