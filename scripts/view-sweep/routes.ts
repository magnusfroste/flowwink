/**
 * Route discovery for the view sweep.
 *
 * Discover, don't enumerate: the sweep never carries a list of pages. It reads
 * the route table out of src/App.tsx with the TypeScript parser — the same
 * `createBrowserRouter([...])` literal React Router consumes — so a page added
 * there is swept on the next run without anyone remembering this tool exists.
 *
 * It fails LOUDLY when the table stops being a literal it can read (routes
 * moved into an imported constant, a spread, a function call): a discoverer
 * that silently returns fewer routes is the allowlist guard all over again.
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

export type RouteArea = 'public' | 'admin' | 'portal';

export interface DiscoveredRoute {
  /** Full pattern, e.g. `/admin/pages/:id`. */
  pattern: string;
  /** Param names in order of appearance. */
  params: string[];
  /** JSX tag rendered by the route (`PublicPage`, `Navigate`, …). */
  component: string | null;
  /** `to` of a declared `<Navigate>` element — a redirect that is on purpose. */
  redirectTo: string | null;
  area: RouteArea;
  /** file:line of the route object. */
  source: string;
}

function joinPaths(parent: string, child: string): string {
  if (child.startsWith('/')) return child;
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return `${base}/${child}`;
}

function jsxTagName(node: ts.Expression | undefined): { tag: string | null; navigateTo: string | null } {
  if (!node) return { tag: null, navigateTo: null };
  let expr: ts.Expression = node;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  // withPageFallback(<X />) and friends: the page is the first argument.
  if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
    return jsxTagName(expr.arguments[0]);
  }
  const opening = ts.isJsxSelfClosingElement(expr)
    ? expr
    : ts.isJsxElement(expr)
      ? expr.openingElement
      : null;
  if (!opening) return { tag: null, navigateTo: null };
  const tag = opening.tagName.getText();
  let navigateTo: string | null = null;
  if (tag === 'Navigate') {
    for (const attr of opening.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name.getText() === 'to' && attr.initializer) {
        if (ts.isStringLiteral(attr.initializer)) navigateTo = attr.initializer.text;
        else if (
          ts.isJsxExpression(attr.initializer) &&
          attr.initializer.expression &&
          ts.isStringLiteralLike(attr.initializer.expression)
        ) {
          navigateTo = attr.initializer.expression.text;
        }
      }
    }
  }
  return { tag, navigateTo };
}

export function discoverRoutes(appFile: string, repoRoot: string): DiscoveredRoute[] {
  const text = readFileSync(appFile, 'utf8');
  const sf = ts.createSourceFile(appFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = relative(repoRoot, appFile);
  const routes: DiscoveredRoute[] = [];
  let routerCalls = 0;

  const fail = (node: ts.Node, why: string): never => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    throw new Error(
      `view-sweep route discovery: ${why} at ${rel}:${line + 1}. ` +
        'The route table is no longer a literal this parser can read — teach scripts/view-sweep/routes.ts the new shape instead of listing routes by hand.',
    );
  };

  const walkArray = (arr: ts.ArrayLiteralExpression, parentPath: string, topLevelPath: string | null) => {
    for (const el of arr.elements) {
      if (!ts.isObjectLiteralExpression(el)) fail(el, `route entry is a ${ts.SyntaxKind[el.kind]}, not an object literal`);
      const obj = el as ts.ObjectLiteralExpression;
      let path: string | null = null;
      let isIndex = false;
      let children: ts.ArrayLiteralExpression | null = null;
      let element: ts.Expression | undefined;
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) fail(prop, 'route object uses a spread or shorthand property');
        const pa = prop as ts.PropertyAssignment;
        const name = pa.name.getText();
        if (name === 'path') {
          if (!ts.isStringLiteralLike(pa.initializer)) fail(pa, '`path` is not a string literal');
          path = (pa.initializer as ts.StringLiteralLike).text;
        } else if (name === 'index') {
          isIndex = pa.initializer.kind === ts.SyntaxKind.TrueKeyword;
        } else if (name === 'children') {
          if (!ts.isArrayLiteralExpression(pa.initializer)) fail(pa, '`children` is not an array literal');
          children = pa.initializer as ts.ArrayLiteralExpression;
        } else if (name === 'element') {
          element = pa.initializer;
        }
      }

      const fullPath = path !== null ? joinPaths(parentPath, path) : parentPath;
      if (children) {
        // A layout route. Its own path is served by its index child; the
        // top-level ancestor decides the area (everything under /account is
        // the portal, whatever the children are called).
        walkArray(children, fullPath, topLevelPath ?? path);
        continue;
      }
      if (path === null && !isIndex) continue; // pathless leaf: nothing to visit

      const { tag, navigateTo } = jsxTagName(element);
      const { line } = sf.getLineAndCharacterOfPosition(obj.getStart());
      const pattern = fullPath === '' ? '/' : fullPath;
      const area: RouteArea =
        pattern === '/admin' || pattern.startsWith('/admin/')
          ? 'admin'
          : topLevelPath === '/account'
            ? 'portal'
            : 'public';
      routes.push({
        pattern,
        params: [...pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]),
        component: tag,
        redirectTo: navigateTo,
        area,
        source: `${rel}:${line + 1}`,
      });
    }
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      /^create(Browser|Hash|Memory)Router$/.test(node.expression.getText())
    ) {
      routerCalls++;
      const arg = node.arguments[0];
      if (!arg || !ts.isArrayLiteralExpression(arg)) fail(node, 'router is not created from an array literal');
      walkArray(arg as ts.ArrayLiteralExpression, '', null);
    }
    if (ts.isJsxOpeningLikeElement(node) && node.tagName.getText() === 'Route') {
      fail(node, 'JSX <Route> elements found (parser only reads the object route table)');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (routerCalls === 0) throw new Error(`view-sweep route discovery: no create*Router([...]) call in ${rel}`);
  if (routes.length === 0) throw new Error(`view-sweep route discovery: router in ${rel} produced zero routes`);

  // Two route objects may share a pattern only by mistake; keep the first
  // (React Router does too) but say so.
  const seen = new Map<string, DiscoveredRoute>();
  for (const r of routes) if (!seen.has(r.pattern)) seen.set(r.pattern, r);
  return [...seen.values()];
}

export function fillPattern(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(values[name] ?? ''));
}
