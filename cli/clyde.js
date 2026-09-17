#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const { spawn, execFileSync, spawnSync } = require('child_process');

// ─── Paths ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL = path.join(ROOT, '.env.local');
const SCHEMA_SQL = path.join(ROOT, 'db', 'schema.sql');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_DIR = path.join(ROOT, 'backend');
const WORKING_DIR = path.join(ROOT, 'working');
const BIN_DIR = process.platform === 'win32' ? 'Scripts' : 'bin';

const {
  parseEnv,
  serializeEnv,
  isConfigured,
  launchBindUrls,
  envNeedsUpdate,
  extractProjectRef,
  isValidAnthropicKey,
  isValidOpenRouterKey,
  isValidOpenAIKey,
  isValidLegacyJwtKey,
} = require('./lib/env');
const {
  isAuthFailure,
  isUnreachable,
  isLikelyIpv6Only,
  parsePoolerInput,
  connectSupabasePostgres,
  poolerOptions,
  sessionPoolerConnectUrl,
} = require('./lib/postgres');
const { normalizeSecret, isStaleEmptySecret } = require('./lib/secret');
const { portFromUrl, pickFreePort } = require('./lib/ports');
const { interpretSupabaseRestStatus, interpretSupabaseNetworkError, inspectSupabaseJwt } = require('./lib/supabase');
const { needsWizard, planRun, WIZARD_STEPS } = require('./lib/wizard-flow');
const { isDockerNoise, composeUpArgs, composeDownArgs, dockerChildEnv } = require('./lib/docker');

// ─── Brand Colors (ANSI True Color) ────────────────────────────────
const C = {
  green:  (s) => `\x1b[38;2;200;255;0m${s}\x1b[0m`,
  orange: (s) => `\x1b[38;2;255;107;53m${s}\x1b[0m`,
  teal:   (s) => `\x1b[38;2;0;212;170m${s}\x1b[0m`,
  white:  (s) => `\x1b[38;2;245;245;240m${s}\x1b[0m`,
  gray:   (s) => `\x1b[38;2;160;160;144m${s}\x1b[0m`,
  red:    (s) => `\x1b[38;2;255;59;48m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[22m`,
  dim:    (s) => `\x1b[2m${s}\x1b[22m`,
  check:  '\x1b[38;2;200;255;0m\u2713\x1b[0m',
  cross:  '\x1b[38;2;255;59;48m\u2717\x1b[0m',
  arrow:  '\x1b[38;2;255;107;53m\u25B6\x1b[0m',
  dot:    '\x1b[38;2;0;212;170m\u2022\x1b[0m',
};

// ─── ASCII Art Header ───────────────────────────────────────────────
function printHeader() {
  const art = [
    ' \x1b[38;2;200;255;0m\x1b[1m ██████╗██╗     ██╗   ██╗██████╗ ███████╗\x1b[0m',
    ' \x1b[38;2;200;255;0m\x1b[1m██╔════╝██║     ╚██╗ ██╔╝██╔══██╗██╔════╝\x1b[0m',
    ' \x1b[38;2;200;255;0m\x1b[1m██║     ██║      ╚████╔╝ ██║  ██║█████╗  \x1b[0m',
    ' \x1b[38;2;200;255;0m\x1b[1m██║     ██║       ╚██╔╝  ██║  ██║██╔══╝  \x1b[0m',
    ' \x1b[38;2;200;255;0m\x1b[1m╚██████╗███████╗   ██║   ██████╔╝███████╗\x1b[0m',
    ' \x1b[38;2;200;255;0m\x1b[1m ╚═════╝╚══════╝   ╚═╝   ╚═════╝ ╚══════╝\x1b[0m',
  ];

  console.log('');
  art.forEach(line => console.log(line));
  console.log('');
  console.log(C.orange('  Multi-Agent AI Orchestration System'));
  console.log(C.gray('  ──────────────────────────────────────────'));
  console.log('');
}

