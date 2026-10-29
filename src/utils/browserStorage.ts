function serverStorage(): Storage {
  return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, length: 0, key: () => null };
}

export function safeLocalStorage(): Storage {
  return typeof window === 'undefined' ? serverStorage() : window.localStorage;
}

export function safeSessionStorage(): Storage {
  return typeof window === 'undefined' ? serverStorage() : window.sessionStorage;
}
