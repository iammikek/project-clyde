import json
import os
import tempfile
import unittest

from services.settings import format_runtime_models


def _write_working(root: str, settings: dict, agents: list[dict] | None = None) -> None:
    with open(os.path.join(root, "settings.json"), "w") as f:
        json.dump(settings, f)
    if agents is None:
        return
    teams = os.path.join(root, "teams")
    os.makedirs(teams)
    with open(os.path.join(teams, "teams.json"), "w") as f:
        json.dump(
            {
                "version": "1.0",
                "orchestrator": {"name": "Clyde"},
                "teams": [{"id": "team-unassigned", "name": "Unassigned", "color": "#6B7280"}],
            },
            f,
        )
    with open(os.path.join(teams, "team-unassigned.json"), "w") as f:
        json.dump({"id": "team-unassigned", "members": agents}, f)


class FormatRuntimeModelsTests(unittest.TestCase):
    def test_openrouter_grok_is_clyde_not_opus(self):
        with tempfile.TemporaryDirectory() as td:
            _write_working(
                td,
                {
                    "agent_provider": "openrouter",
                    "openrouter_model": "x-ai/grok-4.6",
                    "openrouter_subagent_model": "anthropic/claude-haiku-4.5",
                    "clyde_model": "opus",
                },
                agents=[
                    {
                        "name": "Oliver",
                        "model": "anthropic/claude-sonnet-4",
                        "platform": "openrouter",
                    }
                ],
            )
            text = format_runtime_models(td)

        self.assertIn("Provider: `openrouter`", text)
        self.assertIn("You (Clyde) are running: `x-ai/grok-4.6`", text)
        self.assertIn("Default for newly created subagents: `anthropic/claude-haiku-4.5`", text)
        self.assertIn("Oliver: `anthropic/claude-sonnet-4` (openrouter)", text)
        self.assertNotIn("You (Clyde) are running: `opus`", text)
        self.assertIn("Do not say you are Claude Opus unless that is the Clyde value above.", text)

    def test_anthropic_reports_clyde_model_from_settings(self):
        with tempfile.TemporaryDirectory() as td:
            _write_working(td, {"agent_provider": "anthropic", "clyde_model": "sonnet"})
            text = format_runtime_models(td)

        self.assertIn("Provider: `anthropic`", text)
        self.assertIn("You (Clyde) are running: `sonnet`", text)
        self.assertNotIn("You (Clyde) are running: `opus`", text)


if __name__ == "__main__":
    unittest.main()
