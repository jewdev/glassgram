import { toast, copyText } from '../ui/toast';
import { openZoom } from '../ui/zoom';
import { getHdProfilePic } from './api';
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

export const showStoryDetails = (ctx: MediaContext) => withTarget(ctx, (t) => openStoryDetails(t.post));

/** True when the target has more than one item (carousel or story tray). */
export async function hasMultiple(ctx: MediaContext): Promise<boolean> {
  try {
    const t = await resolveTarget(ctx);
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
