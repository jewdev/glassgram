// Runs one step of the health check in this Instagram tab (see shared/health.ts). Every check reads
// only what the page already loaded: nothing here sends Instagram a request.

import { STEP_LABELS, type HealthCheck, type HealthNext, type HealthReport, type HealthStep } from '../shared/health';
import { cooldownLeft, myUserId } from './core/api';
import { bridge, bridgeSafe } from './core/bridge';
import { normalizeMedia, type ApiMedia } from './core/media';
import { postAuthor } from './core/mute';
import { currentRoute, type Route } from './core/router';
import { SEL, shortcodeInRoot, SUGGESTED_WORDS } from './core/selectors';
import { getSettings } from './core/state';

type PageHealth = { relay: boolean; templates: string[] };

const check = (id: string, label: string, status: HealthCheck['status'], detail: string, affects?: string[]): HealthCheck => ({ id, label, status, detail, affects });

const DATA_FEATURES = ['Downloads', 'HD profile picture', 'Follow status badge', 'Story mentions & stickers'];
const VIDEO_FEATURES = ['Video controls', 'Reel counter', 'Skip ad reels', 'Next reel when one ends'];

/** Longest wait for a page's content to load. */
const READY_MS = 12000;
/** After the content shows up, a moment for the rest of the page (menus, labels) to render. */
const SETTLE_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What shows a step's page has loaded. */
const READY: Record<HealthStep, () => boolean> = {
  home: () => [...document.querySelectorAll(SEL.article)].some((a) => shortcodeInRoot(a)),
  post: () => !!document.querySelector(`${SEL.main} img, ${SEL.main} video`),
  profile: () => !!document.querySelector(SEL.profileHeader)?.querySelector('img'),
  reels: () => !!document.querySelector('video'),
  explore: () => !!document.querySelector(SEL.main)?.querySelector(SEL.postLink),
  direct: () => !!document.querySelector(SEL.main)?.childElementCount,
};

