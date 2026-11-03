// Runs the health check in this Instagram tab (see shared/health.ts). Every check reads only what
// the page already loaded: nothing here sends Instagram a request.

import type { HealthCheck, HealthReport } from '../shared/health';
import { cooldownLeft, myUserId } from './core/api';
import { bridge, bridgeSafe } from './core/bridge';
import { normalizeMedia, type ApiMedia } from './core/media';
import { currentRoute, type Route } from './core/router';
import { SEL, shortcodeInRoot } from './core/selectors';
import { getSettings } from './core/state';

type PageHealth = { relay: boolean; templates: string[] };

const check = (id: string, label: string, status: HealthCheck['status'], detail: string, affects?: string[]): HealthCheck => ({ id, label, status, detail, affects });

const DATA_FEATURES = ['Downloads', 'HD profile picture', 'Follow status badge', 'Story mentions & stickers'];

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

async function postData(route: Route, relay: boolean): Promise<HealthCheck> {
  const label = 'Post data';
  if (!relay) return check('media', label, 'skip', "Needs Instagram's page data (see above).");
  const code = visibleShortcode(route);
  if (!code) return check('media', label, 'skip', 'No post on this page. Open your feed or a post, then check again.');
  const raw = await bridgeSafe<ApiMedia | null>('getMedia', { code }, null);
  if (!raw) return check('media', label, 'warn', "A post on screen wasn't found in Instagram's page data. Downloads fall back to asking Instagram.", ['Downloads']);
  const items = normalizeMedia(raw).items;
  return items.length && items.every((it) => it.url)
    ? check('media', label, 'ok', `Read the media of a post on screen (${items.length} ${items.length === 1 ? 'file' : 'files'}).`)
    : check('media', label, 'fail', "Found a post but couldn't read its photo or video links.", ['Downloads', 'Zoom', 'Copy media URL']);
}

function feedLayout(route: Route): HealthCheck {
  const label = 'Post layout';
  if (route.kind !== 'home' && route.kind !== 'post') return check('feed', label, 'skip', 'Open your feed or a post to check this.');
  const articles = [...document.querySelectorAll(SEL.article)];
  if (!articles.length) {
    return document.querySelector(SEL.postLink)
      ? check('feed', label, 'fail', "Posts are on screen, but not where Glassgram looks for them.", ['Download toolbar', 'Hide ads', 'Exact timestamps'])
      : check('feed', label, 'skip', 'No posts loaded yet. Scroll a little, then check again.');
  }
  const withCode = articles.filter((a) => shortcodeInRoot(a)).length;
  const withTime = articles.filter((a) => a.querySelector(SEL.time)).length;
  if (!withCode) return check('feed', label, 'fail', "Found posts, but none links to itself the way Glassgram expects.", ['Download toolbar', 'Shortcuts']);
  if (!withTime) return check('feed', label, 'warn', 'Found posts without a date.', ['Exact timestamps']);
  return check('feed', label, 'ok', `Recognized ${withCode} of ${articles.length} ${articles.length === 1 ? 'post' : 'posts'} on screen.`);
}

function profileLayout(route: Route): HealthCheck {
  const label = 'Profile layout';
  if (route.kind !== 'profile') return check('profile', label, 'skip', 'Open a profile to check this.');
  const header = document.querySelector(SEL.profileHeader);
  if (!header) return check('profile', label, 'fail', "Couldn't find the profile header.", ['HD profile picture', 'Follow status badge', 'Bulk download profile posts']);
  return header.querySelector('img')
    ? check('profile', label, 'ok', 'Found the profile header and picture.')
    : check('profile', label, 'warn', 'Found the profile header, but no picture in it.', ['HD profile picture']);
}

function navigation(route: Route): HealthCheck {
  const label = 'Navigation';
  if (route.kind === 'stories' || route.kind === 'highlight') return check('nav', label, 'skip', 'Hidden while a story is open.');
  const missing = [
    !document.querySelector(SEL.reelsNav) && 'Reels',
    !document.querySelector(SEL.exploreNav) && 'Explore',
  ].filter(Boolean);
  return missing.length
    ? check('nav', label, 'warn', `Couldn't find the ${missing.join(' and ')} ${missing.length === 1 ? 'link' : 'links'} in the menu.`, ['Hide Reels tab', 'Hide Explore tab'])
    : check('nav', label, 'ok', 'Found the Reels and Explore links.');
}

function bulkFormat(page: PageHealth): HealthCheck {
  const label = 'Bulk download';
  if (!getSettings()['bulk.enabled']) return check('bulk', label, 'skip', 'Bulk download is off.');
  return page.templates.includes('PolarisProfilePostsQuery')
    ? check('bulk', label, 'ok', "Captured Instagram's profile request format.")
    : check('bulk', label, 'warn', "Hasn't seen Instagram load a profile grid in this tab yet. Open a profile and scroll its posts once.", ['Bulk download profile posts']);
}

async function rateLimit(): Promise<HealthCheck> {
  const left = await cooldownLeft();
  return left
    ? check('cooldown', 'Rate limit', 'warn', `Instagram rate-limited Glassgram. Its requests are paused for ${Math.ceil(left / 60000)} more min.`, ['Bulk download profile posts', 'Unfollowers checker'])
    : check('cooldown', 'Rate limit', 'ok', 'Not rate-limited.');
}

export async function runHealthCheck(): Promise<HealthReport> {
  const route = currentRoute();
  const checks: HealthCheck[] = [];

  checks.push(
    myUserId()
      ? check('session', 'Logged in', 'ok', 'Instagram session found.')
      : check('session', 'Logged in', 'fail', 'Not logged in to Instagram in this tab.', ['Most features']),
  );

  const page = await pageScript();
  checks.push(
    page
      ? check('page', 'Page script', 'ok', 'Connected.')
      : check('page', 'Page script', 'fail', 'Not answering. Reload the Instagram tab.', ['Downloads', 'Anonymous stories', 'DM tools', 'Clean links']),
  );

  const relay = !!page?.relay;
  checks.push(
    !page
      ? check('relay', "Instagram's page data", 'skip', 'Needs the page script.')
      : relay
        ? check('relay', "Instagram's page data", 'ok', 'Found and readable.')
        : check('relay', "Instagram's page data", 'fail', "Couldn't find it. Features fall back to asking Instagram, which is slower and more visible.", DATA_FEATURES),
  );

  checks.push(await postData(route, relay), feedLayout(route), profileLayout(route), navigation(route));
  if (page) checks.push(bulkFormat(page));
  checks.push(await rateLimit());

  return { version: chrome.runtime.getManifest().version, page: route.kind, at: Date.now(), checks };
}
