import { REQUIRED_ENV } from '@/lib/supabase-config';

/**
 * Shown instead of a white screen when the Supabase env vars are unset.
 *
 * Imports nothing that touches the Supabase client — it must render on an
 * instance that has no backend configured yet. Self-contained styling so it
 * works even before the app's providers mount.
 */
export function ConfigureEnvironment() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 text-2xl">
            ⚙️
          </div>
          <h1 className="text-xl font-semibold">Almost there — connect your backend</h1>
          <p className="text-sm text-muted-foreground">
            FlowWink is deployed, but it doesn’t yet know which Supabase project to talk to.
            Set the two environment variables below, then redeploy.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          {REQUIRED_ENV.map((v) => (
            <div key={v.name} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                  v.present ? 'bg-emerald-500' : 'bg-destructive'
                }`}
                aria-hidden
              />
              <div className="min-w-0">
                <code className="text-sm font-mono break-all">{v.name}</code>
                <p className="text-xs text-muted-foreground">
                  {v.present ? 'set ✓' : `missing — ${v.hint}`}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
          <p className="font-medium">Where to set them</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              <span className="text-foreground">Vercel / Netlify:</span> Project → Settings →
              Environment Variables → add both → redeploy.
            </li>
            <li>
              <span className="text-foreground">Docker / self-hosted:</span> set them in the
              container environment; the entrypoint regenerates{' '}
              <code className="font-mono">runtime-config.js</code> on start.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground pt-1">
            Find both values in your Supabase dashboard under Project Settings → API.
          </p>
        </div>
      </div>
    </div>
  );
}
