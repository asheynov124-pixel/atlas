/**
 * Deep copy for plain JSON-shaped state. Used instead of structuredClone,
 * which iOS Safari only gained in 15.4.
 */
export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
