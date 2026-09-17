'use strict';

// Terminals wrap pasted text in these markers. If they leak into the value,
// Postgres/API servers reject a password that looked fine while typing.
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

function normalizeSecret(value) {
  let text = String(value == null ? '' : value);
  while (text.includes(BRACKETED_PASTE_START)) {
    text = text.replace(BRACKETED_PASTE_START, '');
  }
  while (text.includes(BRACKETED_PASTE_END)) {
    text = text.replace(BRACKETED_PASTE_END, '');
  }
  // Do not trim(): leading/trailing spaces can be part of a generated password.
  return text.replace(/\r/g, '').replace(/\n/g, '');
}

// npm run / the shell can leave a leftover Enter on stdin. That submits the
// first prompt empty in a few milliseconds — ignore that once, then wait.
function isStaleEmptySecret(value, elapsedMs, attempt) {
  return !value && attempt === 1 && elapsedMs < 250;
}

module.exports = {
  normalizeSecret,
  isStaleEmptySecret,
};
