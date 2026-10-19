// Signs a release file with the Ed25519 key in RELEASE_SIGNING_KEY (base64 PKCS#8) and writes
// <file>.sig (base64). Checks the result against the public key the extension ships, so a secret
// that doesn't match fails here instead of breaking one-click updates. Uses nothing outside Node.
// Usage: RELEASE_SIGNING_KEY=... node scripts/sign.mjs glassgram.zip
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const secret = process.env.RELEASE_SIGNING_KEY?.trim();
if (!file || !secret) {
  console.error('Usage: RELEASE_SIGNING_KEY=<base64 pkcs8> node scripts/sign.mjs <file>');
  process.exit(1);
}

const shipped = /export const SIGNING_KEY = '([^']*)';/.exec(readFileSync(new URL('../src/shared/signing-key.ts', import.meta.url), 'utf8'))?.[1];
if (!shipped) {
  console.error('src/shared/signing-key.ts has no public key. Run scripts/signing-key.mjs first.');
  process.exit(1);
}

const data = readFileSync(file);
const sig = sign(null, data, createPrivateKey({ key: Buffer.from(secret, 'base64'), format: 'der', type: 'pkcs8' }));
if (!verify(null, data, createPublicKey({ key: Buffer.from(shipped, 'base64'), format: 'der', type: 'spki' }), sig)) {
  console.error("RELEASE_SIGNING_KEY doesn't match the public key in src/shared/signing-key.ts.");
  process.exit(1);
}
writeFileSync(`${file}.sig`, sig.toString('base64'));
console.log(`Signed ${file}`);
