import { onHover } from '../core/hover';
import { currentRoute } from '../core/router';
import { getSettings } from '../core/state';
import { h, icon, ICONS, uiLayer } from '../ui/dom';
import type { Feature } from './types';

const VOLUME_KEY = 'video.volume';
const MUTED_KEY = 'video.muted';
const SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '3'];
/** Instagram re-mutes a video shortly after it starts; undo that within this window. */
const ENFORCE_MS = 1500;

/** Last audible level (never 0), so unmuting goes back to it. */
let savedVolume: number | undefined;
/** Whether the user left videos muted (volume button or slider at 0). Unset until they choose. */
let savedMuted: boolean | undefined;
const playedAt = new WeakMap<HTMLVideoElement, number>();
/** Videos whose speed the user changed manually — don't override them on play. */
const manualSpeed = new WeakSet<HTMLVideoElement>();
const manualLoop = new WeakSet<HTMLVideoElement>();

function fmt(t: number) {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Stories advance when their video ends, so a looping story video would replay forever. */
function onStoryRoute() {
  const k = currentRoute().kind;
  return k === 'stories' || k === 'highlight';
}

function applyDefaults(v: HTMLVideoElement) {
  const s = getSettings();
  if (!manualSpeed.has(v)) v.playbackRate = Number(s['video.speed']) || 1;
  if (!manualLoop.has(v)) v.loop = onStoryRoute() ? false : s['video.loop'];
  if (s['video.rememberVolume']) applyVolume(v);
}

function applyVolume(v: HTMLVideoElement) {
  if (savedVolume !== undefined && Math.abs(v.volume - savedVolume) > 0.01) v.volume = savedVolume;
  if (savedMuted === undefined || v.muted === savedMuted) return;
  // Browsers pause a video unmuted before the user has interacted with the page; leave it muted then.
  if (!savedMuted && !navigator.userActivation?.hasBeenActive) return;
  v.muted = savedMuted;
}

export const videoControls: Feature = {
  id: 'video-controls',
  isEnabled: (s) => s['video.enabled'],
  start() {
    // Videos already on the page played before the saved volume loaded, so apply it once it arrives.
    chrome.storage.local.get([VOLUME_KEY, MUTED_KEY]).then((r) => {
      savedVolume = r[VOLUME_KEY] as number | undefined;
      savedMuted = r[MUTED_KEY] as boolean | undefined;
      document.querySelectorAll('video').forEach(applyDefaults);
    });
    // Keep other tabs in step with the volume picked here.
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (VOLUME_KEY in changes) savedVolume = changes[VOLUME_KEY].newValue as number | undefined;
      if (MUTED_KEY in changes) savedMuted = changes[MUTED_KEY].newValue as boolean | undefined;
    };
    chrome.storage.onChanged.addListener(onStorage);

    const onPlay = (e: Event) => {
      if (!(e.target instanceof HTMLVideoElement)) return;
      playedAt.set(e.target, performance.now());
      applyDefaults(e.target);
    };
    document.addEventListener('play', onPlay, true);
    // Instagram sets its own mute state right after a video starts; put the remembered one back.
    const onVolume = (e: Event) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !getSettings()['video.rememberVolume']) return;
      if (performance.now() - (playedAt.get(v) ?? -Infinity) < ENFORCE_MS) applyVolume(v);
    };
    document.addEventListener('volumechange', onVolume, true);
    document.querySelectorAll('video').forEach(applyDefaults);

    let video: HTMLVideoElement | null = null;
    let seeking = false;

    const playBtn = h('button', { class: 'ige-btn ige-btn--sm', type: 'button', title: 'Play / pause' });
    const time = h('span', { class: 'ige-vbar__time' }, '0:00 / 0:00');
    const seek = h('input', { class: 'ige-range ige-vbar__seek', type: 'range', min: '0', max: '1000', value: '0', step: '1', 'aria-label': 'Seek' });
    const speed = h(
      'select',
      { class: 'ige-vbar__speed', title: 'Playback speed', 'aria-label': 'Playback speed' },
      ...SPEEDS.map((v) => h('option', { value: v }, `${v}×`)),
    );
    const muteBtn = h('button', { class: 'ige-btn ige-btn--sm', type: 'button', title: 'Mute / unmute' });
    const vol = h('input', { class: 'ige-range ige-vbar__vol', type: 'range', min: '0', max: '1', step: '0.05', value: '1', 'aria-label': 'Volume' });
    const loopBtn = h('button', { class: 'ige-btn ige-btn--sm', type: 'button', title: 'Loop', html: icon(ICONS.loop, 16) });

    const bar = h('div', { class: 'ige-vbar' }, playBtn, time, seek, speed, muteBtn, vol, loopBtn);
    uiLayer().append(bar);

    const render = () => {
      if (!video) return;
      playBtn.innerHTML = icon(video.paused ? ICONS.play : ICONS.pause, 16);
      muteBtn.innerHTML = icon(video.muted || video.volume === 0 ? ICONS.mute : ICONS.volume, 16);
      if (!seeking) seek.value = String(video.duration ? Math.round((video.currentTime / video.duration) * 1000) : 0);
      time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
      vol.value = String(video.muted ? 0 : video.volume);
      const rate = String(video.playbackRate);
      if (!SPEEDS.includes(rate)) speed.append(h('option', { value: rate }, `${rate}×`));
      speed.value = rate;
      loopBtn.classList.toggle('is-active', video.loop);
    };

    const events = ['timeupdate', 'play', 'pause', 'volumechange', 'ratechange', 'durationchange', 'loadedmetadata'];
    const bind = (v: HTMLVideoElement | null) => {
      if (v === video) return;
      events.forEach((ev) => video?.removeEventListener(ev, render));
      video = v;
      events.forEach((ev) => video?.addEventListener(ev, render));
      render();
    };

    const stop = (e: Event) => e.stopPropagation();
    bar.addEventListener('click', stop);
    bar.addEventListener('mousedown', stop);
    bar.addEventListener('keydown', stop);

    playBtn.addEventListener('click', () => video && (video.paused ? video.play().catch(() => {}) : video.pause()));
    seek.addEventListener('input', () => {
      seeking = true;
      if (video?.duration) video.currentTime = (Number(seek.value) / 1000) * video.duration;
    });
    seek.addEventListener('change', () => (seeking = false));
    speed.addEventListener('change', () => {
      if (!video) return;
      manualSpeed.add(video);
      video.playbackRate = Number(speed.value);
    });
    const saveVolume = (muted: boolean, level?: number) => {
      savedMuted = muted;
      if (level !== undefined) savedVolume = level;
      if (!getSettings()['video.rememberVolume']) return;
      const items: Record<string, unknown> = { [MUTED_KEY]: muted };
      if (level !== undefined) items[VOLUME_KEY] = level;
      chrome.storage.local.set(items);
    };
    muteBtn.addEventListener('click', () => {
      if (!video) return;
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = savedVolume || 0.5;
      saveVolume(video.muted);
    });
    vol.addEventListener('input', () => {
      if (!video) return;
      video.volume = Number(vol.value);
      video.muted = video.volume === 0;
      // 0 is remembered as "muted"; the level stays at the last audible one so unmuting restores it.
      saveVolume(video.muted, video.muted ? undefined : video.volume);
    });
    loopBtn.addEventListener('click', () => {
      if (!video) return;
      manualLoop.add(video);
      video.loop = !video.loop;
      render();
    });

    const off = onHover((hv) => {
      if (!hv || !(hv.el instanceof HTMLVideoElement)) {
        bar.classList.remove('is-visible');
        return;
      }
      bind(hv.el);
      const r = hv.rect;
      const bottom = Math.min(innerHeight, r.bottom);
      bar.style.left = `${Math.max(0, r.left) + 8}px`;
      bar.style.width = `${Math.min(r.right, innerWidth) - Math.max(0, r.left) - 16}px`;
      bar.style.top = `${bottom - 44}px`;
      bar.classList.toggle('is-visible', bottom - Math.max(0, r.top) > 120);
    });

    return () => {
      off();
      bind(null);
      chrome.storage.onChanged.removeListener(onStorage);
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('volumechange', onVolume, true);
      bar.remove();
    };
  },
  onSettings() {
    document.querySelectorAll('video').forEach(applyDefaults);
  },
};
