#!/usr/bin/env python3
"""D2 canaries #4+#5 — Adriana then Leticia (60s gap after #4 finishes).

Clears suppress gates only for the active lead, restores OFF+kill + re-blocks after each.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "tasks/camila-autonomy/evidence/PRD-09"
PRODUCT_ID = "806b5975-e268-402e-a65c-9e9503271041"
AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_ID = "80268751-958e-4750-8550-eeae942b3c4d"
MAX_APPROACH_SPAN_S = 180
GAP_BETWEEN_S = 60

ADRIANA = {
    "slug": "adriana",
    "handle": "beautycompany.af",
    "extracted_lead_id": "aa624eba-da2b-453e-9cba-6d752ca5a92b",
    "greeting": "Adriana",
    "telefone": "5549988309265",
}
LETICIA = {
    "slug": "leticia",
    "handle": "espaco.leh",
    "extracted_lead_id": "543f3938-f648-4c91-adb9-98a55cae8558",
    "greeting": "Leticia",
    "telefone": "5511942602733",
}


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


def clear_suppress(c: dict) -> None:
    rows(
        f"""
UPDATE platform_crm_extracted_leads
SET excluded_at = NULL, approved_at = NULL, approved_by = NULL
WHERE id = '{c["extracted_lead_id"]}';
DELETE FROM platform_crm_lead_excluded
WHERE product_id = '{PRODUCT_ID}' AND lower(handle) = lower('{c["handle"]}');
DELETE FROM platform_crm_lead_optout
WHERE product_id = '{PRODUCT_ID}'
  AND (
    lower(COALESCE(handle,'')) = lower('{c["handle"]}')
    OR regexp_replace(COALESCE(telefone,''), '\\D', '', 'g')
       = regexp_replace('{c["telefone"]}', '\\D', '', 'g')
  );
"""
    )


def reblock(c: dict, conv_id: str | None, reason: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conv_sql = ""
    if conv_id:
        conv_sql = f"""
UPDATE platform_crm_conversations
SET metadata = COALESCE(metadata, '{{}}'::jsonb) || jsonb_build_object(
  'do_not_contact', true,
  'do_not_contact_reason', '{reason}'
), updated_at = now()
WHERE id = '{conv_id}';
"""
    rows(
        f"""
UPDATE platform_crm_extracted_leads
SET approved_at = NULL, approved_by = NULL, excluded_at = COALESCE(excluded_at, '{now}')
WHERE id = '{c["extracted_lead_id"]}';
INSERT INTO platform_crm_lead_excluded (product_id, handle)
VALUES ('{PRODUCT_ID}', '{c["handle"]}')
ON CONFLICT DO NOTHING;
INSERT INTO platform_crm_lead_optout (product_id, handle, telefone, reason)
SELECT '{PRODUCT_ID}', '{c["handle"]}', '{c["telefone"]}', '{reason}'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_crm_lead_optout o
  WHERE o.product_id = '{PRODUCT_ID}'
    AND regexp_replace(COALESCE(o.telefone,''), '\\D', '', 'g')
      = regexp_replace('{c["telefone"]}', '\\D', '', 'g')
);
{conv_sql}
"""
    )


def restore_off_kill(camp_id: str | None, paused_reason: str) -> list:
    camp_sql = ""
    if camp_id:
        camp_sql = f"""
UPDATE platform_crm_cold_campaigns
SET status='paused', dry_run=true, activated_at=null,
    paused_reason='{paused_reason}', updated_at=now()
WHERE id='{camp_id}';
UPDATE platform_crm_cold_outreach_queue
SET status='skipped', skip_reason='d2_canary_restore', next_followup_at=null, updated_at=now()
WHERE campaign_id='{camp_id}' AND status IN ('queued','sending');
UPDATE platform_crm_cold_outreach_queue
SET next_followup_at=null,
    skip_reason=COALESCE(skip_reason, 'already_contacted_no_followup'),
    updated_at=now()
