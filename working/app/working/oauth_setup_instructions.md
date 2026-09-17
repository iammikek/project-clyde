# FreeAgent OAuth — what to tell the operator

**Do not** recommend `http://localhost:3000/...`, `/app/working/.env.local`, or `python3 freeagent_oauth_helper.py`. Those paths are stale. Clyde does not serve a callback on port 3000 and does not load env from the working directory.

FreeAgent has **no API keys** and no personal access tokens.

## Tell the operator this

1. Open [dev.freeagent.com](https://dev.freeagent.com/) (not company **Settings**). **My Apps** → **Create New App**.
2. **App homepage URL:** `https://projectclyde.app` (public label only).
3. **Redirect URI:** `http://127.0.0.1:8000/api/integrations/freeagent/callback`  
   If the backend bound another port, use that port. Integrations → FreeAgent shows the exact URI.  
   Leave **Enable Accountancy Practice API** **off**. If it is on, approve fails with “This app is only for accountants” on a normal company login.
4. Copy **OAuth identifier** (client ID) and **OAuth secret**.
5. Add them to the **project-root** `.env.local` (same file as Supabase — not a file under `working/`):

```env
FREEAGENT_CLIENT_ID=paste-oauth-identifier
FREEAGENT_CLIENT_SECRET=paste-oauth-secret
```

6. Restart Clyde (`npm run clyde`).
7. In the app: **Integrations** → API → **FreeAgent preset** → **Connect FreeAgent**. Sign in to the **live** company and allow access.

Clyde writes `FREEAGENT_ACCESS_TOKEN` and `FREEAGENT_REFRESH_TOKEN` into that same `.env.local` and refreshes the access token (~1 hour).

You cannot write the project-root `.env.local` yourself (file-access rules). Give the operator the lines to paste; do not invent a second env file in the working directory.

## After connect

Emma can call FreeAgent via the registered integration (`https://api.freeagent.com/v2`, auth **OAuth 2.0**, credential `FREEAGENT_ACCESS_TOKEN`).
