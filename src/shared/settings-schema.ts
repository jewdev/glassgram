// Single source of truth for every user-facing setting.
// The options page and popup are generated from SECTIONS, so adding a feature
// means: add a default here, add a schema entry below, read it in the feature.

export const DEFAULTS = {
  // Appearance of the extension's own pages (settings, popup)
  'ui.theme': 'system' as 'system' | 'light' | 'dark',

  // Media downloads
  'download.enabled': true,
  'download.showAll': true,
  'download.copyUrl': true,
  'download.copyCaption': true,
  'download.filename': 'Instagram/{user}/{user}_{date}_{shortcode}_{index}',
  'download.mode': 'zip' as 'folder' | 'zip',
  'download.saveAs': false,

  // Stories
  'stories.download': true,
  'stories.mentions': true,

  // Profile
  'profile.hdPic': true,
  'profile.followBadge': true,
  'bulk.enabled': false,
  'bulk.delayMin': 1.5,
  'bulk.delayMax': 3.5,

  // Feed
  'feed.followingOnly': false,
  'feed.noDoubleTapLike': true,

  // Video
  'video.enabled': true,
  'video.noAutoplay': false,
  'video.speed': '1',
  'video.rememberVolume': true,
  'video.loop': true,

  // Declutter
  'declutter.ads': true,
  'declutter.suggested': false,
  'declutter.sidebarSuggestions': false,
  'declutter.reelsTab': false,
  'declutter.exploreTab': false,
  'declutter.threads': true,
  'declutter.storiesTray': false,

  // Shortcuts
  'shortcuts.enabled': true,
  'shortcuts.download': 'd',
  'shortcuts.downloadAll': 'shift+d',
  'shortcuts.zoom': 'z',
  'shortcuts.copyUrl': 'shift+c',

  // Info extras
  'info.timestamps': true,
  'info.timestampFormat': 'datetime' as 'datetime' | 'datetime24' | 'date',
  'info.contextMenu': true,
  'info.copyComment': true,

  // Links
  'links.clean': true,
  'links.shareDomain': '',
  'links.direct': true,

  // Privacy
  'privacy.anonStories': false,
  'privacy.blockAnalytics': true,

  // Direct messages
  'dm.voiceDownload': true,
  'privacy.dmHideTyping': false,
  'privacy.dmHideSeen': false,

  // Account tools
  'account.unfollowers': false,
  'account.delayMin': 2,
  'account.delayMax': 4,
};

export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;

type Base<K extends SettingKey> = {
  key: K;
  label: string;
  desc?: string;
  /** Sub-option: shown under this toggle and only active while it is on. */
  dependsOn?: SettingKey;
  /** Shown in the popup as a quick toggle. */
  quick?: boolean;
  /** Status the user should know before turning it on. */
  badge?: 'experimental' | 'untested' | 'risky';
};

export type SettingDef =
  | (Base<SettingKey> & { type: 'toggle'; warning?: string })
  | (Base<SettingKey> & { type: 'select'; options: { value: string; label: string }[] })
  | (Base<SettingKey> & { type: 'text'; placeholder?: string; help?: string })
  | (Base<SettingKey> & { type: 'number'; min: number; max: number; step: number; unit?: string })
  | (Base<SettingKey> & { type: 'shortcut' });

/** Icon names map to SVG paths in the options page. */
export type SectionIcon = 'download' | 'eye' | 'feed' | 'play' | 'message' | 'link' | 'keyboard' | 'shield' | 'tools';

export interface Section {
  id: string;
  title: string;
  icon: SectionIcon;
  /** Everyday features vs. power tools (risky, experimental, account-level). */
  half: 'everyday' | 'power';
  intro?: string;
  items: SettingDef[];
}

