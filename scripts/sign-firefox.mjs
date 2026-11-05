// Gets the Firefox build signed by Mozilla as an unlisted add-on (no store listing, no review queue)
// and writes the two release assets Firefox needs:
//   glassgram.xpi  the signed add-on
//   updates.json   what the manifest's update_url points at, so installed copies update themselves
// Uses the addons.mozilla.org API with the key pair from https://addons.mozilla.org/developers/addon/api/key/
// and nothing outside Node. Running it again for a version AMO already signed just downloads it.
// Usage: AMO_JWT_ISSUER=... AMO_JWT_SECRET=... node scripts/sign-firefox.mjs glassgram-firefox.zip [source.zip]
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const API = 'https://addons.mozilla.org/api/v5';
const POLL_MS = 10_000;
const TIMEOUT_MS = 20 * 60_000;

const [zipPath, sourcePath] = process.argv.slice(2);
const issuer = process.env.AMO_JWT_ISSUER?.trim();
const secret = process.env.AMO_JWT_SECRET?.trim();
if (!zipPath || !issuer || !secret) {
  console.error('Usage: AMO_JWT_ISSUER=<key> AMO_JWT_SECRET=<secret> node scripts/sign-firefox.mjs <firefox build zip> [source zip]');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(new URL('../dist-firefox/manifest.json', import.meta.url), 'utf8'));
const { version } = manifest;
const gecko = manifest.browser_specific_settings.gecko;
const repo = process.env.GITHUB_REPOSITORY ?? 'jewdev/glassgram';

const b64url = (b) => Buffer.from(b).toString('base64url');
/** AMO wants a fresh short-lived HS256 JWT on every request. */
function jwt() {
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: issuer, jti: randomUUID(), iat, exp: iat + 60 }))}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** Throws on an error status, unless `soft` (then the caller reads res.ok). */
async function amo(path, init = {}, soft = false) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers: { ...init.headers, Authorization: `JWT ${jwt()}` } });
  if (!res.ok && !soft) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res;
}
const file = (path, type) => new Blob([readFileSync(path)], { type });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, check) {
  const end = Date.now() + TIMEOUT_MS;
  for (;;) {
    const done = await check();
    if (done) return done;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(POLL_MS);
  }
}

/** This version on AMO, or undefined. Newest first, so it is on the first page when it exists. */
async function findVersion() {
  const res = await amo(`/addons/addon/${encodeURIComponent(gecko.id)}/versions/?filter=all_with_unlisted&page_size=50`, {}, true);
  if (res.status >= 400 && res.status < 500) return undefined; // add-on not created yet (AMO doesn't document which status)
  if (!res.ok) throw new Error(`Listing versions: ${res.status} ${await res.text()}`);
  return (await res.json()).results.find((v) => v.version === version);
}

async function submit() {
  const form = new FormData();
  form.append('upload', file(zipPath, 'application/zip'), basename(zipPath));
  form.append('channel', 'unlisted');
  const { uuid } = await (await amo('/addons/upload/', { method: 'POST', body: form })).json();
  console.log(`Uploaded ${zipPath}, waiting for validation`);
  const upload = await until('validation', async () => {
    const u = await (await amo(`/addons/upload/${uuid}/`)).json();
    return u.processed && u;
  });
  if (!upload.valid) throw new Error(`AMO validation failed:\n${JSON.stringify(upload.validation?.messages ?? upload.validation, null, 2)}`);

  // PUT by guid adds a version, or creates the add-on on its first release.
  await amo(`/addons/addon/${encodeURIComponent(gecko.id)}/`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: { upload: uuid } }) });
  const v = await findVersion();
  if (!v) throw new Error(`AMO accepted the upload but lists no version ${version}`);

  // Mozilla asks for the source of bundled code; reviewers read it, nothing ships from it.
  if (sourcePath) {
    const src = new FormData();
    src.append('source', file(sourcePath, 'application/zip'), basename(sourcePath));
    await amo(`/addons/addon/${encodeURIComponent(gecko.id)}/versions/${v.id}/`, { method: 'PATCH', body: src });
    console.log(`Attached source ${sourcePath}`);
  }
  return v;
}

let v = await findVersion();
if (v) console.log(`AMO already has ${version}`);
else v = await submit();

console.log('Waiting for the signature');
const signed = await until('signing', async () => {
  const cur = (await findVersion()) ?? v;
  if (cur.file?.status === 'disabled') throw new Error(`AMO disabled ${version}. Check the add-on's page on addons.mozilla.org.`);
  return cur.file?.status === 'public' && cur.file.url && cur;
});

const xpi = Buffer.from(await (await amo(signed.file.url)).arrayBuffer());
writeFileSync('glassgram.xpi', xpi);
writeFileSync(
  'updates.json',
  JSON.stringify(
    {
      addons: {
        [gecko.id]: {
          updates: [
            {
              version,
              update_link: `https://github.com/${repo}/releases/download/v${version}/glassgram.xpi`,
              update_hash: `sha256:${createHash('sha256').update(xpi).digest('hex')}`,
              applications: { gecko: { strict_min_version: gecko.strict_min_version } },
            },
          ],
        },
      },
    },
    null,
    2,
  ),
);
console.log(`Signed glassgram.xpi (${version}) and wrote updates.json`);
