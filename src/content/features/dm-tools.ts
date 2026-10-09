import { send, type DownloadResult } from '../../shared/messages';
import { inRootFolder } from '../core/download';
import { renderFilename } from '../core/filename';
import { onDomChange } from '../core/observer';
import { h, icon, ICONS } from '../ui/dom';
import { toast } from '../ui/toast';
import type { Feature } from './types';

// The MAIN-world script reads these attributes on every chat-socket send.
const ATTR_TYPING = 'data-ige-dmtyping';
const ATTR_SEEN = 'data-ige-dmseen';
const ATTR_VOICE = 'data-ige-voice';

/** Hide typing indicator / read receipts in DMs (experimental). */
export const dmPrivacy: Feature = {
  id: 'dm-privacy',
  isEnabled: (s) => s['privacy.dmHideTyping'] || s['privacy.dmHideSeen'],
  start() {
    return () => {
      document.documentElement.removeAttribute(ATTR_TYPING);
      document.documentElement.removeAttribute(ATTR_SEEN);
    };
  },
  onSettings(s) {
    const html = document.documentElement;
    for (const [attr, on] of [
      [ATTR_TYPING, s['privacy.dmHideTyping']],
      [ATTR_SEEN, s['privacy.dmHideSeen']],
    ] as const) {
      if (on) html.setAttribute(attr, '1');
      else html.removeAttribute(attr);
    }
  },
};

/** e.g. Glassgram/DMs/voice_2026-10-05_1628169548894483.m4a — same root folder as the filename template. */
function voiceFilename(attachmentId: string): string {
  const name = renderFilename('voice_{date}_{id}', { user: '', shortcode: '', index: 1, id: attachmentId || String(Date.now()), takenAt: Date.now() / 1000, type: 'audio' }, 'm4a');
  return inRootFolder(`DMs/${name}`);
}

const BTN_CLASS = 'ige-voice-dl';

async function downloadVoice(bubble: Element) {
  const url = bubble.getAttribute('data-ige-voice-url');
  if (!url) return;
  const res = await send<DownloadResult>({ type: 'download', jobs: [{ url, filename: voiceFilename(bubble.getAttribute('data-ige-voice-id') ?? '') }] });
  toast(res?.ok ? 'Downloading voice message' : 'Download failed', res?.ok ? 'success' : 'error');
}

/** Download voice messages: a download button on every voice message bubble, no need to play it. */
export const voiceDownload: Feature = {
  id: 'voice-download',
  isEnabled: (s) => s['dm.voiceDownload'],
  start() {
    document.documentElement.setAttribute(ATTR_VOICE, '1');

    // The MAIN-world script tags bubbles with data-ige-voice-url (from Instagram's own message data).
    const off = onDomChange(() => {
      for (const bubble of document.querySelectorAll('[data-ige-voice-url]:not([data-ige-vbtn])')) {
        bubble.setAttribute('data-ige-vbtn', '');
        const btn = h('button', {
          class: `ige-root ${BTN_CLASS}`,
          type: 'button',
          title: 'Download voice message',
          'aria-label': 'Download voice message',
          html: icon(ICONS.download, 16),
          onClick: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            downloadVoice(bubble);
          },
        });
        bubble.insertAdjacentElement('afterend', btn);
      }
    });

    return () => {
      off();
      document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
      document.querySelectorAll('[data-ige-vbtn]').forEach((b) => b.removeAttribute('data-ige-vbtn'));
      document.documentElement.removeAttribute(ATTR_VOICE);
    };
  },
};
