#!/usr/bin/env bash
# v64: run the whole suite twice: as written, then with rules.js and self.js added last to every
# boot that loads app.js (live index.html order). Both runs must have zero failures.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== plain suite"; node --test tests/
echo "== live order (rules.js then self.js loaded last)"; NOVA_LIVE_RULES=1 node --test tests/
