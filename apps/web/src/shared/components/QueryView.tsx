import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState } from '@/shared/ui/feedback';

/** Renders loading, error and data states for a query in one consistent way. */
export function QueryView<T>({
  query,
  loading,
  children,
}: {
  query: UseQueryResult<T>;
  loading: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return loading;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return children(query.data);
}
