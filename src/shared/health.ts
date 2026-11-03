// Health check: does Glassgram still understand Instagram's page?
// The checks run in an open Instagram tab (src/content/health.ts) and only look at what the page
// already has. They never send Instagram a request. The settings page shows the result.

export type HealthStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  /** One sentence: what was found, or what to do about it. */
  detail: string;
  /** Features that stop working when this check fails. */
  affects?: string[];
}

export interface HealthReport {
  /** Glassgram version that ran the checks. */
  version: string;
  /** Kind of Instagram page the checks ran on (see content/core/router.ts). */
  page: string;
  at: number;
  checks: HealthCheck[];
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
    '',
    ...r.checks.map((c) => `[${MARK[c.status]}] ${c.label}: ${c.detail}`),
  ];
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
