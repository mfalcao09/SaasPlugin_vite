#!/usr/bin/env python3
"""Camila Harness pilot tick — VPS owner of dispatch (PRD-12).

Default: dry (force_dry / flags off → 0 WhatsApp).
Arm crontab only after: GO PILOT HARNESS v1.

Env file (default /opt/scripts/camila/.env.harness):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  COLD_OUTREACH_SECRET       (x-cold-secret — preferred if service_role JWT auth drifts)
  HARNESS_PILOT_GO_ID
  HARNESS_PILOT_PRODUCT_ID   (optional for persist)
  HARNESS_PILOT_INSTANCE_ID  (required for real send)
  FORCE_DRY=1                (BUILD / until GO)

Crontab (DISARMED until GO — keep commented):
  # * * * * * flock -n /tmp/harness-pilot-tick.lock /opt/scripts/camila/harness_pilot_tick.py >> /opt/scripts/camila/evidence/harness-pilot-tick.log 2>&1
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENV_PATH = Path(os.environ.get("HARNESS_TICK_ENV", "/opt/scripts/camila/.env.harness"))
OUT_DIR = Path(os.environ.get("HARNESS_TICK_OUT", "/opt/scripts/camila/evidence"))


def load_env(path: Path) -> dict[str, str]:
    d: dict[str, str] = {}
    if not path.is_file():
        return d
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k.strip()] = v.strip().strip('"').strip("'")
    return d


def post_json(url: str, headers: dict, body: dict, timeout: int = 120):
    data = json.dumps(body).encode()
    h = dict(headers)
    h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"raw": raw[:400]}
        return e.code, payload


def main() -> int:
    env = {**load_env(ENV_PATH), **os.environ}
    base = (env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base or not key:
        print("ERR missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2

    force_dry = env.get("FORCE_DRY", "1") not in ("0", "false", "FALSE")
    body = {
        "action": "harness-pilot-tick",
        "go_id": env.get("HARNESS_PILOT_GO_ID") or "GO-PILOT-HARNESS-v1",
        "force_dry": force_dry,
        "seed_if_empty": True,
        "preview": force_dry,
    }
    if env.get("HARNESS_PILOT_PRODUCT_ID"):
        body["product_id"] = env["HARNESS_PILOT_PRODUCT_ID"]
    if env.get("HARNESS_PILOT_INSTANCE_ID"):
        body["instance_id"] = env["HARNESS_PILOT_INSTANCE_ID"]

    url = f"{base}/functions/v1/platform-cold-outreach"
    headers = {"Authorization": f"Bearer {key}", "apikey": key}
    cold_secret = env.get("COLD_OUTREACH_SECRET") or ""
    if cold_secret:
        headers["x-cold-secret"] = cold_secret
    st, payload = post_json(
        url,
        headers,
        body,
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = {
        "at": datetime.now(timezone.utc).isoformat(),
        "http": st,
        "force_dry": force_dry,
        "body": payload,
    }
    (OUT_DIR / f"harness-pilot-tick-{stamp}.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT_DIR / "harness-pilot-tick-latest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"http": st, "reason": payload.get("reason"), "real": payload.get("real_whatsapp_sends"), "dry": payload.get("dry")}, ensure_ascii=False))
    return 0 if st == 200 and payload.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