export const SECTIONS: Section[] = [
  // ───────────── Everyday ─────────────
  {
    id: 'downloads',
    title: 'Downloads',
    icon: 'download',
    half: 'everyday',
    intro: 'Hover any post, reel or story to get download actions.',
    items: [
      { type: 'toggle', key: 'download.enabled', label: 'Download toolbar on posts & reels', desc: 'A small toolbar appears when you hover photos and videos.', quick: true },
      { type: 'toggle', key: 'download.showAll', label: '"Download all" for carousels', dependsOn: 'download.enabled' },
      { type: 'toggle', key: 'download.copyUrl', label: '"Copy media URL" button', dependsOn: 'download.enabled' },
      { type: 'toggle', key: 'download.copyCaption', label: '"Copy caption" button', dependsOn: 'download.enabled' },
      { type: 'toggle', key: 'stories.download', label: 'Download stories & highlights', desc: 'The current story or the whole tray, from the story viewer.', quick: true },
      { type: 'toggle', key: 'info.contextMenu', label: 'Right-click "Download Instagram media"', desc: 'Adds an entry to the browser\'s context menu on instagram.com.' },
      {
        type: 'text',
        key: 'download.filename',
        label: 'Filename template',
        placeholder: DEFAULTS['download.filename'],
        help: 'Tokens: {user} {shortcode} {index} {id} {date} {time} {type}. Use / for folders inside Downloads. The extension is added automatically.',
      },
      {
        type: 'select',
        key: 'download.mode',
        label: 'Saving several files',
        desc: 'For carousels, story trays and bulk downloads.',
        options: [
          { value: 'zip', label: 'One ZIP file' },
          { value: 'folder', label: 'Separate files' },
        ],
      },
      { type: 'toggle', key: 'download.saveAs', label: 'Ask where to save each file', desc: 'Opens the "Save as" dialog for single downloads.' },
    ],
  },
  {
    id: 'viewing',
    title: 'Profiles & stories',
    icon: 'eye',
    half: 'everyday',
    items: [
      { type: 'toggle', key: 'profile.hdPic', label: 'HD profile picture', desc: 'Hover a profile picture to zoom it full size, download it or copy its URL.', quick: true },
      {
        type: 'toggle',
        key: 'profile.followBadge',
        label: 'Follow status badge',
        desc: `Shows "Follows you", "Doesn't follow you" or "Follow each other" next to the username.`,
        quick: true,
      },
      {
        type: 'toggle',
        key: 'stories.mentions',
        label: 'Story mentions & stickers',
        desc: 'Lists who is mentioned in a story, including hidden mentions, plus hashtags, location, links and music.',
      },
      { type: 'toggle', key: 'info.timestamps', label: 'Exact timestamps', desc: 'Replaces "3d" with the real date. Hover for the original.' },
      {
        type: 'select',
        key: 'info.timestampFormat',
        label: 'Timestamp format',
        dependsOn: 'info.timestamps',
        options: [
          { value: 'datetime', label: 'Date and time (12h)' },
          { value: 'datetime24', label: 'Date and time (24h)' },
          { value: 'date', label: 'Date only' },
        ],
      },
      { type: 'toggle', key: 'info.copyComment', label: 'Copy comment button', desc: 'A "Copy" item next to "Reply" under every comment.' },
    ],
  },
  {
    id: 'feed',
    title: 'Feed',
    icon: 'feed',
    half: 'everyday',
    items: [
      {
        type: 'toggle',
        key: 'feed.followingOnly',
        label: 'Following-only feed',
        desc: 'Home always opens the chronological feed of accounts you follow.',
        quick: true,
      },
      { type: 'toggle', key: 'declutter.ads', label: 'Hide sponsored posts', quick: true },
      { type: 'toggle', key: 'declutter.suggested', label: 'Hide suggested posts & reels' },
      { type: 'toggle', key: 'declutter.sidebarSuggestions', label: 'Hide suggested accounts sidebar' },
      { type: 'toggle', key: 'declutter.storiesTray', label: 'Hide stories tray on Home' },
      { type: 'toggle', key: 'declutter.reelsTab', label: 'Hide Reels tab' },
      { type: 'toggle', key: 'declutter.exploreTab', label: 'Hide Explore tab' },
      { type: 'toggle', key: 'declutter.threads', label: 'Hide Threads banners & links' },
      { type: 'toggle', key: 'feed.noDoubleTapLike', label: 'Disable double-click like', desc: 'Double-clicking a photo or video no longer likes it.' },
    ],
  },
  {
    id: 'video',
    title: 'Video',
    icon: 'play',
    half: 'everyday',
    items: [
      { type: 'toggle', key: 'video.enabled', label: 'Video control bar', desc: 'Seek bar, speed, volume and loop when you hover a video.', quick: true },
      {
        type: 'select',
        key: 'video.speed',
        label: 'Default speed',
        dependsOn: 'video.enabled',
        options: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '3'].map((v) => ({ value: v, label: `${v}×` })),
      },
      { type: 'toggle', key: 'video.rememberVolume', label: 'Remember volume', dependsOn: 'video.enabled' },
      { type: 'toggle', key: 'video.loop', label: 'Loop videos', dependsOn: 'video.enabled' },
      { type: 'toggle', key: 'video.noAutoplay', label: 'Disable autoplay', desc: "Videos wait until you click them. Stories still play." },
    ],
  },
  {
    id: 'messages',
    title: 'Messages',
    icon: 'message',
    half: 'everyday',
    items: [{ type: 'toggle', key: 'dm.voiceDownload', label: 'Download voice messages', desc: 'A download button on every voice message in your chats.' }],
  },
  {
    id: 'links',
    title: 'Links',
    icon: 'link',
    half: 'everyday',
    items: [
      { type: 'toggle', key: 'links.clean', label: 'Clean share links', desc: '"Copy link" gives you the link without utm_source, stkn or igsh tracking.' },
      {
        type: 'text',
        key: 'links.shareDomain',
        label: 'Share domain',
        placeholder: 'instagram.com',
        help: 'Optional. Replace instagram.com in copied links, e.g. kkinstagram.com for previews in Discord or Telegram.',
        dependsOn: 'links.clean',
      },
      { type: 'toggle', key: 'links.direct', label: 'Open links directly', desc: "Outbound links skip Instagram's l.instagram.com redirect page." },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    icon: 'keyboard',
    half: 'everyday',
    intro: 'Act on the media under your mouse, or the most visible post. Ignored while you type.',
    items: [
      { type: 'toggle', key: 'shortcuts.enabled', label: 'Keyboard shortcuts', quick: true },
      { type: 'shortcut', key: 'shortcuts.download', label: 'Download current media', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.downloadAll', label: 'Download all', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.zoom', label: 'Zoom profile picture', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.copyUrl', label: 'Copy media URL', dependsOn: 'shortcuts.enabled' },
    ],
  },

  // ───────────── Power tools ─────────────
  {
    id: 'privacy',
    title: 'Privacy',
    icon: 'shield',
    half: 'power',
    items: [
      {
        type: 'toggle',
        key: 'privacy.anonStories',
        label: 'Anonymous story viewing',
        desc: "Blocks the \"seen\" request, so you don't appear in a story's viewer list.",
        quick: true,
      },
      {
        type: 'toggle',
        key: 'privacy.dmHideTyping',
        label: 'Hide typing indicator',
        desc: 'The other person won\'t see "typing…" while you write.',
        badge: 'experimental',
        warning: 'Experimental. Check with a friend before relying on it.',
      },
      {
        type: 'toggle',
        key: 'privacy.dmHideSeen',
        label: 'Hide "Seen" in messages',
        desc: "Opening a chat doesn't mark it as read for the other person. Sending still works.",
        badge: 'untested',
        warning: "Not tested yet: this hasn't been confirmed to work. Check with a friend before relying on it.",
      },
      {
        type: 'toggle',
        key: 'privacy.blockAnalytics',
        label: 'Block analytics',
        desc: "Blocks Instagram's event-logging requests. Some analytics travel over its live connection and can't be blocked.",
      },
    ],
  },
  {
    id: 'account',
    title: 'Account tools',
    icon: 'tools',
    half: 'power',
    intro: 'These read a lot of data from Instagram. Heavy use can get your account temporarily rate-limited.',
    items: [
      {
        type: 'toggle',
        key: 'bulk.enabled',
        label: 'Bulk download profile posts',
        desc: 'A button on profiles that downloads the latest posts.',
        badge: 'risky',
        warning: 'Many requests in a short time can get your account temporarily rate-limited. Keep the delays reasonable.',
      },
      { type: 'number', key: 'bulk.delayMin', label: 'Shortest wait between requests', min: 0.5, max: 30, step: 0.5, unit: 's', dependsOn: 'bulk.enabled' },
      { type: 'number', key: 'bulk.delayMax', label: 'Longest wait between requests', min: 1, max: 60, step: 0.5, unit: 's', dependsOn: 'bulk.enabled' },
      {
        type: 'toggle',
        key: 'account.unfollowers',
        label: 'Unfollowers checker',
        desc: "Who doesn't follow you back, plus CSV export. Open it from the popup or your profile.",
        badge: 'risky',
        warning: "Reads your full follower lists slowly. Large accounts take a while; don't lower the delays too much.",
      },
      { type: 'number', key: 'account.delayMin', label: 'Shortest wait between requests', min: 1, max: 30, step: 0.5, unit: 's', dependsOn: 'account.unfollowers' },
      { type: 'number', key: 'account.delayMax', label: 'Longest wait between requests', min: 1.5, max: 60, step: 0.5, unit: 's', dependsOn: 'account.unfollowers' },
    ],
  },
];
