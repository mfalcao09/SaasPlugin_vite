#!/usr/bin/env python3
"""Loop 3 PILOT DELIVER (build) — dry-run only, 0 WhatsApp real.

Pronto = deno pilot-deliver (+ cadence) PASS
        + módulo sem Z-API
        + plan sem GO bloqueia
        + Renata resume text canônico
        + realSends=0 no dry-run
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HARNESS = Path(__file__).resolve().parents[1]
EVID = HARNESS / "evidence"
SHARED = ROOT / "supabase/functions/_shared/camila-harness"
COLD = ROOT / "supabase/functions/platform-cold-outreach/index.ts"

RENATA_TEXT = (
    "Oi, Renata! Desculpe, não consegui te responder na minha janela de atendimento. "
    "Mas vamos retomar por aqui!"
)


def run_deno(test: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["deno", "test", "--allow-read", "--no-check", str(test)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )


def main() -> int:
    EVID.mkdir(parents=True, exist_ok=True)
    tests = [
        SHARED / "pilot-deliver.test.ts",
        SHARED / "lead-spacing.test.ts",
        SHARED / "outbound-queue.test.ts",
        SHARED / "wire-sim.test.ts",
    ]
    exits: dict[str, int] = {}
    tails: dict[str, str] = {}
    for t in tests:
        p = run_deno(t)
        exits[t.name] = p.returncode
        tails[t.name] = ((p.stdout or "") + (p.stderr or ""))[-2000:]
        if p.returncode != 0:
            print(p.stdout, file=sys.stderr)
            print(p.stderr, file=sys.stderr)

    pilot_src = (SHARED / "pilot-deliver.ts").read_text()
    roster_src = (SHARED / "pilot-roster.ts").read_text()
    cold_txt = COLD.read_text() if COLD.exists() else ""

    wire_transport_src = (SHARED / "wire-transport.ts").read_text()
    checks = {
        "deno_pilot_deliver": exits.get("pilot-deliver.test.ts") == 0,
        "deno_lead_spacing": exits.get("lead-spacing.test.ts") == 0,
        "deno_outbound_queue": exits.get("outbound-queue.test.ts") == 0,
        "deno_wire": exits.get("wire-sim.test.ts") == 0,
        "pilot_no_zapi": "zapi" not in pilot_src.lower()
        and "platform-whatsapp-qr-send" not in pilot_src,
        "wire_dry_transport": "createDryWireTransport" in wire_transport_src
        and "allowReal: false" in wire_transport_src
        and "PilotTransport" not in pilot_src
        and "PilotTransport" not in wire_transport_src,
        "renata_resume_text": RENATA_TEXT in roster_src,
        "renata_phone": "5581993552037" in roster_src,
        "roster_10": "espaco_andressamanoel" in roster_src,
        "cold_has_harness_pilot_plan": "harness-pilot-plan" in cold_txt,
        "cold_pilot_zero_sends": "real_whatsapp_sends: 0" in cold_txt,
    }
    ok = all(checks.values())
    evidence = {
        "loop": 3,
        "name": "PILOT_DELIVER_BUILD",
        "go_build": "GO BUILD PILOT DELIVER",
        "awaiting": "GO PILOT HARNESS v1",
        "at": datetime.now(timezone.utc).isoformat(),
        "pass": ok,
        "real_whatsapp_sends": 0,
        "checks": {k: ("PASS" if v else "FAIL") for k, v in checks.items()},
        "deno_exits": exits,
        "note": "Dry-run only. Real WhatsApp requires GO PILOT HARNESS v1 + flags.",
        "contract": "camila-harness v1.2 + cadence + pilot-deliver",
        "prd": "PRD-11",
    }
    out = EVID / "L3-pilot-latest.json"
    out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    stamp = EVID / f"L3-pilot-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    stamp.write_text(out.read_text())
    print(
        json.dumps(
            {"pass": ok, "evidence": str(out), "checks": evidence["checks"]},
            ensure_ascii=False,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
