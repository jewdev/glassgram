import type { DownloadJob } from './types';

export type Message =
  | { type: 'download'; jobs: DownloadJob[] }
  | { type: 'zip'; jobs: DownloadJob[]; zipName: string }
  /** Save a video's sound as MP3: `job.url` is the video, `job.filename` ends in .mp3. */
  | { type: 'mp3'; job: DownloadJob }
  | { type: 'openUnfollowers' }
  | { type: 'openUnsent' }
  | { type: 'contextDownload' }
  | { type: 'zipProgress'; done: number; total: number; jobId?: string }
  | { type: 'checkUpdates' }
  /** Popup → background: bring up an Instagram tab (opening one if needed) and show this panel in it. */
  | { type: 'openOnInstagram'; panel: 'openUnfollowers' | 'openUnsent' }
  /** Settings page → content script: run the health check in this tab (replies with a HealthReport). */
  | { type: 'healthCheck' }
  /** Settings page → background: is the service worker answering? */
  | { type: 'ping' }
  /** Stop the ZIPs this tab started. */
  | { type: 'cancelZip' }
  // background <-> offscreen
  | { type: 'offscreen:zip'; jobs: DownloadJob[]; jobId: string; target: 'offscreen' }
  | { type: 'offscreen:mp3'; url: string; jobId: string; target: 'offscreen' }
  | { type: 'offscreen:cancel'; jobId: string; target: 'offscreen' }
  | { type: 'offscreen:revoke'; url: string; target: 'offscreen' };

export type DownloadResult = { ok: true; count: number } | { ok: false; error: string };

export function send<R = unknown>(msg: Message): Promise<R> {
  return chrome.runtime.sendMessage(msg) as Promise<R>;
}