// ─── Spinner ────────────────────────────────────────────────────────
function createSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${C.teal(frames[i++ % frames.length])} ${C.white(message)}`);
  }, 80);

  return {
    succeed(msg) {
      clearInterval(interval);
      process.stdout.write(`\r  ${C.check} ${C.white(msg || message)}                    \n`);
    },
    fail(msg) {
      clearInterval(interval);
      process.stdout.write(`\r  ${C.cross} ${C.red(msg || message)}                    \n`);
    },
  };
}

// ─── Prompt Utilities ───────────────────────────────────────────────
function openTerminalInput() {
  if (process.platform === 'win32') {
    return { input: process.stdin, close() {} };
  }
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    const stream = fs.createReadStream(null, { fd, autoClose: true });
    return {
      input: stream,
      close() {
        stream.destroy();
      },
    };
  } catch {
    return { input: process.stdin, close() {} };
  }
}

function setTtyEcho(enabled) {
  if (process.platform === 'win32') return;
  try {
    const fd = fs.openSync('/dev/tty', 'r+');
    try {
      spawnSync('stty', [enabled ? 'echo' : '-echo'], { stdio: [fd, 'ignore', 'ignore'] });
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* leave echo as-is */ }
}

process.on('exit', () => setTtyEcho(true));

function promptSecretWindows(question) {
  return new Promise((resolve) => {
    process.stdout.write(`  ${C.arrow} ${C.white(question)} `);
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', (answer) => {
        rl.close();
        process.stdout.write('\n');
        resolve(normalizeSecret(answer));
      });
      return;
    }

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      const text = String(chunk);
      if (text === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.exit(1);
      }
      if (text === '\r' || text === '\n' || text === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(normalizeSecret(value));
        return;
      }
      if (text === '\u007f' || text === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += text;
    };
    stdin.on('data', onData);
  });
}

function promptLine(question, { secret = false } = {}) {
  if (secret && process.platform === 'win32') {
    return promptSecretWindows(question);
  }
  return new Promise((resolve) => {
    const tty = openTerminalInput();
    if (secret) setTtyEcho(false);
    let restored = false;
    const restore = () => {
      if (!secret || restored) return;
      restored = true;
      setTtyEcho(true);
    };
    const rl = readline.createInterface({
      input: tty.input,
      output: process.stdout,
      terminal: false,
    });
    rl.on('SIGINT', () => {
      restore();
      tty.close();
      process.exit(1);
    });
    rl.question(`  ${C.arrow} ${C.white(question)} `, (answer) => {
      rl.close();
      restore();
      tty.close();
      if (secret) process.stdout.write('\n');
      resolve(secret ? normalizeSecret(answer) : answer.trim());
    });
  });
}

function prompt(question) {
  return promptLine(question, { secret: false });
}

async function promptSecretOnce(question) {
  return promptLine(question, { secret: true });
}

async function promptSecret(question) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const started = Date.now();
    const value = await promptSecretOnce(question);
    if (isStaleEmptySecret(value, Date.now() - started, attempt)) continue;
    if (value) {
      console.log(C.gray(`  (${value.length} characters)`));
      return value;
    }
    console.log(`  ${C.cross} ${C.red('Nothing was received. Type or paste, then press Enter.')}`);
  }
}

async function promptWithValidation(question, validate, errorMsg, { secret = false } = {}) {
  while (true) {
    const value = secret ? await promptSecret(question) : await prompt(question);
    if (validate(value)) return value;
    console.log(`  ${C.cross} ${C.red(errorMsg)}`);
  }
}

async function promptYesNo(question) {
  const answer = await prompt(`${question} (y/n):`);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// ─── Shell helpers (safe, no injection) ─────────────────────────────
function npmInstall(cwd) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, ['install'], { cwd, stdio: 'pipe', timeout: 120000 });
}

// ─── Env File Utilities ─────────────────────────────────────────────
function loadEnvFile() {
  if (!fs.existsSync(ENV_LOCAL)) return {};
  return parseEnv(fs.readFileSync(ENV_LOCAL, 'utf8'));
}

function writeEnvFile(config) {
  const existing = fs.existsSync(ENV_LOCAL) ? loadEnvFile() : {};
  fs.writeFileSync(ENV_LOCAL, serializeEnv({ ...existing, ...config }));
}

// ─── First-Run Detection ────────────────────────────────────────────
function isFirstRun() {
  const envExists = fs.existsSync(ENV_LOCAL);
  return needsWizard(envExists, envExists ? loadEnvFile() : {});
}

// ─── Prerequisites Check ────────────────────────────────────────────
function checkPrerequisites() {
  console.log(C.bold(C.white('  Checking prerequisites...\n')));
  let allGood = true;

  // Node.js
  const nodeMajor = parseInt(process.versions.node.split('.')[0]);
  if (nodeMajor >= 20) {
    console.log(`  ${C.check} ${C.white(`Node.js ${process.versions.node}`)}`);
  } else {
    console.log(`  ${C.cross} ${C.white(`Node.js ${process.versions.node}`)} ${C.red('(need 20+)')}`);
    allGood = false;
  }

  // Python
  try {
    const result = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    const pyVersion = (result.stdout || result.stderr || '').trim();
    const pyMatch = pyVersion.match(/(\d+)\.(\d+)/);
    if (pyMatch && parseInt(pyMatch[1]) === 3 && parseInt(pyMatch[2]) >= 10) {
      console.log(`  ${C.check} ${C.white(pyVersion)}`);
    } else {
      console.log(`  ${C.cross} ${C.white(pyVersion)} ${C.red('(need 3.10+)')}`);
      allGood = false;
    }
  } catch {
    console.log(`  ${C.cross} ${C.red('Python 3 not found')}`);
    allGood = false;
  }

  // Git
  try {
    const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
    const gitVersion = (result.stdout || '').trim();
    console.log(`  ${C.check} ${C.white(gitVersion)}`);
  } catch {
    console.log(`  ${C.cross} ${C.red('Git not found')}`);
    allGood = false;
  }

  console.log('');
  if (!allGood) {
    console.log(C.red('  Please install the missing prerequisites and try again.\n'));
    process.exit(1);
  }
}

// ─── Setup Wizard ───────────────────────────────────────────────────
async function runSetupWizard() {
  console.log(C.bold(C.green('  FIRST-TIME SETUP\n')));

  // Agent provider selection
  console.log(C.bold(C.orange('  Agent Provider')));
  console.log('');
  console.log(C.gray('  1. Anthropic  — Claude Agent SDK (default)'));
  console.log(C.gray('  2. OpenRouter — LangChain Deep Agents (300+ models)'));
  console.log(C.gray('  (This can be changed later in Settings)'));
  console.log('');
  const providerChoice = await prompt('Choose provider (1 or 2):');
  const useOpenRouter = providerChoice.trim() === '2';
  console.log('');

  // Cost-saving mode — ask first
  console.log(C.bold(C.orange('  Model Configuration')));
  console.log('');
  if (useOpenRouter) {
    console.log(C.gray('  Default model: anthropic/claude-sonnet-4'));
    console.log(C.gray('  You can change the model anytime in Settings'));
  } else {
    console.log(C.gray('  Default: Clyde uses Opus, subagents use Sonnet'));
    console.log(C.gray('  Cost-saving: Clyde uses Sonnet, subagents use Haiku'));
  }
  console.log(C.gray('  (This can be changed later in Settings)'));
  console.log('');
  const costSaving = useOpenRouter ? false : await promptYesNo('Enable cost-saving mode?');
  if (!useOpenRouter) console.log('');

  console.log(C.gray('  You\'ll need your Supabase dashboard and API keys ready.'));
  console.log(C.gray('  Credentials are stored locally in .env.local and never shared.\n'));

  // Supabase
  console.log(C.bold(C.orange('  Supabase')));
  console.log('');
  console.log(C.gray('  Open your project, then:'));
  console.log(C.gray('    Gear (bottom left) > Project Settings > API Keys'));
  console.log(C.gray('    or click Connect at the top of the project.'));
  console.log('');
  console.log(C.gray('  Use the Legacy API keys tab:'));
  console.log(C.gray('    anon / public     → Anon Key  (starts with eyJ)'));
  console.log(C.gray('    service_role      → Service Role Key  (click the eye)'));
  console.log(C.gray('  Do not paste sb_publishable_ or sb_secret_ keys here.'));
  console.log(C.gray('  Paste is fine — input is hidden. Press Enter when done.'));
  console.log('');

  const supabaseUrl = await promptWithValidation(
    'Project URL:',
    (v) => /^https?:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v),
    'Expected format: https://<ref>.supabase.co — copy it from Connect or API Keys'
  );

  const supabaseAnonKey = await promptWithValidation(
    'Anon Key:',
    isValidLegacyJwtKey,
    'Use the legacy anon / public key (starts with eyJ). Not sb_publishable_.',
    { secret: true }
  );

  const supabaseServiceKey = await promptWithValidation(
    'Service Role Key:',
    isValidLegacyJwtKey,
    'Use the legacy service_role key (starts with eyJ). Not sb_secret_.',
    { secret: true }
  );

  console.log('');
  console.log(C.bold(C.orange('  Database')) + C.gray('  (password set when you created the project)'));
  console.log('');
  console.log(C.gray('  If schema deploy cannot reach the IPv6-only direct host, you will copy'));
  console.log(C.gray('  the Session pooler URI from Connect (not Direct, not Transaction pooler).'));
  console.log('');

  const dbPassword = await promptSecret('Database Password:');

  console.log('');

  let anthropicKey = '';
  let openaiKey = '';
  let openrouterKey = '';

  if (useOpenRouter) {
    console.log(C.bold(C.orange('  API Keys')));
    console.log('');
    console.log(C.gray('  OpenRouter — https://openrouter.ai/keys'));
    console.log(C.gray('    Sign in > Create Key > copy it immediately (starts with sk-or-).'));
    console.log(C.gray('    Add credit at https://openrouter.ai/settings/credits'));
    console.log(C.gray('    or the key will work in this wizard but API calls will fail.'));
    console.log(C.gray('  This is not an OpenAI key and not ChatGPT Plus.'));
    console.log('');

    openrouterKey = await promptWithValidation(
      'OpenRouter API Key:',
      isValidOpenRouterKey,
      'OpenRouter keys start with sk-or- — create one at https://openrouter.ai/keys',
      { secret: true }
    );

    console.log('');
    console.log(C.gray('  OpenAI is only for embeddings (search), not chat.'));
    console.log(C.gray('  Keys: https://platform.openai.com/api-keys  (sk- or sk-proj-)'));
    console.log(C.gray('  Not the Home page, and not ChatGPT. You can skip this'));
    console.log(C.gray('  if you want embeddings to go through OpenRouter instead.'));
    console.log('');
    const wantsOpenai = await promptYesNo('Add a separate OpenAI API Key for embeddings?');
    if (wantsOpenai) {
      openaiKey = await promptWithValidation(
        'OpenAI API Key:',
        isValidOpenAIKey,
        'Use https://platform.openai.com/api-keys — key should start with sk- (not sk-or-)',
        { secret: true }
      );
    }
  } else {
    console.log(C.bold(C.orange('  API Keys')));
    console.log('');
    console.log(C.gray('  Anthropic — https://console.anthropic.com/settings/keys  (sk-ant-)'));
    console.log(C.gray('  OpenAI    — https://platform.openai.com/api-keys  (sk- or sk-proj-)'));
    console.log(C.gray('    OpenAI is for embeddings. Not ChatGPT, not platform.openai.com/home.'));
    console.log('');

    anthropicKey = await promptWithValidation(
      'Anthropic API Key:',
      isValidAnthropicKey,
      'Key should start with "sk-ant-" — https://console.anthropic.com/settings/keys',
      { secret: true }
    );

    console.log('');
    console.log(C.gray('  OpenAI is only for embeddings (search), not chat.'));
    console.log(C.gray('  You can skip this and add OPENAI_API_KEY to .env.local later.'));
    console.log('');
    const wantsOpenai = await promptYesNo('Add an OpenAI API Key for embeddings?');
    if (wantsOpenai) {
      openaiKey = await promptWithValidation(
        'OpenAI API Key:',
        isValidOpenAIKey,
        'Use https://platform.openai.com/api-keys — key should start with sk- (not sk-or-)',
        { secret: true }
      );
    }
  }

  // Extract project ref
  const projectRef = extractProjectRef(supabaseUrl);

  const config = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl.replace(/\/$/, ''),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
    BACKEND_URL: 'http://127.0.0.1:8000',
    WORKING_DIR: WORKING_DIR,
  };

  // Add provider-specific keys
  if (anthropicKey) config.ANTHROPIC_API_KEY = anthropicKey;
  if (openaiKey) config.OPENAI_API_KEY = openaiKey;
  if (openrouterKey) config.OPENROUTER_API_KEY = openrouterKey;

  return { config, projectRef, dbPassword, costSaving, useOpenRouter };
}

// ─── Supabase Credential Test ────────────────────────────────────
function probeSupabaseKey(supabaseUrl, key, which, jwtOk = false) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL('/rest/v1/', supabaseUrl);
    } catch (err) {
      resolve(interpretSupabaseNetworkError(err));
      return;
    }
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      },
      timeout: 10000,
    }, (res) => {
      resolve(interpretSupabaseRestStatus(res.statusCode, which, { jwtOk }));
      res.resume();
    });

    req.on('error', (err) => resolve(interpretSupabaseNetworkError(err)));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: 'timeout', message: 'Connection timed out — check the Project URL.' });
    });
    req.end();
  });
}

async function testSupabaseCredentials(supabaseUrl, serviceRoleKey, anonKey) {
  const projectRef = extractProjectRef(supabaseUrl);

  const serviceJwt = inspectSupabaseJwt(serviceRoleKey, 'service_role', projectRef);
  if (!serviceJwt.ok) return serviceJwt;
  const service = await probeSupabaseKey(supabaseUrl, serviceRoleKey, 'service_role', true);
  if (!service.ok) return service;

  if (!anonKey) return service;
  const anonJwt = inspectSupabaseJwt(anonKey, 'anon', projectRef);
  if (!anonJwt.ok) return anonJwt;
  return probeSupabaseKey(supabaseUrl, anonKey, 'anon', true);
}

// ─── Schema Deployment ──────────────────────────────────────────────
function printSchemaManualSteps() {
  console.log(C.gray('  Apply the schema in the dashboard (no database password needed):'));
  console.log(C.gray('    1. Open the project > SQL Editor > New query'));
  console.log(C.gray('    2. Paste the contents of db/schema.sql'));
  console.log(C.gray('    3. Run — it is safe to run more than once.'));
  console.log(C.gray('  Or reset the DB password and re-run: npm run clyde -- --deploy-schema\n'));
}

function printDatabasePasswordHelp() {
  console.log(C.gray('  This is the Postgres password from Project Settings → Database,'));
  console.log(C.gray('  not the password you use to log into supabase.com.'));
  console.log(C.gray('  Reset it: Project Settings → Database → Reset database password.\n'));
}

function printPoolerHelp(projectRef) {
  console.log(C.gray('  1. Click Connect at the top of the project (green button).'));
  console.log(C.gray('  2. Stay on Connection String (not App Frameworks / ORMs / MCP).'));
  console.log(C.gray('  3. Choose Session pooler — not Direct connection, not Transaction pooler.'));
  console.log(C.gray('  4. Copy the URI. Host ends in pooler.supabase.com, port 5432.'));
  console.log(C.gray('     Leave [YOUR-PASSWORD] as-is; this wizard uses the password you typed.'));
  if (projectRef) {
    console.log(C.gray(`  Direct link: ${sessionPoolerConnectUrl(projectRef)}`));
  }
  console.log('');
}

async function pgConnect(pg, options) {
  const client = new pg.Client(options);
  try {
    await client.connect();
    return client;
  } catch (err) {
    try { await client.end(); } catch { /* ignore */ }
    throw err;
  }
}

async function connectPostgres(pg, projectRef, dbPassword, poolerInput) {
  return connectSupabasePostgres({
    connect: (options) => pgConnect(pg, options),
    projectRef,
    dbPassword,
    poolerInput,
  });
}

async function askForPooler(projectRef, dbPassword) {
  while (true) {
    const raw = await prompt('Paste Session pooler URI:');
    try {
      return parsePoolerInput(raw, projectRef, dbPassword);
    } catch (err) {
      console.log(`  ${C.cross} ${C.red(err.message)}`);
    }
  }
}

async function requirePg() {
  try {
    return require('pg');
  } catch {
    const installSpinner = createSpinner('Installing pg driver...');
    const result = npmInstall(ROOT);
    if (result.status !== 0) {
      installSpinner.fail('Failed to install pg driver');
      process.exit(1);
    }
    installSpinner.succeed('pg driver installed');
    return require('pg');
  }
}

async function deploySchema(projectRef, dbPassword) {
  const pg = await requirePg();
  return deploySchemaWithPg(pg, projectRef, dbPassword);
}

async function deploySchemaWithPg(pg, projectRef, dbPassword) {
  let spinner = createSpinner('Deploying database schema...');
  try {
    let client;
    try {
      client = await connectPostgres(pg, projectRef, dbPassword, '');
    } catch (err) {
      if (isAuthFailure(err)) throw err;
      if (err.code !== 'PG_UNREACHABLE' && !isUnreachable(err)) throw err;
      spinner.fail(
        isLikelyIpv6Only(err)
          ? 'Direct database host is unreachable (IPv6-only on new projects)'
          : 'Direct database host is unreachable'
      );
      printPoolerHelp(projectRef);
      const parsed = await askForPooler(projectRef, dbPassword);
      parsed.password = dbPassword;
      spinner = createSpinner('Connecting via session pooler...');
      try {
        client = await pgConnect(pg, poolerOptions(parsed));
      } catch (poolerErr) {
        if (!isAuthFailure(poolerErr)) throw poolerErr;
        spinner.fail(`Database password was rejected (${dbPassword.length} characters sent)`);
        printDatabasePasswordHelp();
        parsed.password = await promptSecret('Database Password:');
        spinner = createSpinner('Retrying session pooler...');
        client = await pgConnect(pg, poolerOptions(parsed));
      }
    }

    const schema = fs.readFileSync(SCHEMA_SQL, 'utf8');
    await client.query(schema);
    await client.end();

    spinner.succeed('Database schema deployed (8 tables, 1 function, 7 indexes)');
  } catch (err) {
    spinner.fail('Database schema deployment failed');

    if (err.code === 'PG_UNREACHABLE' || isUnreachable(err)) {
      console.log(C.red(`\n  Could not connect to Postgres.`));
      console.log(C.gray('  The REST API can still work; only the schema deploy uses this host.\n'));
      printSchemaManualSteps();
    } else if (isAuthFailure(err)) {
      console.log(C.red('\n  Database password was rejected by Postgres.'));
      printDatabasePasswordHelp();
      console.log(C.gray('  If the character count above does not match what you typed,'));
      console.log(C.gray('  the terminal dropped characters — paste the password instead.\n'));
      printSchemaManualSteps();
    } else if (err.message && err.message.includes('already exists')) {
      console.log(C.gray('  Schema already exists — skipping.\n'));
      return;
    } else {
      console.log(C.red(`\n  ${err.message}\n`));
      printSchemaManualSteps();
    }

    const answer = await prompt('Continue without schema deployment? (y/n):');
    if (answer.toLowerCase() !== 'y') process.exit(1);
  }
}

// ─── Dependency Installation ────────────────────────────────────────
async function installDependencies() {
  console.log('');
  console.log(C.bold(C.white('  Installing dependencies...\n')));

  // Root (pg)
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'pg'))) {
    const spinner = createSpinner('Installing root dependencies...');
    const result = npmInstall(ROOT);
    if (result.status !== 0) {
      spinner.fail('Root dependency install failed');
      console.log(C.red(`  ${(result.stderr || '').toString()}`));
      process.exit(1);
    }
    spinner.succeed('Root dependencies installed');
  } else {
    console.log(`  ${C.check} ${C.white('Root dependencies already installed')}`);
  }

  // Frontend
  if (!fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'))) {
    const spinner = createSpinner('Installing frontend dependencies...');
    const result = npmInstall(FRONTEND_DIR);
    if (result.status !== 0) {
      spinner.fail('Frontend install failed');
      console.log(C.red(`  ${(result.stderr || '').toString()}`));
      process.exit(1);
    }
    spinner.succeed('Frontend dependencies installed');
  } else {
    console.log(`  ${C.check} ${C.white('Frontend dependencies already installed')}`);
  }

  // Backend venv
  const venvPath = path.join(BACKEND_DIR, '.venv');
  if (!fs.existsSync(venvPath)) {
    const spinner = createSpinner('Creating Python virtual environment...');
    const result = spawnSync('python3', ['-m', 'venv', '.venv'], {
      cwd: BACKEND_DIR,
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      spinner.fail('Venv creation failed');
      console.log(C.red(`  ${(result.stderr || '').toString()}`));
      process.exit(1);
    }
    spinner.succeed('Python virtual environment created');
  }

  // Python requirements
  const pip = path.join(venvPath, BIN_DIR, 'pip');
  const spinner = createSpinner('Installing Python dependencies...');
  const pipResult = spawnSync(pip, ['install', '-r', 'requirements.txt'], {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    timeout: 180000,
  });
  if (pipResult.status !== 0) {
    spinner.fail('Python dependency install failed');
    console.log(C.red(`  ${(pipResult.stderr || '').toString()}`));
    process.exit(1);
  }
  spinner.succeed('Python dependencies installed');

  // Stamp the install so syncPythonDeps() knows deps are current
  try {
    const reqFile = path.join(BACKEND_DIR, 'requirements.txt');
    const stampFile = path.join(venvPath, '.deps-stamp');
    fs.writeFileSync(stampFile, String(fs.statSync(reqFile).mtimeMs));
  } catch { /* ignore */ }
}

// ─── Working Directory Setup ────────────────────────────────────────
function ensureWorkingDir() {
  const dirs = ['agents', 'prompts', 'memory', 'logs', 'output', 'skills', 'uploads', 'teams', 'workflows'];
  for (const dir of dirs) {
    const p = path.join(WORKING_DIR, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

// ─── Dependency Sync (returning users) ────────────────────────────────
function syncPythonDeps() {
  const venvPath = path.join(BACKEND_DIR, '.venv');
  const pip = path.join(venvPath, BIN_DIR, 'pip');
  if (!fs.existsSync(pip)) return; // no venv yet — first-run will handle it

  // Compare requirements.txt mtime against a stamp file to avoid running pip every launch
  const stampFile = path.join(venvPath, '.deps-stamp');
  const reqFile = path.join(BACKEND_DIR, 'requirements.txt');
  try {
    const reqMtime = fs.statSync(reqFile).mtimeMs;
    if (fs.existsSync(stampFile)) {
      const stampMtime = parseFloat(fs.readFileSync(stampFile, 'utf8'));
      if (reqMtime <= stampMtime) return; // already up to date
    }
  } catch { /* fall through to install */ }

  const spinner = createSpinner('Syncing Python dependencies...');
  const result = spawnSync(pip, ['install', '-r', 'requirements.txt', '--quiet'], {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    timeout: 180000,
  });
  if (result.status === 0) {
    spinner.succeed('Python dependencies synced');
    try { fs.writeFileSync(stampFile, String(fs.statSync(reqFile).mtimeMs)); } catch { /* ignore */ }
  } else {
    spinner.fail('Python dependency sync failed (non-fatal)');
    console.log(C.gray(`  ${(result.stderr || '').toString().trim()}`));
  }
}

// ─── Cost-Saving Mode ────────────────────────────────────────────────
function applyCostSavingMode() {
  const spinner = createSpinner('Applying cost-saving configuration...');

  try {
    // Update settings.json — Clyde → Sonnet, Subagents → Haiku
    const settingsPath = path.join(WORKING_DIR, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* use empty */ }
    }
    settings.clyde_model = 'sonnet';
    settings.subagent_default_model = 'haiku';
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Update teams.default.json orchestrator model
    const teamsDefaultPath = path.join(WORKING_DIR, 'teams', 'teams.default.json');
    if (fs.existsSync(teamsDefaultPath)) {
      try {
        const teamsData = JSON.parse(fs.readFileSync(teamsDefaultPath, 'utf8'));
        if (teamsData.orchestrator) {
          teamsData.orchestrator.model = 'sonnet';
        }
        fs.writeFileSync(teamsDefaultPath, JSON.stringify(teamsData, null, 2));
      } catch { /* non-critical */ }
    }

    spinner.succeed('Cost-saving mode enabled (Clyde: Sonnet, Subagents: Haiku)');
  } catch (err) {
    spinner.fail(`Failed to apply cost-saving mode: ${err.message}`);
  }
}

// ─── Docker Detection ───────────────────────────────────────────────
function checkDocker() {
  try {
    const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (docker.status !== 0) return false;
    const compose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 5000 });
    return compose.status === 0;
  } catch {
    return false;
  }
}

async function resolveLaunchBind() {
  const envFile = loadEnvFile();
  const preferredBackend = portFromUrl(envFile.BACKEND_URL || envFile.NEXT_PUBLIC_BACKEND_URL, 8000);
  const preferredFrontend = Number(envFile.FRONTEND_PORT) || 3020;
  const backendPort = await pickFreePort(preferredBackend);
  const frontendPort = await pickFreePort(preferredFrontend);
  const bind = launchBindUrls(backendPort, frontendPort);
  if (envNeedsUpdate(envFile, bind)) {
    writeEnvFile(bind);
    Object.assign(envFile, bind);
  }
  if (backendPort !== preferredBackend) {
    console.log(C.gray(`  Port ${preferredBackend} is in use — backend on ${backendPort}.`));
  }
  if (frontendPort !== preferredFrontend) {
    console.log(C.gray(`  Port ${preferredFrontend} is in use — frontend on ${frontendPort}.`));
  }
  return { envFile, backendPort, frontendPort, bind };
}

// ─── Docker Launcher ────────────────────────────────────────────────
async function launchDocker() {
  console.log(C.bold(C.green('  STARTING CLYDE (Docker)\n')));

  const composeFile = path.join(ROOT, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) {
    console.log(`  ${C.cross} ${C.red('docker-compose.yml not found')}`);
    process.exit(1);
  }

  const { envFile, backendPort, frontendPort, bind } = await resolveLaunchBind();

  console.log(`  ${C.dot} ${C.teal('Building and starting containers...')}`);
  console.log('');

  const docker = spawn('docker', composeUpArgs(), {
    cwd: ROOT,
    env: dockerChildEnv({
      processEnv: process.env,
      envFile,
      bind,
      backendPort,
      frontendPort,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browserOpened = false;

  const formatLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || isDockerNoise(trimmed)) return;
    if (trimmed.includes('ERROR') || trimmed.includes('Traceback') || /failed/i.test(trimmed)) {
      console.log(`  ${C.orange('[docker]')} ${C.red(trimmed)}`);
    } else {
      console.log(`  ${C.orange('[docker]')} ${C.gray(trimmed)}`);
    }

    if (!browserOpened && (trimmed.includes('Ready') || trimmed.includes(`localhost:${frontendPort}`))) {
      browserOpened = true;
      setTimeout(() => {
        const cmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        try {
          execFileSync(cmd, [`http://localhost:${frontendPort}`], { stdio: 'ignore' });
          console.log(`\n  ${C.check} ${C.white('Opened')} ${C.green(`http://localhost:${frontendPort}`)} ${C.white('in your browser')}\n`);
        } catch { /* best-effort */ }
      }, 1500);
    }
  };

  docker.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(formatLine);
  });
  docker.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(formatLine);
  });

  console.log(`  ${C.dot} ${C.teal('Backend')}  ${C.gray('\u2192')} ${C.white(`http://127.0.0.1:${backendPort}`)}`);
  console.log(`  ${C.dot} ${C.green('Frontend')} ${C.gray('\u2192')} ${C.white(`http://localhost:${frontendPort}`)}`);
  console.log('');
  console.log(C.gray('  Press Ctrl+C to stop\n'));

  const shutdown = () => {
    console.log(`\n  ${C.orange('Shutting down containers...')}`);
    const down = spawn('docker', composeDownArgs(), { cwd: ROOT, stdio: 'inherit' });
    down.on('exit', () => process.exit(0));
    setTimeout(() => process.exit(0), 10000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  docker.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`\n  ${C.cross} ${C.red(`Docker exited with code ${code}`)}`);
    }
  });
}

