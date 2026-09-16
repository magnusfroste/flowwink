/**
 * Active locale pack: the storage key, the change event, and subscription.
 *
 * Its own file, with no pack imports, on purpose. LocalePackProvider wraps the
 * whole app — public pages included — and needs only `onActivePackChange`. It
 * used to import it from the registry index, and the index statically imports
 * every pack, and the Swedish pack imports the full BAS 2024 chart of accounts:
 * 237 KB of bookkeeping data, plus 57 KB of posting templates, parsed on every
 * visitor's phone before a landing page could draw (optic, 2026-09-16).
 *
 * Nothing here may import a pack or anything under src/data. The registry index
 * re-exports all of this, so existing importers are unchanged.
 */
export const ACTIVE_PACK_STORAGE_KEY = 'accounting-locale';
export const ACTIVE_PACK_EVENT = 'flowwink:active-locale-pack-changed';

/**
 * Update the active pack id and broadcast a change event so subscribers
 * (React Query cache, module instructions, UI) can refresh in lockstep.
 * Includes cross-tab sync via the storage event.
 */
export function setActivePackId(id: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const previous = window.localStorage.getItem(ACTIVE_PACK_STORAGE_KEY);
  window.localStorage.setItem(ACTIVE_PACK_STORAGE_KEY, id);
  if (previous !== id) {
    window.dispatchEvent(
      new CustomEvent(ACTIVE_PACK_EVENT, { detail: { id, previous } }),
    );
  }
}

/**
 * Subscribe to active-pack changes (same tab + cross-tab via storage event).
 * Returns an unsubscribe function.
 */
export function onActivePackChange(cb: (id: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const localHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ id: string }>).detail;
    if (detail?.id) cb(detail.id);
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === ACTIVE_PACK_STORAGE_KEY && e.newValue) cb(e.newValue);
  };
  window.addEventListener(ACTIVE_PACK_EVENT, localHandler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(ACTIVE_PACK_EVENT, localHandler);
    window.removeEventListener('storage', storageHandler);
  };
}
