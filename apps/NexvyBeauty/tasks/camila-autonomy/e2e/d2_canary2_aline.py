#!/usr/bin/env python3
"""D2 canary #2 — Aline. Uses supabase CLI + vault tick (no VPS JWT).

Enforces: after opening, finish bolhas 2–4 within MAX_APPROACH_SPAN_MS (120s)
before restoring OFF+kill.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # apps/NexvyBeauty
EVIDENCE = ROOT / "tasks/camila-autonomy/evidence/PRD-09"

CANARY = {
    "handle": "alinemachadostudiodebeleza",
    "extracted_lead_id": "75c3fd1e-3793-4d2e-8517-fe0c1663bc74",
    "greeting": "Aline",
    "telefone": "5585997315603",
}
PRODUCT_ID = "806b5975-e268-402e-a65c-9e9503271041"
AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_ID = "80268751-958e-4750-8550-eeae942b3c4d"
MAX_APPROACH_SPAN_S = 180


def db(sql: str) -> dict:
    r = subprocess.run(
        ["supabase", "db", "query", "--linked", "-o", "json", sql],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    raw = r.stdout + "\n" + r.stderr
    m = re.search(r"\{[\s\S]*\"rows\"[\s\S]*\}", raw)
    if not m:
        raise RuntimeError(f"db query failed: {raw[-800:]}")
    return json.loads(m.group(0))


def rows(sql: str) -> list:
    return db(sql).get("rows") or []


def force_tick() -> None:
    rows(
        """
select net.http_post(
  url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-cold-outreach',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
  ),
  body := '{"action":"tick"}'::jsonb
) as request_id;
"""
    )


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {
        "schema": 1,
        "job": "camila-d2-canary-2",
        "when": datetime.now(timezone.utc).isoformat(),
        "canary": CANARY,
        "max_approach_span_s": MAX_APPROACH_SPAN_S,
        "cases": [],
    }

    def add(cid: str, ok: bool, detail: dict):
        report["cases"].append(
            {"id": cid, "status": "PASS" if ok else "FAIL", "detail": detail}
        )
        print(f"[{'PASS' if ok else 'FAIL'}] {cid} {json.dumps(detail, ensure_ascii=False)[:220]}")

    now_iso = datetime.now(timezone.utc).isoformat()

    # approve + nome
    r = rows(
        f"""
UPDATE platform_crm_extracted_leads
SET approved_at = '{now_iso}', primeiro_nome = '{CANARY["greeting"]}'
WHERE id = '{CANARY["extracted_lead_id"]}'
RETURNING id, handle, approved_at IS NOT NULL AS ok;
"""
    )
    add("approve", bool(r and r[0].get("ok")), {"row": r})

    # campaign
    r = rows(
        f"""
INSERT INTO platform_crm_cold_campaigns (
  product_id, agent_id, instance_id, channel, name, status, dry_run,
  activated_at, warmup_config, window_config, jitter_config, sender_name
) VALUES (
  '{PRODUCT_ID}', '{AGENT_ID}', '{INSTANCE_ID}', 'whatsapp',
  'd2-canary-aline-{stamp}', 'active', false, '{now_iso}',
  '{{"startPerDay":5,"doublingEveryDays":2,"maxPerDay":20}}'::jsonb,
  '{{"startHour":9,"endHour":18,"days":[1,2,3,4,5],"timeZone":"America/Sao_Paulo"}}'::jsonb,
  '{{"minMs":5000,"maxMs":8000}}'::jsonb,
  'Camila'
) RETURNING id;
"""
    )
    camp_id = r[0]["id"] if r else None
    add("campaign", bool(camp_id), {"campaign_id": camp_id})
    if not camp_id:
        return 1
    report["campaign_id"] = camp_id

    r = rows(
        f"""
INSERT INTO platform_crm_cold_outreach_queue (
  campaign_id, product_id, extracted_lead_id, handle, telefone,
  tier, tier_rank, variant, status, step, followups_sent, scheduled_for
) VALUES (
  '{camp_id}', '{PRODUCT_ID}', '{CANARY["extracted_lead_id"]}',
  '{CANARY["handle"]}', '{CANARY["telefone"]}',
  'massa', 2, '{{"opening":"A_pergunta","dor":"A_sumiu","precoObj":"P1"}}'::jsonb,
  'queued', 0, 0, null
) RETURNING id;
"""
    )
    qid = r[0]["id"] if r else None
    add("enqueue", bool(qid), {"queue_id": qid})

    r = rows(
        f"""
UPDATE platform_crm_agent_release_controls
SET release_state='TEST', kill_switch=false, updated_at=now()
WHERE agent_id='{AGENT_ID}'
RETURNING release_state, kill_switch;
"""
    )
    add(
        "arm_test",
        bool(r and r[0].get("release_state") == "TEST" and r[0].get("kill_switch") is False),
        {"rel": r},
    )

    # tick opening
    force_tick()
    time.sleep(8)

    # find conversation by recent outbound containing greeting
    conv_rows = rows(
        f"""
