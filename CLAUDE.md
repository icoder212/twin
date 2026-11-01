# Desk Twin: notes for AI coding sessions

Read `README.md` and `docs/ARCHITECTURE.md` first. Key rules:

- Run `npm run verify` (type-check, lint with zero warnings, tests, build) before finishing.
- Domain types come from Zod schemas in `packages/core/src/domain`. Change the schema, then the
  contract (`api/contracts.ts`), then both adapters (`mock/mock-api.ts`, `api/http-api.ts`).
- `packages/core` must stay free of React and DOM-only APIs; it is shared with mobile and backend.
- UI uses semantic tokens only (`bg-surface`, `text-fg-muted`, `border-line`, `text-brand-fg`…)
  and components from `apps/web/src/shared/ui`. No raw palette colours: tenants re-skin tokens.
- Never render HTML from data: no `dangerouslySetInnerHTML` or `innerHTML` (lint enforces it).
  `style={{}}` only for dynamic numeric values. No inline `<script>` or `<style>`: the CSP blocks them.
- Do not import `@twindesk/core/mock` outside a `import.meta.env.VITE_API_MODE !== 'http'`
  guard, so production builds stay free of demo data.
- Modals use the native `<dialog>` wrapper in `shared/ui/dialog.tsx`; Radix menus stay
  non-modal (modal mode injects a style tag the CSP blocks).
- Copy is UK English, plain and calm, and never advisory (no recommendations, targets or
  predictions). Demo answers must pass `runAdviceChecks`; a test enforces it.
- Tool-input gotcha: typing a `\u` escape sequence in a file-writing tool can be decoded into the
  literal (sometimes invisible) character. Type visible characters directly, and for invisible
  ones build the escape text programmatically. `sanitize.ts` regexes must stay as escapes.
