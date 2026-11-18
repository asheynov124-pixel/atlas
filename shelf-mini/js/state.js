// State: one plain object, one way to change it, and its mapping to the URL.
//
// The URL holds the view (filters plus the open item), so the browser's back
// button, a refresh and a shared link all land on the same screen:
//   ?q=night&category=music&favorites=1&item=night-swim
// Favorites and storage health are not in the URL; they come from storage.js.

import { CATEGORY_IDS, ITEM_IDS } from './data.js';
import { NO_FILTERS } from './filter.js';

const MAX_QUERY_LENGTH = 80;

/**
 * Shape of the state:
 *   query, category, favoritesOnly   the active filters
 *   itemId                           the open item, or null for the collection
 *   favorites                        Set of favorite item ids
 *   canSave                          false when favorites can't be stored
 *   lostSaved                        true when earlier saved favorites were unreadable
 */
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Reads the view from a URL query string. Unknown values fall back to defaults. */
export function viewFromSearch(search) {
  const params = new URLSearchParams(search);
  const category = params.get('category');
  const item = params.get('item');
  return {
    query: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    category: CATEGORY_IDS.has(category) ? category : NO_FILTERS.category,
    favoritesOnly: params.get('favorites') === '1',
    itemId: ITEM_IDS.has(item) ? item : null,
  };
}

/** Builds the URL for a view. Defaults are left out, so the plain collection is just the path. */
export function urlForView({ query, category, favoritesOnly, itemId }, pathname) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query);
  if (category !== NO_FILTERS.category) params.set('category', category);
  if (favoritesOnly) params.set('favorites', '1');
  if (itemId) params.set('item', itemId);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
