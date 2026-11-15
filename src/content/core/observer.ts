type Scan = () => void;
type MutationHandler = (records: MutationRecord[]) => void;

const scans = new Set<Scan>();
const immediate = new Set<MutationHandler>();
let observer: MutationObserver | undefined;
let scheduled = false;
let lastRun = 0;
const MIN_INTERVAL = 250;

function run() {
  scheduled = false;
  lastRun = performance.now();
  for (const s of scans) {
    try {
      s();
    } catch (e) {
      console.debug('[IGE] scan failed', e);
    }
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  const wait = Math.max(0, MIN_INTERVAL - (performance.now() - lastRun));
  setTimeout(() => requestAnimationFrame(run), wait);
}

function onRecords(records: MutationRecord[]) {
  for (const m of immediate) {
    try {
      m(records);
    } catch (e) {
      console.debug('[IGE] mutation handler failed', e);
    }
  }
  if (scans.size) schedule();
}

/** One document-wide observer shared by every feature. */
function observe() {
  if (observer) return;
  observer = new MutationObserver(onRecords);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/** Register a DOM scan that runs (throttled) whenever the page mutates. */
export function onDomChange(scan: Scan): () => void {
  scans.add(scan);
  observe();
  schedule();
  return () => scans.delete(scan);
}

/**
 * Register a handler that gets each batch of added/removed nodes right away, before the browser lays
 * them out. Not throttled, so keep it cheap: it runs on every change to the page.
 */
export function onMutations(handler: MutationHandler): () => void {
  immediate.add(handler);
  observe();
  return () => immediate.delete(handler);
}
