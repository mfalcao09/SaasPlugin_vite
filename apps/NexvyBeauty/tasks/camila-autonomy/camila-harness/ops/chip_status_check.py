#!/usr/bin/env python3
"""Conferencia do chip Camila. So GET /status. Nao envia WhatsApp."""
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

INSTANCE_ROW = "80268751-958e-4750-8550-eeae942b3c4d"
LOG = Path("/opt/scripts/camila/evidence/chip-status.log")

def load_env():
    env = {}
    for line in Path("/opt/scripts/camila/.env.harness").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def rest_get(base, key, path):
    req = urllib.request.Request(
        base + path,
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

def main():
    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    inst = rest_get(
        base,
        key,
        "/rest/v1/platform_crm_wa_qr_instances?select=instance_id,instance_token&id=eq." + INSTANCE_ROW,
    )[0]
    cfg = rest_get(
        base,
        key,
        "/rest/v1/platform_settings?select=zapi_base_url,zapi_client_token&limit=1",
    )[0]
    root = str(cfg.get("zapi_base_url") or "https://api.z-api.io").rstrip("/")
    iid = str(inst.get("instance_id") or "")
    itok = str(inst.get("instance_token") or "")
    ctok = str(cfg.get("zapi_client_token") or "")
    url = root + "/instances/" + iid + "/token/" + itok + "/status"
    req = urllib.request.Request(
        url,
        headers={"Client-Token": ctok, "Content-Type": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw, code = r.read().decode(), r.status
    except urllib.error.HTTPError as e:
        raw, code = e.read().decode(), e.code
    try:
        body = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    connected = body.get("connected") is True
    phone = body.get("smartphoneConnected") is True or body.get("smartphone_connected") is True
    row = {
        "at": datetime.now(timezone.utc).isoformat(),
        "http": code,
        "connected": connected,
        "smartphoneConnected": phone,
        "ok": bool(connected and phone),
    }
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as fh:
        fh.write(json.dumps(row) + "\n")
    print(json.dumps(row))
    raise SystemExit(0 if row["ok"] else 1)

if __name__ == "__main__":
    main()
