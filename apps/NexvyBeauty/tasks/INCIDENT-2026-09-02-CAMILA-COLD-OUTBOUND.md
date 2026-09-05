# INCIDENT-2026-09-02 — Camila cold outbound (Z-API piloto)

**Status:** Contido. Camila desativada. Campanha pausada + dry_run=true.  
**Campanha:** `piloto-camila-zapi-20260901` (`b480ed6e-73c8-43ec-addd-9c05c6ac68da`)  
**Agente:** Camila prospector (`68aeece9-26f2-4f7b-a595-a6ea5e8acfa7`)  
**Instância Z-API:** `camila-zapi-test`

## O que aconteceu

1. F3 ativado sem gate humano: `dry_run=false`, janela `0–24` todos os dias.
2. **5 envios reais** ~00:05–00:06 BRT (apenas bolha 1 de 4).
3. Brain respondeu auto-replies (Jeissiane recebeu follow-up duplicado).
4. CRM: conversas duplicadas (cold vs webhook), badge Camila ausente, bolha 1 missing em alguns threads.
5. Send 500 até fix do helper `json()` em `platform-whatsapp-qr-send`.

## Contatos que receberam WhatsApp (bolha 1)

| Lead | Telefone | Notas |
|------|----------|-------|
| Deise | +5538988383104 | Auto-reply |
| Expert (Lancilashes) | +5513992028635 | Sem reply |
| Ellas | +5584981356722 | Auto-reply |
| Jeissiane | +5568999576171 | Auto-reply + brain follow-up |
| Emilly (LASH) | +5521971449182 | Sem reply |

Dry-run only (não enviados de fato): Eloísa, Vanessa.  
Protegidos pelo stop: Edna, Marcelo teste, Karolyna.

## Contenção (F0)

- [x] Campanha → `paused`, `dry_run=true`, `activated_at=NULL`
- [x] Camila → `is_active=false`, `active_in_whatsapp=false`
- [x] Fila: 3 queued → `skipped` (`EMERGENCY_STOP_20260902`)
- [x] Opt-out dos 5 telefones (`platform_crm_lead_optout`, reason `INCIDENT_20260902`)
- [x] Conversas afetadas → `waiting_human`

## Correções implementadas (F1–F4)

| Fase | Escopo |
|------|--------|
| **F1** | Pin Camila em todo cold open (insert + reuse); lookup por `visitor_phone` variants; UI fallback `last_message_metadata.agent_id` |
| **F2** | Sequência 4 bolhas via `apresentar_sequence` em metadata; tick processa bolhas 2–4 (15s) |
| **F3** | `auto_reply` classifier; `suppress_brain` no on-inbound + webhook skip brain |
| **F4** | `validateRealSend` + `validateWindowForRealSend` antes de envio real |

## Root causes

| Sintoma | Causa |
|---------|-------|
| Meia-noite | `window_config` 0–24, 7 dias |
| F3 sem OK Marcelo | `dry_run=false` programático |
| Só 1 bolha | Motor só chamava `renderOpeningFromDb` |
| Brain em auto-reply | Sem `auto_reply` intent + brain sempre após inbound |
| CRM sem Camila | Pin só em insert/closed→reopen |
| Bolha 1 missing | Conversas duplicadas (visitor_id vs phone) |
| Send 500 | `json()` ausente em qr-send |

## Retomada (F5 — NÃO executar sem OK explícito)

1. `ALLOW_REAL_SEND=1` + `ALLOW_PERMISSIVE_WINDOW=1` só se janela piloto exigir.
2. Reativar Camila + campanha com `dry_run=true` primeiro; validar tick dry.
3. Marcelo aprova flip `dry_run=false` + `COLD_OUTREACH_ENABLED=true`.
4. Monitorar: delivered_count, suppress_brain logs, sequência 4 bolhas.

## Referências

- PR #191 (WIP, não mergear sem checklist)
- Commit delivery ACK: `08bc186`
- Supabase project: `fzhlbwhdejumkyqosuvq`
