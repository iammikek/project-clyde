'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const clyde = require('./clyde.js');
const { planRun, WIZARD_STEPS, README_LOCKSTEP, README_STEP_MARKERS } = require('./lib/wizard-flow');

describe('cli/clyde.js', () => {
  it('does not start the app when required as a module', () => {
    assert.equal(typeof clyde.main, 'function');
    assert.equal(clyde.planRun, planRun);
    assert.deepEqual(clyde.WIZARD_STEPS, WIZARD_STEPS);
  });

  it('exits after --deploy-schema without launching', () => {
    const plan = clyde.planRun({
      argv: ['node', 'cli/clyde.js', '--deploy-schema'],
      envExists: false,
      fileEnv: {},
    });
    assert.deepEqual(plan, { action: 'deploy-schema', launch: false });
  });

  it('runs the wizard until the Supabase trio exists', () => {
    assert.equal(clyde.planRun({
      argv: ['node', 'cli/clyde.js'],
      envExists: false,
      fileEnv: {},
    }).action, 'wizard');
    assert.equal(clyde.planRun({
      argv: ['node', 'cli/clyde.js'],
      envExists: true,
      fileEnv: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service',
      },
      runMode: 'native',
    }).action, 'launch');
  });

  it('filters Docker BuildKit noise and remaps host ports', () => {
    assert.equal(clyde.isDockerNoise('#28 exporting layers 10.7s done'), true);
    assert.equal(clyde.isDockerNoise('Bind for 0.0.0.0:8000 failed'), false);
    assert.deepEqual(clyde.composeUpArgs(), [
      'compose', '--env-file', '.env.local', '--progress', 'quiet', 'up', '--build',
    ]);
    const env = clyde.dockerChildEnv({
      backendPort: 8001,
      frontendPort: 3021,
    });
    assert.equal(env.CLYDE_BACKEND_HOST_PORT, '8001');
    assert.equal(env.CLYDE_FRONTEND_HOST_PORT, '3021');
    assert.match(env.CORS_ORIGINS, /127\.0\.0\.1:3021/);
  });
});

describe('README lockstep with the wizard', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, 'clyde.js'), 'utf8');

  for (const phrase of README_LOCKSTEP) {
    it(`documents ${JSON.stringify(phrase)}`, () => {
      assert.ok(readme.includes(phrase), `README.md is missing ${JSON.stringify(phrase)}`);
    });
  }

  it('lists wizard steps in CLI order', () => {
    let last = -1;
    for (const step of WIZARD_STEPS) {
      const marker = README_STEP_MARKERS[step];
      const idx = readme.indexOf(marker);
      assert.ok(idx !== -1, `README.md is missing wizard step marker ${JSON.stringify(marker)}`);
      assert.ok(idx > last, `README.md lists ${step} before the previous wizard step`);
      last = idx;
    }
  });

  it('keeps the Connect Session pooler steps in the CLI', () => {
    assert.match(source, /Stay on Connection String/);
    assert.match(source, /Choose Session pooler/);
    assert.match(source, /Leave \[YOUR-PASSWORD\] as-is/);
    assert.match(source, /Legacy API keys tab/);
  });
});
