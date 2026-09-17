#!/usr/bin/env python3
"""F6 verify — canary R2. Requires F4 live + PATH_A_F6_LIVE. Default: blocked gate."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

EVID = Path(__file__).resolve().parents[4] / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
STATE = EVID / "loop-state.json"


def main() -> int:
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    f4 = state.get("phases", {}).get("F4", {})
    f5 = state.get("phases", {}).get("F5", {})
    live = os.environ.get("PATH_A_F6_LIVE", "").strip() == "1"
    f4_live_ok = f4.get("live") == "pass_live" or f4.get("status") == "pass"

    if not live or not f4_live_ok or f5.get("status") != "pass":
        out = {
            "status": "blocked",
            "reason": "needs_F4_live_and_PATH_A_F6_LIVE",
            "f4": f4,
            "f5": f5.get("status"),
            "gate": "F7_GATE",
            "at": datetime.now(timezone.utc).isoformat(),
            "note": "Camila left OFF+kill; no R2 canary send in this session",
        }
        EVID.mkdir(parents=True, exist_ok=True)
        (EVID / "F6-result.json").write_text(json.dumps(out, indent=2) + "\n")
        print("F6_BLOCKED", json.dumps(out))
        # Exit 0 for gate record — not a false green for expansion.
        return 0

    print("F6_FAIL live path not implemented in overnight session", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
