// Single source of truth for every user-facing setting.
// The options page and popup are generated from SECTIONS, so adding a feature
// means: add a default here, add a schema entry below, read it in the feature.

export const DEFAULTS = {
  // Media downloads
  'download.enabled': true,
  'download.showAll': true,
  'download.copyUrl': true,
  'download.copyCaption': true,
  'download.filename': 'Instagram/{user}/{user}_{date}_{shortcode}_{index}',
  'download.mode': 'folder' as 'folder' | 'zip',
  'download.saveAs': false,

  // Stories
  'stories.download': true,
  'stories.mentions': true,

  // Profile
  'profile.hdPic': true,
  'profile.followBadge': true,
  'bulk.enabled': true,
  'bulk.delayMin': 1.5,
  'bulk.delayMax': 3.5,

  // Feed
  'feed.followingOnly': false,
  'feed.noDoubleTapLike': false,

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
  'privacy.blockAnalytics': false,

  // Direct messages
  'dm.voiceDownload': true,
  'privacy.dmHideTyping': false,
  'privacy.dmHideSeen': false,

  // Account tools
  'account.unfollowers': true,
  'account.delayMin': 2,
  'account.delayMax': 4,
};

export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;

type Base<K extends SettingKey> = {
  key: K;
  label: string;
  desc?: string;
  /** Only shown/active when this toggle is on. */
  dependsOn?: SettingKey;
  /** Shown in the popup as a quick toggle. */
  quick?: boolean;
};

export type SettingDef =
  | (Base<SettingKey> & { type: 'toggle'; warning?: string })
  | (Base<SettingKey> & { type: 'select'; options: { value: string; label: string }[] })
  | (Base<SettingKey> & { type: 'text'; placeholder?: string; help?: string })
  | (Base<SettingKey> & { type: 'number'; min: number; max: number; step: number; unit?: string })
  | (Base<SettingKey> & { type: 'shortcut' });

export interface Section {
  id: string;
  title: string;
  icon: string;
  intro?: string;
  items: SettingDef[];
}

