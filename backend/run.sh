#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
PORT="${PORT:-8000}"
uvicorn main:app --reload --host 127.0.0.1 --port "$PORT"
