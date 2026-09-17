'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseEnv,
  serializeEnv,
  isPlaceholder,
  isConfigured,
  hasSupabase,
  extractProjectRef,
  wantsDeploySchema,
  isValidAnthropicKey,
  isValidOpenRouterKey,
  isValidOpenAIKey,
  isValidLegacyJwtKey,
  launchBindUrls,
  envNeedsUpdate,
} = require('./env');

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service',
};

describe('serializeEnv', () => {
  it('omits undefined provider keys instead of writing "undefined"', () => {
    const text = serializeEnv({
      ...supabase,
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      WORKING_DIR: '/tmp/working',
    });
    assert.equal(text.includes('ANTHROPIC_API_KEY='), false);
    assert.equal(text.includes('OPENAI_API_KEY='), false);
    assert.equal(text.includes('undefined'), false);
    assert.match(text, /^# OpenRouter\nOPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz$/m);
  });

  it('persists OpenRouter, Anthropic, and OpenAI when all are set', () => {
    const text = serializeEnv({
      ...supabase,
      ANTHROPIC_API_KEY: 'sk-ant-abcdefghijklmnopqrstuvwxyz',
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
      WORKING_DIR: '/tmp/working',
    });
    assert.match(text, /ANTHROPIC_API_KEY=sk-ant-/);
    assert.match(text, /OPENROUTER_API_KEY=sk-or-/);
    assert.match(text, /OPENAI_API_KEY=sk-proj-/);
  });

  it('writes NEXT_PUBLIC_BACKEND_URL to match BACKEND_URL', () => {
    const text = serializeEnv({
      ...supabase,
      ANTHROPIC_API_KEY: 'sk-ant-abcdefghijklmnopqrstuvwxyz',
      OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
      BACKEND_URL: 'http://localhost:8001',
      WORKING_DIR: '/tmp/working',
    });
    assert.match(text, /BACKEND_URL=http:\/\/localhost:8001/);
    assert.match(text, /NEXT_PUBLIC_BACKEND_URL=http:\/\/localhost:8001/);
    assert.match(text, /NEXT_PUBLIC_BACKEND_WS_URL=ws:\/\/localhost:8001/);
  });

  it('defaults backend URLs to 127.0.0.1 to avoid IPv6 localhost', () => {
    const text = serializeEnv({
      ...supabase,
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      WORKING_DIR: '/tmp/working',
    });
    assert.match(text, /BACKEND_URL=http:\/\/127\.0\.0\.1:8000/);
    assert.match(text, /NEXT_PUBLIC_BACKEND_URL=http:\/\/127\.0\.0\.1:8000/);
  });

  it('keeps extra keys such as RUN_MODE', () => {
    const text = serializeEnv({
      ...supabase,
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      WORKING_DIR: '/tmp/working',
      RUN_MODE: 'native',
      FRONTEND_PORT: '3021',
    });
    assert.match(text, /^RUN_MODE=native$/m);
    assert.match(text, /^FRONTEND_PORT=3021$/m);
  });
});

describe('isConfigured / first-run', () => {
  it('treats Supabase-only env as ready to boot without re-running the wizard', () => {
    const env = {
      ...supabase,
      ANTHROPIC_API_KEY: 'undefined',
      OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
    };
    assert.equal(hasSupabase(env), true);
    assert.equal(isConfigured(env), false);
  });

  it('treats placeholder example files as unconfigured', () => {
    const env = parseEnv(`
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-proj-...
`);
    assert.equal(isConfigured(env), false);
  });

  it('accepts OpenRouter without Anthropic or OpenAI', () => {
    assert.equal(isConfigured({
      ...supabase,
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
    }), true);
  });

  it('accepts Anthropic without OpenAI', () => {
    assert.equal(isConfigured({
      ...supabase,
      ANTHROPIC_API_KEY: 'sk-ant-abcdefghijklmnopqrstuvwxyz',
    }), true);
  });

  it('rejects literal undefined values from old wizard writes', () => {
    assert.equal(isPlaceholder('undefined'), true);
    assert.equal(isPlaceholder('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.undefinedpayload'), false);
    assert.equal(isConfigured({
      ...supabase,
      ANTHROPIC_API_KEY: 'undefined',
      OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
    }), true);
  });
});

describe('key validators', () => {
  it('does not treat OpenRouter keys as OpenAI keys', () => {
    assert.equal(isValidOpenAIKey('sk-or-v1-abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(isValidOpenAIKey('sk-ant-abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(isValidOpenAIKey('sk-proj-abcdefghijklmnopqrstuvwxyz'), true);
    assert.equal(isValidOpenRouterKey('sk-or-v1-abcdefghijklmnopqrstuvwxyz'), true);
    assert.equal(isValidAnthropicKey('sk-ant-abcdefghijklmnopqrstuvwxyz'), true);
  });

  it('rejects dashboard JWT placeholders', () => {
    assert.equal(isValidLegacyJwtKey('eyJ...'), false);
    assert.equal(isValidLegacyJwtKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload'), true);
  });
});

describe('extractProjectRef', () => {
  it('reads the ref from a project URL', () => {
    assert.equal(
      extractProjectRef('https://xxqdombfkjxupwrrotol.supabase.co/'),
      'xxqdombfkjxupwrrotol'
    );
  });
});

describe('wantsDeploySchema', () => {
  it('detects the flag before first-run, including npm config', () => {
    assert.equal(wantsDeploySchema(['node', 'cli/clyde.js'], {}), false);
    assert.equal(wantsDeploySchema(['node', 'cli/clyde.js', '--deploy-schema'], {}), true);
    assert.equal(wantsDeploySchema(['node', 'cli/clyde.js'], { npm_config_deploy_schema: 'true' }), true);
  });

  it('still deploys when the env file is only partly configured', () => {
    assert.equal(isConfigured({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service',
      ANTHROPIC_API_KEY: 'undefined',
      OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
    }), false);
    assert.equal(wantsDeploySchema(['node', 'cli/clyde.js', '--deploy-schema'], {}), true);
  });
});

describe('launchBindUrls / envNeedsUpdate', () => {
  it('binds 127.0.0.1 and records the frontend port', () => {
    assert.deepEqual(launchBindUrls(8001, 3021), {
      BACKEND_URL: 'http://127.0.0.1:8001',
      NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:8001',
      NEXT_PUBLIC_BACKEND_WS_URL: 'ws://127.0.0.1:8001',
      FRONTEND_PORT: '3021',
    });
  });

  it('detects when launch URLs drifted from the env file', () => {
    assert.equal(envNeedsUpdate({ BACKEND_URL: 'http://localhost:8000' }, { BACKEND_URL: 'http://127.0.0.1:8000' }), true);
    assert.equal(envNeedsUpdate({ BACKEND_URL: 'http://127.0.0.1:8001' }, { BACKEND_URL: 'http://127.0.0.1:8001' }), false);
  });
});
