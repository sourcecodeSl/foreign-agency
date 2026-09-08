// Node 22 exposes a stub `localStorage` global that shadows jsdom's own, and
// some jsdom builds omit it entirely. Install a plain in-memory shim so the
// app's tokenStore behaves the same way it does in a browser.
function memoryStorage() {
  let map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(String(k)),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const store = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: store, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: store, writable: true, configurable: true });
}
