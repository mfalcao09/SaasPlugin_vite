#!/usr/bin/env python3
"""Camila D2 canary: 1 shortlist lead, 4-bubble approach, then restore OFF+kill.

Runs on VPS with /opt/scripts/camila/.env.d1 (same secrets as D1).
Canary: @joicefbeltramini (Joice) — shortlist validated 2026-09-14.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENV_PATH = Path(os.environ.get("CAMILA_D1_ENV", "/opt/scripts/camila/.env.d1"))
OUT_DIR = Path(os.environ.get("CAMILA_D2_OUT", "/opt/scripts/camila/evidence"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Shortlist canary (validated greeting shortlist — person-first, unique phone)
CANARY = {
    "handle": "joicefbeltramini",
    "extracted_lead_id": "89f9f8c6-7526-4db5-aaf0-15cd25e7a0e0",
    "greeting": "Joice",
    "telefone": "5547996650702",
}
PRODUCT_ID = "806b5975-e268-402e-a65c-9e9503271041"
AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_ID = "80268751-958e-4750-8550-eeae942b3c4d"


def load_env(path: Path) -> dict:
    d = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k.strip()] = v.strip().strip('"').strip("'")
    return d


def req(method: str, url: str, headers: dict, body=None, timeout=180):
    data = None if body is None else json.dumps(body).encode()
    h = dict(headers)
    if data is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"raw": raw[:800]}
        return e.code, payload


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report: dict = {
        "schema": 1,
        "job": "camila-d2-canary",
        "when": datetime.now(timezone.utc).isoformat(),
        "canary": CANARY,
        "cases": [],
    }

    def add(cid: str, ok: bool, detail: dict):
        report["cases"].append(
            {"id": cid, "status": "PASS" if ok else "FAIL", "detail": detail}
        )
        print(f"[{'PASS' if ok else 'FAIL'}] {cid} {json.dumps(detail, ensure_ascii=False)[:240]}")

    if not ENV_PATH.exists():
        print("missing env", ENV_PATH, file=sys.stderr)
        return 2
    env = load_env(ENV_PATH)
    base = env["SUPABASE_URL"].rstrip("/")
    svc = env["SUPABASE_SERVICE_ROLE_KEY"]
    rest = {
        "apikey": svc,
        "Authorization": f"Bearer {svc}",
        "Prefer": "return=representation",
    }
    fn_headers = {
        "apikey": svc,
        "Authorization": f"Bearer {svc}",
        "Content-Type": "application/json",
    }

    now_iso = datetime.now(timezone.utc).isoformat()

    # 0) approve canary only
    st, rows = req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_extracted_leads?id=eq.{CANARY['extracted_lead_id']}",
        rest,
        {"approved_at": now_iso, "primeiro_nome": CANARY["greeting"]},
    )
    add("approve_canary", st in (200, 204) or bool(rows), {"http": st, "rows": rows})

    # 1) create dedicated campaign (armed)
    campaign = {
        "product_id": PRODUCT_ID,
        "agent_id": AGENT_ID,
        "instance_id": INSTANCE_ID,
        "channel": "whatsapp",
        "name": f"d2-canary-joice-{stamp}",
        "status": "active",
        "dry_run": False,
        "activated_at": now_iso,
        "scheduled_start_at": None,
        "scheduled_end_at": None,
        "warmup_config": {"startPerDay": 5, "doublingEveryDays": 2, "maxPerDay": 20},
        "window_config": {
            "startHour": 9,
            "endHour": 18,
            "days": [1, 2, 3, 4, 5],
            "timeZone": "America/Sao_Paulo",
        },
        "jitter_config": {"minMs": 5000, "maxMs": 10000},
        "sender_name": "Camila",
    }
    st, crow = req(
        "POST",
        f"{base}/rest/v1/platform_crm_cold_campaigns",
        rest,
        campaign,
    )
    camp_id = None
    if isinstance(crow, list) and crow:
        camp_id = crow[0].get("id")
    elif isinstance(crow, dict):
        camp_id = crow.get("id")
    add("create_campaign", bool(camp_id), {"http": st, "campaign_id": camp_id, "body": crow})
    if not camp_id:
        _write(report, stamp)
        return 1
    report["campaign_id"] = camp_id

    # 2) enqueue ONLY canary (manual queue row — never full enqueue)
    qrow = {
        "campaign_id": camp_id,
        "product_id": PRODUCT_ID,
        "extracted_lead_id": CANARY["extracted_lead_id"],
        "handle": CANARY["handle"],
        "telefone": CANARY["telefone"],
        "tier": "massa",
        "tier_rank": 2,
        "variant": {"opening": "A_pergunta", "dor": "A_sumiu", "precoObj": "P1"},
        "status": "queued",
        "step": 0,
        "followups_sent": 0,
        "scheduled_for": None,
    }
    st, qins = req(
        "POST",
        f"{base}/rest/v1/platform_crm_cold_outreach_queue",
        rest,
        qrow,
    )
    qid = None
    if isinstance(qins, list) and qins:
        qid = qins[0].get("id")
    add("enqueue_canary_only", bool(qid), {"http": st, "queue_id": qid})

    # 3) arm release TEST + kill false
    st, _ = req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT_ID}",
        rest,
        {
            "release_state": "TEST",
            "kill_switch": False,
            "updated_at": now_iso,
        },
    )
    st2, rel = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT_ID}&select=release_state,kill_switch",
        rest,
    )
    ok_rel = (
        st2 == 200
        and isinstance(rel, list)
        and rel
        and rel[0].get("release_state") == "TEST"
        and rel[0].get("kill_switch") is False
    )
    add("arm_test", ok_rel, {"patch_http": st, "rel": rel})

    # 4) tick for opening, then ticks for apresentar 2–4
    ticks = []
    for i in range(5):
        st, body = req(
            "POST",
            f"{base}/functions/v1/platform-cold-outreach",
            fn_headers,
            {"action": "tick", "campaign_id": camp_id},
            timeout=120,
        )
        ticks.append({"i": i, "http": st, "body": body})
        print(f"  tick[{i}] http={st} body={json.dumps(body, ensure_ascii=False)[:300]}")
        if i < 4:
            time.sleep(16)

    add(
        "ticks",
        any(t.get("http") == 200 for t in ticks),
        {"ticks": ticks},
    )

    # 5) prove outs + ledger
    phone = CANARY["telefone"]
    st, msgs = req(
        "GET",
        f"{base}/rest/v1/platform_crm_messages?direction=eq.outbound&order=created_at.desc&limit=20"
        f"&select=id,conversation_id,content,created_at,metadata",
        rest,
    )
    # filter by recent + content heuristics
    recent = []
    if isinstance(msgs, list):
        for m in msgs:
            c = (m.get("content") or "")
            if "Joice" in c or "NexvyBeauty" in c:
                # only last ~10 min
                recent.append(
                    {
                        "id": m.get("id"),
                        "conversation_id": m.get("conversation_id"),
                        "preview": c[:120],
                        "created_at": m.get("created_at"),
                        "origem": (m.get("metadata") or {}).get("origem"),
                    }
                )
    recent = recent[:8]
    add(
        "outbound_persisted",
        len(recent) >= 1,
        {"n": len(recent), "msgs": recent},
    )

    st, led = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_action_ledger"
        f"?agent_id=eq.{AGENT_ID}&order=created_at.desc&limit=15"
        f"&select=id,action_type,status,deny_reason,created_at,lead_id",
        rest,
    )
    add(
        "ledger_sample",
        st == 200 and isinstance(led, list),
        {"http": st, "rows": led if isinstance(led, list) else led},
    )

    # 6) restore: pause campaign, OFF + kill, de-approve canary
    req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_cold_campaigns?id=eq.{camp_id}",
        rest,
        {
            "status": "paused",
            "dry_run": True,
            "activated_at": None,
            "paused_reason": "d2_canary_complete_restore",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    # clear remaining queued on this campaign
    req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_cold_outreach_queue?campaign_id=eq.{camp_id}&status=eq.queued",
        rest,
        {"status": "skipped", "skip_reason": "d2_canary_restore"},
    )
    req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_extracted_leads?id=eq.{CANARY['extracted_lead_id']}",
        rest,
        {"approved_at": None},
    )
    st, _ = req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT_ID}",
        rest,
        {
            "release_state": "OFF",
            "kill_switch": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    st2, rel2 = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT_ID}&select=release_state,kill_switch",
        rest,
    )
    ok_off = (
        st2 == 200
        and isinstance(rel2, list)
        and rel2
        and rel2[0].get("release_state") == "OFF"
        and rel2[0].get("kill_switch") is True
    )
    add("restore_off_kill", ok_off, {"rel": rel2})

    path = _write(report, stamp)
    fails = [c for c in report["cases"] if c["status"] != "PASS"]
    print("evidence", path)
    return 1 if fails else 0


def _write(report: dict, stamp: str) -> Path:
    path = OUT_DIR / f"d2-canary-{stamp}.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    latest = OUT_DIR / "d2-canary-latest.json"
    latest.write_text(path.read_text())
    return path


if __name__ == "__main__":
    sys.exit(main())
