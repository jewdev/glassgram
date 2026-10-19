import { send, type DownloadResult } from '../../shared/messages';
import { onFound, requestScan } from '../core/bridge';
import { inRootFolder } from '../core/download';
import { renderFilename } from '../core/filename';
import { onDomChange } from '../core/observer';
import { h, icon, ICONS, shadowHost } from '../ui/dom';
import { toast } from '../ui/toast';
import type { Feature } from './types';

// Hiding the typing indicator and read receipts happens entirely in the page script, which gets
// those settings over the bridge (see content/index.ts).

/** e.g. Glassgram/DMs/voice_2026-10-05_1628169548894483.m4a — same root folder as the filename template. */
function voiceFilename(attachmentId: string): string {
  const name = renderFilename('voice_{date}_{id}', { user: '', shortcode: '', index: 1, id: attachmentId || String(Date.now()), takenAt: Date.now() / 1000, type: 'audio' }, 'm4a');
  return inRootFolder(`DMs/${name}`);
}

/** The host is the flex item next to Instagram's voice bubble. */
const BTN_HOST_CSS = ':host { display: grid; flex: none; align-self: center; }';

async function downloadVoice(voice: { url: string; id: string }) {
  const res = await send<DownloadResult>({ type: 'download', jobs: [{ url: voice.url, filename: voiceFilename(voice.id) }] });
  toast(res?.ok ? 'Downloading voice message' : 'Download failed', res?.ok ? 'success' : 'error');
}

/** Download voice messages: a download button on every voice message bubble, no need to play it. */
export const voiceDownload: Feature = {
  id: 'voice-download',
  isEnabled: (s) => s['dm.voiceDownload'],
  start() {
    /** Voice bubble → our button next to it. */
    const buttons = new Map<Element, HTMLElement>();

    // The page script points at each bubble with its URL (from Instagram's own message data).
    const offFound = onFound('voice', (bubble, voice) => {
      if (buttons.get(bubble)?.isConnected) return;
      const btn = h('button', {
        class: 'ige-root ige-voice-dl',
        type: 'button',
        title: 'Download voice message',
        'aria-label': 'Download voice message',
        html: icon(ICONS.download, 16),
        onClick: (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          downloadVoice(voice);
        },
      });
      const host = shadowHost('span', btn, BTN_HOST_CSS);
      buttons.set(bubble, host);
      bubble.insertAdjacentElement('afterend', host);
    });
    const offDom = onDomChange(() => {
      for (const [bubble, host] of buttons) if (!bubble.isConnected) (buttons.delete(bubble), host.remove());
      if (location.pathname.startsWith('/direct/')) requestScan();
    });

    return () => {
      offFound();
      offDom();
      buttons.forEach((host) => host.remove());
      buttons.clear();
    };
  },
};
