# White-label

Each firm that deploys Desk Twin gets its own name, product name, colours, corner radius,
features, security settings, locale and legal text from one validated configuration. The same
build serves every tenant.

## Tenant configuration

The schema is `tenantConfigSchema` in `packages/core/src/domain/tenant.ts`. Presets for the demo
live in `packages/core/src/tenants/presets.ts` (AlchmAI, Northbridge, Meridian). In production
the backend serves the config for each hostname or embed key, and the client validates it with
the same schema before use.

| Section         | What it controls                                                                          |
| --------------- | ----------------------------------------------------------------------------------------- |
| `brand`         | Full logo per scheme, wordmark text, square mark image, whether the sign-in art shows     |
| `theme`         | Default scheme, radius scale, and full dark and light token sets                          |
| `features`      | Which modules exist: twin, tasks, workflows, shortcuts, alerts, approvals, sources, audit |
| `security`      | Idle timeout and warning, session lifetime, MFA, SSO providers, lockout attempts          |
| `locale`        | Language, currency and timezone for all formatting                                        |
| `legal`         | Disclaimer shown in the app, support address, privacy and terms links                     |
| `notifications` | Channels the firm allows (e.g. no WhatsApp), minimal wording, supervisor escalation       |
| `embed`         | Host origins allowed to frame the twin and talk to it                                     |

Disabled features disappear from navigation and their routes return "not found"; the API must
reject them too.

## Theme tokens

Components use semantic tokens only (`bg-surface`, `text-fg-muted`, `border-line`,
`text-brand-fg`, `bg-brand`…), never raw colours. A tenant supplies 17 tokens per scheme:

`bg, surface, surface2, surface3, line, lineStrong, fg, fgMuted, fgSubtle, brand, brandFg,
onBrand, accent, success, warning, danger, info`

Rules a new palette must meet:

- `brand` is a fill and needs 4.5:1 against `onBrand` (button text).
- `brandFg`, `fgMuted` and `fgSubtle` are text and need 4.5:1 against `surface`.
- `success`, `warning` and `danger` sit side by side in meters; check them with a colour-blind
  simulator. Status colours always ship with an icon and a label, never colour alone.
- Values must be `#rgb`, `#rrggbb` or `#rrggbbaa`. Anything else is rejected, so a config can
  never inject CSS.

Tokens are applied through the CSSOM on `<html>` (`features/tenant/theme.ts`), which a strict CSP
allows, rather than by injecting a stylesheet.

## Adding a tenant

1. Add a preset to `presets.ts` (or serve it from the backend) and run `npm test`; the schema
   parse fails fast on any invalid value.
2. Add the brand assets under `apps/web/public/brand/<tenant>/`. The square mark goes in
   `markUrl`. A full logo goes in `logo`, with one version for dark backgrounds (`onDark`), one
   for light (`onLight`) and its `aspectRatio`. Export it about 96px tall, cropped to the
   artwork. Without a logo, the mark and the text wordmark are shown instead.
3. Add the tenant's hosts to `embed.allowedOrigins` and to the nginx `frame-ancestors` map.
4. In demo builds, check it at `/login?tenant=<id>` or in _Settings → White-label_.

## Embedding in a host platform

```ts
import { mountTwinDesk } from '@twindesk/embed-sdk';

const twin = mountTwinDesk({
  container: document.getElementById('desk-twin')!,
  src: 'https://twin.example.com/embed/twin?tenant=meridian',
  scheme: 'light',
  autoHeight: true,
  onMessage: (message) => {
    if (message.type === 'twindesk:answer') console.info('answer logged as', message.answerId);
  },
});

twin.setScheme('dark');
twin.ask('How close am I to my daily limit?');
```

The SDK creates a sandboxed iframe, checks the twin's exact origin on every message, and only
speaks the typed protocol in `packages/embed-sdk/src/index.ts`. Inside the frame the twin
accepts messages only from its parent and only from the tenant's allowed origins. Single sign-on
between host and twin should use the host's identity provider (OIDC), so the host never handles
twin credentials.
