#!/usr/bin/env python3
"""Path A F4 live canary — ONLY phone 5511945760964. Restores OFF+kill in finally.

With --live and PATH_A_F4_LIVE=1:
  1) seed canary conv soft-closed + DNC/remarketing + recent R2 ts
  2) POST Z-API ReceivedCallback farewell → expect stay_closed / no reopen
  3) POST reopen_intent → expect apply_mutation + bot_active (allowlist only)
  4) finally: release OFF + kill_switch true; conv restored soft-closed
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib import request, error

CANARY = "5511945760964"
AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_UUID = "80268751-958e-4750-8550-eeae942b3c4d"
INSTANCE_ID = "3F8520044B4222D5DB40D226F545789F"
# Canonical canary; ensureConversation may prefer a sibling — we soft-close ALL.
CONV_ID = "f0746176-4f2b-4ccb-9f27-6574f68e6c21"
NEXVY = Path(__file__).resolve().parents[3]
EVID = Path(__file__).resolve().parents[1] / "evidence/PRD-09/path-a-loop"


def load_dotenv() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in (".env.local", ".env"):
        p = NEXVY / name
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


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
    if r.returncode != 0 and not best:
        raise RuntimeError(f"db query failed: {blob[-800:]}")
    return list((best or {}).get("rows") or [])


def ensure_off_kill() -> None:
    db_query(
        f"""
        update platform_crm_agent_release_controls
        set release_state='OFF', kill_switch=true, updated_at=now()
        where agent_id='{AGENT_ID}'
        """
    )


def seed_soft_closed() -> None:
    r2 = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    # Soft-close EVERY conversation for the canary phone on this instance so
    # ensureConversation cannot pick a bot_active sibling and skip Path A.
    db_query(
        f"""
        update platform_crm_conversations
        set status='closed',
            needs_human=false,
            accepted_at=null,
            accepted_by=null,
            assigned_to=null,
            metadata = coalesce(metadata,'{{}}'::jsonb) || jsonb_build_object(
              'do_not_contact', true,
              'do_not_contact_reason', 'opt_out_remarketing',
              'remarketing', true,
              'last_r2_delivered_at', '{r2}',
              'path_a_f4_seed', true
            ),
            updated_at=now()
        where wa_qr_instance_id='{INSTANCE_UUID}'
          and regexp_replace(coalesce(visitor_phone,''), '\\D', '', 'g') like '%945760964%'
        """
    )


def restore_soft_closed() -> None:
    seed_soft_closed()


def instance_token() -> str:
    rows = db_query(
        f"select instance_token from platform_crm_wa_qr_instances where id='{INSTANCE_UUID}'"
    )
    tok = str((rows[0] or {}).get("instance_token") or "").strip()
    if not tok:
        raise RuntimeError("instance_token missing for camila-zapi-test")
    return tok


def post_inbound(text: str, env: dict[str, str]) -> dict:
    # Prefer iid+tok (DB) so we don't need ZAPI_WEBHOOK_KEY in local env.
    tok = instance_token()
    base = (
        env.get("SUPABASE_URL")
        or env.get("VITE_SUPABASE_URL")
        or "https://fzhlbwhdejumkyqosuvq.supabase.co"
    ).rstrip("/")
    url = (
        f"{base}/functions/v1/platform-whatsapp-qr-webhook"
        f"?provider=zapi&iid={INSTANCE_ID}&tok={tok}&skip_brain=1"
    )
    mid = f"f4-{uuid.uuid4().hex[:16]}"
    body = {
        "type": "ReceivedCallback",
        "instanceId": INSTANCE_ID,
        "phone": CANARY,
        "fromMe": False,
        "messageId": mid,
        "text": {"message": text},
        "senderName": "wa-eval-canary",
    }
    req = request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return {"http": resp.status, "body": json.loads(raw) if raw else {}}
    except error.HTTPError as e:
        return {"http": e.code, "body": e.read().decode()[:500]}


def latest_decision() -> dict | None:
    rows = db_query(
        f"""
        select m.id::text,
               m.conversation_id::text,
               m.content,
               m.metadata->'path_a_decision' as path_a_decision,
               m.created_at
        from platform_crm_messages m
        join platform_crm_conversations c on c.id=m.conversation_id
        where c.wa_qr_instance_id='{INSTANCE_UUID}'
          and regexp_replace(coalesce(c.visitor_phone,''), '\\D', '', 'g') like '%945760964%'
          and m.direction='inbound'
          and m.created_at > now() - interval '10 minutes'
        order by m.created_at desc
        limit 1
        """
    )
    return rows[0] if rows else None


def conv_status() -> dict:
    rows = db_query(
        f"""
        select id::text, status,
               (metadata->>'do_not_contact') as dnc,
               (metadata->>'path_a_reopened_at') as path_a_reopened_at
        from platform_crm_conversations
        where wa_qr_instance_id='{INSTANCE_UUID}'
          and regexp_replace(coalesce(visitor_phone,''), '\\D', '', 'g') like '%945760964%'
        order by updated_at desc nulls last
        """
    )
    return {"rows": rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()
    stamp = datetime.now(timezone.utc).isoformat()
    out: dict = {
        "schema": 1,
        "job": "path-a-f4-canary",
        "when": stamp,
        "canary_phone": CANARY,
        "agent_id": AGENT_ID,
        "conversation_id": CONV_ID,
        "live": bool(args.live),
    }
    EVID.mkdir(parents=True, exist_ok=True)

    if not args.live:
        out["status"] = "dry_skipped"
        out["note"] = "Pass --live and PATH_A_F4_LIVE=1 after edge deploy"
        (EVID / "F4-live-skip.json").write_text(json.dumps(out, indent=2) + "\n")
        print(json.dumps(out))
        return 0

    if os.environ.get("PATH_A_F4_LIVE", "").strip() != "1":
        out["status"] = "blocked"
        out["note"] = "PATH_A_F4_LIVE!=1"
        (EVID / "F4-live-blocked.json").write_text(json.dumps(out, indent=2) + "\n")
        print(json.dumps(out), file=sys.stderr)
        return 2

    env = load_dotenv()
    steps: dict = {}
    try:
        ensure_off_kill()
        seed_soft_closed()
        steps["seed"] = conv_status()

        # B2 farewell — must stay closed
        steps["farewell_http"] = post_inbound("Pode deixar", env)
        time.sleep(3)
        steps["farewell_decision"] = latest_decision()
        steps["farewell_conv"] = conv_status()
        d1 = (steps["farewell_decision"] or {}).get("path_a_decision") or {}
        if isinstance(d1, str):
            d1 = json.loads(d1)
        frows = (steps["farewell_conv"] or {}).get("rows") or []
        if any(r.get("status") == "bot_active" for r in frows):
            raise AssertionError(f"farewell reopened: {frows}")
        if not d1:
            raise AssertionError(
                f"farewell missing path_a_decision: {steps['farewell_decision']}"
            )
        if d1.get("class") != "farewell_ack":
            raise AssertionError(f"expected farewell_ack got {d1}")
        if d1.get("apply_mutation") is True:
            raise AssertionError(f"farewell apply_mutation true: {d1}")

        # Re-seed closed before reopen (farewell may have written meta)
        seed_soft_closed()

        # B3 reopen
        steps["reopen_http"] = post_inbound(
            "Obrigada, mudei de ideia, quero ver como funciona",
            env,
        )
        time.sleep(3)
        steps["reopen_decision"] = latest_decision()
        steps["reopen_conv"] = conv_status()
        d2 = (steps["reopen_decision"] or {}).get("path_a_decision") or {}
        if isinstance(d2, str):
            d2 = json.loads(d2)
        if not d2:
            raise AssertionError(
                f"reopen missing path_a_decision: {steps['reopen_decision']}"
            )
        if d2.get("class") != "reopen_intent":
            raise AssertionError(f"expected reopen_intent got {d2}")
        if d2.get("apply_mutation") is not True:
            raise AssertionError(f"expected apply_mutation true: {d2}")
        rrows = (steps["reopen_conv"] or {}).get("rows") or []
        if not any(r.get("status") == "bot_active" for r in rrows):
            raise AssertionError(f"expected bot_active after reopen: {rrows}")

        out["status"] = "pass_live"
        out["steps"] = steps
        out["checks"] = {
            "farewell_stayed_closed": True,
            "reopen_apply_mutation": True,
            "reopen_bot_active": True,
            "r2_auto": "off",
        }
        return 0
    except Exception as e:
        out["status"] = "fail_live"
        out["error"] = str(e)
        out["steps"] = steps
        print(json.dumps(out), file=sys.stderr)
        return 1
    finally:
        try:
            ensure_off_kill()
            restore_soft_closed()
            out["finally"] = {
                "release": db_query(
                    f"select release_state, kill_switch from platform_crm_agent_release_controls where agent_id='{AGENT_ID}'"
                ),
                "conv": conv_status(),
            }
        except Exception as fe:
            out["finally_error"] = str(fe)
        (EVID / "F4-live-result.json").write_text(json.dumps(out, indent=2, default=str) + "\n")
        (EVID / "F4-live-result-latest.json").write_text(
            json.dumps(out, indent=2, default=str) + "\n"
        )
        if out.get("status") == "pass_live":
            print(json.dumps({"status": "pass_live", "finally": out.get("finally")}))


if __name__ == "__main__":
    raise SystemExit(main())
