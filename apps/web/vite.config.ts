import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { contentSecurityPolicy, securityHeaders } from './config/security-headers';

/** Adds the Content Security Policy as a meta tag to production builds. */
function cspMetaTag(connectSrc: string[]): Plugin {
  return {
    name: 'twindesk:csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<!-- CSP -->',
          `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy({ connectSrc })}" />`,
        ),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const connectSrc = env.VITE_API_BASE_URL ? [new URL(env.VITE_API_BASE_URL).origin] : [];
  // Frames are only allowed from the app itself (white-label preview) and configured hosts.
  const frameAncestors = [
    "'self'",
    ...(env.VITE_EMBED_ALLOWED_ORIGINS?.split(',').filter(Boolean) ?? []),
  ];

  return {
    plugins: [react(), tailwindcss(), cspMetaTag(connectSrc)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // HMR needs inline scripts in development, so the CSP is only enforced on builds.
      headers: securityHeaders({ csp: false }),
    },
    preview: {
      port: 4173,
      strictPort: true,
      headers: securityHeaders({ connectSrc, frameAncestors }),
    },
    build: {
      target: 'es2022',
      sourcemap: mode !== 'production',
      // Never inline assets as data: URIs; keeps the CSP simple and assets cacheable.
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            data: ['@tanstack/react-query', 'zustand', 'zod'],
          },
        },
      },
    },
  };
});
