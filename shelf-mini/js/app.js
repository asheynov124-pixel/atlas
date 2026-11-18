// Event handling and navigation: wires user actions to state, storage and history.
//
// Navigation rules:
// - Filter changes replace the current history entry (no back-button spam).
// - Opening an item pushes an entry, so Back (button, gesture or Esc) returns to
//   the exact filtered collection, at the same scroll position, with focus on the
//   card that was opened.
// - Arriving on an item from a link or a refresh has no collection entry behind
//   it, so Back replaces the entry with the collection instead of leaving the app.

import { ITEMS, ITEM_IDS } from './data.js';
import { NO_FILTERS, suggestWiderSearch } from './filter.js';
import { createFavoriteStorage } from './storage.js';
import { createStore, viewFromSearch, urlForView } from './state.js';
import { createView } from './render.js';

const favoriteStorage = createFavoriteStorage({ validIds: ITEM_IDS });
const saved = favoriteStorage.load();

const store = createStore({
  ...viewFromSearch(location.search),
  favorites: new Set(saved.ids),
  canSave: saved.canSave,
  lostSaved: saved.lostSaved,
});

const view = createView(document);
const { els } = view;

let lastOpenedId = store.get().itemId; // the card to return focus to (also after a deep link)
let unsavedChanges = false; // true after a failed save: this tab knows more than storage does
let goingBack = false; // guards against a double Back leaving the app

const currentUrl = () => urlForView(store.get(), location.pathname);

// ---- Actions --------------------------------------------------------------

function setFilters(patch) {
  store.set(patch);
  history.replaceState(history.state, '', currentUrl());
  view.announceResults(store.get());
}

function clearFilters() {
  setFilters({ ...NO_FILTERS });
  view.focusResults();
}

function openItem(id) {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
  lastOpenedId = id;
  store.set({ itemId: id });
  history.pushState({ fromCollection: true }, '', currentUrl());
  window.scrollTo(0, 0);
  view.focusDetailTitle();
}

function closeItem() {
  if (goingBack) return;
  if (history.state?.fromCollection) {
    goingBack = true;
    history.back(); // popstate restores the collection
    return;
  }
  store.set({ itemId: null });
  history.replaceState({ scrollY: 0 }, '', currentUrl());
  returnToCollection(0);
}

function returnToCollection(scrollY) {
  window.scrollTo(0, scrollY);
  if (!lastOpenedId || !view.focusCard(lastOpenedId)) view.focusResults();
}

function toggleFavorite() {
  const state = store.get();
  const id = state.itemId;
  if (!id) return;
  const adding = !state.favorites.has(id);

  // Start from what is stored, so a change made in another tab is not overwritten.
  // After a failed save this tab's list is the complete one, so start from that.
  const stored = unsavedChanges ? null : favoriteStorage.read();
  const base = stored && (stored.status === 'ok' || stored.status === 'empty') ? stored.ids : state.favorites;
  const next = new Set(base);
  if (adding) next.add(id);
  else next.delete(id);

  const ok = favoriteStorage.save([...next]);
  unsavedChanges = !ok;
  store.set({ favorites: next, canSave: ok });
  view.showFavoriteResult({ added: adding, saved: ok });
}

// ---- Events ---------------------------------------------------------------

els.searchInput.addEventListener('input', () => setFilters({ query: els.searchInput.value }));

els.searchClear.addEventListener('click', () => {
  setFilters({ query: '' });
  els.searchInput.focus();
});

els.controls.addEventListener('submit', (event) => {
  event.preventDefault();
  // On phones, the search key should put the keyboard away so the results show.
  if (window.matchMedia('(pointer: coarse)').matches) els.searchInput.blur();
});

els.favoritesToggle.addEventListener('change', () => setFilters({ favoritesOnly: els.favoritesToggle.checked }));

els.categoryList.addEventListener('change', (event) => {
  if (event.target.name === 'category') setFilters({ category: event.target.value });
});

els.clearFilters.addEventListener('click', clearFilters);
els.emptyClear.addEventListener('click', clearFilters);

els.emptyWiden.addEventListener('click', () => {
  const state = store.get();
  const wider = suggestWiderSearch(ITEMS, state, state.favorites);
  if (!wider) return;
  setFilters(wider.patch);
  view.focusResults();
});

els.grid.addEventListener('click', (event) => {
  const link = event.target.closest('a.card__link');
  if (!link) return;
  // Let modified clicks (new tab, new window) behave like ordinary links.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openItem(link.dataset.id);
});

els.backButton.addEventListener('click', closeItem);
els.favoriteButton.addEventListener('click', toggleFavorite);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.isComposing) return;
  if (event.target === els.searchInput) {
    if (els.searchInput.value) {
      event.preventDefault();
      setFilters({ query: '' });
    }
    return;
  }
  if (store.get().itemId) {
    event.preventDefault();
    closeItem();
  }
});

window.addEventListener('popstate', (event) => {
  goingBack = false;
  const next = viewFromSearch(location.search);
  store.set(next);
  if (next.itemId) {
    lastOpenedId = next.itemId;
    window.scrollTo(0, 0);
    view.focusDetailTitle();
  } else {
    returnToCollection(event.state?.scrollY ?? 0);
  }
});

// Another tab changed favorites: show the same list here.
window.addEventListener('storage', (event) => {
  if (!favoriteStorage.isOwnChange(event.key) || unsavedChanges) return;
  const stored = favoriteStorage.read();
  if (stored.status === 'ok' || stored.status === 'empty') {
    store.set({ favorites: new Set(stored.ids), lostSaved: false });
  }
});

// Remember where the collection was scrolled to, so a refresh comes back to it.
window.addEventListener('pagehide', () => {
  if (!store.get().itemId) history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
});

// ---- Start ----------------------------------------------------------------

history.scrollRestoration = 'manual';
store.subscribe((state) => view.render(state));
view.render(store.get());
document.getElementById('file-warning').hidden = true;

// Tidy the URL (drops unknown items or categories) without adding history.
history.replaceState({ ...history.state }, '', currentUrl());
if (!store.get().itemId && history.state?.scrollY) window.scrollTo(0, history.state.scrollY);
