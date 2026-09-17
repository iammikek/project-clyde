'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeJwtPayload,
  inspectSupabaseJwt,
  interpretSupabaseRestStatus,
  interpretSupabaseNetworkError,
} = require('./supabase');

function fakeJwt(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${body}.sig`;
}

describe('inspectSupabaseJwt', () => {
  it('accepts a matching anon JWT even if REST would 401', () => {
    const token = fakeJwt({ role: 'anon', ref: 'abcdefghijklmnop' });
    assert.equal(inspectSupabaseJwt(token, 'anon', 'abcdefghijklmnop').ok, true);
  });

  it('rejects swapping service_role into the anon field', () => {
    const token = fakeJwt({ role: 'service_role', ref: 'abcdefghijklmnop' });
    const result = inspectSupabaseJwt(token, 'anon', 'abcdefghijklmnop');
    assert.equal(result.ok, false);
    assert.match(result.message, /service_role/);
  });

  it('rejects a key from another project', () => {
    const token = fakeJwt({ role: 'anon', ref: 'otherprojectrefxx' });
    const result = inspectSupabaseJwt(token, 'anon', 'abcdefghijklmnop');
    assert.equal(result.ok, false);
    assert.match(result.message, /otherprojectrefxx/);
  });
});

describe('interpretSupabaseRestStatus', () => {
  it('treats 200 and 404 as valid credentials', () => {
    assert.equal(interpretSupabaseRestStatus(200).ok, true);
    assert.equal(interpretSupabaseRestStatus(404).ok, true);
  });

  it('treats anon 401 as ok when the JWT already checked out', () => {
    assert.equal(interpretSupabaseRestStatus(401, 'anon', { jwtOk: true }).ok, true);
    assert.equal(interpretSupabaseRestStatus(401, 'anon', { jwtOk: false }).ok, false);
    assert.equal(interpretSupabaseRestStatus(401, 'service_role', { jwtOk: true }).ok, false);
  });

  it('names which key failed', () => {
    const anon = interpretSupabaseRestStatus(401, 'anon');
    assert.equal(anon.ok, false);
    assert.match(anon.message, /anon \/ public/);
    assert.match(anon.message, /Project Settings/);
    const service = interpretSupabaseRestStatus(403, 'service_role');
    assert.match(service.message, /service_role/);
  });
});

describe('interpretSupabaseNetworkError', () => {
  it('maps DNS failures to the project URL', () => {
    const err = new Error('getaddrinfo ENOTFOUND');
    err.code = 'ENOTFOUND';
    assert.match(interpretSupabaseNetworkError(err).message, /Project URL/);
  });
});

describe('decodeJwtPayload', () => {
  it('returns null for truncated tokens', () => {
    assert.equal(decodeJwtPayload('eyJ.not-enough'), null);
  });
});
