#!/usr/bin/env python3
"""Finish D2 canary apresentar parts 2–4, then restore OFF+kill."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENV_PATH = Path("/opt/scripts/camila/.env.d1")
AGENT = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
CONV = "b23200a2-be5f-4a1e-9810-553ed43276dd"
LEAD = "9db30400-6145-4954-97a1-3a236f8af6a1"


def load_env(path: Path) -> dict:
    d = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k.strip()] = v.strip().strip('"').strip("'")
    return d


def req(method, url, headers, body=None, timeout=120):
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
            payload = {"raw": raw[:500]}
        return e.code, payload


def main() -> int:
    env = load_env(ENV_PATH)
    base = env["SUPABASE_URL"].rstrip("/")
    svc = env["SUPABASE_SERVICE_ROLE_KEY"]
    rest = {
        "apikey": svc,
        "Authorization": f"Bearer {svc}",
        "Prefer": "return=representation",
    }
    fn = {"apikey": svc, "Authorization": f"Bearer {svc}"}
    now = datetime.now(timezone.utc).isoformat()

    st, _ = req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT}",
        rest,
        {"release_state": "TEST", "kill_switch": False, "updated_at": now},
    )
    print("arm_patch", st)
    st, rel = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT}&select=release_state,kill_switch",
        rest,
    )
    print("rel", rel)

    for i in range(4):
        st, body = req(
            "POST",
            f"{base}/functions/v1/platform-cold-outreach",
            fn,
            {"action": "tick"},
            timeout=120,
        )
        print(f"tick{i}", st, json.dumps(body, ensure_ascii=False)[:300])
        time.sleep(16)

    st, msgs = req(
        "GET",
        f"{base}/rest/v1/platform_crm_messages?conversation_id=eq.{CONV}&direction=eq.outbound&order=created_at.asc&select=created_at,content,metadata",
        rest,
    )
    if isinstance(msgs, list):
        print("outs", len(msgs))
        for m in msgs:
            print("-", m.get("created_at"), (m.get("content") or "")[:90])

    st, led = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_action_ledger?lead_id=eq.{LEAD}&order=created_at.asc&select=action_type,status,deny_reason,created_at",
        rest,
    )
    print("ledger", json.dumps(led, ensure_ascii=False)[:800])

    req(
        "PATCH",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT}",
        rest,
        {
            "release_state": "OFF",
            "kill_switch": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    st, rel = req(
        "GET",
        f"{base}/rest/v1/platform_crm_agent_release_controls?agent_id=eq.{AGENT}&select=release_state,kill_switch",
        rest,
    )
    print("restored", rel)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
