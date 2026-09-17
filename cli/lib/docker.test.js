'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isDockerNoise, composeUpArgs, composeDownArgs, dockerChildEnv } = require('./docker');

describe('isDockerNoise', () => {
  it('hides BuildKit step and provenance lines', () => {
    assert.equal(isDockerNoise('#28 exporting layers 10.7s done'), true);
    assert.equal(isDockerNoise('#29 [backend] resolving provenance for metadata file'), true);
    assert.equal(isDockerNoise('Error response from daemon: Bind for 0.0.0.0:8000 failed'), false);
    assert.equal(isDockerNoise('Container project-clyde-backend-1 Started'), false);
  });
});

describe('dockerChildEnv', () => {
  it('publishes free host ports and CORS for the UI', () => {
    const env = dockerChildEnv({
      envFile: { RUN_MODE: 'docker' },
      bind: { BACKEND_URL: 'http://127.0.0.1:8001' },
      backendPort: 8001,
      frontendPort: 3020,
    });
    assert.equal(env.CLYDE_BACKEND_HOST_PORT, '8001');
    assert.equal(env.CLYDE_FRONTEND_HOST_PORT, '3020');
    assert.equal(env.CORS_ORIGINS, 'http://localhost:3020,http://127.0.0.1:3020');
    assert.equal(env.BACKEND_URL, 'http://127.0.0.1:8001');
    assert.deepEqual(composeUpArgs(), [
      'compose', '--env-file', '.env.local', '--progress', 'quiet', 'up', '--build',
    ]);
    assert.deepEqual(composeDownArgs(), ['compose', '--env-file', '.env.local', 'down']);
  });
});
