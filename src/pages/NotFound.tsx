import { logger } from '@/lib/logger';
import { Link, useLocation, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';

/**
 * The page body. Takes the route error as a PROP rather than reading it, so the
 * component is safe to render anywhere.
 *
 * It used to read it itself, with `useRouteError()` wrapped in try/catch —
 * because this component is used two ways: as the router's `errorElement`
 * (App.tsx) and as a plain 404 body by four content pages. Calling a hook inside
 * a try block is a hook whose invocation the compiler cannot guarantee, and
 * react-hooks/rules-of-hooks flagged it correctly. Splitting the two uses apart
 * removes the need for the trick: `RouteErrorPage` reads the error, `NotFound`
 * never does.
 */
const NotFoundBody = ({ routeError }: { routeError?: unknown }) => {
  const location = useLocation();
  const isError = !!routeError;
  const status = isRouteErrorResponse(routeError) ? routeError.status : 404;
  const title = isError && status !== 404 ? 'Something went wrong' : 'Page not found';
  const description = isError && status !== 404
    ? "We hit an unexpected error rendering this page. Try again, or head back home."
    : "The page you're looking for doesn't exist or has been moved.";

  useEffect(() => {
    if (isError) {
      logger.error('Route error on', location.pathname, routeError);
    } else {
      logger.error('404 Error: User attempted to access non-existent route:', location.pathname);
    }
  }, [location.pathname, isError, routeError]);

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-[60vh] bg-background flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-lg space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground tracking-wider uppercase">
              Error {status}
            </p>
            <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild>
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Back to home
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go back
            </Button>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
};

/** Plain 404 — no router error context required. */
const NotFound = () => <NotFoundBody />;

/**
 * The router's `errorElement`. This is the ONLY place `useRouteError` is called,
 * and here it is unconditional — which is what the rule asks for.
 */
export const RouteErrorPage = () => <NotFoundBody routeError={useRouteError()} />;

export default NotFound;
