import json
import os
import tempfile
import unittest

from services.registry import load_registry, relativize_to_working_dir


class RelativizeWorkingDirTests(unittest.TestCase):
    def test_docker_absolute(self):
        self.assertEqual(
            relativize_to_working_dir("/app/working", "/app/working/teams/x.json"),
            "teams/x.json",
        )

    def test_nested_sandbox_prefix(self):
        self.assertEqual(
            relativize_to_working_dir(
                "/app/working",
                "/app/working/app/working/teams/x.json",
            ),
            "teams/x.json",
        )

    def test_relative_app_working(self):
        self.assertEqual(
            relativize_to_working_dir("/app/working", "app/working/teams/x.json"),
            "teams/x.json",
        )

    def test_virtual_working_prefix(self):
        self.assertEqual(
            relativize_to_working_dir("/app/working", "/working/prompts/clyde-system.md"),
            "prompts/clyde-system.md",
        )

    def test_already_relative(self):
        self.assertEqual(
            relativize_to_working_dir("/app/working", "teams/x.json"),
            "teams/x.json",
        )

    def test_host_absolute(self):
        wd = "/Users/mike/Projects/project-clyde/working"
        self.assertEqual(
            relativize_to_working_dir(wd, f"{wd}/outputs/report.md"),
            "outputs/report.md",
        )


class LoadRegistryHealTests(unittest.TestCase):
    def test_missing_team_file_still_lists_team_and_heals(self):
        with tempfile.TemporaryDirectory() as td:
            teams = os.path.join(td, "teams")
            os.makedirs(teams)
            with open(os.path.join(teams, "teams.json"), "w") as f:
                json.dump(
                    {
                        "version": "1.0",
                        "orchestrator": {"name": "Clyde"},
                        "teams": [
                            {
                                "id": "team-unassigned",
                                "name": "Unassigned",
                                "color": "#6B7280",
                            },
                            {
                                "id": "team-dev",
                                "name": "Dev",
                                "color": "#3B82F6",
                                "icon": "Code",
                            },
                        ],
                    },
                    f,
                )
            with open(os.path.join(teams, "team-unassigned.json"), "w") as f:
                json.dump({"id": "team-unassigned", "members": []}, f)

            registry = load_registry(td)

            self.assertEqual([t["name"] for t in registry["teams"]], ["Dev"])
            self.assertEqual(registry["agents"], [])
            healed = os.path.join(teams, "team-dev.json")
            self.assertTrue(os.path.exists(healed))
            with open(healed) as f:
                self.assertEqual(json.load(f)["id"], "team-dev")


class DropNoneArgsTests(unittest.TestCase):
    def test_null_optional_fields_fall_back_to_defaults(self):
        try:
            from agents.tools import _drop_none_args
        except ModuleNotFoundError as exc:
            self.skipTest(f"agents.tools import requires runtime deps ({exc})")

        cleaned = _drop_none_args(
            {"name": "Oliver", "model": None, "platform": None, "role": "Lead"}
        )
        self.assertEqual(cleaned, {"name": "Oliver", "role": "Lead"})
        self.assertEqual(cleaned.get("model", "sonnet").strip(), "sonnet")
        self.assertEqual(cleaned.get("platform", "claude").strip(), "claude")
