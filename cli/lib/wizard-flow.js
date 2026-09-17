'use strict';

const { hasSupabase, wantsDeploySchema } = require('./env');

function needsWizard(envExists, fileEnv = {}) {
  return !envExists || !hasSupabase(fileEnv);
}

function planRun({
  argv = process.argv,
  env = process.env,
  envExists = false,
  fileEnv = {},
  runMode = null,
} = {}) {
  if (wantsDeploySchema(argv, env)) {
    return { action: 'deploy-schema', launch: false };
  }
  if (needsWizard(envExists, fileEnv)) {
    return { action: 'wizard', launch: true };
  }
  return { action: 'launch', launch: true, mode: runMode || 'native' };
}

const WIZARD_STEPS = [
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
];

// Phrases the README must keep in lockstep with cli/clyde.js copy.
const README_LOCKSTEP = [
  'Project Settings',
  'API Keys',
  'Legacy',
  'sb_publishable_',
  'sb_secret_',
  'Session pooler',
  'Transaction pooler',
  '[YOUR-PASSWORD]',
  '--deploy-schema',
  '127.0.0.1',
  'sk-or-',
  'CLYDE_BACKEND_HOST_PORT',
  'npm test',
];

const README_STEP_MARKERS = {
  provider: 'Choose agent provider',
  costMode: 'Cost-saving mode',
  supabase: 'Collect Supabase credentials',
  databasePassword: 'Database password',
  providerKeys: 'Provider API keys',
  writeEnv: 'Write `.env.local`',
  testCredentials: 'Verify Supabase keys',
  deploySchema: 'Deploy the database schema',
  runMode: 'Choose how to run',
  installIfNative: 'installs dependencies',
  launch: '**Launch**',
};

module.exports = {
  needsWizard,
  planRun,
  WIZARD_STEPS,
  README_LOCKSTEP,
  README_STEP_MARKERS,
};
