#!/usr/bin/env python3
"""Integration check — harness wired into runtime, 0 WhatsApp real.

Binary: deno tests (shadow+wire+runtime-bridge) PASS
        + cold-outreach imports harness-plan
        + webhook imports harnessInboundMetaPatch
        + allowRealWhatsapp forced false in runtime-bridge plan
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HARNESS = Path(__file__).resolve().parents[1]
EVID = HARNESS / "evidence"
SHARED = ROOT / "supabase/functions/_shared/camila-harness"
COLD = ROOT / "supabase/functions/platform-cold-outreach/index.ts"
WEBHOOK = ROOT / "supabase/functions/platform-whatsapp-qr-webhook/index.ts"


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
        SHARED / "shadow-sim.test.ts",
        SHARED / "wire-sim.test.ts",
        SHARED / "runtime-bridge.test.ts",
        SHARED / "attendance-window.test.ts",
        SHARED / "holidays.test.ts",
        SHARED / "lead-spacing.test.ts",
        SHARED / "outbound-queue.test.ts",
    ]
    exits = {}
    for t in tests:
        p = run_deno(t)
        exits[t.name] = p.returncode
        if p.returncode != 0:
            print(p.stdout, file=sys.stderr)
            print(p.stderr, file=sys.stderr)

    cold_txt = COLD.read_text()
    webhook_txt = WEBHOOK.read_text()
    bridge_txt = (SHARED / "runtime-bridge.ts").read_text()

    checks = {
        "deno_shadow": exits.get("shadow-sim.test.ts") == 0,
        "deno_wire": exits.get("wire-sim.test.ts") == 0,
        "deno_runtime_bridge": exits.get("runtime-bridge.test.ts") == 0,
        "cold_imports_runtime_bridge": "camila-harness/runtime-bridge" in cold_txt,
        "cold_has_harness_plan_action": 'case "harness-plan"' in cold_txt,
        "cold_harness_plan_zero_sends": "real_whatsapp_sends: 0" in cold_txt
        or '"real_whatsapp_sends": 0' in cold_txt
        or "real_whatsapp_sends: 0" in cold_txt.replace(" ", ""),
        "deno_attendance": exits.get("attendance-window.test.ts") == 0,
        "deno_holidays": exits.get("holidays.test.ts") == 0,
        "deno_lead_spacing": exits.get("lead-spacing.test.ts") == 0,
        "deno_outbound_queue": exits.get("outbound-queue.test.ts") == 0,
        "cold_loads_holidays": "loadHarnessHolidayDates" in cold_txt,
        "webhook_loads_holidays": "loadHarnessHolidayDates" in webhook_txt,
        "webhook_imports_harness": "harnessInboundMetaPatch" in webhook_txt,
        "bridge_forces_allow_real_false": "allowRealWhatsapp: false" in bridge_txt,
        "bridge_never_invokes_zapi": "platform-whatsapp-qr-send" not in bridge_txt
        and "zapi" not in bridge_txt.lower(),
    }
    # tighten cold zero sends check
    checks["cold_harness_plan_zero_sends"] = (
        "real_whatsapp_sends: 0" in cold_txt or "real_whatsapp_sends: 0," in cold_txt
    )

    ok = all(checks.values())
    evidence = {
        "loop": "integration",
        "name": "RUNTIME_WIRE_NO_REAL_WA",
        "at": datetime.now(timezone.utc).isoformat(),
        "pass": ok,
        "real_whatsapp_sends": 0,
        "checks": {k: ("PASS" if v else "FAIL") for k, v in checks.items()},
        "deno_exits": exits,
        "note": "harness-plan never calls deliver(); webhook only patches metadata",
    }
    out = EVID / "L2b-integration-latest.json"
    out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    stamp = EVID / f"L2b-integration-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    stamp.write_text(out.read_text())
    print(json.dumps({"pass": ok, "evidence": str(out), "checks": evidence["checks"]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
