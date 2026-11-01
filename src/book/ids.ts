let counter = 0;

/** Short, URL-safe ids. Crypto when available, a counter fallback for tests. */
export function newId(prefix = ''): string {
  const c = globalThis.crypto;
  let body: string;
  if (c && 'randomUUID' in c) {
    body = c.randomUUID().replace(/-/g, '').slice(0, 10);
  } else {
    counter += 1;
    body = `${Date.now().toString(36)}${counter.toString(36)}`;
  }
  return prefix ? `${prefix}_${body}` : body;
}
