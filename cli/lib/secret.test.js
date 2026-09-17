'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSecret, isStaleEmptySecret } = require('./secret');

describe('normalizeSecret', () => {
  it('keeps interior and edge spaces that trim() would strip', () => {
    assert.equal(normalizeSecret('  p@ss  '), '  p@ss  ');
  });

  it('strips CR/LF and bracketed-paste markers without changing the secret', () => {
    assert.equal(normalizeSecret('p@ss\r\n'), 'p@ss');
    assert.equal(normalizeSecret('\x1b[200~p@ss#word!\x1b[201~'), 'p@ss#word!');
  });

  it('does not decode percent sequences (pg gets the typed bytes)', () => {
    assert.equal(normalizeSecret('100%safe'), '100%safe');
  });
});

describe('isStaleEmptySecret', () => {
  it('ignores only the first instant-empty submit', () => {
    assert.equal(isStaleEmptySecret('', 12, 1), true);
    assert.equal(isStaleEmptySecret('', 12, 2), false);
    assert.equal(isStaleEmptySecret('', 400, 1), false);
    assert.equal(isStaleEmptySecret('p@ss', 12, 1), false);
  });
});
