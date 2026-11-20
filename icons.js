const paths = {
  arrowRight:'M4 12h15m-6-6 6 6-6 6',
  chevronRight:'m9 5 7 7-7 7',
  chevronLeft:'m15 5-7 7 7 7',
  play:'M8 5v14l11-7z',
  page:'M6 3h8l4 4v14H6zm8 0v5h4M9 12h6m-6 4h6',
  bookmark:'M6 4h12v16l-6-4-6 4z',
  pencil:'m4 16-1 5 5-1L20 8l-4-4Zm10-10 4 4',
  grid:'M4 4h16v16H4zm0 8h16M12 4v16',
  exit:'M9 5H4v14h5m3-7h8m-4-4 4 4-4 4',
  check:'m5 12 5 5L20 7',
  undo:'M8 5 3 10l5 5m-5-5h12a5 5 0 0 1 0 10h-3',
  trash:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6',
  download:'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  shapes:'M3 4h9v9H3z M21 15a4 4 0 1 1-8 0 4 4 0 1 1 8 0z',
  palette:'M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H19a2 2 0 0 0 2-2 9 9 0 0 0-9-10zM7 11h.01M10 7h.01M15 7h.01M18 10h.01'
};

export function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}
