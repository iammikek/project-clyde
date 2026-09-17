"""Read and write the project-root .env.local file."""

from __future__ import annotations

import os

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env.local")


def env_local_path() -> str:
    return _ENV_PATH


def write_env_var(key: str, value: str, path: str | None = None) -> None:
    """Add or update key=value in .env.local and os.environ."""
    env_path = path or _ENV_PATH
    lines: list[str] = []
    found = False

    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.strip().startswith(f"{key}="):
                    lines.append(f"{key}={value}\n")
                    found = True
                else:
                    lines.append(line)

    if not found:
        if lines and not lines[-1].endswith("\n"):
            lines.append("\n")
        lines.append(f"\n# Integration: {key}\n")
        lines.append(f"{key}={value}\n")

    with open(env_path, "w") as f:
        f.writelines(lines)

    os.environ[key] = value