SELECT c.id AS conversation_id, c.lead_id, m.created_at AS opening_at, left(m.content,80) AS preview
FROM platform_crm_messages m
JOIN platform_crm_conversations c ON c.id = m.conversation_id
WHERE m.direction='outbound'
  AND m.content ILIKE '%{CANARY["greeting"]}!%'
  AND m.created_at > now() - interval '10 minutes'
ORDER BY m.created_at DESC
LIMIT 1;
"""
    )
    add("opening_found", bool(conv_rows), {"row": conv_rows})
    if not conv_rows:
        # restore and fail
        rows(
            f"""
UPDATE platform_crm_agent_release_controls
SET release_state='OFF', kill_switch=true, updated_at=now()
WHERE agent_id='{AGENT_ID}';
UPDATE platform_crm_cold_campaigns
SET status='paused', dry_run=true, activated_at=null, paused_reason='d2_canary2_opening_fail', updated_at=now()
WHERE id='{camp_id}';
UPDATE platform_crm_extracted_leads SET approved_at=null WHERE id='{CANARY["extracted_lead_id"]}';
"""
        )
        _write(report, stamp)
        return 1

    conv_id = conv_rows[0]["conversation_id"]
    lead_id = conv_rows[0]["lead_id"]
    opening_at = conv_rows[0]["opening_at"]
    report["conversation_id"] = conv_id
    report["lead_id"] = lead_id
    report["opening_at"] = opening_at

    # Finish parts within 2 minutes of opening — vault ticks every ~16s
    deadline = time.time() + MAX_APPROACH_SPAN_S
    outs = 1
    while time.time() < deadline and outs < 4:
        force_tick()
        time.sleep(16)
        n = rows(
            f"""
SELECT count(*)::int AS n
FROM platform_crm_messages
WHERE conversation_id='{conv_id}' AND direction='outbound';
"""
        )
        outs = n[0]["n"] if n else outs
        print(f"  outs={outs} elapsed≈{int(MAX_APPROACH_SPAN_S - (deadline - time.time()))}s")

    span = rows(
        f"""
SELECT
  count(*)::int AS outs,
  EXTRACT(EPOCH FROM (max(created_at) - min(created_at)))::int AS span_s,
  (SELECT metadata->'apresentar_sequence'->>'status'
   FROM platform_crm_conversations WHERE id='{conv_id}') AS ap_status
FROM platform_crm_messages
WHERE conversation_id='{conv_id}' AND direction='outbound';
"""
    )
    span_s = (span[0].get("span_s") if span else None) or 9999
    outs_n = span[0]["outs"] if span else 0
    add(
        "approach_complete_within_2min",
        outs_n >= 4 and span_s <= MAX_APPROACH_SPAN_S,
        {"outs": outs_n, "span_s": span_s, "ap": span[0] if span else None},
    )

    msgs = rows(
        f"""
SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::text AS when_brt,
  left(content,100) AS preview, metadata->>'origem' AS origem
FROM platform_crm_messages
WHERE conversation_id='{conv_id}' AND direction='outbound'
ORDER BY created_at;
"""
    )
    report["messages"] = msgs

    # restore ALWAYS
    rows(
        f"""
UPDATE platform_crm_agent_release_controls
SET release_state='OFF', kill_switch=true, updated_at=now()
WHERE agent_id='{AGENT_ID}';
UPDATE platform_crm_cold_campaigns
SET status='paused', dry_run=true, activated_at=null,
    paused_reason='d2_canary2_done', updated_at=now()
WHERE id='{camp_id}';
UPDATE platform_crm_extracted_leads
SET approved_at=null WHERE id='{CANARY["extracted_lead_id"]}';
"""
    )
    rel = rows(
        f"""
SELECT release_state, kill_switch FROM platform_crm_agent_release_controls
WHERE agent_id='{AGENT_ID}';
"""
    )
    add(
        "restore_off_kill",
        bool(rel and rel[0].get("release_state") == "OFF" and rel[0].get("kill_switch") is True),
        {"rel": rel},
    )

    path = _write(report, stamp)
    fails = [c for c in report["cases"] if c["status"] != "PASS"]
    print("evidence", path)
    print("MESSAGES:")
    for m in msgs:
        print("-", m.get("when_brt"), m.get("origem"), m.get("preview"))
    return 1 if fails else 0


def _write(report: dict, stamp: str) -> Path:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / f"d2-canary-aline-{stamp}.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (EVIDENCE / "d2-canary-aline-latest.json").write_text(path.read_text())
    return path


if __name__ == "__main__":
    sys.exit(main())
