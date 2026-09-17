# FreeAgent OAuth Setup Guide

Canonical operator instructions: `oauth_setup_instructions.md` and skill `FreeAgent`.

FreeAgent has **no API keys**. Do not tell anyone to use `localhost:3000`, `/app/working/.env.local`, or `freeagent_oauth_helper.py`.

1. [dev.freeagent.com](https://dev.freeagent.com/) → **My Apps** → **Create New App**
2. Homepage: `https://projectclyde.app`
3. Redirect: `http://127.0.0.1:8000/api/integrations/freeagent/callback` (match the bound backend port)
4. Project-root `.env.local`: `FREEAGENT_CLIENT_ID` and `FREEAGENT_CLIENT_SECRET`
5. Restart Clyde → **Integrations** → **FreeAgent preset** → **Connect FreeAgent** (live company login)

Clyde stores `FREEAGENT_ACCESS_TOKEN` / `FREEAGENT_REFRESH_TOKEN` and refreshes the access token (~1 hour).
