import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens something (e.g. a create dialog) when a query parameter matches an
 * expected value, then removes the param so a refresh doesn't reopen it.
 * Used by ⌘K quick-create shortcuts (e.g. /admin/leads?new=1).
 */
export function useOpenOnQueryParam(
  param: string,
  expected: string,
  open: () => void,
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get(param) !== expected) return;
    open();
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
