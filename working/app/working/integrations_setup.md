# Integration Setup Guide

## FreeAgent Integration

### Setup Requirements:
1. OAuth app on the [FreeAgent Developer Dashboard](https://dev.freeagent.com/) (**My Apps** → **Create New App**) — not company **Settings**
2. Client ID (OAuth identifier), client secret, then an access token from the OAuth flow
3. Base URL: `https://api.freeagent.com/v2` (sandbox: `https://api.sandbox.freeagent.com/v2`)
4. Authentication: `Authorization: Bearer` access token (refresh when it expires; ~1 hour)

See `api_setup_guide.md` for the full path.

### Key Endpoints:
- `/invoices` - Create and manage invoices
- `/contacts` - Client management
- `/projects` - Project tracking
- `/timeslips` - Time tracking
- `/expenses` - Expense management

### Environment Variable:
```
FREEAGENT_CLIENT_ID=your_oauth_identifier_here
FREEAGENT_CLIENT_SECRET=your_oauth_secret_here
FREEAGENT_ACCESS_TOKEN=your_oauth_access_token_here
FREEAGENT_REFRESH_TOKEN=your_oauth_refresh_token_here
```

## HubSpot Integration

### Setup Requirements:
1. HubSpot API Key or OAuth token
2. Base URL: https://api.hubapi.com
3. Authentication: API Key or Bearer token

### Key Endpoints:
- `/crm/v3/objects/contacts` - Contact management
- `/crm/v3/objects/companies` - Company management
- `/crm/v3/objects/deals` - Deal pipeline
- `/crm/v3/objects/tickets` - Support tickets
- `/marketing/v3/emails` - Email campaigns

### Environment Variable:
```
HUBSPOT_API_KEY=your_api_key_here
```

## Integration Usage:
- Emma (Business Operations) will use FreeAgent for invoicing and financial management
- James (Client Success Manager) will use HubSpot for CRM and sales pipeline management