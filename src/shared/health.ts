// Health check: does Glassgram still understand Instagram's pages?
// The settings page opens Instagram in a tab of its own and walks it through the pages Glassgram
// works on (STEPS). On each one the content script (src/content/health.ts) looks at what the page
// loaded. Glassgram sends Instagram no request of its own: the pages load as they would for you.

export type HealthStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  /** One sentence: what was found, or what to do about it. */
  detail: string;
  /** Features that stop working when this check fails. */
  affects?: string[];
  /** The page it ran on (a STEP_LABELS value), for grouping. Missing for checks of Glassgram itself. */
  group?: string;
}

/** The pages the full check opens, in order. */
export type HealthStep = 'home' | 'post' | 'profile' | 'reels' | 'explore' | 'direct';
export const STEPS: HealthStep[] = ['home', 'post', 'profile', 'reels', 'explore', 'direct'];
export const STEP_LABELS: Record<HealthStep, string> = {
  home: 'Home feed',
  post: 'A post',
  profile: 'A profile',
  reels: 'Reels',
  explore: 'Explore',
  direct: 'Messages',
};

/** chrome.storage.session key: the id of the tab the full check opened, while it runs. */
export const HEALTH_TAB_KEY = 'health.tabId';

/** Where the next steps go, read from the Home feed. Never part of a copied report. */
export interface HealthNext {
  post?: string;
  profile?: string;
}

/** The address a step opens, or undefined when Home had nothing to point it at. */
export function stepUrl(step: HealthStep, next: HealthNext, base = 'https://www.instagram.com/'): string | undefined {
  switch (step) {
    case 'home':
      return base;
    case 'post':
      return next.post && `${base}p/${encodeURIComponent(next.post)}/`;
    case 'profile':
      return next.profile && `${base}${encodeURIComponent(next.profile)}/`;
    case 'reels':
      return `${base}reels/`;
    case 'explore':
      return `${base}explore/`;
    case 'direct':
      return `${base}direct/inbox/`;
  }
}

export interface HealthReport {
  /** Glassgram version that ran the checks. */
  version: string;
  /** The pages checked: a route kind (see content/core/router.ts), or the steps of a full check. */
  page: string;
  at: number;
  checks: HealthCheck[];
  /** From a Home step: where the next steps go. Left out of reportText. */
  next?: HealthNext;
}

/** The worst status in the report; skipped checks don't count. */
export function overall(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return checks.some((c) => c.status === 'ok') ? 'ok' : 'skip';
}

export function summary(checks: HealthCheck[]): string {
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const ran = checks.filter((c) => c.status !== 'skip').length;
  if (fails) return `${fails} ${fails === 1 ? 'problem' : 'problems'} found`;
  if (warns) return `${warns} ${warns === 1 ? 'warning' : 'warnings'}`;
  return ran ? `All ${ran} checks passed` : 'Nothing could be checked on this page';
}

const MARK: Record<HealthStatus, string> = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

/** Plain text for bug reports. Holds no usernames, links or post codes. */
export function reportText(r: HealthReport, browser: string): string {
  const lines = [
    `Glassgram ${r.version} health check`,
    `Browser: ${browser}`,
    `Page: ${r.page}`,
    `Time: ${new Date(r.at).toISOString()}`,
  ];
  let group: string | null | undefined = null;
  for (const c of r.checks) {
    if (c.group !== group) {
      group = c.group;
      lines.push('', `${group ?? 'Glassgram'}:`);
    }
    lines.push(`[${MARK[c.status]}] ${c.label}: ${c.detail}`);
  }
  return lines.join('\n');
}

/**
 * The Instagram tab to check: the one the user looks at in the last focused window, else the most
 * recently used one.
 */
export function pickTab<T extends { id?: number; active?: boolean; lastAccessed?: number; windowId?: number }>(tabs: T[], focusedWindowId?: number): T | undefined {
  const usable = tabs.filter((t) => t.id !== undefined);
  return (
    usable.find((t) => t.active && t.windowId === focusedWindowId) ??
    [...usable].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
  );
}
