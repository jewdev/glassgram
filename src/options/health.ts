// Settings page side of the health check (see shared/health.ts): opens Instagram in a tab of its
// own, walks it through each step's page, asks the content script there to check it, and shows the
// result. The tab closes when the check ends; closing it early stops the check.

import {
  HEALTH_TAB_KEY,
  overall,
  reportText,
  STEP_LABELS,
  STEPS,
  stepUrl,
  summary,
  type HealthCheck,
  type HealthNext,
  type HealthReport,
  type HealthStatus,
  type HealthStep,
} from '../shared/health';
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Rows under a heading per page; Glassgram's own checks come first. */
function rows(checks: HealthCheck[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let group: string | null | undefined = null;
  for (const c of checks) {
    if (c.group !== group) {
      group = c.group;
      const head = document.createElement('li');
      head.className = 'health__group';
      head.textContent = group ?? 'Glassgram';
      out.push(head);
    }
    out.push(row(c));
  }
  return out;
}

function show(checks: HealthCheck[], sub: string) {
  const state = overall(checks);
  const icon = $('health-icon');
  icon.className = `update-card__icon health__icon is-${state}`;
  icon.innerHTML = svg(state === 'skip' ? 'warn' : state, 18);
  $('health-card-title').textContent = state === 'ok' ? 'Glassgram works with Instagram' : state === 'fail' ? 'Something is broken' : 'Mostly working';
  $('health-card-sub').textContent = sub;
  $('health-list').replaceChildren(...rows(checks));
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

const progress = (text: string) => ($('health-status').textContent = text);

type Reply = HealthReport | { error: string } | undefined;

/** Ask the tab's content script to run one step. It may still be starting, so retry for a moment. */
async function askTab(tabId: number, step: HealthStep): Promise<Reply> {
  const end = Date.now() + 8000;
  for (;;) {
    try {
      // The content script waits up to 12 s for the page to load before it checks.
      return await withTimeout(chrome.tabs.sendMessage(tabId, { type: 'healthCheck', step } satisfies Message) as Promise<Reply>, 25000);
    } catch (e) {
      if (Date.now() > end || String(e).includes('timeout')) return undefined;
      await sleep(500);
    }
  }
}

const stepCheck = (step: HealthStep, status: HealthStatus, detail: string, affects?: string[]): HealthCheck => ({
  id: `${step}-step`,
  label: 'Page',
  status,
  detail,
  affects,
  group: STEP_LABELS[step],
});

/** Stories are never opened: the person who posted one would see the check as a view. */
const STORIES: HealthCheck = {
  id: 'stories-viewer',
  label: 'Story viewer',
  status: 'skip',
  detail: 'Not opened, because its owner would see a view. Open a story yourself to try downloads, mentions and stickers.',
  group: 'Stories',
};

async function run() {
  if (running) return;
  busy(true);
  lastReport = undefined;
  $<HTMLButtonElement>('health-copy').disabled = true;
  setAction();

  let tabId: number | undefined;
  let closed = false;
  const onRemoved = (id: number) => {
    if (id === tabId) closed = true;
  };
  chrome.tabs.onRemoved.addListener(onRemoved);
  const checks: HealthCheck[] = [await background()];
  let loggedOut = false;
  let finished = false;

  try {
    // A blank tab first, so the background knows it's the check's tab before Glassgram starts in it.
    // It opens in the background: the settings page stays in front to show the progress.
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    tabId = tab.id;
    if (tabId === undefined) throw new Error('no tab');
    await chrome.storage.session.set({ [HEALTH_TAB_KEY]: tabId });

    let next: HealthNext = {};
    for (const [i, step] of STEPS.entries()) {
      if (closed) break;
      const url = stepUrl(step, next);
      if (!url) {
        checks.push(stepCheck(step, 'skip', `Home had no ${step === 'post' ? 'post' : 'profile'} to open.`));
        continue;
      }
      progress(`Checking ${STEP_LABELS[step]} · ${i + 1} of ${STEPS.length}`);
      const loaded = tabLoaded(tabId);
      await chrome.tabs.update(tabId, { url });
      await loaded;
      if (closed) break;
      const reply = await askTab(tabId, step);
      if (closed) break;
      if (!reply || 'error' in reply) {
        checks.push(stepCheck(step, 'fail', reply ? `The check failed: ${reply.error}` : "Glassgram didn't answer on this page.", ['Everything on this page']));
        if (step === 'home') break;
        continue;
      }
      checks.push(...reply.checks);
      if (step === 'home') {
        next = reply.next ?? {};
        loggedOut = reply.checks.some((c) => c.id === 'session' && c.status === 'fail');
        if (loggedOut) break;
      }
    }
    finished = !closed && !loggedOut;
  } catch {
    checks.push({ id: 'tab', label: 'Instagram tab', status: 'fail', detail: "Couldn't open a tab for the check.", affects: ['The health check'] });
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
    await chrome.storage.session.remove(HEALTH_TAB_KEY).catch(() => {});
    // A logged-out tab stays open, so the user can log in there.
    if (tabId !== undefined && !closed && !loggedOut) await chrome.tabs.remove(tabId).catch(() => {});
  }

  const pages = new Set(checks.map((c) => c.group).filter(Boolean)).size;
  if (finished) checks.push(STORIES);
  if (closed) checks.push({ id: 'stopped', label: 'Check stopped', status: 'warn', detail: 'The Instagram tab was closed before every page was checked.' });
  lastReport = { version: chrome.runtime.getManifest().version, page: 'full check', at: Date.now(), checks };
  $<HTMLButtonElement>('health-copy').disabled = false;
  busy(false);
  if (loggedOut) {
    show(checks, 'Log in to Instagram, then run the check again.');
    // The check's tab stays open on Instagram's login page; show it, or a new one if it was closed.
    const loginTab = tabId;
    setAction({
      label: 'Log in to Instagram',
      run: () => {
        const open = () => chrome.tabs.create({ url: IG_URL });
        if (loginTab === undefined) return void open();
        chrome.tabs.update(loginTab, { active: true }).catch(open);
      },
    });
    return;
  }
  show(
    checks,
    `Opened Instagram in a tab of its own and checked ${pages} ${pages === 1 ? 'page' : 'pages'}. The pages loaded as they would for you; Glassgram sent Instagram nothing of its own.`,
  );
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
  // The check opens a tab and takes a while, so say so before it starts.
  const confirm = $<HTMLDialogElement>('health-confirm');
  $('health-run').addEventListener('click', () => {
    if (running) return;
    confirm.returnValue = '';
    confirm.showModal();
  });
  confirm.addEventListener('close', async () => {
    if (confirm.returnValue !== 'run') return;
    await run();
    $('health').scrollIntoView({ block: 'nearest' });
  });
  $('health-again').addEventListener('click', run);
  $('health-copy').addEventListener('click', copy);
  $('health-close').addEventListener('click', () => ($('health').hidden = true));
}
