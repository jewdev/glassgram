// Settings page side of the health check (see shared/health.ts): finds an Instagram tab, asks its
// content script to run the checks, and shows the result.

import { overall, pickTab, reportText, summary, type HealthCheck, type HealthReport, type HealthStatus } from '../shared/health';
import type { Message } from '../shared/messages';
import { IG_URL, tabLoaded } from '../shared/tabs';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ICON: Record<HealthStatus, string> = {
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 7v6M12 17h.01"/>',
  fail: '<path d="M7 7l10 10M17 7 7 17"/>',
  skip: '<path d="M7 12h10"/>',
};
const STATUS_TEXT: Record<HealthStatus, string> = { ok: 'Passed', warn: 'Warning', fail: 'Failed', skip: 'Skipped' };

const svg = (s: HealthStatus, size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[s]}</svg>`;

let running = false;
let lastReport: HealthReport | undefined;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function background(): Promise<HealthCheck> {
  const label = 'Background worker';
  try {
    const r = await withTimeout(chrome.runtime.sendMessage({ type: 'ping' } satisfies Message) as Promise<{ ok?: boolean }>, 3000);
    if (r?.ok) return { id: 'background', label, status: 'ok', detail: 'Answering.' };
  } catch {
    /* reported below */
  }
  return { id: 'background', label, status: 'fail', detail: 'Not answering. Press Reload Glassgram on the extensions page.', affects: ['Downloads', 'ZIP files', 'Update checks'] };
}

type Action = { label: string; run: () => void };

function setAction(a?: Action) {
  const btn = $<HTMLButtonElement>('health-action');
  btn.hidden = !a;
  if (!a) return;
  btn.textContent = a.label;
  btn.onclick = a.run;
}

function row(c: HealthCheck): HTMLElement {
  const li = document.createElement('li');
  li.className = `health__row is-${c.status}`;
  const mark = document.createElement('span');
  mark.className = 'health__mark';
  mark.innerHTML = svg(c.status, 13);
  mark.title = STATUS_TEXT[c.status];
  const text = document.createElement('div');
  text.className = 'health__text';
  const label = document.createElement('p');
  label.className = 'health__label';
  label.textContent = c.label;
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = `${STATUS_TEXT[c.status]}: `;
  label.prepend(sr);
  const detail = document.createElement('p');
  detail.className = 'health__detail';
  detail.textContent = c.detail;
  text.append(label, detail);
  if (c.affects?.length && (c.status === 'fail' || c.status === 'warn')) {
    const aff = document.createElement('p');
    aff.className = 'health__affects';
    aff.textContent = `Affects: ${c.affects.join(', ')}`;
    text.append(aff);
  }
  li.append(mark, text);
  return li;
}

function show(checks: HealthCheck[], sub: string) {
  const state = overall(checks);
  const icon = $('health-icon');
  icon.className = `update-card__icon health__icon is-${state}`;
  icon.innerHTML = svg(state === 'skip' ? 'warn' : state, 18);
  $('health-card-title').textContent = state === 'ok' ? 'Glassgram works with Instagram' : state === 'fail' ? 'Something is broken' : 'Mostly working';
  $('health-card-sub').textContent = sub;
  $('health-list').replaceChildren(...checks.map(row));
  $('health').hidden = false;

  const status = $('health-status');
  status.classList.toggle('is-error', state === 'fail' || state === 'warn');
  const link = document.createElement('a');
  link.href = '#health';
  link.textContent = summary(checks);
  status.replaceChildren(link);
}

function busy(on: boolean) {
  running = on;
  for (const id of ['health-run', 'health-again']) $<HTMLButtonElement>(id).disabled = on;
  if (on) $('health-status').textContent = 'Checking…';
}

async function run() {
  if (running) return;
  busy(true);
  lastReport = undefined;
  $<HTMLButtonElement>('health-copy').disabled = true;
  setAction();
  try {
    const bg = await background();
    const [focused, tabs] = await Promise.all([chrome.windows.getLastFocused().catch(() => undefined), chrome.tabs.query({ url: `${IG_URL}*` })]);
    const tab = pickTab(tabs, focused?.id);
    if (!tab?.id) {
      show([bg], 'Open Instagram in a tab and log in, then run the check again.');
      setAction({ label: 'Open Instagram', run: () => chrome.tabs.create({ url: IG_URL }) });
      return;
    }
    const tabId = tab.id;
    let reply: HealthReport | { error: string } | undefined;
    try {
      reply = await withTimeout(chrome.tabs.sendMessage(tabId, { type: 'healthCheck' } satisfies Message) as Promise<HealthReport | { error: string }>, 15000);
    } catch {
      reply = undefined;
    }
    if (!reply || 'error' in reply) {
      const tabCheck: HealthCheck = {
        id: 'content',
        label: 'Instagram tab',
        status: 'fail',
        detail: reply ? `The check failed: ${reply.error}` : "Glassgram isn't running in the Instagram tab. Tabs opened before Glassgram was installed or reloaded need a reload.",
        affects: ['Everything on Instagram'],
      };
      show([bg, tabCheck], 'Reload the Instagram tab, and Glassgram checks again.');
      setAction({
        label: 'Reload Instagram tab',
        run: async () => {
          setAction();
          busy(true);
          await chrome.tabs.reload(tabId).catch(() => {});
          await tabLoaded(tabId);
          busy(false);
          run();
        },
      });
      return;
    }
    lastReport = { ...reply, checks: [bg, ...reply.checks] };
    $<HTMLButtonElement>('health-copy').disabled = false;
    const skipped = lastReport.checks.some((c) => c.status === 'skip');
    show(lastReport.checks, `Checked the Instagram tab you used last, without sending Instagram anything.${skipped ? ' Some checks need a different page: open your feed, a post or a profile and run it there too.' : ''}`);
  } finally {
    busy(false);
    if (!lastReport && !$('health-status').querySelector('a')) $('health-status').textContent = 'Not checked yet';
  }
}

async function copy() {
  if (!lastReport) return;
  const btn = $<HTMLButtonElement>('health-copy');
  try {
    await navigator.clipboard.writeText(reportText(lastReport, navigator.userAgent));
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => (btn.textContent = 'Copy report'), 1600);
}

export function wireHealth() {
  $('health-run').addEventListener('click', async () => {
    await run();
    $('health').scrollIntoView({ block: 'nearest' });
  });
  $('health-again').addEventListener('click', run);
  $('health-copy').addEventListener('click', copy);
  $('health-close').addEventListener('click', () => ($('health').hidden = true));
}
