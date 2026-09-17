'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planRun, needsWizard, WIZARD_STEPS } = require('./wizard-flow');

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service',
};

describe('planRun', () => {
  it('exits after --deploy-schema without launching', () => {
    const plan = planRun({
      argv: ['node', 'cli/clyde.js', '--deploy-schema'],
      envExists: true,
      fileEnv: supabase,
      runMode: 'native',
    });
    assert.deepEqual(plan, { action: 'deploy-schema', launch: false });
  });

  it('runs the wizard when .env.local is missing', () => {
    const plan = planRun({
      argv: ['node', 'cli/clyde.js'],
      envExists: false,
      fileEnv: {},
    });
    assert.equal(plan.action, 'wizard');
    assert.equal(plan.launch, true);
  });

  it('launches without the wizard once Supabase keys exist', () => {
    const plan = planRun({
      argv: ['node', 'cli/clyde.js'],
      envExists: true,
      fileEnv: supabase,
      runMode: 'docker',
    });
    assert.deepEqual(plan, { action: 'launch', launch: true, mode: 'docker' });
  });
});

describe('needsWizard', () => {
  it('is true until the Supabase trio is present', () => {
    assert.equal(needsWizard(false, {}), true);
    assert.equal(needsWizard(true, supabase), false);
    assert.equal(needsWizard(true, { ...supabase, ANTHROPIC_API_KEY: 'undefined' }), false);
  });
});

describe('WIZARD_STEPS', () => {
  it('matches the CLI order: provider before keys, schema before launch', () => {
    assert.deepEqual(WIZARD_STEPS, [
      'provider',
      'costMode',
      'supabase',
      'databasePassword',
      'providerKeys',
      'writeEnv',
      'testCredentials',
      'deploySchema',
      'runMode',
      'installIfNative',
      'launch',
    ]);
  });
});
