// Rendering: turns state into DOM. No event handling and no storage here.
//
// Cards are built once at start-up; filtering only shows and hides them. Typing
// never rebuilds the artwork, and the DOM nodes (and focus) stay stable.
//
// innerHTML is used only for artwork, which artwork.js builds from the bundled
// sample data. Anything a person types (the search query) goes in via textContent.

import { ITEMS, CATEGORIES, getItem, getCategory } from './data.js';
import { artworkSVG } from './artwork.js';
import { filterItems, isFiltered, queryWords, suggestWiderSearch } from './filter.js';
import { urlForView } from './state.js';

const APP_NAME = 'Shelf Mini';
const TOTAL = ITEMS.length;

const NOTICE_CANT_SAVE =
  "Favorites can't be saved in this browser right now. You can still add them, but they'll be cleared when you leave or refresh.";
const NOTICE_LOST_SAVED =
  "Your earlier favorites couldn't be opened, so this list is starting fresh. New favorites will be saved as usual.";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** "Music · 2021", with the dot hidden from screen readers. */
function fillCategoryLine(element, item) {
  const category = document.createElement('span');
  category.textContent = getCategory(item.category).singular;
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = ' · ';
  const year = document.createElement('span');
  year.textContent = String(item.year);
  element.replaceChildren(category, dot, year);
}

/** What the empty state says, given why nothing is showing. */
function emptyStateCopy(state) {
  const words = queryWords(state.query);
  const category = getCategory(state.category);

  if (state.favoritesOnly && state.favorites.size === 0 && words.length === 0) {
    return {
      title: 'No favorites yet',
      body: 'Open any title and choose Favorite to keep it here.',
      clearLabel: 'Browse all titles',
    };
  }

  if (words.length === 0) {
    return {
      title: category ? `No favorites in ${category.label}` : 'No favorites yet',
      body: 'Your favorites are all in other categories.',
      clearLabel: 'Clear filters',
    };
  }

  let scope = '';
  if (state.favoritesOnly && category) scope = `You're searching your Favorites in ${category.label}. `;
  else if (category) scope = `You're searching ${category.label} only. `;
  else if (state.favoritesOnly) scope = "You're searching your Favorites only. ";

  return {
    title: `No titles match “${state.query.trim()}”`,
    body: `${scope}Search looks at titles only, so try fewer letters or a different spelling.`,
    clearLabel: 'Clear search and filters',
  };
}

function widerSearchLabel({ kind, count }) {
  if (kind === 'all-favorites') return count === 1 ? 'Show your 1 favorite' : `Show all ${count} favorites`;
  return `Show ${plural(count, 'match', 'matches')} in all titles`;
}

