import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { logger } from '@/lib/logger';
import { Button } from '@/shared/ui/button';
import { NotFoundPage } from './NotFoundPage';

/** Route error boundary. Shows a calm message and never a stack trace. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  logger.error('Route error', error);
  return (
    <div role="alert" className="grid min-h-dvh place-items-center bg-bg px-4 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
        <p className="text-sm text-fg-muted">
          The page could not be shown. Your data is safe. Reload to try again.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button asChild size="sm">
            <Link to="/desk">Go to your desk</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