export const SECTIONS: Section[] = [
  {
    id: 'downloads',
    title: 'Media downloads',
    icon: '⬇',
    intro: 'Hover any post, reel or story to get a toolbar with download actions.',
    items: [
      { type: 'toggle', key: 'download.enabled', label: 'Download toolbar on posts & reels', desc: 'Shows a small toolbar when hovering photos and videos.', quick: true },
      { type: 'toggle', key: 'download.showAll', label: '"Download all" for carousels', dependsOn: 'download.enabled' },
      { type: 'toggle', key: 'download.copyUrl', label: '"Copy media URL" button', dependsOn: 'download.enabled' },
      { type: 'toggle', key: 'download.copyCaption', label: '"Copy caption" button', dependsOn: 'download.enabled' },
      {
        type: 'text',
        key: 'download.filename',
        label: 'Filename template',
        placeholder: DEFAULTS['download.filename'],
        help: 'Tokens: {user} {shortcode} {index} {id} {date} {time} {type}. Use / for folders (inside your Downloads folder). Extension is added automatically.',
      },
      {
        type: 'select',
        key: 'download.mode',
        label: 'Multiple files (carousel / bulk)',
        options: [
          { value: 'folder', label: 'Separate files in a folder' },
          { value: 'zip', label: 'Single ZIP archive' },
        ],
      },
      { type: 'toggle', key: 'download.saveAs', label: 'Ask where to save each file', desc: 'Opens the "Save as" dialog for single downloads.' },
    ],
  },
  {
    id: 'stories',
    title: 'Stories',
    icon: '◎',
    items: [
      { type: 'toggle', key: 'stories.download', label: 'Download stories & highlights', desc: 'Toolbar in the story viewer: current story or the whole tray.', quick: true },
      {
        type: 'toggle',
        key: 'stories.mentions',
        label: 'Story mentions & stickers',
        desc: 'Toolbar button that lists who is mentioned in a story (including hidden mentions), plus hashtags, location, links, music and shared posts.',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Profile',
    icon: '☺',
    items: [
      { type: 'toggle', key: 'profile.hdPic', label: 'HD profile picture', desc: 'Hover a profile picture → zoom full-resolution, download or copy its URL.', quick: true },
      { type: 'toggle', key: 'profile.followBadge', label: 'Follow status badge', desc: `Shows "Follows you", "Doesn't follow you" or "Follow each other" next to the username on profiles.`, quick: true },
      {
        type: 'toggle',
        key: 'bulk.enabled',
        label: 'Bulk download profile posts',
        desc: 'Adds a button on profiles to download every post.',
        warning: 'Many requests in a short time can get your account temporarily rate-limited by Instagram. Keep the delays reasonable.',
      },
      { type: 'number', key: 'bulk.delayMin', label: 'Min delay between requests', min: 0.5, max: 30, step: 0.5, unit: 's', dependsOn: 'bulk.enabled' },
      { type: 'number', key: 'bulk.delayMax', label: 'Max delay between requests', min: 1, max: 60, step: 0.5, unit: 's', dependsOn: 'bulk.enabled' },
    ],
  },
  {
    id: 'feed',
    title: 'Feed',
    icon: '☰',
    items: [
      {
        type: 'toggle',
        key: 'feed.followingOnly',
        label: 'Following-only feed',
        desc: 'Home always opens the chronological feed of accounts you follow, without suggested posts.',
        quick: true,
      },
      { type: 'toggle', key: 'feed.noDoubleTapLike', label: 'Disable double-click like', desc: 'Double-clicking a photo or video no longer likes it.' },
    ],
  },
  {
    id: 'video',
    title: 'Video',
    icon: '▶',
    items: [
      { type: 'toggle', key: 'video.enabled', label: 'Video control bar', desc: 'Seek bar, speed, volume and loop on hover.', quick: true },
      { type: 'toggle', key: 'video.noAutoplay', label: 'Disable video autoplay', desc: "Videos don't start until you click them. Stories still play." },
      {
        type: 'select',
        key: 'video.speed',
        label: 'Default playback speed',
        dependsOn: 'video.enabled',
        options: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '3'].map((v) => ({ value: v, label: `${v}×` })),
      },
      { type: 'toggle', key: 'video.rememberVolume', label: 'Remember volume', dependsOn: 'video.enabled' },
      { type: 'toggle', key: 'video.loop', label: 'Loop videos', dependsOn: 'video.enabled' },
    ],
  },
  {
    id: 'declutter',
    title: 'Declutter',
    icon: '✂',
    items: [
      { type: 'toggle', key: 'declutter.ads', label: 'Hide sponsored posts', quick: true },
      { type: 'toggle', key: 'declutter.suggested', label: 'Hide "Suggested for you" posts & reels in feed' },
      { type: 'toggle', key: 'declutter.sidebarSuggestions', label: 'Hide suggested accounts sidebar' },
      { type: 'toggle', key: 'declutter.storiesTray', label: 'Hide stories tray on home' },
      { type: 'toggle', key: 'declutter.reelsTab', label: 'Hide Reels tab' },
      { type: 'toggle', key: 'declutter.exploreTab', label: 'Hide Explore tab' },
      { type: 'toggle', key: 'declutter.threads', label: 'Hide Threads banners & links' },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    icon: '⌨',
    intro: 'Act on the media under your mouse, or the most visible post. Ignored while typing.',
    items: [
      { type: 'toggle', key: 'shortcuts.enabled', label: 'Enable keyboard shortcuts', quick: true },
      { type: 'shortcut', key: 'shortcuts.download', label: 'Download current media', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.downloadAll', label: 'Download all (carousel / story tray)', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.zoom', label: 'Zoom profile picture (on a profile)', dependsOn: 'shortcuts.enabled' },
      { type: 'shortcut', key: 'shortcuts.copyUrl', label: 'Copy media URL', dependsOn: 'shortcuts.enabled' },
    ],
  },
  {
    id: 'info',
    title: 'Info extras',
    icon: 'ℹ',
    items: [
      { type: 'toggle', key: 'info.timestamps', label: 'Exact timestamps', desc: 'Replace "3d" with the real date. Hover shows the original.' },
      {
        type: 'select',
        key: 'info.timestampFormat',
        label: 'Timestamp format',
        dependsOn: 'info.timestamps',
        options: [
          { value: 'datetime', label: 'Date + time (12h)' },
          { value: 'datetime24', label: 'Date + time (24h)' },
          { value: 'date', label: 'Date only' },
        ],
      },
      { type: 'toggle', key: 'info.contextMenu', label: 'Right-click "Download Instagram media"', desc: 'Adds a context-menu entry on instagram.com.' },
      { type: 'toggle', key: 'info.copyComment', label: 'Copy comment button', desc: 'A "Copy" button next to every comment.' },
    ],
  },
  {
    id: 'links',
    title: 'Links',
    icon: '🔗',
    items: [
      {
        type: 'toggle',
        key: 'links.clean',
        label: 'Clean share links',
        desc: 'Removes tracking (utm_source, stkn, igsh…) from links copied with "Copy link".',
      },
      {
        type: 'text',
        key: 'links.shareDomain',
        label: 'Share domain',
        placeholder: 'www.instagram.com',
        help: 'Optional. Replace instagram.com in copied links, e.g. kkinstagram.com for better previews in Discord or Telegram. Leave empty to keep instagram.com.',
        dependsOn: 'links.clean',
      },
      { type: 'toggle', key: 'links.direct', label: 'Open links directly', desc: "Outbound links skip Instagram's l.instagram.com redirect page." },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    icon: '◐',
    items: [
      {
        type: 'toggle',
        key: 'privacy.anonStories',
        label: 'Anonymous story viewing',
        desc: 'Blocks the "seen" request, so you won\'t appear in viewer lists. Reload Instagram after changing.',
        quick: true,
      },
      {
        type: 'toggle',
        key: 'privacy.blockAnalytics',
        label: 'Block analytics',
        desc: "Blocks Instagram's event-logging requests (/ajax/bz, /ajax/qm, /logging). Some analytics also travel over Instagram's live connection and can't be blocked separately.",
      },
    ],
  },
  {
    id: 'dm',
    title: 'Direct messages',
    icon: '✉',
    items: [
      {
        type: 'toggle',
        key: 'dm.voiceDownload',
        label: 'Download voice messages',
        desc: 'A download button on every voice message in your chats. No need to play it first.',
      },
      {
        type: 'toggle',
        key: 'privacy.dmHideTyping',
        label: 'Hide typing indicator (experimental)',
        desc: 'The other person won\'t see "typing…" while you write.',
        warning: 'Experimental: built from Instagram\'s chat protocol, not yet confirmed on your account. Test it with a friend.',
      },
      {
        type: 'toggle',
        key: 'privacy.dmHideSeen',
        label: 'Hide "Seen" (not tested yet)',
        desc: 'Opening a chat doesn\'t mark it as read for the other person. Sending a message still works.',
        warning: 'Not tested yet: this hasn\'t been confirmed to work. Check with a friend before relying on it.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account tools',
    icon: '⚇',
    items: [
      {
        type: 'toggle',
        key: 'account.unfollowers',
        label: 'Unfollowers checker',
        desc: 'Find who doesn\'t follow you back and export followers/following to CSV. Open it from the popup or your profile.',
        warning: 'Reads your full follower lists slowly. Very large accounts take a while; don\'t lower the delays too much.',
      },
      { type: 'number', key: 'account.delayMin', label: 'Min delay between requests', min: 1, max: 30, step: 0.5, unit: 's', dependsOn: 'account.unfollowers' },
      { type: 'number', key: 'account.delayMax', label: 'Max delay between requests', min: 1.5, max: 60, step: 0.5, unit: 's', dependsOn: 'account.unfollowers' },
    ],
  },
];
