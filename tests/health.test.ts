import { describe, expect, it } from 'vitest';
import { overall, pickTab, reportText, summary, type HealthCheck } from '../src/shared/health';

const c = (status: HealthCheck['status'], label: string = status): HealthCheck => ({ id: label, label, status, detail: `${label} detail` });

describe('overall', () => {
  it('takes the worst status, ignoring skipped checks', () => {
    expect(overall([c('ok'), c('skip')])).toBe('ok');
    expect(overall([c('ok'), c('warn'), c('skip')])).toBe('warn');
    expect(overall([c('warn'), c('fail')])).toBe('fail');
    expect(overall([c('skip')])).toBe('skip');
    expect(overall([])).toBe('skip');
  });
});

describe('summary', () => {
  it('counts problems before warnings', () => {
    expect(summary([c('fail'), c('fail', 'b'), c('warn')])).toBe('2 problems found');
    expect(summary([c('ok'), c('warn')])).toBe('1 warning');
    expect(summary([c('ok'), c('ok', 'b'), c('skip')])).toBe('All 2 checks passed');
    expect(summary([c('skip')])).toBe('Nothing could be checked on this page');
  });
});

describe('reportText', () => {
  it('lists every check with its status', () => {
    const text = reportText({ version: '1.6.0', page: 'home', at: Date.UTC(2026, 10, 3), checks: [c('ok', 'Logged in'), c('fail', 'Post layout')] }, 'TestBrowser');
    expect(text).toContain('Glassgram 1.6.0 health check');
    expect(text).toContain('Browser: TestBrowser');
    expect(text).toContain('Page: home');
    expect(text).toContain('2026-11-03T00:00:00.000Z');
    expect(text).toContain('[OK  ] Logged in: Logged in detail');
    expect(text).toContain('[FAIL] Post layout: Post layout detail');
  });
});

describe('pickTab', () => {
  it('prefers the active tab in the focused window', () => {
    const tabs = [
      { id: 1, active: false, lastAccessed: 300, windowId: 1 },
      { id: 2, active: true, lastAccessed: 100, windowId: 2 },
    ];
    expect(pickTab(tabs, 2)?.id).toBe(2);
  });

  it('falls back to the most recently used tab', () => {
    const tabs = [
      { id: 1, active: true, lastAccessed: 100, windowId: 1 },
      { id: 2, active: false, lastAccessed: 300, windowId: 2 },
      { id: undefined, active: false, lastAccessed: 900, windowId: 2 },
    ];
    expect(pickTab(tabs, 3)?.id).toBe(2);
    expect(pickTab([], 1)).toBeUndefined();
  });
});
