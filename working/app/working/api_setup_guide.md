# API Keys Setup Guide

## Where to store credentials

Ask the operator to add keys to the **project-root** `.env.local` (same file as Supabase). Do **not** create `/app/working/.env.local` — Clyde will not load it.

```env
# FreeAgent — OAuth identifier + secret; tokens filled by Integrations → Connect
FREEAGENT_CLIENT_ID=your_oauth_identifier_here
FREEAGENT_CLIENT_SECRET=your_oauth_secret_here
FREEAGENT_ACCESS_TOKEN=
FREEAGENT_REFRESH_TOKEN=
```

### 2. Security Best Practices

**✅ DO:**
- Store keys in `.env.local` (never committed to git)
- Use different keys for development/production
- Rotate keys regularly
- Restrict API permissions to minimum required

**❌ DON'T:**
- Put keys directly in code
- Commit `.env.local` to version control
- Share keys in chat/email
- Use production keys for testing

## Getting Your API Keys

### FreeAgent OAuth credentials

FreeAgent does **not** issue API keys in the company account (**Settings** has no Developer / API-key page). Credentials live on a separate developer site.

1. **Open the Developer Dashboard**
   - Go to [dev.freeagent.com](https://dev.freeagent.com/) and sign in (create a developer account if needed)
   - This is not the same login screen as your day-to-day FreeAgent company

2. **Create an app**
   - **My Apps** → **Create New App**
   - Register an exact **OAuth redirect URI** (it must match the URI you send in the auth request)
   - Copy the **OAuth identifier** (client ID) and **OAuth secret** (client secret)

3. **Authorise**
   - Operator: **Integrations** → **FreeAgent preset** → **Connect FreeAgent**, then sign in to the live company
   - Clyde writes access + refresh tokens to project-root `.env.local`. Access tokens last about an hour; Clyde refreshes them.

Same app works for sandbox (`https://api.sandbox.freeagent.com/v2`) and live (`https://api.freeagent.com/v2`).

**FreeAgent API documentation:** [quick start](https://dev.freeagent.com/docs/quick_start) · [OAuth](https://dev.freeagent.com/docs/oauth)

### HubSpot API Key

1. **Login to HubSpot**
   - Go to your HubSpot account
   - Navigate to Settings → Integrations → API Key

2. **Generate API Key**
   - Click "Create Key" 
   - Copy the generated key
   - Key format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Alternative: OAuth Token**
- For more advanced integrations, use OAuth
- Provides better security and granular permissions
- Required for some advanced HubSpot features

**HubSpot API Documentation:** https://developers.hubspot.com/docs/api/overview

## Testing Your Setup

### Test FreeAgent Connection
```bash
curl -H "Authorization: Bearer $FREEAGENT_ACCESS_TOKEN" \
     https://api.freeagent.com/v2/company
```

### Test HubSpot Connection
```bash
curl "https://api.hubapi.com/crm/v3/objects/contacts?hapikey=$HUBSPOT_API_KEY"
```

## Integration Configuration

Once you have your keys in `.env.local`, your team agents will automatically use them:

### Emma (Business Operations) will use:
- `FREEAGENT_ACCESS_TOKEN` for invoice generation
- `FREEAGENT_PRODUCTION_URL` for API calls

### James (Client Success) will use:
- `HUBSPOT_API_KEY` for CRM operations
- `HUBSPOT_BASE_URL` for API calls

## Environment File Structure

Ask the operator to add these to the **project-root** `.env.local` (same file as Supabase):

```bash
# FreeAgent Configuration
FREEAGENT_CLIENT_ID=your_oauth_identifier_here
FREEAGENT_CLIENT_SECRET=your_oauth_secret_here
FREEAGENT_ACCESS_TOKEN=your_oauth_access_token_here
FREEAGENT_REFRESH_TOKEN=your_oauth_refresh_token_here
FREEAGENT_SANDBOX_URL=https://api.sandbox.freeagent.com/v2
FREEAGENT_PRODUCTION_URL=https://api.freeagent.com/v2

# HubSpot Configuration  
HUBSPOT_API_KEY=12345678-1234-1234-1234-123456789012
HUBSPOT_BASE_URL=https://api.hubapi.com

# Environment
ENVIRONMENT=production
```

## Next Steps After Adding Keys

1. **Verify Access**: Test both API connections
2. **Notify Team**: Let Emma and James know keys are ready
3. **Run Integration Tests**: Have each agent test their connections
4. **Monitor Usage**: Check API rate limits and usage

## Troubleshooting

### Common Issues:
- **401 Unauthorized**: Check token format and expiration
- **403 Forbidden**: Verify API permissions and scopes
- **429 Rate Limited**: Implement proper rate limiting
- **Connection Timeout**: Check network and firewall settings

### Support Resources:
- FreeAgent Support: support@freeagent.com
- HubSpot Support: developers.hubspot.com/community
- Your team agents can help diagnose integration issues

## Security Notes

- **Never share your `.env.local` file**
- **Add `.env.local` to your `.gitignore`**  
- **Use different keys for development and production**
- **Monitor API usage for suspicious activity**
- **Rotate keys quarterly for security**