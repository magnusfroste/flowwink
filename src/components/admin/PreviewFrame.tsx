import { ReactNode, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyBrandingToDocument } from '@/providers/BrandingProvider';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

interface PreviewFrameProps {
  /** Real viewport width in CSS pixels (375 = mobile, 768 = tablet). */
  width: number;
  title: string;
  branding?: BrandingSettings | null;
  children: ReactNode;
}

/**
 * Read-only device preview rendered inside a real <iframe>.
 *
 * Shrinking a container (max-w-[375px]) does NOT shrink the viewport, so
 * Tailwind's md:/lg: media queries still match the desktop window and the
 * "mobile" preview shows desktop layout in a narrow column. An iframe has its
 * own viewport, so media queries evaluate against the device width for real.
 *
 * Mechanics:
 * - The children are React-portaled into the frame's <body>; they stay in the
 *   parent React tree, so all contexts (QueryClient, Router, Branding, i18n)
 *   keep working across the document boundary.
 * - Parent stylesheets (<style> from Vite dev, <link rel="stylesheet"> from
 *   builds, loaded Google Font links) are cloned into the frame's <head>.
 * - The parent's <html> class list (next-themes' `dark`) is mirrored and kept
 *   in sync via a MutationObserver.
 * - Branding CSS variables are applied to the FRAME's documentElement — the
 *   admin parent deliberately resets them, so the frame brands itself.
 * - The surface is read-only: link navigation and form submits are blocked so
 *   a click can never navigate the frame away from the portal document.
 */
export function PreviewFrame({ width, title, branding, children }: PreviewFrameProps) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  const frameRef = useCallback((node: HTMLIFrameElement | null) => setFrame(node), []);

  useEffect(() => {
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    // Rewrite the about:blank document synchronously — Firefox replaces the
    // initial iframe document asynchronously, and writing our own gives every
    // browser the same stable document to portal into.
    doc.open();
    doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    doc.close();

    document.head
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => doc.head.appendChild(node.cloneNode(true)));

    const syncRootClass = () => {
      doc.documentElement.className = document.documentElement.className;
      // Per-tema-primären läses ur dokumentklassen — när temat flippar måste
      // ramen brandas om, inte bara byta klass.
      if (branding) applyBrandingToDocument(branding, doc);
    };
    syncRootClass();
    const themeObserver = new MutationObserver(syncRootClass);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const blockNavigation = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('a[href]')) e.preventDefault();
    };
    const blockSubmit = (e: Event) => e.preventDefault();
    doc.addEventListener('click', blockNavigation, true);
    doc.addEventListener('submit', blockSubmit, true);

    const mount = doc.createElement('div');
    doc.body.appendChild(mount);
    setMountNode(mount);

    return () => {
      themeObserver.disconnect();
      doc.removeEventListener('click', blockNavigation, true);
      doc.removeEventListener('submit', blockSubmit, true);
      setMountNode(null);
    };
  }, [frame]);

  useEffect(() => {
    if (!frame?.contentDocument || !mountNode || !branding) return;
    applyBrandingToDocument(branding, frame.contentDocument);
  }, [frame, mountNode, branding]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      style={{ width }}
      className="h-full max-w-full shrink-0 rounded-lg border border-border bg-background shadow-sm"
    >
      {mountNode && createPortal(children, mountNode)}
    </iframe>
  );
}
