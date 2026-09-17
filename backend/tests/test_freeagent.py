import os
import tempfile
import unittest
from unittest.mock import patch

from services.freeagent import (
    NO_API_KEY_MESSAGE,
    authorize_url,
    is_freeagent_url,
    is_sandbox_url,
    redirect_uri_for_backend,
    token_endpoint,
)


class FreeAgentUrlTests(unittest.TestCase):
    def test_live_and_sandbox_hosts(self):
        self.assertTrue(is_freeagent_url("https://api.freeagent.com/v2/invoices"))
        self.assertTrue(is_freeagent_url("https://api.sandbox.freeagent.com/v2/company"))
        self.assertFalse(is_freeagent_url("https://api.stripe.com/v1"))
        self.assertFalse(is_freeagent_url(""))

    def test_sandbox_token_endpoint(self):
        self.assertEqual(
            token_endpoint("https://api.sandbox.freeagent.com/v2/invoices"),
            "https://api.sandbox.freeagent.com/v2/token_endpoint",
        )
        self.assertEqual(
            token_endpoint("https://api.freeagent.com/v2"),
            "https://api.freeagent.com/v2/token_endpoint",
        )
        self.assertTrue(is_sandbox_url("https://api.sandbox.freeagent.com/v2"))

    def test_authorize_url_uses_code_flow(self):
        url = authorize_url(
            "client-abc",
            "http://127.0.0.1:8000/api/integrations/freeagent/callback",
        )
        self.assertTrue(url.startswith("https://api.freeagent.com/v2/approve_app?"))
        self.assertIn("response_type=code", url)
        self.assertIn("client_id=client-abc", url)
        self.assertIn("redirect_uri=", url)

    def test_redirect_uri_follows_backend_url(self):
        self.assertEqual(
            redirect_uri_for_backend("http://127.0.0.1:8001"),
            "http://127.0.0.1:8001/api/integrations/freeagent/callback",
        )

    def test_no_api_key_copy(self):
        self.assertIn("does not issue API keys", NO_API_KEY_MESSAGE)
        self.assertIn("dev.freeagent.com", NO_API_KEY_MESSAGE)


class EnvfileTests(unittest.TestCase):
    def test_write_env_var_updates_and_appends(self):
        from services.envfile import write_env_var

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, ".env.local")
            with open(path, "w") as f:
                f.write("FOO=one\n")
            with patch.dict(os.environ, {}, clear=False):
                write_env_var("FOO", "two", path=path)
                write_env_var("BAR", "three", path=path)
                with open(path) as handle:
                    text = handle.read()
                self.assertIn("FOO=two", text)
                self.assertIn("BAR=three", text)
                self.assertEqual(os.environ.get("FOO"), "two")
                self.assertEqual(os.environ.get("BAR"), "three")


if __name__ == "__main__":
    unittest.main()
