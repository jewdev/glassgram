import { toast, copyText } from '../ui/toast';
import { openZoom } from '../ui/zoom';
import { getHdProfilePic, getReelItems } from './api';
import { dispatch, downloadPost, jobsForPost, profilePicFilename } from './download';
import { extFromUrl } from './media';
import { resolveTarget, type MediaContext } from './resolve';
import { openStoryDetails } from '../features/story-details';

function fail(e: unknown) {
  console.debug('[IGE]', e);
  toast((e as Error).message || 'Something went wrong', 'error', 5000);
}

async function withTarget<T>(ctx: MediaContext, fn: (t: Awaited<ReturnType<typeof resolveTarget>>) => Promise<T> | T) {
  try {
    return await fn(await resolveTarget(ctx));
  } catch (e) {
    fail(e);
  }
}

export const downloadCurrent = (ctx: MediaContext) => withTarget(ctx, (t) => downloadPost(t.post, [t.index]));

export const downloadAll = (ctx: MediaContext) =>
  withTarget(ctx, (t) => {
    if (t.tray) {
      const jobs = t.tray.flatMap((p) => jobsForPost(p, [0]));
      return dispatch(jobs, `${t.post.username}_stories`);
    }
    return downloadPost(t.post);
  });

export const copyMediaUrl = (ctx: MediaContext) => withTarget(ctx, (t) => copyText(t.post.items[t.index].url, 'Media URL copied'));

export const copyCaption = (ctx: MediaContext) =>
  withTarget(ctx, async (t) => {
    if (t.post.caption) await copyText(t.post.caption, 'Caption copied');
    else toast('This post has no caption');
  });

export const zoomMedia = (ctx: MediaContext) =>
  withTarget(ctx, (t) => {
    const item = t.post.items[t.index];
    if (item.type !== 'image') return toast('Only photos can be zoomed');
    const n = t.post.items.length;
    openZoom({
      src: item.url,
      caption: `@${t.post.username}${n > 1 ? ` · ${t.index + 1}/${n}` : ''}`,
      onDownload: () => downloadCurrent(ctx),
      onCopy: () => copyText(item.url, 'Image URL copied'),
    });
  });

export const showStoryDetails = (ctx: MediaContext) =>
  withTarget(ctx, async (t) => {
    let post = t.post;
    // Instagram's page data has no pictures of the mentioned accounts; this click may ask for them.
    if (ctx.kind === 'story' && post.extras?.mentions.some((m) => !m.picUrl)) {
      try {
        const tray = await getReelItems(await ctx.reelId(), false, true);
        post = tray.find((p) => p.id === post.id) ?? post;
      } catch {
        /* show it without the pictures */
      }
    }
    openStoryDetails(post);
  });

/** True when the target has more than one item (carousel or story tray). `offline`: see api.ts. */
export async function hasMultiple(ctx: MediaContext, offline = false): Promise<boolean> {
  try {
    const t = await resolveTarget(ctx, offline);
    return (t.tray?.length ?? t.post.items.length) > 1;
  } catch {
    return false;
  }
}

// ---------- profile picture ----------
export async function zoomAvatar(username: string) {
  try {
    const pic = await getHdProfilePic(username);
    openZoom({
      src: pic.url,
      caption: `@${username}`,
      onDownload: () => downloadAvatar(username),
      onCopy: () => copyText(pic.url, 'Image URL copied'),
    });
  } catch (e) {
    fail(e);
  }
}

export async function downloadAvatar(username: string) {
  try {
    const pic = await getHdProfilePic(username);
    await dispatch([{ url: pic.url, filename: profilePicFilename(username, pic.userId, extFromUrl(pic.url, 'jpg')) }], `${username}_profile`);
  } catch (e) {
    fail(e);
  }
}

export async function copyAvatarUrl(username: string) {
  try {
    await copyText((await getHdProfilePic(username)).url, 'Image URL copied');
  } catch (e) {
    fail(e);
  }
}
