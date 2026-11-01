import type { ColorScheme, TenantConfig, ThemeTokenName } from '@twindesk/core';

const CSS_VARS: Record<ThemeTokenName, string> = {
  bg: '--td-bg',
  surface: '--td-surface',
  surface2: '--td-surface2',
  surface3: '--td-surface3',
  line: '--td-line',
  lineStrong: '--td-line-strong',
  fg: '--td-fg',
  fgMuted: '--td-fg-muted',
  fgSubtle: '--td-fg-subtle',
  brand: '--td-brand',
  brandFg: '--td-brand-fg',
  onBrand: '--td-on-brand',
  accent: '--td-accent',
  success: '--td-success',
  warning: '--td-warning',
  danger: '--td-danger',
  info: '--td-info',
};

/**
 * Applies a tenant's validated tokens through the CSSOM. Values were checked against a strict
 * hex pattern when the config was parsed, and setProperty is allowed under a strict CSP where
 * injecting a <style> element is not.
 */
export function applyTheme(root: HTMLElement, tenant: TenantConfig, scheme: ColorScheme): void {
  root.dataset.theme = scheme;
  const tokens = tenant.theme[scheme];
  for (const [name, cssVar] of Object.entries(CSS_VARS) as Array<[ThemeTokenName, string]>) {
    root.style.setProperty(cssVar, tokens[name]);
  }
  root.style.setProperty('--td-radius-scale', String(tenant.theme.radiusScale));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bg);
}
