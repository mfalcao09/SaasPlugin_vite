#!/usr/bin/env python3
"""F2 verify — migration present + kernel policy deno tests."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

NEXVY = Path(__file__).resolve().parents[4]
EVID = NEXVY / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
MIG = NEXVY / "supabase/migrations_platform_crm/20260916_path_a_soft_hard_optout.sql"
POLICY = NEXVY / "supabase/functions/_shared/cold-outreach/path-a-kernel-policy.ts"
TEST = NEXVY / "supabase/functions/_shared/cold-outreach/path-a-kernel-policy.test.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    for p in (MIG, POLICY, TEST):
        if not p.exists():
            fail(f"missing {p}")
    body = MIG.read_text()
    if "kind text" not in body or "active boolean" not in body:
        fail("migration missing soft/hard columns")
    if "revoked_at" not in body:
        fail("migration missing revoked_at")

    r = subprocess.run(
        [
            "deno",
            "test",
            "--no-check",
            "--allow-read",
            str(TEST.relative_to(NEXVY)),
        ],
        cwd=str(NEXVY),
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(r.stdout[-2000:], file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
        fail(f"deno test exit {r.returncode}")

    out = {
        "status": "pass",
        "migration": str(MIG.relative_to(NEXVY)),
        "deno_exit": 0,
        "note": "SQL not auto-applied to linked prod in this verify; apply before F3 enforce",
    }
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / "F2-result.json").write_text(json.dumps(out, indent=2) + "\n")
    print("F2_PASS", json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
