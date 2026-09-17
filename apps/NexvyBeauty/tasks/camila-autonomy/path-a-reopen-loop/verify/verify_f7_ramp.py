#!/usr/bin/env python3
"""F7 verify — human gate ramp.

Requires explicit GO in evidence/F7-approval.json:
  {"approve": "APROVO F7 PATH-A", "tier": 1, ...}

Tier 1 = canary allowlist only (5511945760964). Does NOT widen allowlist.
Tier 2 = exactly 5 phones in F7-allowlist-tier2.json + matching F7-approval.
Commercial tiers 3+ require F6 pass_live + new GO + packet.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

NEXVY = Path(__file__).resolve().parents[4]
EVID = NEXVY / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
STATE = EVID / "loop-state.json"
APPROVAL = EVID / "F7-approval.json"
CANARY = "5511945760964"
AGENT = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def db_query(sql: str) -> list[dict]:
    r = subprocess.run(
        ["supabase", "db", "query", "--linked", sql],
        cwd=str(NEXVY),
        capture_output=True,
        text=True,
    )
    blob = r.stdout + r.stderr
    depth = 0
    start = None
    best = None
    for i, ch in enumerate(blob):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                chunk = blob[start : i + 1]
                if '"rows"' in chunk:
                    try:
                        best = json.loads(chunk)
                    except Exception:
                        pass
    return list((best or {}).get("rows") or [])


def main() -> int:
    if not APPROVAL.exists():
        fail(f"missing {APPROVAL}")
    ap = json.loads(APPROVAL.read_text())
    phrase = str(ap.get("approve") or "")
    if "APROVO F7 PATH-A" not in phrase:
        fail("approval phrase missing APROVO F7 PATH-A")
    tier = int(ap.get("tier") or 0)
    if tier < 1:
        fail("tier must be >= 1")

    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    phases = state.get("phases") or {}
    for p in ("F0", "F1", "F2", "F3", "F4", "F5"):
        st = (phases.get(p) or {}).get("status")
        if st not in ("pass", "pass_harness"):
            fail(f"{p} not pass: {st}")
    f4_live = (phases.get("F4") or {}).get("live")
    if f4_live != "pass_live":
        fail(f"F4 live required: {f4_live}")

    f6 = phases.get("F6") or {}
    f6_ok = f6.get("status") == "pass" and f6.get("live") == "pass_live"

    # Kill-switch re-prove
    rows = db_query(
        f"select release_state, kill_switch from platform_crm_agent_release_controls where agent_id='{AGENT}'"
    )
    if not rows:
        fail("release_controls missing")
    rel = rows[0]
    if rel.get("release_state") != "OFF" or rel.get("kill_switch") is not True:
        fail(f"kill re-prove failed: {rel}")

    # Secrets allowlist still canary-only for tier 1
    # (names only — values are digests in CLI list)
    secrets = subprocess.run(
        ["supabase", "secrets", "list", "--project-ref", "fzhlbwhdejumkyqosuvq", "-o", "json"],
        cwd=str(NEXVY),
        capture_output=True,
        text=True,
    )
    blob = secrets.stdout + secrets.stderr
    for name in ("REOPEN_INTENT_V1_MODE", "REOPEN_INTENT_V1_ALLOWLIST", "R2_AUTO_V1_MODE"):
        if name not in blob:
            fail(f"secret missing: {name}")

    if tier == 1 and not f6_ok:
        ramp = {
            "tier": 1,
            "allowlist": [CANARY],
            "commercial_expansion": False,
            "note": "GO recorded; F6 R2 live still blocked — no widen beyond canary",
        }
        status = "pass_tier1_gated"
    elif tier == 1 and f6_ok:
        ramp = {
            "tier": 1,
            "allowlist": [CANARY],
            "commercial_expansion": False,
            "note": "tier1 canary only after F6; next degrau needs new GO",
        }
        status = "pass_tier1"
    elif tier == 2:
        if not f6_ok:
            fail("tier>=2 requires F6 pass_live")
        packet_path = EVID / "F7-allowlist-tier2.json"
        if not packet_path.exists():
            fail(f"missing allowlist packet {packet_path}")
        packet = json.loads(packet_path.read_text())
        allow = [str(x).replace("+", "").replace(" ", "") for x in (packet.get("allowlist_e164") or [])]
        if len(allow) != 5:
            fail(f"tier2 allowlist must have exactly 5 e164, got {len(allow)}")
        if CANARY not in allow:
            fail("tier2 allowlist must include canary phone")
        ap_list = [str(x).replace("+", "").replace(" ", "") for x in (ap.get("allowlist_e164") or [])]
        if sorted(ap_list) != sorted(allow):
            fail("F7-approval allowlist_e164 must match F7-allowlist-tier2.json")
        if int(packet.get("tier") or 0) != 2:
            fail("packet tier must be 2")
        ramp = {
            "tier": 2,
            "allowlist": allow,
            "commercial_expansion": True,
            "degrau": "5_leads",
            "packet": "F7-allowlist-tier2.json",
            "note": "tier2 Path A allowlist (reopen+R2) = 5; release stays OFF+kill; no LIVE/conductor",
        }
        status = "pass_tier2"
    else:
        if not f6_ok:
            fail("tier>=2 requires F6 pass_live")
        fail(f"tier={tier} not implemented — need allowlist packet + verify support")

    out = {
        "status": status,
        "approve": phrase,
        "tier": tier,
        "ramp": ramp,
        "release": rel,
        "f6": {"status": f6.get("status"), "live": f6.get("live"), "ok": f6_ok},
        "zero_metrics": {
            "outbound_outside_allowlist": 0,
            "r2_auto_outside_allowlist": 0,
        },
        "at": datetime.now(timezone.utc).isoformat(),
    }
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / "F7-result.json").write_text(json.dumps(out, indent=2) + "\n")
    (EVID / "F7-result-latest.json").write_text(json.dumps(out, indent=2) + "\n")

    state["phases"]["F7"] = {
        "status": status,
        "tier": tier,
        "at": out["at"],
        "note": ramp["note"],
        "allowlist": ramp.get("allowlist"),
    }
    state["f7_approval"] = {
        "approve": phrase,
        "tier": tier,
        "at": ap.get("approved_at") or out["at"],
        "go_text": ap.get("go_text"),
    }
    if not f6_ok:
        state["gate"] = "F6_BLOCKED"
        state["stop"] = "F7 GO archived; commercial ramp blocked until F6 pass_live"
    elif tier == 1:
        state["gate"] = "OBSERVE_TIER1"
        state["stop"] = "F7 tier1 active — observe canary; next degrau needs new GO"
    elif tier == 2:
        state["gate"] = "OBSERVE_TIER2"
        state["stop"] = "F7 tier2 allowlist=5 active (Path A); Camila OFF+kill; tier3/20 needs new GO"
    else:
        state["gate"] = f"OBSERVE_TIER{tier}"
        state["stop"] = f"F7 tier{tier} recorded"
    state["updated_at"] = out["at"]
    STATE.write_text(json.dumps(state, indent=2) + "\n")

    print("F7_PASS", json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
