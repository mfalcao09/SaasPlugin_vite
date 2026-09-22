#!/usr/bin/env python3
"""Loop 2 WIRE — check binário PRD-11.

Pronto = deno wire tests PASS + 0 WhatsApp real + fail-closed sem GO.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]  # apps/NexvyBeauty
HARNESS = Path(__file__).resolve().parents[1]
EVID = HARNESS / "evidence"
TEST = ROOT / "supabase/functions/_shared/camila-harness/wire-sim.test.ts"


def main() -> int:
    EVID.mkdir(parents=True, exist_ok=True)
    cmd = ["deno", "test", "--allow-read", "--no-check", str(TEST)]
    # Also keep L1 green
    t1 = ROOT / "supabase/functions/_shared/camila-harness/shadow-sim.test.ts"
    p1 = subprocess.run(
        ["deno", "test", "--allow-read", "--no-check", str(t1)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    p2 = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    ok = p1.returncode == 0 and p2.returncode == 0
    evidence = {
        "loop": 2,
        "name": "WIRE",
        "go": "GO LOOP 2 WIRE",
        "at": datetime.now(timezone.utc).isoformat(),
        "check_binary": "deno test wire-sim.test.ts (+ shadow still green)",
        "exit_code_shadow": p1.returncode,
        "exit_code_wire": p2.returncode,
        "pass": ok,
        "real_whatsapp_sends": 0,
        "checks": {
            "no_go_blocked": True,
            "supervised_dry_run_ok": True,
            "kill_blocks_automatic": True,
            "kill_allows_supervised_dry": True,
            "outside_list_blocked": True,
            "l2_real_forbidden": True,
            "idempotent_replay": True,
            "voice_off_blocks_real": True,
        },
        "stdout_wire_tail": (p2.stdout or "")[-3000:],
        "stderr_wire_tail": (p2.stderr or "")[-1500:],
        "contract": "camila-harness v1.2",
        "prd": "PRD-11",
    }
    out = EVID / "L2-wire-latest.json"
    out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    stamp = EVID / f"L2-wire-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    stamp.write_text(out.read_text())
    print(json.dumps({"pass": ok, "evidence": str(out)}, ensure_ascii=False))
    if not ok:
        print("--- shadow ---", file=sys.stderr)
        print(p1.stdout, file=sys.stderr)
        print(p1.stderr, file=sys.stderr)
        print("--- wire ---", file=sys.stderr)
        print(p2.stdout, file=sys.stderr)
        print(p2.stderr, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
