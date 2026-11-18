// Filtering: pure functions with no DOM and no storage, so they are easy to test.
//
// A filter is { query, category, favoritesOnly }. Every active part narrows the
// list: search AND category AND favorites. Search looks at titles only.

export const NO_FILTERS = Object.freeze({ query: '', category: 'all', favoritesOnly: false });

/**
 * Folds case, accents and punctuation so "salt & iron", "Salt and Iron" and
 * "SALT-AND-IRON" all compare equal.
 */
export function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Splits a query into words. Every word must appear in the title, in any order. */
export function queryWords(query) {
  const folded = normalize(query);
  return folded ? folded.split(' ') : [];
}

const titleCache = new Map();
function foldedTitle(item) {
  let folded = titleCache.get(item.id);
  if (folded === undefined) {
    folded = normalize(item.title);
    titleCache.set(item.id, folded);
  }
  return folded;
}

export function matchesTitle(item, words) {
  const title = foldedTitle(item);
  return words.every((word) => title.includes(word));
}

export function filterItems(items, filters, favorites) {
  const words = queryWords(filters.query);
  return items.filter(
    (item) =>
      (filters.category === 'all' || item.category === filters.category) &&
      (!filters.favoritesOnly || favorites.has(item.id)) &&
      matchesTitle(item, words),
  );
}

export function isFiltered(filters) {
  return (
    queryWords(filters.query).length > 0 ||
    filters.category !== NO_FILTERS.category ||
    filters.favoritesOnly !== NO_FILTERS.favoritesOnly
  );
}

/**
 * When nothing matches, find the smallest change that would show something,
 * short of clearing everything. Returns { patch, count, kind } or null.
 */
export function suggestWiderSearch(items, filters, favorites) {
  const narrowed = filters.category !== 'all' || filters.favoritesOnly;
  if (!narrowed) return null;

  if (queryWords(filters.query).length > 0) {
    const patch = { category: 'all', favoritesOnly: false };
    const count = filterItems(items, { ...filters, ...patch }, favorites).length;
    return count > 0 ? { patch, count, kind: 'all-titles' } : null;
  }

  if (filters.favoritesOnly && filters.category !== 'all' && favorites.size > 0) {
    const patch = { category: 'all' };
    const count = filterItems(items, { ...filters, ...patch }, favorites).length;
    return count > 0 ? { patch, count, kind: 'all-favorites' } : null;
  }

  return null;
}
