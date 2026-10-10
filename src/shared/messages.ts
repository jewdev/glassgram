import type { DownloadJob } from './types';

export type Message =
  | { type: 'download'; jobs: DownloadJob[] }
  | { type: 'zip'; jobs: DownloadJob[]; zipName: string }
  | { type: 'openUnfollowers' }
  | { type: 'openUnsent' }
  | { type: 'contextDownload' }
  | { type: 'zipProgress'; done: number; total: number; jobId?: string }
  | { type: 'checkUpdates' }
  // background <-> offscreen
  | { type: 'offscreen:zip'; jobs: DownloadJob[]; jobId: string; target: 'offscreen' }
  | { type: 'offscreen:revoke'; url: string; target: 'offscreen' };

export type DownloadResult = { ok: true; count: number } | { ok: false; error: string };

export function send<R = unknown>(msg: Message): Promise<R> {
  return chrome.runtime.sendMessage(msg) as Promise<R>;
}
