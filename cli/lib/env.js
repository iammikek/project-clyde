'use strict';

const PLACEHOLDERS = [
  'sk-ant-...',
  'sk-or-...',
  'sk-proj-...',
  'your-project.supabase.co',
  'eyJ...',
  '/path/to/',
  '[YOUR-PASSWORD]',
];

const SERIALIZED_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'BACKEND_URL',
  'NEXT_PUBLIC_BACKEND_URL',
  'NEXT_PUBLIC_BACKEND_WS_URL',
  'WORKING_DIR',
]);

function parseEnv(content) {
  const env = {};
  for (const line of String(content || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
  }
  return env;
}

function isPlaceholder(value) {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text || text === 'undefined') return true;
  return PLACEHOLDERS.some((p) => text.includes(p));
}

function present(value) {
  return !isPlaceholder(value);
}

function backendUrls(backendUrl) {
  const url = present(backendUrl) ? backendUrl.replace(/\/$/, '') : 'http://127.0.0.1:8000';
  return {
    BACKEND_URL: url,
    NEXT_PUBLIC_BACKEND_URL: url,
    NEXT_PUBLIC_BACKEND_WS_URL: url.replace(/^http/, 'ws'),
  };
}

function appendSection(lines, comment, entries) {
  const rows = entries.filter(([, value]) => present(value));
  if (!rows.length) return;
  lines.push(comment);
  for (const [key, value] of rows) {
    lines.push(`${key}=${value}`);
  }
  lines.push('');
}

function extraEnvEntries(config = {}) {
  return Object.keys(config)
    .filter((key) => !SERIALIZED_KEYS.has(key) && present(config[key]))
    .sort()
    .map((key) => [key, config[key]]);
}

function serializeEnv(config = {}) {
  const urls = backendUrls(config.BACKEND_URL || config.NEXT_PUBLIC_BACKEND_URL);
  const lines = [];

  appendSection(lines, '# Anthropic', [
    ['ANTHROPIC_API_KEY', config.ANTHROPIC_API_KEY],
  ]);
  appendSection(lines, '# OpenRouter', [
    ['OPENROUTER_API_KEY', config.OPENROUTER_API_KEY],
  ]);
  appendSection(lines, '# Supabase', [
    ['NEXT_PUBLIC_SUPABASE_URL', config.NEXT_PUBLIC_SUPABASE_URL],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', config.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', config.SUPABASE_SERVICE_ROLE_KEY],
  ]);
  appendSection(lines, '# OpenAI (embeddings)', [
    ['OPENAI_API_KEY', config.OPENAI_API_KEY],
  ]);

  lines.push('# Backend');
  lines.push(`BACKEND_URL=${urls.BACKEND_URL}`);
  lines.push(`NEXT_PUBLIC_BACKEND_URL=${urls.NEXT_PUBLIC_BACKEND_URL}`);
  lines.push(`NEXT_PUBLIC_BACKEND_WS_URL=${urls.NEXT_PUBLIC_BACKEND_WS_URL}`);
  lines.push('');
  lines.push('# Working directory (absolute path)');
  lines.push(`WORKING_DIR=${present(config.WORKING_DIR) ? config.WORKING_DIR : ''}`);
  lines.push('');

  appendSection(lines, '# Other', extraEnvEntries(config));

  return lines.join('\n');
}

function hasSupabase(env = {}) {
  return (
    present(env.NEXT_PUBLIC_SUPABASE_URL) &&
    present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    present(env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

function isConfigured(env = {}) {
  if (!hasSupabase(env)) return false;
  return present(env.ANTHROPIC_API_KEY) || present(env.OPENROUTER_API_KEY);
}

function extractProjectRef(supabaseUrl) {
  const match = String(supabaseUrl || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) {
    throw new Error('Could not read project ref from Supabase URL');
  }
  return match[1];
}

function wantsDeploySchema(argv = process.argv, env = process.env) {
  if (argv.some((arg) => arg === '--deploy-schema' || arg === 'deploy-schema')) {
    return true;
  }
  const npmFlag = env.npm_config_deploy_schema;
  return npmFlag === '' || npmFlag === 'true';
}

function isValidAnthropicKey(value) {
  return /^sk-ant-\S{20,}$/.test(String(value || '').trim());
}

function isValidOpenRouterKey(value) {
  return /^sk-or-\S{20,}$/.test(String(value || '').trim());
}

function isValidOpenAIKey(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('sk-') || text.length <= 20) return false;
  if (text.startsWith('sk-or-') || text.startsWith('sk-ant-')) return false;
  return true;
}

function isValidLegacyJwtKey(value) {
  const text = String(value || '').trim();
  return text.startsWith('eyJ') && text.length > 30 && !text.includes('eyJ...');
}

function launchBindUrls(backendPort, frontendPort) {
  return {
    ...backendUrls(`http://127.0.0.1:${backendPort}`),
    FRONTEND_PORT: String(frontendPort),
  };
}

function envNeedsUpdate(current, updates) {
  return Object.keys(updates).some((key) => String(current[key] || '') !== String(updates[key]));
}

module.exports = {
  PLACEHOLDERS,
  SERIALIZED_KEYS,
  parseEnv,
  isPlaceholder,
  present,
  backendUrls,
  extraEnvEntries,
  serializeEnv,
  hasSupabase,
  isConfigured,
  extractProjectRef,
  wantsDeploySchema,
  isValidAnthropicKey,
  isValidOpenRouterKey,
  isValidOpenAIKey,
  isValidLegacyJwtKey,
  launchBindUrls,
  envNeedsUpdate,
};
