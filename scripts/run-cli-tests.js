'use strict';

const { globSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = globSync('cli/**/*.test.js', { cwd: root }).sort();

if (!files.length) {
  console.log('No CLI tests found.');
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
