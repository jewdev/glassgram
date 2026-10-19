// Makes a new Ed25519 release signing key. Writes the public half into src/shared/signing-key.ts and
// prints the private half to stdout, so it can go straight into the repository secret without
// touching the disk:
//   node scripts/signing-key.mjs | gh secret set RELEASE_SIGNING_KEY
// Releases signed with an older key stop installing in one click for builds that ship the new one.
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/shared/signing-key.ts', import.meta.url);

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const src = readFileSync(FILE, 'utf8');
const next = src.replace(/export const SIGNING_KEY = '[^']*';/, `export const SIGNING_KEY = '${pub}';`);
if (next === src) {
  console.error("Couldn't find SIGNING_KEY in src/shared/signing-key.ts");
  process.exit(1);
}
writeFileSync(FILE, next);
console.error('Public key written to src/shared/signing-key.ts. Commit it.');
process.stdout.write(priv);
