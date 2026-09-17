# FreeAgent

Use this when the operator asks how to connect FreeAgent.

FreeAgent has **no API keys**. Auth is OAuth 2.0 only (access token ~1 hour, then refresh).

**Never tell them:**
- `http://localhost:3000/auth/freeagent/callback`
- `/app/working/.env.local` or any env file inside the working directory
- `python3 freeagent_oauth_helper.py` as the main path

**Do tell them:**

1. [dev.freeagent.com](https://dev.freeagent.com/) → **My Apps** → **Create New App** (not company Settings).
2. Homepage URL: `https://projectclyde.app`
3. Redirect URI: `http://127.0.0.1:8000/api/integrations/freeagent/callback` (or the URI shown under Integrations if the backend port is not 8000). Leave **Enable Accountancy Practice API** unchecked.
4. Paste into the **project-root** `.env.local` (same file as Supabase), then restart Clyde:

```env
FREEAGENT_CLIENT_ID=paste-oauth-identifier
FREEAGENT_CLIENT_SECRET=paste-oauth-secret
```

5. **Integrations** → **FreeAgent preset** → **Connect FreeAgent**. Sign in to the live company.

Clyde stores and refreshes tokens. You cannot edit repo-root `.env.local` from this working directory — give the operator the lines; do not create a duplicate env file here.