// ─── Run Mode Helpers ───────────────────────────────────────────────
function getRunMode() {
  const env = loadEnvFile();
  return env.RUN_MODE || null;
}

function setRunMode(mode) {
  writeEnvFile({ RUN_MODE: mode });
}

async function chooseRunMode() {
  const hasDocker = checkDocker();
  if (!hasDocker) return 'native';

  console.log('');
  console.log(C.bold(C.white('  How would you like to run Clyde?\n')));
  console.log(`  ${C.white('1.')} ${C.green('Native')}  ${C.gray('(Python venv + Node.js \u2014 requires Python 3.10+ & Node 20+)')}`);
  console.log(`  ${C.white('2.')} ${C.teal('Docker')}  ${C.gray('(Containerized \u2014 only requires Docker Desktop)')}`);
  console.log('');

  const answer = await prompt('Choose (1 or 2):');
  const mode = answer.trim() === '2' ? 'docker' : 'native';
  setRunMode(mode);
  return mode;
}

// ─── App Launcher ───────────────────────────────────────────────────
async function launchApp() {
  console.log(C.bold(C.green('  STARTING CLYDE\n')));

  const { envFile, backendPort, frontendPort, bind } = await resolveLaunchBind();
  const env = {
    ...process.env,
    ...envFile,
    ...bind,
    CORS_ORIGINS: `http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`,
  };
  const children = [];
  let browserOpened = false;

  if (!isConfigured(envFile)) {
    console.log(C.gray('  Provider keys are incomplete (need ANTHROPIC_API_KEY or OPENROUTER_API_KEY).'));
    console.log(C.gray('  The app will boot in limited mode until those are set in .env.local.\n'));
  }

  // Backend
  const uvicorn = path.join(BACKEND_DIR, '.venv', BIN_DIR, 'uvicorn');

  if (!fs.existsSync(uvicorn)) {
    console.log(`  ${C.cross} ${C.red('Backend not installed')} ${C.gray('(uvicorn not found)')}`);
    console.log(C.gray('  This usually means dependencies were not fully installed.\n'));
    const fix = await promptYesNo('Install backend dependencies now?');
    if (fix) {
      await installDependencies();
      if (!fs.existsSync(uvicorn)) {
        console.log(`\n  ${C.cross} ${C.red('uvicorn still not found after install. Check backend/requirements.txt.')}\n`);
        process.exit(1);
      }
    } else {
      console.log(C.gray('\n  Run the setup again or manually create the backend venv.\n'));
      process.exit(1);
    }
  }
  const backend = spawn(uvicorn, [
    'main:app', '--reload', '--host', '127.0.0.1', '--port', String(backendPort),
  ], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(backend);

  const formatLine = (prefix, colorFn, line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.includes('ERROR') || trimmed.includes('Traceback')) {
      console.log(`  ${colorFn(prefix)} ${C.red(trimmed)}`);
    } else {
      console.log(`  ${colorFn(prefix)} ${C.gray(trimmed)}`);
    }
  };

  backend.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(l => formatLine('[backend] ', C.teal, l));
  });
  backend.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(l => formatLine('[backend] ', C.teal, l));
  });

  // Frontend
  const nextBin = path.join(FRONTEND_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
  const frontend = spawn(nextBin, ['dev', '--port', String(frontendPort)], {
    cwd: FRONTEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(frontend);

  frontend.stdout.on('data', (data) => {
    const text = data.toString();
    text.split('\n').forEach(l => formatLine('[frontend]', C.green, l));

    if (!browserOpened && (text.includes('Ready') || text.includes(`localhost:${frontendPort}`))) {
      browserOpened = true;
      setTimeout(() => {
        const cmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        try {
          execFileSync(cmd, [`http://localhost:${frontendPort}`], { stdio: 'ignore' });
          console.log(`\n  ${C.check} ${C.white('Opened')} ${C.green(`http://localhost:${frontendPort}`)} ${C.white('in your browser')}\n`);
        } catch { /* best-effort */ }
      }, 1500);
    }
  });
  frontend.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(l => formatLine('[frontend]', C.green, l));
  });

  // Status line
  console.log(`  ${C.dot} ${C.teal('Backend')}  ${C.gray('\u2192')} ${C.white(`http://127.0.0.1:${backendPort}`)}`);
  console.log(`  ${C.dot} ${C.green('Frontend')} ${C.gray('\u2192')} ${C.white(`http://localhost:${frontendPort}`)}`);
  console.log('');
  console.log(C.gray('  Press Ctrl+C to stop\n'));

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n  ${C.orange('Shutting down...')}`);
    children.forEach(child => { if (!child.killed) child.kill('SIGTERM'); });
    setTimeout(() => {
      children.forEach(child => { if (!child.killed) child.kill('SIGKILL'); });
      process.exit(0);
    }, 3000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  backend.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`\n  ${C.cross} ${C.red(`Backend exited with code ${code}`)}`);
    }
  });

  frontend.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`\n  ${C.cross} ${C.red(`Frontend exited with code ${code}`)}`);
    }
  });
}

async function deploySchemaFromEnv() {
  const env = loadEnvFile();
  const projectRef = extractProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  console.log(C.bold(C.orange('  Deploy schema\n')));
  console.log(C.gray('  Paste is fine — input is hidden. A character count is shown after Enter.\n'));
  const dbPassword = await promptSecret('Database Password:');
  console.log('');
  await deploySchema(projectRef, dbPassword);
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  printHeader();

  let runMode = getRunMode();
  const envExists = fs.existsSync(ENV_LOCAL);
  const fileEnv = envExists ? loadEnvFile() : {};
  const plan = planRun({
    argv: process.argv,
    env: process.env,
    envExists,
    fileEnv,
    runMode,
  });

  if (plan.action === 'deploy-schema') {
    ensureWorkingDir();
    try {
      await deploySchemaFromEnv();
    } catch (err) {
      console.log(C.red(`\n  ${err.message}\n`));
      printSchemaManualSteps();
      process.exit(1);
    }
    if (isFirstRun()) {
      console.log(C.gray('  Schema deploy finished. Provider keys are still incomplete,'));
      console.log(C.gray('  so first-time setup did not run. Add ANTHROPIC_API_KEY or'));
      console.log(C.gray('  OPENROUTER_API_KEY to .env.local, then run npm run clyde.\n'));
    } else if (!isConfigured(loadEnvFile())) {
      console.log(C.gray('  Schema deploy finished. Add ANTHROPIC_API_KEY or OPENROUTER_API_KEY'));
      console.log(C.gray('  to .env.local, then run npm run clyde.\n'));
    } else {
      console.log(C.gray('  Schema deploy finished. Run npm run clyde to start the app.\n'));
    }
    return;
  } else if (plan.action === 'wizard') {
    // Setup wizard runs regardless of mode — credentials & schema are always needed
    const { config, projectRef, dbPassword, costSaving, useOpenRouter } = await runSetupWizard();

    // Write .env.local
    console.log('');
    const envSpinner = createSpinner('Writing .env.local...');
    writeEnvFile(config);
    envSpinner.succeed('.env.local created');

    // Test Supabase credentials before deploying schema
    let supabaseOk = false;
    const testSpinner = createSpinner('Testing Supabase credentials...');
    const testResult = await testSupabaseCredentials(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      config.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    if (testResult.ok) {
      testSpinner.succeed('Supabase credentials verified');
      supabaseOk = true;
    } else {
      testSpinner.fail(`Supabase credential check failed`);
      console.log(C.red(`\n  ${testResult.message}`));
      console.log(C.gray('  You can update the keys in Project Settings → API Keys (legacy tab),'));
      console.log(C.gray('  then paste them into .env.local or re-run setup.\n'));
    }

    // Deploy schema (skip if credentials failed)
    if (supabaseOk) {
      await deploySchema(projectRef, dbPassword);
    } else {
      console.log(`  ${C.gray('\u2298')} ${C.gray('Skipping schema deployment (Supabase credentials need fixing)')}`);
    }

    // Ask user how they want to run Clyde
    runMode = await chooseRunMode();

    if (runMode === 'native') {
      // Native mode: check prerequisites and install dependencies
      checkPrerequisites();
      await installDependencies();
    }

    // Ensure working directory
    ensureWorkingDir();

    // Apply provider selection to settings.json
    if (useOpenRouter) {
      try {
        const settingsPath = path.join(WORKING_DIR, 'settings.json');
        let settings = {};
        if (fs.existsSync(settingsPath)) {
          try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* use empty */ }
        }
        settings.agent_provider = 'openrouter';
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(`  ${C.check} ${C.white('Agent provider set to OpenRouter')}`);
      } catch (err) {
        console.log(C.orange(`  Warning: Could not write provider setting: ${err.message}`));
      }
    }

    // Apply cost-saving mode if selected
    if (costSaving) {
      applyCostSavingMode();
    }

    // Done
    console.log('');
    console.log(C.green('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
    console.log(C.bold(C.green('  SETUP COMPLETE')));
    console.log(C.green('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
    console.log('');
  } else {
    ensureWorkingDir();
    if (runMode !== 'docker') {
      syncPythonDeps();
    }
    console.log(`  ${C.check} ${C.white('Configuration detected')} ${runMode === 'docker' ? C.teal('(Docker mode)') : C.green('(Native mode)')}`);
    console.log('');
  }

  if (runMode === 'docker') {
    await launchDocker();
  } else {
    await launchApp();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(C.red(`\n  Fatal error: ${err.message}\n`));
    process.exit(1);
  });
}

module.exports = {
  main,
  planRun,
  isFirstRun,
  isDockerNoise,
  composeUpArgs,
  composeDownArgs,
  dockerChildEnv,
  WIZARD_STEPS,
};
