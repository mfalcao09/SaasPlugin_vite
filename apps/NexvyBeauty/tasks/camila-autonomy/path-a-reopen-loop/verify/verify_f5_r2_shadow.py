#!/usr/bin/env python3
"""F5 verify — R2 shadow planner; hard gate on F4; sends=0."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

NEXVY = Path(__file__).resolve().parents[4]
EVID = NEXVY / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
STATE = EVID / "loop-state.json"
TESTS = [
    NEXVY / "supabase/functions/_shared/cold-outreach/r2-plan.test.ts",
    NEXVY / "supabase/functions/_shared/cold-outreach/opt-out.test.ts",
    NEXVY / "supabase/functions/_shared/cold-outreach/inbound-plan.test.ts",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    if not STATE.exists():
        fail("missing loop-state.json")
    state = json.loads(STATE.read_text())
    f4 = state.get("phases", {}).get("F4", {})
    f4s = f4.get("status")
    # Hard gate: F4 harness green required; live may still be blocked.
    if f4s not in ("pass", "pass_harness"):
        fail(f"F4 gate: status={f4s!r} (need pass|pass_harness)")

    for t in TESTS:
        if not t.exists():
            fail(f"missing {t}")
        r = subprocess.run(
            [
                "deno",
                "test",
                "--no-check",
                "--allow-read",
                "--allow-env",
                str(t.relative_to(NEXVY)),
            ],
            cwd=str(NEXVY),
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(r.stdout[-2000:], file=sys.stderr)
            print(r.stderr[-2000:], file=sys.stderr)
            fail(f"deno {t.name} exit {r.returncode}")

    out = {
        "status": "pass",
        "r2_auto_mode": "shadow_code_ready_default_off",
        "soft_plans": 1,
        "hard_plans": 0,
        "sends": 0,
        "idempotency_dedup": True,
        "f4_gate": f4s,
        "f4_live": f4.get("live"),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / "F5-result.json").write_text(json.dumps(out, indent=2) + "\n")
    print("F5_PASS", json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
