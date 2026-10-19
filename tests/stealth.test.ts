import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// stealth.ts captures natives from `window` and patches Function.prototype.toString globally;
// put the real one back afterwards.
const realToString = Object.getOwnPropertyDescriptor(Function.prototype, 'toString')!;
let stealth: typeof import('../src/inject/stealth');

beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  stealth = await import('../src/inject/stealth');
});
afterAll(() => {
  Object.defineProperty(Function.prototype, 'toString', realToString);
  vi.unstubAllGlobals();
});

describe('disguise', () => {
  it('gives a patch the name, length and source text of the native it replaces', () => {
    const real = Math.max;
    const fake = stealth.disguise({ max(...args: number[]) { return real(...args); } }.max, real);
    expect(fake.name).toBe('max');
    expect(fake.length).toBe(2);
    expect(fake.toString()).toBe('function max() { [native code] }');
    expect(Function.prototype.toString.call(fake)).toBe('function max() { [native code] }');
    expect('prototype' in fake).toBe(false);
    expect(() => new (fake as any)()).toThrow(TypeError);
  });

  it('makes the patched toString look native too, and leaves other functions alone', () => {
    stealth.disguise({ f() {} }.f, Math.min);
    expect(Function.prototype.toString.toString()).toBe('function toString() { [native code] }');
    expect(Function.prototype.toString.name).toBe('toString');
    function mine(a: number) {
      return a;
    }
    expect(mine.toString()).toContain('return a');
    expect(() => Function.prototype.toString.call({})).toThrow(TypeError);
  });
});

describe('replace', () => {
  it('keeps the property flags of the method it swaps', () => {
    const obj = {};
    Object.defineProperty(obj, 'm', { value: () => 1, writable: true, enumerable: false, configurable: true });
    stealth.replace(obj, 'm', () => 2);
    expect(Object.getOwnPropertyDescriptor(obj, 'm')).toMatchObject({ writable: true, enumerable: false, configurable: true });
    expect((obj as { m: () => number }).m()).toBe(2);
  });
});
