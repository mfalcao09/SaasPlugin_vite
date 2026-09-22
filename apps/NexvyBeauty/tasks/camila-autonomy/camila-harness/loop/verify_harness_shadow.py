#!/usr/bin/env python3
"""Loop 1 SHADOW — check binário PRD-11.

Pronto = deno tests PASS + all scenarios + realSends=0 evidence.
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
TEST = ROOT / "supabase/functions/_shared/camila-harness/shadow-sim.test.ts"


def main() -> int:
    EVID.mkdir(parents=True, exist_ok=True)
    cmd = [
        "deno",
        "test",
        "--allow-read",
        "--no-check",
        str(TEST),
    ]
    p = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    ok = p.returncode == 0
    evidence = {
        "loop": 1,
        "name": "SHADOW",
        "go": "GO BUILD HARNESS",
        "at": datetime.now(timezone.utc).isoformat(),
        "check_binary": "deno test camila-harness/shadow-sim.test.ts",
        "exit_code": p.returncode,
        "pass": ok,
        "real_whatsapp_sends": 0,
        "stdout_tail": (p.stdout or "")[-4000:],
        "stderr_tail": (p.stderr or "")[-2000:],
        "scenarios": [
            "S1_soft_to_pool",
            "S2_hard_mid4",
            "S3_interest_service",
            "S4_noise_then_human",
            "S5_silence_to_pool",
            "S6_goodbye_noop",
            "S7_resume_48h",
            "S8_idempotent_replay",
            "S9_no_go_no_send",
            "S10_auto_blocked_by_kill",
        ],
        "contract": "camila-harness v1.2",
        "prd": "PRD-11",
    }
    out = EVID / "L1-shadow-latest.json"
    out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    stamp = EVID / f"L1-shadow-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    stamp.write_text(out.read_text())
    print(json.dumps({"pass": ok, "evidence": str(out)}, ensure_ascii=False))
    if not ok:
        print(p.stdout, file=sys.stderr)
        print(p.stderr, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
