'use strict';

function isDockerNoise(line) {
  const text = String(line || '').trim();
  return /^#\d+/.test(text) || /resolving provenance/i.test(text);
}

function composeUpArgs() {
  return ['compose', '--env-file', '.env.local', '--progress', 'quiet', 'up', '--build'];
}

function composeDownArgs() {
  return ['compose', '--env-file', '.env.local', 'down'];
}

function dockerChildEnv({
  processEnv = {},
  envFile = {},
  bind = {},
  backendPort,
  frontendPort,
} = {}) {
  return {
    ...processEnv,
    ...envFile,
    ...bind,
    CLYDE_BACKEND_HOST_PORT: String(backendPort),
    CLYDE_FRONTEND_HOST_PORT: String(frontendPort),
    CORS_ORIGINS: `http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`,
  };
}

module.exports = {
  isDockerNoise,
  composeUpArgs,
  composeDownArgs,
  dockerChildEnv,
};