async function whenReady(step: HealthStep): Promise<boolean> {
  const end = performance.now() + READY_MS;
  while (performance.now() < end) {
    if (READY[step]()) {
      await sleep(SETTLE_MS);
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function pageScript(): Promise<PageHealth | null> {
  try {
    return await bridge<PageHealth>('health', {}, 3000);
  } catch {
    return null;
  }
}

/** A post visible on this page, to test reading its data. */
function visibleShortcode(route: Route): string | undefined {
  if (route.shortcode) return route.shortcode;
  for (const a of document.querySelectorAll(SEL.article)) {
    const sc = shortcodeInRoot(a);
    if (sc) return sc;
  }
  return undefined;
}

/** Where the full check goes next: a post and a profile from the feed. */
function nextFromFeed(): HealthNext {
  const next: HealthNext = {};
  for (const a of document.querySelectorAll(SEL.article)) {
    next.post ??= shortcodeInRoot(a);
    next.profile ??= postAuthor(a);
    if (next.post && next.profile) break;
  }
  return next;
}

async function postData(route: Route, relay: boolean): Promise<HealthCheck> {
  const label = 'Post data';
  if (!relay) return check('media', label, 'skip', "Needs Instagram's page data (see Glassgram above).");
  const code = visibleShortcode(route);
  if (!code) return check('media', label, 'skip', 'No post on this page.');
  const raw = await bridgeSafe<ApiMedia | null>('getMedia', { code }, null);
  if (!raw) return check('media', label, 'warn', "A post on screen wasn't found in Instagram's page data. Downloads fall back to asking Instagram.", ['Downloads']);
  const items = normalizeMedia(raw).items;
  return items.length && items.every((it) => it.url)
    ? check('media', label, 'ok', `Read the media of a post on screen (${items.length} ${items.length === 1 ? 'file' : 'files'}).`)
    : check('media', label, 'fail', "Found a post but couldn't read its photo or video links.", ['Downloads', 'Zoom', 'Copy media URL']);
}

function feedLayout(route: Route): HealthCheck {
  const label = 'Post layout';
  const articles = [...document.querySelectorAll(SEL.article)];
  // Post pages have no <article> any more: Glassgram reads the post from the address instead.
  if (!articles.length && route.kind === 'post' && route.shortcode) {
    const main = document.querySelector(SEL.main);
    if (!main?.querySelector('img, video')) return check('feed', label, 'skip', "The post didn't load in time.");
    return main.querySelector(SEL.time)
      ? check('feed', label, 'ok', 'Found the post on this page.')
      : check('feed', label, 'warn', 'Found the post, but not its date.', ['Exact timestamps']);
  }
  if (!articles.length) {
    return document.querySelector(SEL.postLink)
      ? check('feed', label, 'fail', 'Posts are on screen, but not where Glassgram looks for them.', ['Download toolbar', 'Hide ads', 'Exact timestamps'])
      : check('feed', label, 'skip', "No posts loaded in time. Instagram may be slow; run the check again.");
  }
  const withCode = articles.filter((a) => shortcodeInRoot(a)).length;
  const withTime = articles.filter((a) => a.querySelector(SEL.time)).length;
  if (!withCode) return check('feed', label, 'fail', "Found posts, but none links to itself the way Glassgram expects.", ['Download toolbar', 'Shortcuts', 'Hide ads']);
  if (!withTime) return check('feed', label, 'warn', 'Found posts without a date.', ['Exact timestamps']);
  return check('feed', label, 'ok', `Recognized ${withCode} of ${articles.length} ${articles.length === 1 ? 'post' : 'posts'} on screen.`);
}

function comments(): HealthCheck {
  const label = 'Comments';
  const main = document.querySelector(SEL.main);
  // The post's own date is one time element; each comment has another.
  const times = main?.querySelectorAll(SEL.time).length ?? 0;
  if (times < 2) return check('comments', label, 'skip', 'This post shows no comments.');
  return main?.querySelector('span[dir="auto"]')
    ? check('comments', label, 'ok', `Found ${times - 1} ${times === 2 ? 'comment' : 'comments'} with their text.`)
    : check('comments', label, 'warn', "Found comments, but not their text where Glassgram looks.", ['Copy comment', 'Save GIFs from comments']);
}

function storiesTray(): HealthCheck {
  const label = 'Stories tray';
  const main = document.querySelector(SEL.main);
  const tray = [...(main?.querySelectorAll('ul') ?? [])].some((ul) => !ul.closest(SEL.article) && ul.querySelectorAll('li canvas').length >= 2);
  return tray
    ? check('stories', label, 'ok', 'Found the stories at the top of the feed.')
    : check('stories', label, 'skip', 'No stories tray on Home right now (it only shows when people you follow posted stories).');
}

function sidebar(): HealthCheck {
  const label = 'Suggested accounts';
  const found =
    document.querySelector(SEL.sidebarSuggestionsLink) ||
    [...document.querySelectorAll(`${SEL.main} span`)].some((el) => el.childElementCount === 0 && SUGGESTED_WORDS.includes(el.textContent?.trim() ?? '') && !el.closest(SEL.article));
  if (found) return check('sidebar', label, 'ok', 'Found the suggested accounts list.');
  return innerWidth < 1160
    ? check('sidebar', label, 'skip', 'The window is too narrow for Instagram to show them.')
    : check('sidebar', label, 'warn', "Couldn't find the suggested accounts list next to the feed.", ['Hide suggested accounts']);
}

function navigation(): HealthCheck {
  const label = 'Navigation';
  const missing = [!document.querySelector(SEL.reelsNav) && 'Reels', !document.querySelector(SEL.exploreNav) && 'Explore'].filter(Boolean);
  return missing.length
    ? check('nav', label, 'warn', `Couldn't find the ${missing.join(' and ')} ${missing.length === 1 ? 'link' : 'links'} in the menu.`, ['Hide Reels tab', 'Hide Explore tab', 'Focus mode'])
    : check('nav', label, 'ok', 'Found the Reels and Explore links.');
}

function profileLayout(route: Route): HealthCheck {
  const label = 'Profile layout';
  const header = document.querySelector(SEL.profileHeader);
  if (!header) return check('profile', label, 'fail', "Couldn't find the profile header.", ['HD profile picture', 'Follow status badge', 'Bulk download profile posts']);
  if (!header.querySelector('img')) return check('profile', label, 'warn', 'Found the profile header, but no picture in it.', ['HD profile picture']);
  const name = route.username?.toLowerCase();
  const named = !!name && [...header.querySelectorAll('h1, h2, span')].some((el) => el.textContent?.trim().toLowerCase() === name);
  return named
    ? check('profile', label, 'ok', 'Found the profile header, picture and username.')
    : check('profile', label, 'warn', "Found the profile header, but not the username in it.", ['Follow status badge']);
}

function bulkFormat(page: PageHealth | null): HealthCheck {
  const label = 'Bulk download';
  if (!getSettings()['bulk.enabled']) return check('bulk', label, 'skip', 'Bulk download is off.');
  if (!page) return check('bulk', label, 'skip', 'Needs the page script (see Glassgram above).');
  return page.templates.includes('PolarisProfilePostsQuery')
    ? check('bulk', label, 'ok', "Captured Instagram's profile request format.")
    : check('bulk', label, 'warn', "Instagram didn't load the profile's posts the way Glassgram expects.", ['Bulk download profile posts']);
}

function reels(): HealthCheck {
  const label = 'Reels player';
  const videos = document.querySelectorAll('video').length;
  return videos
    ? check('reels', label, 'ok', `Found ${videos === 1 ? 'the reel video' : `${videos} reel videos`}.`)
    : check('reels', label, 'fail', "Couldn't find a reel video.", VIDEO_FEATURES);
}

function explore(): HealthCheck {
  const label = 'Explore grid';
  const main = document.querySelector(SEL.main);
  const posts = main?.querySelectorAll(SEL.postLink).length ?? 0;
  return posts
    ? check('explore', label, 'ok', `Found ${posts} ${posts === 1 ? 'post' : 'posts'} in the grid.`)
    : check('explore', label, 'fail', "Couldn't find the posts in the grid.", ['Download toolbar', 'Focus mode']);
}

function messages(route: Route): HealthCheck {
  const label = 'Messages';
  if (route.kind !== 'direct') return check('direct', label, 'fail', 'Instagram opened another page instead of your messages.', ['Voice message download', 'Keep unsent messages']);
  return check('direct', label, 'ok', "Opened your inbox. The check doesn't open a chat, so nothing is marked as read.");
}

async function rateLimit(): Promise<HealthCheck> {
  const left = await cooldownLeft();
  return left
    ? check('cooldown', 'Rate limit', 'warn', `Instagram rate-limited Glassgram. Its requests are paused for ${Math.ceil(left / 60000)} more min.`, ['Bulk download profile posts', 'Unfollowers checker'])
    : check('cooldown', 'Rate limit', 'ok', 'Not rate-limited.');
}

/** Checks of the connection to Instagram, run once, on Home. */
async function general(page: PageHealth | null): Promise<HealthCheck[]> {
  const relay = !!page?.relay;
  return [
    myUserId()
      ? check('session', 'Logged in', 'ok', 'Instagram session found.')
      : check('session', 'Logged in', 'fail', 'Not logged in to Instagram in this browser.', ['Most features']),
    page
      ? check('page', 'Page script', 'ok', 'Connected.')
      : check('page', 'Page script', 'fail', 'Not answering. Reload the Instagram tab.', ['Downloads', 'Anonymous stories', 'DM tools', 'Clean links']),
    !page
      ? check('relay', "Instagram's page data", 'skip', 'Needs the page script.')
      : relay
        ? check('relay', "Instagram's page data", 'ok', 'Found and readable.')
        : check('relay', "Instagram's page data", 'fail', "Couldn't find it. Features fall back to asking Instagram, which is slower and more visible.", DATA_FEATURES),
    await rateLimit(),
  ];
}

export async function runHealthCheck(step: HealthStep): Promise<HealthReport> {
  const loaded = await whenReady(step);
  const route = currentRoute();
  const page = await pageScript();
  const relay = !!page?.relay;
  const checks: HealthCheck[] = [];
  let next: HealthNext | undefined;

  if (!loaded && step !== 'direct') {
    checks.push(check(`${step}-load`, 'Page', 'warn', "The page didn't finish loading in time, so some checks may be skipped."));
  }
  switch (step) {
    case 'home':
      checks.push(...(await general(page)));
      checks.push(feedLayout(route), await postData(route, relay), navigation(), storiesTray(), sidebar());
      next = nextFromFeed();
      break;
    case 'post':
      checks.push(feedLayout(route), await postData(route, relay), comments());
      break;
    case 'profile':
      checks.push(profileLayout(route), bulkFormat(page));
      break;
    case 'reels':
      checks.push(reels());
      break;
    case 'explore':
      checks.push(explore());
      break;
    case 'direct':
      checks.push(messages(route));
      break;
  }

  // The checks of Glassgram's own connection belong to no page.
  const own = new Set(['session', 'page', 'relay', 'cooldown']);
  for (const c of checks) if (!own.has(c.id)) c.group = STEP_LABELS[step];
  return { version: chrome.runtime.getManifest().version, page: route.kind, at: Date.now(), checks, next };
}
