import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Ruler, TriangleAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CHECK_WIDTHS, measureWidth, verdictOf, type WidthMeasurement } from '@/lib/page-width-check';

interface PageWidthCheckProps {
  pageId: string;
  /** What the preview page reads: the editor's current state, saved or not. */
  preview: { slug: string; title: string; content_json: unknown; meta_json: unknown };
  /** Whether what is on screen is what is saved. */
  saved: boolean;
}

/** How long the drawn page must stand still before it is measured. */
const QUIET_MS = 1000;
const NAMES: Record<number, string> = { 390: 'Phone', 768: 'Tablet', 1280: 'Desktop' };
const record = (pageId: string, widths: WidthMeasurement[], saved: boolean) =>
  (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { success?: boolean; error?: string } | null; error: { message: string } | null }> })
    .rpc('record_page_width_check', { p_page_id: pageId, p_widths: widths, p_saved: saved });

/** Draw the preview in a frame of one width, off screen, and measure it there. */
function measureAt(pageId: string, width: number): Promise<WidthMeasurement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Off screen and untouchable, but NOT visibility:hidden — a hidden frame's
    // elements all compute as hidden, and a page of hidden elements "fits".
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:900px;border:0;opacity:0;pointer-events:none;`;
    const done = (fn: () => void) => { window.clearTimeout(timer); frame.remove(); fn(); };
    const timer = window.setTimeout(() => done(() => reject(new Error(`The page did not finish drawing at ${width} px`))), 30_000);
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) return done(() => reject(new Error('The preview could not be read')));
      // The preview is an app whose blocks arrive one by one (each is its own
      // chunk): a section that exists but has not drawn its content "fits" at
      // every width. So wait until the page has stopped changing — a full
      // second without a single change to the document — and only then measure.
      const started = Date.now();
      let lastChange = Date.now();
      const watcher = new MutationObserver(() => { lastChange = Date.now(); });
      watcher.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
      const settle = () => {
        const drawn = doc.querySelector('main section, main div[id]');
        const waited = Date.now() - started;
        const quiet = Date.now() - lastChange >= QUIET_MS;
        if ((!drawn || !quiet) && waited < 20_000) return void window.setTimeout(settle, 200);
        watcher.disconnect();
        // An empty frame "fits" at every width. No blocks drawn is a failure to measure, never a pass.
        if (!drawn) return done(() => reject(new Error(`The preview drew no blocks at ${width} px — nothing was measured`)));
        const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
        // Measure while the frame is still in the page: a removed frame has no
        // layout, and every element of it measures as nothing.
        void fonts.then(() => window.setTimeout(() => {
          let measured: WidthMeasurement;
          try { measured = measureWidth(doc, width); } catch (e) { return done(() => reject(e instanceof Error ? e : new Error(String(e)))); }
          done(() => resolve(measured));
        }, 300));
      };
      settle();
    };
    frame.src = `/preview/${pageId}`;
    document.body.appendChild(frame);
  });
}

/**
 * Page editor → "Check widths" (#940). The page is drawn at phone, tablet and
 * desktop width in this browser and measured: what sticks out past the screen,
 * what text is cut off. The result is shown here and kept with the page, where
 * an agent reads it through inspect_rendered_page.
 */
export function PageWidthCheck({ pageId, preview, saved }: PageWidthCheckProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<WidthMeasurement[]>([]);

  const run = async () => {
    setOpen(true);
    setRunning(true);
    setResults([]);
    try {
      sessionStorage.setItem(`preview-${pageId}`, JSON.stringify({ id: pageId, ...preview, savedAt: new Date().toISOString() }));
      const measured: WidthMeasurement[] = [];
      for (const width of CHECK_WIDTHS) {
        measured.push(await measureAt(pageId, width));
        setResults([...measured]);
      }
      const res = await record(pageId, measured, saved);
      if (res.error) throw new Error(res.error.message);
      if (res.data && res.data.success === false) throw new Error(res.data.error ?? 'The measurement could not be kept');
    } catch (e) {
      logger.error('[page-width-check] failed', e);
      toast.error(e instanceof Error ? e.message : 'The width check failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={running} data-testid="check-widths">
        {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ruler className="h-4 w-4 mr-2" />}
        Check widths
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>The page at three widths</DialogTitle>
            <DialogDescription>
              Drawn in this browser at phone, tablet and desktop width{saved ? '' : ' — with your unsaved changes'}. What sticks out past the screen or is cut off is listed with the block it sits in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3" data-testid="width-results">
            {CHECK_WIDTHS.map((width) => {
              const m = results.find((r) => r.width === width);
              const verdict = m ? verdictOf(m) : null;
              return (
                <div key={width} className="rounded-md border p-3" data-width={width} data-ok={verdict ? String(verdict.ok) : 'pending'}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{NAMES[width]} <span className="text-muted-foreground font-normal">{width} px</span></span>
                    {!m && <span className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Measuring…</span>}
                    {verdict && (
                      <span className={`text-sm flex items-center gap-1.5 ${verdict.ok ? 'text-success' : 'text-destructive'}`}>
                        {verdict.ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} {verdict.line}
                      </span>
                    )}
                  </div>
                  {m && (m.wider_than_screen.length > 0 || m.cut_off.length > 0 || m.squeezed.length > 0) && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {m.wider_than_screen.map((f, i) => (
                        <li key={`w${i}`}>
                          <span className="text-foreground">{f.over_px} px too wide</span> — {f.tag} in <span className="font-mono">{f.block ?? 'the page'}</span>{f.text ? `: “${f.text}”` : ''}
                        </li>
                      ))}
                      {m.squeezed.map((f, i) => (
                        <li key={`s${i}`}>
                          <span className="text-foreground">Squeezed to {f.over_px} px</span> — {f.tag} in <span className="font-mono">{f.block ?? 'the page'}</span>: “{f.text}”
                        </li>
                      ))}
                      {m.cut_off.map((f, i) => (
                        <li key={`c${i}`}>
                          <span className="text-foreground">Cut off</span> — {f.tag} in <span className="font-mono">{f.block ?? 'the page'}</span>: “{f.text}”
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
