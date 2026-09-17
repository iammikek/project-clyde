#!/usr/bin/env python3
"""
FreeAgent OAuth Helper Script
Run this to complete the OAuth flow and get your access/refresh tokens
"""

import os
import requests
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse the authorization code from the callback
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        
        if 'code' in query_params:
            self.server.auth_code = query_params['code'][0]
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b'''
            <html><body>
            <h2>Authorization Successful!</h2>
            <p>You can close this window and return to the terminal.</p>
            </body></html>
            ''')
        else:
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b'''
            <html><body>
            <h2>Authorization Failed!</h2>
            <p>No authorization code received.</p>
            </body></html>
            ''')

def load_env_file():
    """Load environment variables from .env.local"""
    env_vars = {}
    try:
        with open('.env.local', 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
    except FileNotFoundError:
        print("❌ .env.local file not found!")
        print("Please create .env.local with your FreeAgent OAuth credentials first.")
        return None
    return env_vars

def update_env_file(access_token, refresh_token):
    """Update .env.local with the new tokens"""
    try:
        # Read existing file
        with open('.env.local', 'r') as f:
            lines = f.readlines()
        
        # Update token lines
        updated_lines = []
        access_updated = False
        refresh_updated = False
        
        for line in lines:
            if line.startswith('FREEAGENT_ACCESS_TOKEN='):
                updated_lines.append(f'FREEAGENT_ACCESS_TOKEN={access_token}\n')
                access_updated = True
            elif line.startswith('FREEAGENT_REFRESH_TOKEN='):
                updated_lines.append(f'FREEAGENT_REFRESH_TOKEN={refresh_token}\n')
                refresh_updated = True
            else:
                updated_lines.append(line)
        
        # Add tokens if they weren't in the file
        if not access_updated:
            updated_lines.append(f'FREEAGENT_ACCESS_TOKEN={access_token}\n')
        if not refresh_updated:
            updated_lines.append(f'FREEAGENT_REFRESH_TOKEN={refresh_token}\n')
        
        # Write back to file
        with open('.env.local', 'w') as f:
            f.writelines(updated_lines)
            
        print("✅ Updated .env.local with new tokens!")
        
    except Exception as e:
        print(f"❌ Error updating .env.local: {e}")
        print(f"Please manually add these to your .env.local:")
        print(f"FREEAGENT_ACCESS_TOKEN={access_token}")
        print(f"FREEAGENT_REFRESH_TOKEN={refresh_token}")

def main():
    print("🔐 FreeAgent OAuth Helper")
    print("=" * 40)
    print("Prefer Clyde: Integrations → FreeAgent preset → Connect FreeAgent.")
    print("This script is only a fallback if the in-app connect flow is unavailable.\n")
    
    # Load environment variables
    env_vars = load_env_file()
    if not env_vars:
        return
    
    client_id = env_vars.get('FREEAGENT_CLIENT_ID')
    client_secret = env_vars.get('FREEAGENT_CLIENT_SECRET')
    redirect_uri = env_vars.get('FREEAGENT_REDIRECT_URI', 'http://127.0.0.1:8000/api/integrations/freeagent/callback')
    
    if not client_id or not client_secret:
        print("❌ Missing FREEAGENT_CLIENT_ID or FREEAGENT_CLIENT_SECRET in .env.local")
        print("Please add your OAuth credentials from https://dev.freeagent.com/")
        return
    
    print(f"✅ Client ID: {client_id}")
    print(f"✅ Redirect URI: {redirect_uri}")
    
    # Step 1: Start local server for callback
    server = HTTPServer(('localhost', 3000), OAuthCallbackHandler)
    server.auth_code = None
    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.daemon = True
    server_thread.start()
    
    # Step 2: Build authorization URL
    auth_url = (
        f"https://api.freeagent.com/v2/approve_app?"
        f"client_id={client_id}&"
        f"response_type=code&"
        f"redirect_uri={urllib.parse.quote(redirect_uri)}"
    )
    
    print(f"\n🌐 Opening authorization URL...")
    print(f"If it doesn't open automatically, visit:")
    print(f"{auth_url}")
    
    # Open browser
    webbrowser.open(auth_url)
    
    # Step 3: Wait for callback
    print("\n⏳ Waiting for authorization...")
    print("Please authorize the application in your browser...")
    
    while server.auth_code is None:
        import time
        time.sleep(1)
    
    auth_code = server.auth_code
    server.shutdown()
    
    print(f"✅ Received authorization code: {auth_code[:20]}...")
    
    # Step 4: Exchange code for tokens
    print("\n🔄 Exchanging code for tokens...")
    
    token_data = {
        'grant_type': 'authorization_code',
        'client_id': client_id,
        'client_secret': client_secret,
        'code': auth_code,
        'redirect_uri': redirect_uri
    }
    
    try:
        response = requests.post(
            'https://api.freeagent.com/v2/token_endpoint',
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        if response.status_code == 200:
            tokens = response.json()
            access_token = tokens['access_token']
            refresh_token = tokens['refresh_token']
            
            print("✅ Successfully obtained tokens!")
            print(f"Access Token: {access_token[:20]}...")
            print(f"Refresh Token: {refresh_token[:20]}...")
            
            # Update .env.local file
            update_env_file(access_token, refresh_token)
            
            # Test the access token
            print("\n🧪 Testing API access...")
            test_response = requests.get(
                'https://api.freeagent.com/v2/company',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            
            if test_response.status_code == 200:
                company_data = test_response.json()
                company_name = company_data.get('company', {}).get('name', 'Unknown')
                print(f"✅ API test successful! Connected to: {company_name}")
                print("\n🎉 OAuth setup complete! Emma can now use FreeAgent integration.")
            else:
                print(f"⚠️  API test failed: {test_response.status_code}")
                print("Tokens saved but there might be a permissions issue.")
                
        else:
            print(f"❌ Token exchange failed: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Error during token exchange: {e}")

if __name__ == "__main__":
    main()