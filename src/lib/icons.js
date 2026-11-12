// SF-Symbols-inspired glyphs (24×24, drawn with currentColor).

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const GLYPHS = {
  hourglass:
    '<path d="M6 2.5h12a1 1 0 0 1 1 1c0 3.6-2.2 6.3-4.6 8.5 2.4 2.2 4.6 4.9 4.6 8.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1c0-3.6 2.2-6.3 4.6-8.5C7.2 9.8 5 7.1 5 3.5a1 1 0 0 1 1-1Z"/><path fill="var(--glyph-cut, #fff)" d="M12 15.2c1.7 1.3 3.3 2.9 3.6 4.8H8.4c.3-1.9 1.9-3.5 3.6-4.8Z" class="hg-sand"/>',
  schedule:
    '<rect x="3" y="4" width="18" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.8 8.5h16.4" stroke="currentColor" stroke-width="2"/><rect x="6" y="13.5" width="3.5" height="3.5" rx="1"/>',
  checkmark: `<path ${S} stroke-width="2.6" d="m5 12.5 4.5 4.5L19 7.5"/>`,
  restrict: `<circle cx="12" cy="12" r="8.5" ${S} stroke-width="2.4"/><path ${S} stroke-width="2.4" d="m6 6 12 12"/>`,
  lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/><path fill="none" stroke="currentColor" stroke-width="2.2" d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  bell: '<path d="M12 3a6 6 0 0 0-6 6v3.6L4.4 15.4A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Z"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0Z"/>',
  chart: '<rect x="4" y="12" width="4" height="8" rx="1.2"/><rect x="10" y="6" width="4" height="14" rx="1.2"/><rect x="16" y="9" width="4" height="11" rx="1.2"/>',
  gear: `<circle cx="12" cy="12" r="3.2" ${S}/><path ${S} d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>`,
  social:
    '<path d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 3.6c-.5.4-1.4.1-1.4-.6V17h.5A2.5 2.5 0 0 1 3 14.5v-9A2.5 2.5 0 0 1 5.5 3Z"/><circle cx="12" cy="8" r="2.4" fill="var(--glyph-cut, #1c1c1e)"/><path d="M7.8 14.2c.5-2 2.2-3.2 4.2-3.2s3.7 1.2 4.2 3.2Z" fill="var(--glyph-cut, #1c1c1e)"/>',
  games:
    '<path d="M7.2 6.5h9.6c2.6 0 4.2 2 4.8 5.6l.4 2.8c.4 2.5-2.4 4-4.1 2.1l-1.8-2H7.9l-1.8 2c-1.7 1.9-4.5.4-4.1-2.1l.4-2.8C3 8.5 4.6 6.5 7.2 6.5Z"/><path stroke="var(--glyph-cut, #1c1c1e)" stroke-width="1.8" stroke-linecap="round" d="M7.5 9.5v4M5.5 11.5h4"/><circle cx="15.5" cy="10.3" r="1.1" fill="var(--glyph-cut, #1c1c1e)"/><circle cx="17.6" cy="12.6" r="1.1" fill="var(--glyph-cut, #1c1c1e)"/>',
  entertainment:
    '<path d="M4 7.5 7 3h3L7 7.5Zm6 0L13 3h3l-3 4.5Zm6 0L19 3h1a1 1 0 0 1 1 1v3.5Z" opacity=".85"/><rect x="3" y="8.5" width="18" height="12.5" rx="2.5"/><path d="m10 11.5 5 3-5 3Z" fill="var(--glyph-cut, #1c1c1e)"/>',
  creativity: '<path d="M18.5 3.5a2 2 0 0 1 2.8 2.8l-8.6 8.6-3.4.6.6-3.4Z"/><path d="M7.5 14.5c-2 0-3.5 1.5-3.5 3.5 0 1-.6 1.8-1.5 2.2 1 .6 2.2.8 3.5.8 2.5 0 4.5-1.6 4.5-3.8Z"/>',
  productivity: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  education: '<path d="m12 3 10.5 5.5L12 14 1.5 8.5Z"/><path d="M5.5 11.5v4.2c0 1.6 3 3.3 6.5 3.3s6.5-1.7 6.5-3.3v-4.2L12 15Z"/><path stroke="currentColor" stroke-width="1.6" d="M21 9.5V15"/>',
  reading: '<path d="M2.5 5c3-1.2 6.2-1.1 8.8.6v14c-2.6-1.6-5.8-1.8-8.8-.6Zm19 0c-3-1.2-6.2-1.1-8.8.6v14c2.6-1.6 5.8-1.8 8.8-.6Z"/>',
  health: '<path d="M12 20.5S3 15.2 3 9a4.8 4.8 0 0 1 9-2.3A4.8 4.8 0 0 1 21 9c0 6.2-9 11.5-9 11.5Z"/>',
  utilities: '<rect x="4.5" y="2.5" width="15" height="19" rx="3"/><rect x="7" y="5" width="10" height="4" rx="1" fill="var(--glyph-cut, #1c1c1e)"/><g fill="var(--glyph-cut, #1c1c1e)"><circle cx="8.5" cy="12.5" r="1.1"/><circle cx="12" cy="12.5" r="1.1"/><circle cx="15.5" cy="12.5" r="1.1"/><circle cx="8.5" cy="16.5" r="1.1"/><circle cx="12" cy="16.5" r="1.1"/><circle cx="15.5" cy="16.5" r="1.1"/></g>',
  shopping: '<path d="M5 7.5h14l-1 12.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 19.7Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M9 9.5V6.5a3 3 0 0 1 6 0v3"/>',
  travel: '<path d="M21.5 3.2c-.8-.8-2.3-.6-3.4.5L14.5 7.3 5.6 4.6 3.8 6.4l7.1 4.2-3.3 3.3-2.7-.4-1.4 1.4 3.4 1.8 1.8 3.4 1.4-1.4-.4-2.7 3.3-3.3 4.2 7.1 1.8-1.8-2.7-8.9 3.6-3.6c1.1-1.1 1.3-2.6.5-3.4Z"/>',
  others: '<rect x="4" y="9" width="16" height="12.5" rx="3"/><path d="M6 6.5h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".75"/><path d="M8 3.6h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/>',
  headphones: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 15.5V12a8 8 0 0 1 16 0v3.5"/><rect x="3" y="13" width="5" height="8" rx="2"/><rect x="16" y="13" width="5" height="8" rx="2"/>',
  play: '<path d="M8 4.8v14.4a1 1 0 0 0 1.5.9l11-7.2a1 1 0 0 0 0-1.8l-11-7.2A1 1 0 0 0 8 4.8Z"/>',
  music: '<path d="M9 17.5V5.3a1 1 0 0 1 .8-1l9-1.8a1 1 0 0 1 1.2 1V15"/><ellipse cx="6.5" cy="17.8" rx="3" ry="2.6"/><ellipse cx="17.5" cy="15.3" rx="3" ry="2.6"/><path fill="none" stroke="currentColor" stroke-width="2" d="M9 17.5V5.3l11-2.3V15"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><g fill="var(--glyph-cut, #1c1c1e)"><rect x="5" y="6" width="2" height="2" rx=".5"/><rect x="5" y="11" width="2" height="2" rx=".5"/><rect x="5" y="16" width="2" height="2" rx=".5"/><rect x="17" y="6" width="2" height="2" rx=".5"/><rect x="17" y="11" width="2" height="2" rx=".5"/><rect x="17" y="16" width="2" height="2" rx=".5"/></g>',
  book: '<path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v14H7a1.5 1.5 0 0 0 0 3h12.5V21a.5.5 0 0 1-.5.5H7A3 3 0 0 1 4 18.5V4.5a2 2 0 0 1 2-2Z"/>',
  code: `<path ${S} stroke-width="2.4" d="m8 7-5 5 5 5m8-10 5 5-5 5m-2.5-13-3 16"/>`,
  chat: '<path d="M12 3.5c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-1 0-2-.1-2.9-.4L4.5 20.5l1-3.9C4 15.2 3 13.3 3 11.1c0-4.2 4-7.6 9-7.6Z"/>',
  globe: `<circle cx="12" cy="12" r="9" ${S}/><path ${S} d="M3.5 9h17M3.5 15h17M12 3c-2.6 2.4-3.8 5.6-3.8 9s1.2 6.6 3.8 9c2.6-2.4 3.8-5.6 3.8-9S14.6 5.4 12 3Z"/>`,
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"/>',
  heart: '<path d="M12 20.5S3 15.2 3 9a4.8 4.8 0 0 1 9-2.3A4.8 4.8 0 0 1 21 9c0 6.2-9 11.5-9 11.5Z"/>',
  bolt: '<path d="M13.5 2 4.5 13.5H11L10 22l9.5-12H13Z"/>',
  camera: '<path d="M8.8 4.5h6.4l1.5 2.2h2.8A2.5 2.5 0 0 1 22 9.2v8.3a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5V9.2a2.5 2.5 0 0 1 2.5-2.5h2.8Z"/><circle cx="12" cy="13" r="3.8" fill="var(--glyph-cut, #1c1c1e)"/>',
  person: '<circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21c.6-4.4 4-7.2 8.5-7.2s7.9 2.8 8.5 7.2Z"/>',
  data: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 7.5v4.5c0 1.7 3.6 3 8 3s8-1.3 8-3V7.5c0 1.7-3.6 3-8 3s-8-1.3-8-3Zm0 7.5v3.5c0 1.7 3.6 3 8 3s8-1.3 8-3V15c0 1.7-3.6 3-8 3s-8-1.3-8-3Z"/>',
  link: `<path ${S} stroke-width="2.4" d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1"/><path ${S} stroke-width="2.4" d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/>`,
  power: `<path ${S} stroke-width="2.4" d="M12 3v8.5M7 6.2a7.5 7.5 0 1 0 10 0"/>`,
  // UI glyphs
  chevronRight: `<path ${S} stroke-width="2.6" d="m9 5 7 7-7 7"/>`,
  chevronLeft: `<path ${S} stroke-width="2.8" d="m15 4.5-7.5 7.5 7.5 7.5"/>`,
  chevronDown: `<path ${S} stroke-width="2.4" d="m6 9 6 6 6-6"/>`,
  plus: `<path ${S} stroke-width="2.4" d="M12 5v14M5 12h14"/>`,
  minus: `<path ${S} stroke-width="2.4" d="M5 12h14"/>`,
  xmark: `<path ${S} stroke-width="2.6" d="m6 6 12 12M18 6 6 18"/>`,
  trash: '<path d="M9 3.5h6l.8 1.5H20v2H4V5h4.2Z"/><path d="M5.5 8h13l-.9 12a1.5 1.5 0 0 1-1.5 1.4H7.9A1.5 1.5 0 0 1 6.4 20Z"/>',
  search: `<circle cx="10.5" cy="10.5" r="6.5" ${S} stroke-width="2.4"/><path ${S} stroke-width="2.6" d="m15.5 15.5 5 5"/>`,
  arrowDown: '<circle cx="12" cy="12" r="10"/><path fill="none" stroke="var(--glyph-cut, #1c1c1e)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 6.5v10m-4-4 4 4 4-4"/>',
  arrowUp: '<circle cx="12" cy="12" r="10"/><path fill="none" stroke="var(--glyph-cut, #1c1c1e)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 17.5v-10m-4 4 4-4 4 4"/>',
  delete: '<path d="M8.5 5h11A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11L2.5 12Z"/><path fill="none" stroke="var(--glyph-cut, #1c1c1e)" stroke-width="2" stroke-linecap="round" d="m11.5 9 6 6m0-6-6 6"/>',
};

export function icon(name, cls = '') {
  const g = GLYPHS[name] || GLYPHS.globe;
  return `<svg class="glyph ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${g}</svg>`;
}
