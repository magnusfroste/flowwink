import type { ReactNode } from 'react';

/** The full-screen frame the admin shell shows a challenge or a forced enrollment in. */
export function MfaScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}
