'use strict';

function isDockerNoise(line) {
  const text = String(line || '').trim();
  return /^#\d+/.test(text) || /resolving provenance/i.test(text);
}

function composeUpArgs() {
  return ['compose', '--progress', 'quiet', 'up', '--build'];
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
  dockerChildEnv,
};
