// One-click update for the unpacked install: writes a release straight into the extension folder the
// user picked once, through the File System Access API, then reloads. Brave ships with the API off.
import { unzipSync } from 'fflate';
import { checkBundle, patchUpdateState, safeZipPath, staleAssets, type Release } from '../shared/updates';

type Mode = { mode: 'readwrite' };
type Folder = FileSystemDirectoryHandle & {
  queryPermission(d: Mode): Promise<PermissionState>;
  requestPermission(d: Mode): Promise<PermissionState>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o: Mode & { id?: string; startIn?: string }) => Promise<Folder> };

export const canSelfUpdate = () => typeof (window as PickerWindow).showDirectoryPicker === 'function';
export const isBrave = () => 'brave' in navigator;

/** The "why not" shown to the user; anything else that throws is unexpected. */
export class UpdateError extends Error {}

// ---------------- remembered folder (IndexedDB keeps the handle across sessions) ----------------
const DB = 'glassgram-update';
const STORE = 'handles';
const KEY = 'folder';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const conn = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(conn.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    conn.close();
  }
}

export const savedFolder = () => idb<Folder | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined);
export const forgetFolder = () => idb<void>('readwrite', (s) => s.delete(KEY));
const rememberFolder = (f: Folder) => idb<void>('readwrite', (s) => s.put(f, KEY));

/**
 * The folder Glassgram runs from, with write access. Asks for it (or for permission again) only here,
 * so call it first thing in a click handler: both prompts need the click's user activation.
 */
async function folderWithAccess(): Promise<Folder> {
  const saved = await savedFolder();
  if (saved) {
    if ((await saved.queryPermission({ mode: 'readwrite' })) === 'granted') return saved;
    if ((await saved.requestPermission({ mode: 'readwrite' })) === 'granted') return saved;
    throw new UpdateError('Glassgram needs permission to write to its folder.');
  }
  try {
    // The README has people unzip from Downloads; after the first pick the browser reopens where they left off.
    return await (window as PickerWindow).showDirectoryPicker!({ id: 'glassgram', mode: 'readwrite', startIn: 'downloads' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new UpdateError('No folder picked. Nothing was changed.');
    throw e;
  }
}

async function readManifest(dir: FileSystemDirectoryHandle): Promise<{ name?: unknown; version?: unknown } | undefined> {
  try {
    return JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text());
  } catch {
    return undefined;
  }
}

const WHERE = 'Press "Show me where it is" to see the right path.';

/**
 * The picked folder if it's a copy of the running build, or the one copy directly inside it (people often
 * pick Downloads instead of Downloads/glassgram). Anything else is refused, so nothing else gets overwritten.
 */
async function locate(dir: Folder): Promise<Folder> {
  const running = chrome.runtime.getManifest();
  const own = await readManifest(dir);
  if (own?.name === running.name) {
    if (own.version === running.version) return dir;
    throw new UpdateError(`That folder holds Glassgram ${String(own.version)}, but ${running.version} is running, so it's a different copy. ${WHERE}`);
  }
  const found: Folder[] = [];
  for await (const [, h] of dir.entries()) {
    if (h.kind !== 'directory') continue;
    const m = await readManifest(h as FileSystemDirectoryHandle);
    if (m?.name === running.name && m.version === running.version) found.push(h as Folder);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new UpdateError(`That folder has ${found.length} copies of Glassgram inside. Pick the one it's loaded from. ${WHERE}`);
  throw new UpdateError(`Glassgram isn't in that folder. ${WHERE}`);
}

/** Glassgram's own page in the browser's extension list, which shows the folder it's loaded from. */
export const showInstallFolder = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });

// ---------------- download ----------------
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function download(r: Release): Promise<Map<string, Uint8Array>> {
  if (!r.zipUrl || !r.zipSha256) throw new UpdateError("This release can't be installed in one click.");
  const res = await fetch(r.zipUrl, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new UpdateError(`GitHub answered with an error (${res.status}).`);
  const zip = await res.arrayBuffer();
  // Same file GitHub published for this release, byte for byte.
  if (hex(await crypto.subtle.digest('SHA-256', zip)) !== r.zipSha256) throw new UpdateError("The download didn't match the release. Nothing was changed.");

  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(zip)))) {
    if (name.endsWith('/')) continue;
    const path = safeZipPath(name);
    if (!path) throw new UpdateError('The download has an unsafe file path. Nothing was changed.');
    files.set(path, data);
  }
  const bad = checkBundle(files, chrome.runtime.getManifest().name, r.version);
  if (bad) throw new UpdateError(`${bad} Nothing was changed.`);
  return files;
}

// ---------------- writing ----------------
async function parentOf(root: Folder, path: string, create: boolean): Promise<[FileSystemDirectoryHandle, string]> {
  const segs = path.split('/');
  let dir: FileSystemDirectoryHandle = root;
  for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s, { create });
  return [dir, segs[segs.length - 1]];
}

async function readOld(root: Folder, path: string): Promise<Uint8Array | undefined> {
  try {
    const [dir, name] = await parentOf(root, path, false);
    return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
  } catch {
    return undefined; // new file
  }
}

async function write(root: Folder, path: string, data: Uint8Array) {
  const [dir, name] = await parentOf(root, path, true);
  const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await out.write(data as Uint8Array<ArrayBuffer>);
  await out.close(); // the browser swaps the file in on close, so each file is all-or-nothing
}

async function remove(root: Folder, path: string) {
  const [dir, name] = await parentOf(root, path, false);
  await dir.removeEntry(name);
}

async function listAssets(root: Folder): Promise<string[]> {
  let dir: Folder;
  try {
    dir = (await root.getDirectoryHandle('assets')) as Folder;
  } catch {
    return [];
  }
  const out: string[] = [];
  for await (const [name, h] of dir.entries()) if (h.kind === 'file') out.push(`assets/${name}`);
  return out;
}

/** Writes every file, manifest.json last. On any failure, puts the old files back. */
async function install(root: Folder, files: Map<string, Uint8Array>) {
  const order = [...files.keys()].filter((p) => p !== 'manifest.json').concat('manifest.json');
  const backup = new Map<string, Uint8Array | undefined>();
  try {
    for (const path of order) {
      backup.set(path, await readOld(root, path));
      await write(root, path, files.get(path)!);
    }
  } catch (e) {
    for (const [path, old] of backup) await (old ? write(root, path, old) : remove(root, path)).catch(() => {});
    throw new UpdateError(`Couldn't write the new files (${(e as Error).message}). Your current version was kept.`);
  }
  // Leftover chunks of the old build. Harmless if one stays behind.
  for (const path of staleAssets(await listAssets(root), files.keys())) await remove(root, path).catch(() => {});
}

export type Step = 'folder' | 'download' | 'install';

/** The whole one-click update. Resolves only on failure: on success the extension reloads. */
export async function selfUpdate(r: Release, onStep: (s: Step) => void): Promise<void> {
  onStep('folder');
  let root: Folder;
  try {
    root = await locate(await folderWithAccess());
  } catch (e) {
    await forgetFolder().catch(() => {}); // ask again next time
    throw e;
  }
  await rememberFolder(root);
  onStep('download');
  const files = await download(r);
  onStep('install');
  await install(root, files);
  await patchUpdateState({ installing: r.version, installError: undefined });
  chrome.runtime.reload();
}
