'use strict';

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function projectRefFromJwt(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.ref) return String(payload.ref);
  const iss = String(payload.iss || '');
  const match = iss.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : '';
}

function inspectSupabaseJwt(token, expectedRole, projectRef) {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    const label = expectedRole === 'anon' ? 'anon / public' : 'service_role';
    return {
      ok: false,
      reason: 'jwt',
      which: expectedRole,
      message: `Could not read that ${label} key. Paste the legacy eyJ JWT from Project Settings → API Keys.`,
    };
  }

  if (payload.role && payload.role !== expectedRole) {
    const want = expectedRole === 'anon' ? 'anon / public' : 'service_role';
    return {
      ok: false,
      reason: 'role',
      which: expectedRole,
      message: `That key has role "${payload.role}", not ${expectedRole}. Copy ${want} from the Legacy API keys tab.`,
    };
  }

  const tokenRef = projectRefFromJwt(payload);
  if (projectRef && tokenRef && tokenRef !== projectRef) {
    return {
      ok: false,
      reason: 'ref',
      which: expectedRole,
      message: `That key belongs to project ${tokenRef}, not ${projectRef}.`,
    };
  }

  return { ok: true, payload };
}

function interpretSupabaseRestStatus(statusCode, which = 'service_role', { jwtOk = false } = {}) {
  if (statusCode === 200 || statusCode === 404) return { ok: true };
  // Valid anon JWTs often get 401/403 on GET /rest/v1/ because of RLS / OpenAPI root.
  if ((statusCode === 401 || statusCode === 403) && which === 'anon' && jwtOk) {
    return { ok: true };
  }
  if (statusCode === 401 || statusCode === 403) {
    const label = which === 'anon' ? 'anon / public' : 'service_role';
    return {
      ok: false,
      reason: 'auth',
      which,
      message: `Invalid ${label} key — use the legacy eyJ key from Project Settings → API Keys.`,
    };
  }
  return {
    ok: false,
    reason: 'http',
    which,
    message: `Unexpected HTTP ${statusCode} from Supabase (${which}).`,
  };
}

function interpretSupabaseNetworkError(err) {
  const code = err && err.code;
  if (code === 'ENOTFOUND' || code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return { ok: false, reason: 'dns', message: 'Could not reach that Supabase URL — check the Project URL.' };
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
    return { ok: false, reason: 'network', message: 'Connection timed out — check the Project URL and your network.' };
  }
  return { ok: false, reason: 'unknown', message: `Connection failed: ${err && err.message ? err.message : 'unknown error'}` };
}

module.exports = {
  decodeJwtPayload,
  projectRefFromJwt,
  inspectSupabaseJwt,
  interpretSupabaseRestStatus,
  interpretSupabaseNetworkError,
};
