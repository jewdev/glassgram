import { parseNotes, type Inline, type Release } from './updates';

function inlineNodes(parts: Inline[]): Node[] {
  return parts.map((p) => {
    if (p.href) {
      const a = Object.assign(document.createElement('a'), { href: p.href, target: '_blank', rel: 'noopener noreferrer', textContent: p.text });
      return a;
    }
    if (p.bold || p.code) return Object.assign(document.createElement(p.code ? 'code' : 'strong'), { textContent: p.text });
    return document.createTextNode(p.text);
  });
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** One block per release: version + date header, then its notes. Built with DOM APIs, never innerHTML. */
export function renderReleaseNotes(releases: Release[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'notes';
  for (const r of releases) {
    const section = document.createElement('section');
    section.className = 'notes__release';
    const head = document.createElement('header');
    head.className = 'notes__head';
    const title = Object.assign(document.createElement('a'), { className: 'notes__version', href: r.url, target: '_blank', rel: 'noopener noreferrer', textContent: `v${r.version}` });
    head.append(title);
    const date = new Date(r.publishedAt);
    if (!Number.isNaN(date.getTime())) head.append(Object.assign(document.createElement('span'), { className: 'notes__date', textContent: dateFmt.format(date) }));
    section.append(head);

    let list: HTMLUListElement | null = null;
    const blocks = parseNotes(r.notes);
    for (const b of blocks) {
      if (b.kind === 'item') {
        if (!list) section.append((list = document.createElement('ul')));
        const li = document.createElement('li');
        li.append(...inlineNodes(b.parts));
        list.append(li);
        continue;
      }
      list = null;
      if (b.kind === 'heading') section.append(Object.assign(document.createElement('h3'), { textContent: b.text }));
      else {
        const p = document.createElement('p');
        p.append(...inlineNodes(b.parts));
        section.append(p);
      }
    }
    if (!blocks.length) section.append(Object.assign(document.createElement('p'), { className: 'notes__empty', textContent: 'No notes for this release.' }));
    root.append(section);
  }
  return root;
}

/** Saves the release ZIP through the browser's downloads, returning the download id. */
export async function downloadRelease(r: Release): Promise<number> {
  const url = r.zipUrl ?? `${r.url.replace('/tag/', '/download/')}/glassgram.zip`;
  return chrome.downloads.download({ url, filename: `glassgram-v${r.version}.zip`, conflictAction: 'uniquify' });
}
