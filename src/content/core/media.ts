import type { MediaItem, ResolvedPost } from '../../shared/types';

interface Candidate {
  url: string;
  width?: number;
  height?: number;
}

/** Subset of the private web API media object we rely on. */
export interface ApiMedia {
  pk?: string | number;
  id?: string;
  code?: string;
  media_type?: number; // 1 image, 2 video, 8 carousel
  taken_at?: number;
  video_duration?: number;
  user?: { username?: string };
  owner?: { username?: string };
  caption?: { text?: string } | null;
  image_versions2?: { candidates?: Candidate[] };
  video_versions?: Candidate[];
  carousel_media?: ApiMedia[];
}

export function pickBest<T extends Candidate>(candidates: T[] | undefined): T | undefined {
  if (!candidates?.length) return undefined;
  return candidates.reduce((best, c) => ((c.width ?? 0) * (c.height ?? 0) > (best.width ?? 0) * (best.height ?? 0) ? c : best));
}

export function extFromUrl(url: string, fallback: string): string {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|heic|mp4|m4v|mov)$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* not a URL */
  }
  return fallback;
}

function single(m: ApiMedia): MediaItem | undefined {
  const id = String(m.pk ?? m.id ?? '').split('_')[0];
  const video = m.media_type === 2 || m.video_versions?.length ? pickBest(m.video_versions) : undefined;
  if (video) {
    return { url: video.url, type: 'video', width: video.width ?? 0, height: video.height ?? 0, ext: extFromUrl(video.url, 'mp4'), id, duration: m.video_duration };
  }
  const img = pickBest(m.image_versions2?.candidates);
  if (!img) return undefined;
  return { url: img.url, type: 'image', width: img.width ?? 0, height: img.height ?? 0, ext: extFromUrl(img.url, 'jpg'), id };
}

export function normalizeMedia(m: ApiMedia): ResolvedPost {
  const children = m.carousel_media?.length ? m.carousel_media : [m];
  return {
    id: String(m.pk ?? m.id ?? '').split('_')[0],
    shortcode: m.code ?? '',
    username: m.user?.username ?? m.owner?.username ?? 'unknown',
    takenAt: m.taken_at ?? 0,
    caption: m.caption?.text ?? '',
    items: children.map(single).filter((x): x is MediaItem => !!x),
  };
}

/** CDN file name (last path segment) — stable across size variants, used to match DOM <img> to API items. */
export function cdnFileKey(url: string): string {
  try {
    const last = new URL(url, location.href).pathname.split('/').pop() ?? '';
    return last.replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return '';
  }
}
