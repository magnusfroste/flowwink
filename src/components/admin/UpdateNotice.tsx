import { useState } from 'react';
import { ArrowUpCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateCheck } from '@/hooks/useUpdateCheck';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UPSTREAM_REPO } from '@/lib/update-check';

const DOCS = `https://github.com/${UPSTREAM_REPO}/blob/main/docs/operators`;

/**
 * A quiet line at the foot of the sidebar when a newer FlowWink exists — for
 * admins only, and only when this build is really behind (see update-check.ts).
 * There is no "Update" button: the instance cannot push to its own fork or
 * pull its own image. It says what update means for THIS deployment.
 */
export function UpdateNotice({ collapsed }: { collapsed: boolean }) {
  const { isAdmin } = useAuth();
  const u = useUpdateCheck(isAdmin);
  const [open, setOpen] = useState(false);
  if (!u.show) return null;

  const label = u.kind === 'docker' ? `v${u.latestRelease} available` : u.behindBy ? `Update · ${u.behindBy} changes` : 'Update available';
  const forkUrl = u.sourceRepo ? `https://github.com/${u.sourceRepo}` : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>A newer FlowWink is out</DialogTitle>
            <DialogDescription>
              {u.kind === 'docker'
                ? `This frontend runs v${u.currentVersion} from the Docker image; v${u.latestRelease} is released.`
                : u.behindBy
                  ? `This site is ${u.behindBy} change${u.behindBy === 1 ? '' : 's'} behind FlowWink's main branch.`
                  : 'FlowWink\'s main branch has moved on since this site was built.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {u.kind === 'vercel' && (
              <>
                <p>Your site is a fork of FlowWink. To update it:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open your fork on GitHub{u.sourceRepo ? <> (<span className="font-mono text-xs">{u.sourceRepo}</span>)</> : null}.</li>
                  <li>Press <span className="font-medium">Sync fork</span> → <span className="font-medium">Update branch</span>.</li>
                  <li>Vercel builds the site and Supabase applies the migrations and functions by themselves. The skills follow the next time an admin opens a page.</li>
                </ol>
                <p className="text-xs text-muted-foreground">Sync in a quiet hour — every sync is a production deploy.</p>
              </>
            )}
            {u.kind === 'docker' && (
              <>
                <p>Pull the new image and restart the container:</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">ghcr.io/{UPSTREAM_REPO}-frontend:v{u.latestRelease}</pre>
                <p>Then bring the backend along: <span className="font-mono text-xs">supabase db push</span> and deploy the edge functions — the image is the frontend only.</p>
              </>
            )}
            {u.kind === 'source' && (
              <p>Pull <span className="font-mono text-xs">main</span>, then update the four layers: migrations, edge functions, the frontend build — the skills follow on the next admin visit.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {u.kind === 'vercel' && forkUrl && (
                <Button size="sm" asChild><a href={forkUrl} target="_blank" rel="noopener noreferrer">Open your fork <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
              )}
              {u.compareUrl && u.kind !== 'docker' && (
                <Button size="sm" variant="outline" asChild><a href={u.compareUrl} target="_blank" rel="noopener noreferrer">What changed</a></Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <a href={u.kind === 'docker' ? `${DOCS}/self-hosted-frontend.md` : `${DOCS}/provisioning-and-updates.md`} target="_blank" rel="noopener noreferrer">How updates work</a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