WHERE campaign_id='{camp_id}' AND status='sent';
"""
    rows(
        f"""
UPDATE platform_crm_agent_release_controls
SET release_state='OFF', kill_switch=true, updated_at=now()
WHERE agent_id='{AGENT_ID}';
{camp_sql}
"""
    )
    return rows(
        f"""
SELECT release_state, kill_switch FROM platform_crm_agent_release_controls
WHERE agent_id='{AGENT_ID}';
"""
    )


def run_one(c: dict, job: str) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report: dict = {
        "schema": 1,
        "job": job,
        "when": datetime.now(timezone.utc).isoformat(),
        "canary": c,
        "max_approach_span_s": MAX_APPROACH_SPAN_S,
        "cases": [],
    }

    def add(cid: str, ok: bool, detail: dict):
        report["cases"].append(
            {"id": cid, "status": "PASS" if ok else "FAIL", "detail": detail}
        )
        print(f"[{'PASS' if ok else 'FAIL'}] {c['slug']}/{cid} {json.dumps(detail, ensure_ascii=False)[:220]}")

    now_iso = datetime.now(timezone.utc).isoformat()
    camp_id = None
    conv_id = None

    try:
        clear_suppress(c)
        add("clear_suppress", True, {"handle": c["handle"]})

        r = rows(
            f"""
UPDATE platform_crm_extracted_leads
SET approved_at = '{now_iso}', primeiro_nome = '{c["greeting"]}', excluded_at = NULL
WHERE id = '{c["extracted_lead_id"]}'
RETURNING id, handle, approved_at IS NOT NULL AS ok, excluded_at IS NULL AS not_excluded;
"""
        )
        add(
            "approve",
            bool(r and r[0].get("ok") and r[0].get("not_excluded")),
            {"row": r},
        )

        r = rows(
            f"""
