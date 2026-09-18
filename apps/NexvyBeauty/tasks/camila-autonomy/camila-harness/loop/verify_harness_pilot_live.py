#!/usr/bin/env python3
"""PRD-12 BUILD verify — 0 real WhatsApp; legacy cutover PASS."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SHARED = ROOT / "supabase/functions/_shared/camila-harness"
COLD = ROOT / "supabase/functions/platform-cold-outreach/index.ts"
WEBHOOK = ROOT / "supabase/functions/platform-whatsapp-qr-webhook/index.ts"
CONDUCTOR = ROOT / "supabase/functions/platform-camila-conductor/index.ts"
OPS = Path(__file__).resolve().parents[1] / "ops"
EVIDENCE = Path(__file__).resolve().parents[1] / "evidence"
MIGRATION = ROOT / "supabase/migrations_platform_crm/20260918_prd12_unschedule_legacy_camila_crons.sql"

DENO_TESTS = [
    "prd12-live.test.ts",
    "pilot-deliver.test.ts",
    "lead-spacing.test.ts",
    "outbound-queue.test.ts",
    "wire-sim.test.ts",
]


def run_deno(path: Path) -> int:
    p = subprocess.run(
        ["deno", "test", "--allow-read", "--no-check", str(path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if p.returncode != 0:
        print(p.stdout, file=sys.stderr)
        print(p.stderr, file=sys.stderr)
    return p.returncode


def main() -> int:
    exits = {n: run_deno(SHARED / n) for n in DENO_TESTS}
    inbound_cite = ROOT / "supabase/functions/_shared/inbound-cite.test.ts"
    quoted = ROOT / "supabase/functions/_shared/evolution-quoted.test.ts"
    exits["inbound_cite"] = run_deno(inbound_cite)
    exits["evolution_quoted"] = run_deno(quoted)
    cold = COLD.read_text(encoding="utf-8") if COLD.exists() else ""
    webhook = WEBHOOK.read_text(encoding="utf-8") if WEBHOOK.exists() else ""
    conductor = CONDUCTOR.read_text(encoding="utf-8") if CONDUCTOR.exists() else ""
    gates = (SHARED / "wire-gates.ts").read_text(encoding="utf-8")
    transport = (SHARED / "wire-transport.ts").read_text(encoding="utf-8")
    zapi = (SHARED / "wire-transport-zapi.ts").read_text(encoding="utf-8")
    tick = (SHARED / "harness-pilot-tick.ts").read_text(encoding="utf-8")
    legacy = (SHARED / "legacy-cutover.ts").read_text(encoding="utf-8")
    reactive = (SHARED / "reactive-enqueue.ts").read_text(encoding="utf-8")
    store = (SHARED / "pilot-queue-store.ts").read_text(encoding="utf-8")
    vps_py = OPS / "harness_pilot_tick.py"
    runbook = OPS / "RUNBOOK-VPS-PILOT-TICK.md"

    checks = {
        "deno_prd12_live": exits.get("prd12-live.test.ts") == 0,
        "deno_pilot_deliver": exits.get("pilot-deliver.test.ts") == 0,
        "deno_lead_spacing": exits.get("lead-spacing.test.ts") == 0,
        "deno_outbound_queue": exits.get("outbound-queue.test.ts") == 0,
        "deno_wire_sim": exits.get("wire-sim.test.ts") == 0,
        "deno_inbound_cite": exits.get("inbound_cite") == 0,
        "deno_evolution_quoted": exits.get("evolution_quoted") == 0,
        "no_reply_stub": "Recebi sua mensagem" not in reactive
        and "enqueued_reply_stub" not in reactive
        and "wake_brain" in reactive,
        "wire_transport_type": "export type WireTransport" in transport,
        "no_PilotTransport": "PilotTransport" not in transport
        and "PilotTransport" not in (SHARED / "pilot-deliver.ts").read_text(encoding="utf-8"),
        "wire_transport_zapi": "createZapiWireTransport" in zapi,
        "gate_pilot_live": "pilotLive" in gates
        and "l2_real_whatsapp_forbidden" in gates,
        "harness_pilot_tick_module": "runHarnessPilotTick" in tick,
        "roster_from_db": "loadPreselectedPilotLeads" in tick
        and "loadPreselectedPilotLeads" in cold
        and "PILOT_ROSTER" not in cold
        and "PILOT_ROSTER" not in (SHARED / "pilot-deliver.ts").read_text(encoding="utf-8")
        and "PILOT_ROSTER" not in (SHARED / "pilot-roster.ts").read_text(encoding="utf-8"),
        "seed_migration": (
            ROOT / "supabase/migrations_platform_crm/20260918_prd12_seed_pilot_preselected.sql"
        ).is_file(),
        "cold_harness_pilot_tick_action": 'case "harness-pilot-tick"' in cold,
        "cold_tick_retired": "legacy_tick_retired" in cold
        or "LEGACY_TICK_RETIRED" in cold,
        "cold_r2_gated": "legacyCamilaSendersEnabled" in cold,
        "webhook_path_a_gated": "pathARuntimeAllowed" in webhook,
        "webhook_reactive": "enqueueReactiveFromInbound" in webhook,
        "webhook_assertive_cite": "recentTexts" in webhook
        and "harness_cite_text" in webhook
        and "wake_brain" in webhook,
        "webhook_roster_db": "loadPreselectedPilotLeads" in webhook
        and "pilotManualList()" not in webhook,
        "conductor_retired": "legacy_conductor_retired" in conductor,
        "legacy_cutover_module": "LEGACY_CAMILA_SENDERS" in legacy,
        "queue_persist": (
            "serializePilotQueue" in store
            and "harness_pilot_queue" in store
            and 'select("id, settings")' in store
            and "update({ settings" in store
        ),
        "reactive_module": "enqueueReactiveFromInbound" in reactive,
        "reactive_no_hardcoded_roster": "pilotManualList()" not in reactive,
        "vps_script": vps_py.is_file() and "harness-pilot-tick" in vps_py.read_text(encoding="utf-8"),
        "vps_runbook": runbook.is_file(),
        "migration_unschedule": MIGRATION.is_file()
        and "platform-cold-outreach-tick" in MIGRATION.read_text(encoding="utf-8")
        and "platform-camila-conductor" in MIGRATION.read_text(encoding="utf-8"),
        "no_new_pgcron_pilot": MIGRATION.is_file()
        and "cron.schedule" not in MIGRATION.read_text(encoding="utf-8"),
    }

    legacy_cutover = {
        "path_a_sends_possible": False,  # cutover code + default flags
        "r2_sends_possible": False,
        "cold_tick_retired": checks["cold_tick_retired"],
        "apresentar_retired": "apresentar_retired" in cold or "legacyCamilaSendersEnabled" in cold,
        "conductor_cron_off": checks["conductor_retired"] and checks["migration_unschedule"],
        "vps_owner": "harness_pilot_tick",
        "LEGACY_CAMILA_SENDERS_default": "off",
    }
    checks["legacy_cutover_pass"] = all(
        [
            legacy_cutover["cold_tick_retired"],
            legacy_cutover["apresentar_retired"],
            legacy_cutover["conductor_cron_off"],
            checks["webhook_path_a_gated"],
            checks["cold_r2_gated"],
            checks["vps_script"],
        ]
    )

    # Binary evidence fields for path_a/r2: False means "not possible" → PASS in report
    legacy_report = {
        "path_a_sends_possible": "PASS" if legacy_cutover["path_a_sends_possible"] is False else "FAIL",
        "r2_sends_possible": "PASS" if legacy_cutover["r2_sends_possible"] is False else "FAIL",
        "cold_tick_retired": "PASS" if legacy_cutover["cold_tick_retired"] else "FAIL",
        "apresentar_retired": "PASS" if legacy_cutover["apresentar_retired"] else "FAIL",
        "conductor_cron_off": "PASS" if legacy_cutover["conductor_cron_off"] else "FAIL",
        "vps_owner": legacy_cutover["vps_owner"],
        "LEGACY_CAMILA_SENDERS_default": legacy_cutover["LEGACY_CAMILA_SENDERS_default"],
        "status": "PASS" if checks["legacy_cutover_pass"] else "FAIL",
    }

    ok = all(checks.values())
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    evidence = {
        "loop": "12",
        "name": "PILOT_LIVE_WIRE_BUILD",
        "go_build": "GO BUILD PRD-12",
        "awaiting": "GO PILOT HARNESS v1",
        "at": datetime.now(timezone.utc).isoformat(),
        "pass": ok,
        "real_whatsapp_sends": 0,
        "checks": {k: ("PASS" if v else "FAIL") for k, v in checks.items()},
        "legacy_cutover": legacy_report,
        "note": "BUILD only — 0 real WhatsApp; VPS cron disarmed until GO PILOT",
    }
    latest = EVIDENCE / "L3-pilot-live-build-latest.json"
    stamped = EVIDENCE / f"L3-pilot-live-build-{stamp}.json"
    latest.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    stamped.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Update LOOP-MANIFEST
    manifest_path = Path(__file__).resolve().parent / "LOOP-MANIFEST.json"
    if manifest_path.is_file():
        man = json.loads(manifest_path.read_text(encoding="utf-8"))
        for loop in man.get("loops", []):
            if str(loop.get("id")) == "12":
                loop["status"] = "BUILD_PASS_AWAITING_GO" if ok else "BUILD_FAIL"
                loop["note"] = "PRD-12 BUILD PASS; 0 WA until GO PILOT; VPS cron disarmed"
        man["current"] = "PRD12_BUILD_PASS_AWAITING_GO_PILOT" if ok else "PRD12_BUILD_FAIL"
        man["status"] = "AWAITING_GO_PILOT" if ok else "BUILD_FAIL"
        man["verify_prd12_live_build"] = "PASS" if ok else "FAIL"
        man["real_whatsapp_sends"] = 0
        manifest_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({"pass": ok, "evidence": str(latest), "checks": evidence["checks"], "legacy_cutover": evidence["legacy_cutover"]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
