#!/usr/bin/env python3
"""D3 — 10 shortlist leads in pairs; 60s gap BETWEEN pairs (not within).

Each lead: clear suppress → approve → campaign (window until 22h BRT) → enqueue →
TEST → ticks until 4 outs → OFF+kill → reblock.
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
SHORTLIST = EVIDENCE / "shortlist-10-d3-latest.json"
PRODUCT_ID = "806b5975-e268-402e-a65c-9e9503271041"
AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_ID = "80268751-958e-4750-8550-eeae942b3c4d"
MAX_APPROACH_SPAN_S = 180
GAP_BETWEEN_PAIRS_S = 60


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


def load_leads() -> list[dict]:
    doc = json.loads(SHORTLIST.read_text())
    out = []
    for c in doc["candidates"]:
        out.append(
            {
                "order": c["order"],
                "slug": re.sub(r"[^a-z0-9]+", "-", c["handle_raw"].lower()).strip("-"),
                "handle": c["handle_raw"],
                "extracted_lead_id": c["extracted_lead_id"],
                "greeting": c["greeting"],
                "telefone": c["telefone"],
            }
        )
    out.sort(key=lambda x: x["order"])
    if len(out) != 10:
        raise RuntimeError(f"expected 10 leads, got {len(out)}")
    return out


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
SET status='skipped', skip_reason='d3_canary_restore', next_followup_at=null, updated_at=now()
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


def run_one(c: dict) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report: dict = {
        "schema": 1,
        "job": f"camila-d3-canary-{c['order']}",
        "when": datetime.now(timezone.utc).isoformat(),
        "canary": c,
        "max_approach_span_s": MAX_APPROACH_SPAN_S,
        "cases": [],
    }

    def add(cid: str, ok: bool, detail: dict):
        report["cases"].append(
            {"id": cid, "status": "PASS" if ok else "FAIL", "detail": detail}
        )
        print(
            f"[{'PASS' if ok else 'FAIL'}] #{c['order']} {c['slug']}/{cid} "
            f"{json.dumps(detail, ensure_ascii=False)[:200]}"
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    camp_id = None
    conv_id = None
    greet = c["greeting"].replace("'", "''")

    try:
        clear_suppress(c)
        add("clear_suppress", True, {"handle": c["handle"]})

        r = rows(
            f"""
UPDATE platform_crm_extracted_leads
SET approved_at = '{now_iso}', primeiro_nome = '{greet}', excluded_at = NULL
WHERE id = '{c["extracted_lead_id"]}'
RETURNING id, handle, approved_at IS NOT NULL AS ok, excluded_at IS NULL AS not_excluded;
"""
        )
        add(
            "approve",
            bool(r and r[0].get("ok") and r[0].get("not_excluded")),
            {"row": r},
        )

        # endHour 22: disparo após 18h BRT (GO Marcelo 17:54+)
        r = rows(
            f"""