INSERT INTO platform_crm_cold_campaigns (
  product_id, agent_id, instance_id, channel, name, status, dry_run,
  activated_at, warmup_config, window_config, jitter_config, sender_name
) VALUES (
  '{PRODUCT_ID}', '{AGENT_ID}', '{INSTANCE_ID}', 'whatsapp',
  'd2-canary-{c["slug"]}-{stamp}', 'active', false, '{now_iso}',
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
            raise RuntimeError("campaign insert failed")
        report["campaign_id"] = camp_id

        r = rows(
            f"""
INSERT INTO platform_crm_cold_outreach_queue (
  campaign_id, product_id, extracted_lead_id, handle, telefone,
  tier, tier_rank, variant, status, step, followups_sent, scheduled_for
) VALUES (
  '{camp_id}', '{PRODUCT_ID}', '{c["extracted_lead_id"]}',
  '{c["handle"]}', '{c["telefone"]}',
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

        force_tick()
        time.sleep(12)

        conv_rows = rows(
            f"""
SELECT c.id AS conversation_id, c.lead_id, m.created_at AS opening_at, left(m.content,80) AS preview
FROM platform_crm_messages m
JOIN platform_crm_conversations c ON c.id = m.conversation_id
WHERE m.direction='outbound'
  AND m.content ILIKE '%{c["greeting"]}!%'
  AND m.created_at > now() - interval '10 minutes'
ORDER BY m.created_at DESC
LIMIT 1;
"""
        )
        add("opening_found", bool(conv_rows), {"row": conv_rows})
        if not conv_rows:
            raise RuntimeError("opening not found")

        conv_id = conv_rows[0]["conversation_id"]
        report["conversation_id"] = conv_id
        report["lead_id"] = conv_rows[0]["lead_id"]
        report["opening_at"] = conv_rows[0]["opening_at"]

        deadline = time.time() + MAX_APPROACH_SPAN_S
        outs = 1
        while time.time() < deadline and outs < 4:
            force_tick()
            time.sleep(32)
            n = rows(
                f"""
SELECT count(*)::int AS n
FROM platform_crm_messages
WHERE conversation_id='{conv_id}' AND direction='outbound';
"""
            )
            outs = n[0]["n"] if n else outs
            print(f"  {c['slug']} outs={outs} elapsed≈{int(MAX_APPROACH_SPAN_S - (deadline - time.time()))}s")

        # final tick in case last bubble is due
        force_tick()
        time.sleep(8)

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
            "approach_complete_within_span",
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
    except Exception as e:
        add("exception", False, {"error": str(e)[:400]})
    finally:
        rel = restore_off_kill(camp_id, f"d2_canary_{c['slug']}_done")
        add(
            "restore_off_kill",
            bool(rel and rel[0].get("release_state") == "OFF" and rel[0].get("kill_switch") is True),
            {"rel": rel},
        )
        reblock(c, conv_id, f"already_contacted_d2_canary_{c['slug']}")
        # keep shared-phone suppress for lu.heleno if Leticia
        if c["handle"] == "espaco.leh":
            rows(
                f"""
UPDATE platform_crm_extracted_leads
SET approved_at=NULL, excluded_at=COALESCE(excluded_at, now())
WHERE id='02f26de1-7513-4ff9-adb0-1cb6d19cf4e1';
INSERT INTO platform_crm_lead_excluded (product_id, handle)
VALUES ('{PRODUCT_ID}', 'lu.heleno.nails')
ON CONFLICT DO NOTHING;
INSERT INTO platform_crm_lead_optout (product_id, handle, telefone, reason)
SELECT '{PRODUCT_ID}', 'lu.heleno.nails', '5511942602733', 'shared_phone_with_espaco_leh_suppress'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_crm_lead_optout o
  WHERE o.product_id='{PRODUCT_ID}'
    AND regexp_replace(COALESCE(o.telefone,''),'\\D','','g')='5511942602733'
);
"""
            )
        add("reblock", True, {"handle": c["handle"], "conversation_id": conv_id})

    path = EVIDENCE / f"d2-canary-{c['slug']}-{stamp}.json"
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (EVIDENCE / f"d2-canary-{c['slug']}-latest.json").write_text(path.read_text())
    report["evidence_path"] = str(path)
    print("evidence", path)
    for m in report.get("messages") or []:
        print("-", m.get("when_brt"), m.get("origem"), m.get("preview"))
    return report


def main() -> int:
    print("=== CANARY 4 Adriana ===")
    r1 = run_one(ADRIANA, "camila-d2-canary-4")
    fails1 = [c for c in r1["cases"] if c["status"] != "PASS"]

    print(f"=== GAP {GAP_BETWEEN_S}s ===")
    time.sleep(GAP_BETWEEN_S)

    print("=== CANARY 5 Leticia ===")
    r2 = run_one(LETICIA, "camila-d2-canary-5")
    fails2 = [c for c in r2["cases"] if c["status"] != "PASS"]

    summary = {
        "when": datetime.now(timezone.utc).isoformat(),
        "gap_s": GAP_BETWEEN_S,
        "adriana": {
            "ok": not fails1,
            "outs": next((c["detail"].get("outs") for c in r1["cases"] if c["id"] == "approach_complete_within_span"), None),
            "conversation_id": r1.get("conversation_id"),
            "evidence": r1.get("evidence_path"),
            "fails": [c["id"] for c in fails1],
        },
        "leticia": {
            "ok": not fails2,
            "outs": next((c["detail"].get("outs") for c in r2["cases"] if c["id"] == "approach_complete_within_span"), None),
            "conversation_id": r2.get("conversation_id"),
            "evidence": r2.get("evidence_path"),
            "fails": [c["id"] for c in fails2],
        },
    }
    out = EVIDENCE / "d2-canary-45-adriana-leticia-latest.json"
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print("summary", out)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 1 if fails1 or fails2 else 0


if __name__ == "__main__":
    sys.exit(main())
