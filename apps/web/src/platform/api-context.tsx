import { createContext, useContext } from 'react';
import type { AppApi } from './create-api';

export const ApiContext = createContext<AppApi | null>(null);

export function useApi(): AppApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
