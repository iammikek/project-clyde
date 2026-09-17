'use strict';

function isAuthFailure(err) {
  return /password authentication failed/i.test(err && err.message ? err.message : '');
}

function isLikelyIpv6Only(err) {
  const code = err && err.code;
  return (
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  );
}

function isUnreachable(err) {
  const code = err && err.code;
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'EAI_AGAIN' ||
    code === 'PG_UNREACHABLE' ||
    /timeout/i.test(err && err.message ? err.message : '')
  );
}

function unreachableError(message) {
  const err = new Error(message || 'Could not reach Supabase Postgres over IPv4 or IPv6');
  err.code = 'PG_UNREACHABLE';
  return err;
}

function sessionPoolerConnectUrl(projectRef) {
  if (!projectRef) return '';
  return `https://supabase.com/dashboard/project/${projectRef}?showConnect=true&connectTab=direct&method=session&type=uri`;
}

function isPlaceholderDbPassword(value) {
  let text = String(value || '').trim();
  if (!text) return true;
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep raw */
  }
  return /your[-_ ]?password/i.test(text) || /^\[?password\]?$/i.test(text);
}

function parsePoolerInput(raw, projectRef, dbPassword) {
  const trimmed = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) {
    throw new Error('Paste the Session pooler URI from Connect (green Connect button, then Session pooler)');
  }

  if (/^postgres(ql)?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Could not parse that URI. Copy it from Connect → Session pooler.');
    }

    const username = decodeURIComponent(url.username || '');
    const urlPassword = decodeURIComponent(url.password || '');
    // Host/user/port come from the URI. Use a real URI password if present;
    // otherwise keep the password typed in the wizard.
    const password = isPlaceholderDbPassword(urlPassword) ? dbPassword : urlPassword;

    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      user: username || `postgres.${projectRef}`,
      password,
    };
  }

  const [host, portPart] = trimmed.split(':');
  const port = portPart ? parseInt(portPart, 10) : 5432;
  if (Number.isNaN(port)) {
    throw new Error('Expected a *.pooler.supabase.com host or a URI from Connect → Session pooler');
  }

  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    return { host, port, user: 'postgres', password: dbPassword };
  }

  if (!/pooler\.supabase\.com$/i.test(host)) {
    throw new Error('Expected a *.pooler.supabase.com host or a URI from Connect → Session pooler');
  }

  return {
    host,
    port,
    user: `postgres.${projectRef}`,
    password: dbPassword,
  };
}

function directOptions(projectRef, dbPassword) {
  return {
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  };
}

function poolerOptions(parsed) {
  return {
    host: parsed.host,
    port: parsed.port,
    database: 'postgres',
    user: parsed.user,
    password: parsed.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  };
}

async function connectSupabasePostgres({
  connect,
  projectRef,
  dbPassword,
  poolerInput,
}) {
  try {
    return await connect(directOptions(projectRef, dbPassword));
  } catch (err) {
    if (isAuthFailure(err)) throw err;
    if (!isUnreachable(err)) throw err;
  }

  if (!poolerInput || !String(poolerInput).trim()) {
    throw unreachableError();
  }

  const parsed = parsePoolerInput(poolerInput, projectRef, dbPassword);
  return connect(poolerOptions(parsed));
}

module.exports = {
  isAuthFailure,
  isUnreachable,
  isLikelyIpv6Only,
  unreachableError,
  sessionPoolerConnectUrl,
  parsePoolerInput,
  isPlaceholderDbPassword,
  directOptions,
  poolerOptions,
  connectSupabasePostgres,
};
