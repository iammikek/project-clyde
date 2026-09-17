'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { portFromUrl, pickFreePort, isPortFree } = require('./ports');
const net = require('net');

describe('portFromUrl', () => {
  it('reads an explicit port', () => {
    assert.equal(portFromUrl('http://localhost:8001'), 8001);
    assert.equal(portFromUrl('http://127.0.0.1:8000/'), 8000);
  });

  it('falls back when the URL is missing', () => {
    assert.equal(portFromUrl('', 8000), 8000);
    assert.equal(portFromUrl('not-a-url', 3020), 3020);
  });
});

describe('pickFreePort', () => {
  it('skips a bound port and returns the next free one', async () => {
    const holder = net.createServer();
    await new Promise((resolve, reject) => {
      holder.once('error', reject);
      holder.listen(0, '127.0.0.1', resolve);
    });
    const busy = holder.address().port;
    try {
      const chosen = await pickFreePort(busy, { maxTries: 5 });
      assert.notEqual(chosen, busy);
      assert.equal(await isPortFree(chosen), true);
    } finally {
      await new Promise((resolve) => holder.close(resolve));
    }
  });

  it('treats 0.0.0.0 as busy (docker publish) even if 127.0.0.1 is free', async () => {
    const holder = net.createServer();
    await new Promise((resolve, reject) => {
      holder.once('error', reject);
      holder.listen(0, '0.0.0.0', resolve);
    });
    const busy = holder.address().port;
    try {
      assert.equal(await isPortFree(busy), false);
      const chosen = await pickFreePort(busy, { maxTries: 5 });
      assert.notEqual(chosen, busy);
    } finally {
      await new Promise((resolve) => holder.close(resolve));
    }
  });
});
