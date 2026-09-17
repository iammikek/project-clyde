'use strict';

const net = require('net');

function portFromUrl(url, fallback = 8000) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.port) return Number(parsed.port);
    if (parsed.protocol === 'https:') return 443;
    if (parsed.protocol === 'http:') return 80;
  } catch {
    /* fallback */
  }
  return fallback;
}

function tryListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (err) => {
      resolve(err && err.code === 'EADDRINUSE' ? false : true);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function isPortFree(port) {
  // Docker publishes 0.0.0.0, which can be busy even when 127.0.0.1 is free
  // (another compose stack, e.g. Floodwatch).
  for (const host of ['127.0.0.1', '0.0.0.0', '::1']) {
    if (!(await tryListen(port, host))) return false;
  }
  return true;
}

async function pickFreePort(preferred, { maxTries = 20 } = {}) {
  const start = Number(preferred) || 0;
  for (let i = 0; i < maxTries; i += 1) {
    const port = start + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found from ${start}–${start + maxTries - 1}`);
}

module.exports = {
  portFromUrl,
  tryListen,
  isPortFree,
  pickFreePort,
};
