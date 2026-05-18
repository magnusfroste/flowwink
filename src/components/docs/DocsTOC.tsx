import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Parses ## and ### headings from markdown. Skips fenced code blocks.
 */
function extractHeadings(md: string): Heading[] {
  const lines = md.split('\n');
  const out: Heading[] = [];
  let inFence = false;
  const seen = new Map<string, number>();
  for (const raw of lines) {
    if (raw.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = raw.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/`/g, '').trim();
    let id = slugify(text);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    out.push({ id, text, level });
  }
  return out;
}

interface Props {
  content: string;
}

export function DocsTOC({ content }: Props) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    // give react-markdown a tick to render, then observe
    const t = setTimeout(() => {
      headings.forEach((h) => {
        const el = document.getElementById(h.id);
        if (el) observer.observe(el);
      });
    }, 100);
    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="space-y-2 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        On this page
      </div>
      <ul className="space-y-1.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id} className={cn(h.level === 3 && 'pl-4')}>
            <a
              href={`#${h.id}`}
              className={cn(
                'block -ml-px pl-3 py-0.5 border-l border-transparent transition-colors',
                activeId === h.id
                  ? 'border-primary text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
