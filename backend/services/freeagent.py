"""FreeAgent API auth — OAuth 2.0 only.

FreeAgent does not issue API keys or personal access tokens. Register an app at
https://dev.freeagent.com/ (My Apps → Create New App), then exchange an
authorization code for access + refresh tokens. Access tokens last about one hour.
"""

from __future__ import annotations

import os
from urllib.parse import urlencode, urlparse

import httpx

CLIENT_ID_KEY = "FREEAGENT_CLIENT_ID"
CLIENT_SECRET_KEY = "FREEAGENT_CLIENT_SECRET"
ACCESS_TOKEN_KEY = "FREEAGENT_ACCESS_TOKEN"
REFRESH_TOKEN_KEY = "FREEAGENT_REFRESH_TOKEN"

LIVE_API = "https://api.freeagent.com/v2"
SANDBOX_API = "https://api.sandbox.freeagent.com/v2"

NO_API_KEY_MESSAGE = (
    "FreeAgent does not issue API keys. Create an OAuth app at "
    "https://dev.freeagent.com/ → My Apps → Create New App, add "
    "FREEAGENT_CLIENT_ID and FREEAGENT_CLIENT_SECRET to .env.local, then "
    "connect the live company (Integrations → FreeAgent → Connect)."
)


class FreeAgentAuthError(Exception):
    """Missing credentials or a failed token request."""


def is_freeagent_url(url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return host == "api.freeagent.com" or host == "api.sandbox.freeagent.com"


def is_sandbox_url(url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return host == "api.sandbox.freeagent.com"


def api_root(url: str = "") -> str:
    return SANDBOX_API if is_sandbox_url(url) else LIVE_API


def token_endpoint(url: str = "") -> str:
    return f"{api_root(url)}/token_endpoint"


def approve_app_endpoint(url: str = "") -> str:
    return f"{api_root(url)}/approve_app"


def redirect_uri_for_backend(backend_url: str | None = None) -> str:
    base = (backend_url or os.environ.get("BACKEND_URL") or "http://127.0.0.1:8000").rstrip("/")
    return f"{base}/api/integrations/freeagent/callback"


def authorize_url(client_id: str, redirect_uri: str, sandbox: bool = False) -> str:
    endpoint = approve_app_endpoint(SANDBOX_API if sandbox else LIVE_API)
    return (
        f"{endpoint}?"
        + urlencode(
            {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
            }
        )
    )


def persist_tokens(access_token: str, refresh_token: str | None = None) -> None:
    from services.envfile import write_env_var

    write_env_var(ACCESS_TOKEN_KEY, access_token)
    if refresh_token:
        write_env_var(REFRESH_TOKEN_KEY, refresh_token)


def _client_credentials() -> tuple[str, str]:
    client_id = os.environ.get(CLIENT_ID_KEY, "").strip()
    client_secret = os.environ.get(CLIENT_SECRET_KEY, "").strip()
    if not client_id or not client_secret:
        raise FreeAgentAuthError(NO_API_KEY_MESSAGE)
    return client_id, client_secret


async def _token_request(url: str, data: dict) -> dict:
    client_id, client_secret = _client_credentials()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            token_endpoint(url),
            auth=(client_id, client_secret),
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if response.status_code >= 400:
        raise FreeAgentAuthError(
            f"FreeAgent token request failed ({response.status_code}): {response.text[:500]}"
        )
    payload = response.json()
    access = payload.get("access_token")
    if not access:
        raise FreeAgentAuthError("FreeAgent token response did not include an access_token.")
    persist_tokens(access, payload.get("refresh_token"))
    return payload


async def exchange_authorization_code(code: str, redirect_uri: str, sandbox: bool = False) -> dict:
    root = SANDBOX_API if sandbox else LIVE_API
    return await _token_request(
        root,
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
    )


async def refresh_access_token(url: str = "") -> str:
    refresh = os.environ.get(REFRESH_TOKEN_KEY, "").strip()
    if not refresh:
        raise FreeAgentAuthError(
            "FREEAGENT_REFRESH_TOKEN is missing. Connect FreeAgent again from Integrations."
        )
    payload = await _token_request(
        url,
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        },
    )
    return payload["access_token"]


def access_token() -> str:
    token = os.environ.get(ACCESS_TOKEN_KEY, "").strip()
    if not token:
        raise FreeAgentAuthError(
            "FREEAGENT_ACCESS_TOKEN is missing. FreeAgent has no API keys — "
            "connect OAuth from Integrations → FreeAgent."
        )
    return token


def bearer_headers(token: str | None = None) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token or access_token()}",
        "Accept": "application/json",
    }


async def request_with_refresh(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    """Send a FreeAgent request; refresh the access token once on 401."""
    headers = dict(kwargs.pop("headers", None) or {})
    headers.update(bearer_headers())
    response = await client.request(method, url, headers=headers, **kwargs)
    if response.status_code != 401:
        return response
    token = await refresh_access_token(url)
    headers.update(bearer_headers(token))
    return await client.request(method, url, headers=headers, **kwargs)