export function createView(doc) {
  const $ = (id) => doc.getElementById(id);
  const els = {
    collectionView: $('collection-view'),
    detailView: $('detail-view'),
    notice: $('storage-notice'),
    noticeText: $('storage-notice-text'),
    controls: $('controls'),
    searchInput: $('search-input'),
    searchClear: $('search-clear'),
    favoritesToggle: $('favorites-toggle'),
    favoritesCount: $('favorites-count'),
    categoryList: $('category-list'),
    summary: $('summary'),
    summaryText: $('results-summary'),
    clearFilters: $('clear-filters'),
    grid: $('grid'),
    empty: $('empty-state'),
    emptyTitle: $('empty-title'),
    emptyBody: $('empty-body'),
    emptyClear: $('empty-clear'),
    emptyWiden: $('empty-widen'),
    backButton: $('back-button'),
    detailArt: $('detail-art'),
    detailEyebrow: $('detail-eyebrow'),
    detailTitle: $('detail-title'),
    detailCredit: $('detail-credit'),
    detailFormat: $('detail-format'),
    detailDescription: $('detail-description'),
    favoriteButton: $('favorite-button'),
    favoriteStatus: $('favorite-status'),
    favoriteHint: $('favorite-hint'),
    announcer: $('announcer'),
  };

  // Category options, built once from the data.
  const radios = new Map();
  const categoryTemplate = $('category-template');
  for (const { id, label } of [{ id: 'all', label: 'All' }, ...CATEGORIES]) {
    const option = categoryTemplate.content.firstElementChild.cloneNode(true);
    const input = option.querySelector('input');
    input.value = id;
    option.querySelector('.category__face').textContent = label;
    radios.set(id, input);
    els.categoryList.append(option);
  }

  // Cards, built once.
  const cards = new Map();
  const cardTemplate = $('card-template');
  for (const item of ITEMS) {
    const element = cardTemplate.content.firstElementChild.cloneNode(true);
    const link = element.querySelector('.card__link');
    link.dataset.id = item.id;
    element.querySelector('.card__art').innerHTML = artworkSVG(item);
    element.querySelector('.card__title').textContent = item.title;
    fillCategoryLine(element.querySelector('.card__category'), item);
    cards.set(item.id, { element, link, favorite: element.querySelector('.card__favorite') });
    els.grid.append(element);
  }
  els.emptyTitle.tabIndex = -1;

  let shownItemId = null;
  let announceTimer = 0;

  function renderControls(state) {
    if (els.searchInput.value !== state.query) els.searchInput.value = state.query;
    els.searchClear.hidden = state.query === '';
    els.favoritesToggle.checked = state.favoritesOnly;
    els.favoritesCount.textContent = state.favorites.size > 0 ? String(state.favorites.size) : '';
    for (const [id, input] of radios) input.checked = id === state.category;
  }

  function renderNotice(state) {
    const text = !state.canSave ? NOTICE_CANT_SAVE : state.lostSaved ? NOTICE_LOST_SAVED : '';
    if (els.noticeText.textContent !== text) els.noticeText.textContent = text;
    els.notice.hidden = text === '';
  }

  function renderCollection(state) {
    const visible = filterItems(ITEMS, state, state.favorites);
    const visibleIds = new Set(visible.map((item) => item.id));
    const filtered = isFiltered(state);

    for (const [id, card] of cards) {
      card.element.hidden = !visibleIds.has(id);
      card.favorite.hidden = !state.favorites.has(id);
      card.link.href = urlForView({ ...state, itemId: id }, location.pathname);
    }

    const nothing = visible.length === 0;
    els.grid.hidden = nothing;
    els.summary.hidden = nothing;
    els.empty.hidden = !nothing;
    els.summaryText.textContent = filtered
      ? `${visible.length} of ${plural(TOTAL, 'title', 'titles')}`
      : plural(TOTAL, 'title', 'titles');
    els.clearFilters.hidden = !filtered;

    if (nothing) {
      const copy = emptyStateCopy(state);
      els.emptyTitle.textContent = copy.title;
      els.emptyBody.textContent = copy.body;
      els.emptyClear.textContent = copy.clearLabel;
      const wider = suggestWiderSearch(ITEMS, state, state.favorites);
      els.emptyWiden.hidden = !wider;
      els.emptyWiden.textContent = wider ? widerSearchLabel(wider) : '';
    }
  }

  function renderDetail(state) {
    const item = getItem(state.itemId);
    if (item.id !== shownItemId) {
      shownItemId = item.id;
      els.detailArt.innerHTML = artworkSVG(item);
      fillCategoryLine(els.detailEyebrow, item);
      els.detailTitle.textContent = item.title;
      els.detailCredit.textContent = item.credit;
      els.detailFormat.textContent = item.detail;
      els.detailDescription.textContent = item.description;
      els.favoriteStatus.textContent = '';
      els.favoriteButton.classList.remove('just-added');
    }
    els.favoriteButton.setAttribute('aria-pressed', String(state.favorites.has(item.id)));
    els.favoriteHint.hidden = state.canSave;
  }

  function render(state) {
    const item = state.itemId ? getItem(state.itemId) : null;
    els.collectionView.hidden = Boolean(item);
    els.detailView.hidden = !item;
    renderControls(state);
    renderNotice(state);
    renderCollection(state);
    if (item) renderDetail(state);
    doc.title = item ? `${item.title} · ${APP_NAME}` : APP_NAME;
  }

  /** Tells screen-reader users how many titles are showing, once typing pauses. */
  function announceResults(state) {
    const count = filterItems(ITEMS, state, state.favorites).length;
    const text = !isFiltered(state)
      ? `All ${TOTAL} titles shown.`
      : count === 0
        ? 'No titles match.'
        : `${plural(count, 'title', 'titles')} shown.`;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      els.announcer.textContent = text;
    }, 500);
  }

  /** Reports the outcome of a favorite change, without claiming a save that didn't happen. */
  function showFavoriteResult({ added, saved }) {
    els.favoriteButton.classList.remove('just-added');
    if (added) {
      void els.favoriteButton.offsetWidth; // restart the animation
      els.favoriteButton.classList.add('just-added');
    }
    els.favoriteStatus.textContent = saved
      ? added
        ? 'Added to Favorites.'
        : 'Removed from Favorites.'
      : added
        ? 'Added for this visit only.'
        : 'Removed for this visit only.';
  }

  function bringIntoView(element) {
    const box = element.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) element.scrollIntoView({ block: 'center' });
  }

  /** Focus the card for an item; if it is no longer listed, its nearest visible neighbour. */
  function focusCard(id) {
    const order = ITEMS.map((item) => item.id);
    const start = order.indexOf(id);
    if (start === -1) return false;
    const candidates = [...order.slice(start), ...order.slice(0, start).reverse()];
    for (const candidate of candidates) {
      const card = cards.get(candidate);
      if (!card.element.hidden) {
        card.link.focus({ preventScroll: true });
        bringIntoView(card.element);
        return true;
      }
    }
    return false;
  }

  /** Focus the results line (or the empty-state title when nothing is showing). */
  function focusResults() {
    const target = els.summary.hidden ? els.emptyTitle : els.summaryText;
    target.focus({ preventScroll: true });
    bringIntoView(target);
  }

  function focusDetailTitle() {
    els.detailTitle.focus({ preventScroll: true });
  }

  return { els, render, announceResults, showFavoriteResult, focusCard, focusResults, focusDetailTitle };
}
