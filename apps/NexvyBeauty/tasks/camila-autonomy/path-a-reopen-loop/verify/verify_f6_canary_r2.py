#!/usr/bin/env python3
"""F6 verify — canary R2. Runs e2e when PATH_A_F6_LIVE=1."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EVID = ROOT / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
STATE = EVID / "loop-state.json"
E2E = ROOT / "tasks/camila-autonomy/e2e/path_a_f6_canary_r2.py"


def main() -> int:
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    f4 = state.get("phases", {}).get("F4", {})
    f5 = state.get("phases", {}).get("F5", {})
    live = os.environ.get("PATH_A_F6_LIVE", "").strip() == "1"
    f4_live_ok = f4.get("live") == "pass_live" or f4.get("status") == "pass"
    f5_ok = f5.get("status") == "pass"

    if not live or not f4_live_ok or not f5_ok:
        out = {
            "status": "blocked",
            "reason": "needs_F4_live_F5_pass_and_PATH_A_F6_LIVE",
            "f4": f4,
            "f5": f5.get("status"),
            "gate": "F7_GATE",
            "at": datetime.now(timezone.utc).isoformat(),
        }
        EVID.mkdir(parents=True, exist_ok=True)
        (EVID / "F6-result.json").write_text(json.dumps(out, indent=2) + "\n")
        print("F6_BLOCKED", json.dumps(out))
        return 0

    result_path = EVID / "F6-result.json"
    prior = json.loads(result_path.read_text()) if result_path.exists() else {}
    if prior.get("status") == "pass_live" and os.environ.get("PATH_A_F6_FORCE_RERUN", "").strip() != "1":
        checks = prior.get("checks") or {}
        ok = (
            1 <= int(checks.get("soft_r2_delivered", 0)) <= 2
            and int(checks.get("hard_r2", 0)) == 0
            and int(checks.get("farewell_after_r2_outbound", 0)) == 0
            and int(checks.get("replay_extra_r2", 0)) == 0
        )
        if ok:
            state.setdefault("phases", {})["F6"] = {
                "status": "pass",
                "live": "pass_live",
                "at": prior.get("when") or datetime.now(timezone.utc).isoformat(),
                "checks": checks,
            }
            state["gate"] = "F6_PASS"
            state["updated_at"] = datetime.now(timezone.utc).isoformat()
            STATE.write_text(json.dumps(state, indent=2) + "\n")
            print("F6_PASS", json.dumps(checks))
            return 0

    proc = subprocess.run(
        [sys.executable, str(E2E), "--live"],
        cwd=str(ROOT),
        env={**os.environ, "PATH_A_F6_LIVE": "1"},
    )
    result = json.loads(result_path.read_text()) if result_path.exists() else {}
    passed = proc.returncode == 0 and result.get("status") == "pass_live"
    if passed:
        state.setdefault("phases", {})["F6"] = {
            "status": "pass",
            "live": "pass_live",
            "at": datetime.now(timezone.utc).isoformat(),
            "checks": result.get("checks"),
        }
        state["gate"] = "F6_PASS"
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        STATE.write_text(json.dumps(state, indent=2) + "\n")
        print("F6_PASS", json.dumps(result.get("checks")))
        return 0
    print("F6_FAIL", json.dumps(result), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
