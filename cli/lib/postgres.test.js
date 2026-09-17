'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePoolerInput,
  connectSupabasePostgres,
  sessionPoolerConnectUrl,
  isAuthFailure,
  isUnreachable,
  isLikelyIpv6Only,
  isPlaceholderDbPassword,
} = require('./postgres');

const REF = 'xxqdombfkjxupwrrotol';
const PASSWORD = 'db-secret';

describe('parsePoolerInput', () => {
  it('parses a session pooler host', () => {
    assert.deepEqual(
      parsePoolerInput('aws-0-eu-west-2.pooler.supabase.com', REF, PASSWORD),
      {
        host: 'aws-0-eu-west-2.pooler.supabase.com',
        port: 5432,
        user: `postgres.${REF}`,
        password: PASSWORD,
      }
    );
  });

  it('parses a postgresql URI and ignores the [YOUR-PASSWORD] placeholder', () => {
    const uri = `postgresql://postgres.${REF}:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
    assert.deepEqual(parsePoolerInput(uri, REF, PASSWORD), {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${REF}`,
      password: PASSWORD,
    });
  });

  it('treats URL-encoded and unbracketed YOUR-PASSWORD as placeholders', () => {
    const encoded = `postgresql://postgres.${REF}:%5BYOUR-PASSWORD%5D@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    assert.equal(parsePoolerInput(encoded, REF, PASSWORD).password, PASSWORD);
    const plain = `postgresql://postgres.${REF}:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    assert.equal(parsePoolerInput(plain, REF, PASSWORD).password, PASSWORD);
  });

  it('keeps a real URI password and transaction-mode port', () => {
    const uri = `postgresql://postgres.${REF}:s3cret%21@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
    assert.deepEqual(parsePoolerInput(uri, REF, PASSWORD), {
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 6543,
      user: `postgres.${REF}`,
      password: 's3cret!',
    });
  });

  it('rejects empty or unrelated hosts', () => {
    assert.throws(() => parsePoolerInput('', REF, PASSWORD), /Session pooler URI from Connect/);
    assert.throws(() => parsePoolerInput('example.com', REF, PASSWORD), /pooler\.supabase\.com/);
  });
});

describe('sessionPoolerConnectUrl', () => {
  it('opens Connect on Session pooler, not ORMs', () => {
    assert.equal(
      sessionPoolerConnectUrl(REF),
      `https://supabase.com/dashboard/project/${REF}?showConnect=true&connectTab=direct&method=session&type=uri`
    );
  });
});

describe('connectSupabasePostgres', () => {
  it('uses the direct db host when it connects', async () => {
    const seen = [];
    const client = { ok: true };
    const result = await connectSupabasePostgres({
      projectRef: REF,
      dbPassword: PASSWORD,
      poolerInput: '',
      connect: async (options) => {
        seen.push(options.host);
        return client;
      },
    });
    assert.equal(result, client);
    assert.deepEqual(seen, [`db.${REF}.supabase.co`]);
  });

  it('does not fall back to the pooler on a bad password', async () => {
    await assert.rejects(
      () => connectSupabasePostgres({
        projectRef: REF,
        dbPassword: 'wrong',
        poolerInput: 'aws-0-eu-west-2.pooler.supabase.com',
        connect: async () => {
          const err = new Error('password authentication failed for user "postgres"');
          throw err;
        },
      }),
      (err) => isAuthFailure(err)
    );
  });

  it('falls back to the session pooler when the direct host is unreachable', async () => {
    const seen = [];
    const result = await connectSupabasePostgres({
      projectRef: REF,
      dbPassword: PASSWORD,
      poolerInput: 'aws-0-eu-west-2.pooler.supabase.com',
      connect: async (options) => {
        seen.push(`${options.user}@${options.host}:${options.port}`);
        if (options.host.startsWith('db.')) {
          const err = new Error('connect ENETUNREACH');
          err.code = 'ENETUNREACH';
          throw err;
        }
        return { ok: true };
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(seen, [
      `postgres@db.${REF}.supabase.co:5432`,
      `postgres.${REF}@aws-0-eu-west-2.pooler.supabase.com:5432`,
    ]);
  });

  it('signals PG_UNREACHABLE when no pooler input is available', async () => {
    await assert.rejects(
      () => connectSupabasePostgres({
        projectRef: REF,
        dbPassword: PASSWORD,
        poolerInput: '',
        connect: async () => {
          const err = new Error('getaddrinfo ENOTFOUND');
          err.code = 'ENOTFOUND';
          throw err;
        },
      }),
      (err) => err.code === 'PG_UNREACHABLE' && isUnreachable(err)
    );
  });

  it('does not hide unexpected errors behind PG_UNREACHABLE', async () => {
    await assert.rejects(
      () => connectSupabasePostgres({
        projectRef: REF,
        dbPassword: PASSWORD,
        poolerInput: '',
        connect: async () => {
          throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string');
        },
      }),
      (err) => /SCRAM/.test(err.message) && err.code !== 'PG_UNREACHABLE'
    );
  });
});

describe('isLikelyIpv6Only', () => {
  it('treats ENETUNREACH as IPv6-only, not ECONNREFUSED', () => {
    assert.equal(isLikelyIpv6Only({ code: 'ENETUNREACH' }), true);
    assert.equal(isLikelyIpv6Only({ code: 'ECONNREFUSED' }), false);
  });
});


describe('isPlaceholderDbPassword', () => {
  it('treats dashboard placeholders as empty', () => {
    assert.equal(isPlaceholderDbPassword(''), true);
    assert.equal(isPlaceholderDbPassword('[YOUR-PASSWORD]'), true);
    assert.equal(isPlaceholderDbPassword('%5BYOUR-PASSWORD%5D'), true);
    assert.equal(isPlaceholderDbPassword('YOUR-PASSWORD'), true);
    assert.equal(isPlaceholderDbPassword('db-secret'), false);
  });
});
