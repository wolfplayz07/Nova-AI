#!/usr/bin/env bash
# v63: run the whole suite twice: as written, then with rules.js added last to every boot that loads
# app.js (live index.html order). Both runs must have zero failures.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== plain suite"; node --test tests/
echo "== live order (rules.js loaded last)"; NOVA_LIVE_RULES=1 node --test tests/
