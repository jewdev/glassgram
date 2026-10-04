export type MediaType = 'image' | 'video';

export interface MediaItem {
  url: string;
  type: MediaType;
  width: number;
  height: number;
  ext: string;
  /** Seconds, videos only — used to match a playing <video> to its API item. */
  duration?: number;
  /** Media id (pk) of this item (carousel child or story item). */
  id: string;
}

/** Stickers & tags on a story item. */
export interface StoryExtras {
  mentions: { username: string; fullName: string; picUrl: string; hidden: boolean }[];
  hashtags: string[];
  locations: { name: string; id: string }[];
  links: { url: string; display: string; title: string }[];
  music: { title: string; artist: string }[];
  sharedPosts: { code: string; isReel: boolean }[];
}

/** A post, reel, or story item resolved from the API. */
export interface ResolvedPost {
  id: string;
  shortcode: string;
  username: string;
  takenAt: number; // unix seconds
  caption: string;
  items: MediaItem[];
  /** Stories only. */
  extras?: StoryExtras;
}

export interface DownloadJob {
  url: string;
  filename: string;
}
