const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Instagram shortcode -> numeric media pk (as string). Long private-post codes use only the first 11 chars. */
export function shortcodeToPk(shortcode: string): string {
  let pk = 0n;
  for (const ch of shortcode.slice(0, 11)) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`Invalid shortcode char: ${ch}`);
    pk = pk * 64n + BigInt(v);
  }
  return pk.toString();
}

export function pkToShortcode(pk: string): string {
  let n = BigInt(pk.split('_')[0]);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 64n)] + out;
    n /= 64n;
  }
  return out || 'A';
}
