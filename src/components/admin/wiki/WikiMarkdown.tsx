import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface Props {
  /** Markdown body. WikiWords auto-link. */
  content: string;
  /** Slugs that exist — used to color "missing" links red. */
  knownSlugs: Set<string>;
}

const WIKI_LINK_RE = /\[\[([A-Z][A-Za-z0-9]*)\]\]/g;
const CAMEL_RE = /\b([A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]*)+)\b/g;

/**
 * Pre-process markdown: convert `[[Slug]]` and bare `CamelCase` words to
 * standard markdown links pointing at /admin/wiki/<slug>. We then let
 * react-markdown render them and intercept <a> to use react-router <Link>
 * + apply a "missing page" style.
 */
function preprocess(md: string): string {
  // 1) [[Slug]] → [Slug](wiki:Slug)
  let out = md.replace(WIKI_LINK_RE, (_m, slug) => `[${slug}](wiki:${slug})`);

  // 2) Bare CamelCase. Skip inside code spans / fences / existing links.
  // Naive but workable: process line-by-line, leave fenced/inline code alone.
  const lines = out.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Tokenize on inline code + existing links so we don't munge them.
    const parts: string[] = [];
    const re = /(`[^`]*`|\[[^\]]*\]\([^)]*\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      parts.push(line.slice(last, m.index).replace(CAMEL_RE, (w) => `[${w}](wiki:${w})`));
      parts.push(m[0]);
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last).replace(CAMEL_RE, (w) => `[${w}](wiki:${w})`));
    lines[i] = parts.join('');
  }
  return lines.join('\n');
}

export function WikiMarkdown({ content, knownSlugs }: Props) {
  const processed = preprocess(content || '_This page is empty — double-click to start writing._');

  const components: Components = {
    a: ({ href, children, ...rest }) => {
      if (href?.startsWith('wiki:')) {
        const slug = href.slice(5);
        const exists = knownSlugs.has(slug);
        return (
          <Link
            to={`/admin/wiki/${slug}`}
            className={
              exists
                ? 'text-primary underline-offset-2 hover:underline'
                : 'text-destructive underline decoration-dotted hover:no-underline'
            }
            title={exists ? `Open ${slug}` : `Create ${slug}`}
          >
            {children}
          </Link>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      );
    },
  };

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