INSERT INTO platform_crm_cold_campaigns (
  product_id, agent_id, instance_id, channel, name, status, dry_run,
  activated_at, warmup_config, window_config, jitter_config, sender_name
) VALUES (
  '{PRODUCT_ID}', '{AGENT_ID}', '{INSTANCE_ID}', 'whatsapp',
  'd3-canary-{c["slug"]}-{stamp}', 'active', false, '{now_iso}',
  '{{"startPerDay":5,"doublingEveryDays":2,"maxPerDay":20}}'::jsonb,
  '{{"startHour":0,"endHour":23,"days":[0,1,2,3,4,5,6],"timeZone":"America/Sao_Paulo"}}'::jsonb,
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
  AND m.content ILIKE '%{greet}!%'
  AND m.created_at > now() - interval '15 minutes'
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
            print(
                f"  #{c['order']} {c['slug']} outs={outs} "
                f"elapsed≈{int(MAX_APPROACH_SPAN_S - (deadline - time.time()))}s"
            )

        force_tick()
        time.sleep(8)

        span = rows(
            f"""
SELECT
  count(*)::int AS outs,
  EXTRACT(EPOCH FROM (max(created_at) - min(created_at)))::int AS span_s
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
        report["messages"] = rows(
            f"""
SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::text AS when_brt,
  left(content,100) AS preview, metadata->>'origem' AS origem
FROM platform_crm_messages
WHERE conversation_id='{conv_id}' AND direction='outbound'
ORDER BY created_at;
"""
        )
    except Exception as e:
        add("exception", False, {"error": str(e)[:400]})
    finally:
        rel = restore_off_kill(camp_id, f"d3_canary_{c['slug']}_done")
        add(
            "restore_off_kill",
            bool(rel and rel[0].get("release_state") == "OFF" and rel[0].get("kill_switch") is True),
            {"rel": rel},
        )
        reblock(c, conv_id, f"already_contacted_d3_canary_{c['slug']}")
        add("reblock", True, {"handle": c["handle"], "conversation_id": conv_id})

    path = EVIDENCE / f"d3-canary-{c['slug']}-{stamp}.json"
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (EVIDENCE / f"d3-canary-{c['slug']}-latest.json").write_text(path.read_text())
    report["evidence_path"] = str(path)
    print("evidence", path)
    return report


def main() -> int:
    print("D3 pairs start", datetime.now(timezone.utc).isoformat(), flush=True)
    leads = load_leads()
    print(f"loaded {len(leads)} leads", flush=True)
    pairs = [leads[i : i + 2] for i in range(0, len(leads), 2)]
    summary: dict = {
        "when": datetime.now(timezone.utc).isoformat(),
        "gap_between_pairs_s": GAP_BETWEEN_PAIRS_S,
        "pairs": [],
        "leads": [],
    }
    any_fail = False

    for pi, pair in enumerate(pairs, 1):
        print(f"\n=== PAIR {pi}/5: {[x['handle'] for x in pair]} ===")
        pair_reports = []
        for c in pair:
            print(f"--- lead #{c['order']} @{c['handle']} ({c['greeting']}) ---")
            r = run_one(c)
            fails = [x["id"] for x in r["cases"] if x["status"] != "PASS"]
            if fails:
                any_fail = True
            outs = next(
                (
                    x["detail"].get("outs")
                    for x in r["cases"]
                    if x["id"] == "approach_complete_within_span"
                ),
                None,
            )
            entry = {
                "order": c["order"],
                "handle": c["handle"],
                "greeting": c["greeting"],
                "ok": not fails,
                "fails": fails,
                "outs": outs,
                "conversation_id": r.get("conversation_id"),
                "evidence": r.get("evidence_path"),
            }
            summary["leads"].append(entry)
            pair_reports.append(entry)
            print(f"RESULT #{c['order']} ok={entry['ok']} outs={outs} fails={fails}")

        summary["pairs"].append({"pair": pi, "leads": pair_reports})
        if pi < len(pairs):
            print(f"=== GAP {GAP_BETWEEN_PAIRS_S}s between pairs ===")
            time.sleep(GAP_BETWEEN_PAIRS_S)

    # final release check
    rel = rows(
        f"""
SELECT release_state, kill_switch FROM platform_crm_agent_release_controls
WHERE agent_id='{AGENT_ID}';
"""
    )
    summary["release"] = rel[0] if rel else None
    summary["all_ok"] = not any_fail and bool(
        rel and rel[0].get("release_state") == "OFF" and rel[0].get("kill_switch") is True
    )

    out = EVIDENCE / "d3-pairs-10-latest.json"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stamped = EVIDENCE / f"d3-pairs-10-{stamp}.json"
    text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    out.write_text(text)
    stamped.write_text(text)
    print("\nSUMMARY", out)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 1 if any_fail or not summary["all_ok"] else 0


if __name__ == "__main__":
    sys.exit(main())
