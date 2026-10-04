type Scan = () => void;

const scans = new Set<Scan>();
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

/** Register a DOM scan that runs (throttled) whenever the page mutates. */
export function onDomChange(scan: Scan): () => void {
  scans.add(scan);
  if (!observer) {
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  schedule();
  return () => scans.delete(scan);
}
