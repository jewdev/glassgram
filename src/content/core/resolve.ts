import type { MediaItem, ResolvedPost } from '../../shared/types';
import { getPostByShortcode, getReelItems, getUserId } from './api';
import type { MediaEl } from './hover';
import { cdnFileKey } from './media';
import { currentRoute } from './router';
import { SEL, shortcodeFromHref, shortcodeInRoot } from './selectors';

export type MediaContext =
  | { kind: 'post'; el: MediaEl; shortcode: string }
  | { kind: 'story'; el: MediaEl; reelId: () => Promise<string>; storyId?: string }
  | { kind: 'avatar'; el: MediaEl; username: string };

export interface Target {
  post: ResolvedPost;
  index: number;
  /** Story tray items (for "download all" on stories). */
  tray?: ResolvedPost[];
}

export function contextFor(el: MediaEl): MediaContext | null {
  const route = currentRoute();

  if (route.kind === 'stories' && route.username) {
    const username = route.username;
    return { kind: 'story', el, reelId: () => getUserId(username), storyId: route.storyId };
  }
  if (route.kind === 'highlight' && route.highlightId) {
    const id = `highlight:${route.highlightId}`;
    return { kind: 'story', el, reelId: async () => id };
  }

  if (route.kind === 'profile' && route.username && el instanceof HTMLImageElement && el.closest('header') && !el.closest(SEL.dialog)) {
    return { kind: 'avatar', el, username: route.username };
  }

  // Grid thumbnails (profile, explore, tagged): the image sits inside the post link.
  const link = shortcodeFromHref(el.closest('a')?.getAttribute('href'));
  if (link) return { kind: 'post', el, shortcode: link };

  // Post modal / post page / reel page: the URL is authoritative.
  const inDialog = !!el.closest(SEL.dialog);
  if ((route.kind === 'post' || route.kind === 'reel') && route.shortcode && (inDialog || !el.closest(SEL.article) || !document.querySelector(SEL.dialog))) {
    return { kind: 'post', el, shortcode: route.shortcode };
  }

  const article = el.closest(SEL.article);
  const fromArticle = article && shortcodeInRoot(article);
  if (fromArticle) return { kind: 'post', el, shortcode: fromArticle };

  if (route.shortcode) return { kind: 'post', el, shortcode: route.shortcode };
  return null;
}

/** Index of the item in `items` currently shown by `el`, or -1. */
export function matchIndex(items: MediaItem[], el: MediaEl): number {
  if (el instanceof HTMLImageElement) {
    const key = cdnFileKey(el.currentSrc || el.src);
    return key ? items.findIndex((it) => cdnFileKey(it.url) === key) : -1;
  }
  const src = el.currentSrc || el.src;
  if (src && !src.startsWith('blob:')) {
    const key = cdnFileKey(src);
    const i = items.findIndex((it) => it.type === 'video' && cdnFileKey(it.url) === key);
    if (i >= 0) return i;
  }
  const videos = items.map((it, i) => ({ it, i })).filter((x) => x.it.type === 'video');
  if (videos.length === 1) return videos[0].i;
  if (Number.isFinite(el.duration) && el.duration > 0) {
    let best = -1;
    let bestDiff = 1.5;
    for (const { it, i } of videos) {
      const diff = Math.abs((it.duration ?? -99) - el.duration);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (best >= 0) return best;
  }
  return videos[0]?.i ?? -1;
}

export async function resolveTarget(ctx: MediaContext): Promise<Target> {
  if (ctx.kind === 'post') {
    const post = await getPostByShortcode(ctx.shortcode);
    return { post, index: Math.max(0, matchIndex(post.items, ctx.el)) };
  }
  if (ctx.kind === 'story') {
    const tray = await getReelItems(await ctx.reelId());
    if (!tray.length) throw new Error('No stories found');
    let i = ctx.storyId ? tray.findIndex((p) => p.id === ctx.storyId) : -1;
    if (i < 0) {
      const flat = tray.map((p) => p.items[0]).filter(Boolean);
      i = matchIndex(flat, ctx.el);
    }
    return { post: tray[Math.max(0, i)], index: 0, tray };
  }
  throw new Error('Avatar targets are handled by the profile picture feature');
}
