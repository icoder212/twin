// Must stay first: configures Zod before any schema is created or parsed.
import '@/app/strict-csp';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { loadTenant, resolveTenantId } from '@/features/tenant/resolve-tenant';
import '@/styles/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

const tenant = loadTenant(resolveTenantId());

createRoot(container).render(
  <StrictMode>
    <App tenant={tenant} />
  </StrictMode>,
);
