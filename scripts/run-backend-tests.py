#!/usr/bin/env python3
"""Run backend unittests if backend/tests exists; succeed if there are none."""

from __future__ import annotations

import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
TESTS = os.path.join(BACKEND, "tests")


def main() -> int:
    if not os.path.isdir(TESTS):
        print("No backend/tests directory.")
        return 0

    os.chdir(BACKEND)
    sys.path.insert(0, BACKEND)
    suite = unittest.defaultTestLoader.discover("tests", pattern="test_*.py")
    if suite.countTestCases() == 0:
        print("No backend tests found.")
        return 0
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
