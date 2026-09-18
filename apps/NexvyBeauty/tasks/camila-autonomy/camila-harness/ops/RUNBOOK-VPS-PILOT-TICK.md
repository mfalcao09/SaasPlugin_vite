# Runbook — VPS harness-pilot-tick (PRD-12)

## Owner
Disparo do piloto = **VPS**, não pg_cron. Migration `20260918_prd12_unschedule_legacy_camila_crons.sql` remove cold tick + conductor do Supabase cron.

## Install (BUILD — cron DESARMADO)

```bash
ssh vps-hostinger
sudo mkdir -p /opt/scripts/camila/evidence
sudo cp tasks/.../ops/harness_pilot_tick.py /opt/scripts/camila/harness_pilot_tick.py
sudo chmod 700 /opt/scripts/camila/harness_pilot_tick.py
# create /opt/scripts/camila/.env.harness (mode 600) with SUPABASE_* + GO_ID
# FORCE_DRY=1 until GO PILOT
```

Manual dry probe:

```bash
FORCE_DRY=1 /opt/scripts/camila/harness_pilot_tick.py
# expect real_whatsapp_sends: 0
```

## Arm (somente após `GO PILOT HARNESS v1`)

1. Set secrets: `HARNESS_PILOT_LIVE=1`, `HARNESS_ALLOW_REAL_WHATSAPP=1`, `FORCE_DRY=0`
2. Uncomment crontab:

```cron
* * * * * flock -n /tmp/harness-pilot-tick.lock /opt/scripts/camila/harness_pilot_tick.py >> /opt/scripts/camila/evidence/harness-pilot-tick.log 2>&1
```

3. Confirm no pg_cron: `platform-cold-outreach-tick` / `platform-camila-conductor` absent.

## HARD_STOP

- `FORCE_DRY=1` + comment crontab line
- Edge flags `HARNESS_*=0`
- Legado permanece off (`LEGACY_CAMILA_SENDERS` unset)
