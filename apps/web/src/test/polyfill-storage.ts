// Node 22+ exposes an experimental globalThis.localStorage stub without setItem/getItem when
// --localstorage-file is omitted, which breaks zustand persist middleware under Vitest/jsdom.
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.setItem !== 'function'
) {
  const mem = new Map<string, string>();
  const storagePolyfill: Storage = {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    key(index: number) {
      return Array.from(mem.keys())[index] ?? null;
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    setItem(key: string, value: string) {
      mem.set(String(key), String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storagePolyfill,
    writable: true,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storagePolyfill,
      writable: true,
      configurable: true,
    });
  }
}
