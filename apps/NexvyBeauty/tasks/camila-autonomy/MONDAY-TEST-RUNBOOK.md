# Camila — Runbook segunda (TEST + 5 leads novos)

Atualizado: 2026-09-14T03:07:05.452137+00:00  
Estado agora: `release_state=OFF` · coorte incidente `active=false` · campanha paused+dry_run · chip DB `connected`

## Invariantes (não negociáveis)

1. **Nunca** reativar `incident-piloto-20260901` nem as 5 conversas do incidente.
2. `TEST` ≠ `LIVE` ≠ `CANARY` de produção.
3. Conductor: `ALLOW_LIVE` só sob GO separado; default permanece fail-closed.
4. Rollback = `OFF` + coorte nova `active=false` + kill_switch se preciso.
5. Todo outbound passa pelo Safety Kernel (reservation).

## Dois degraus (não misturar)

| Degrau | O quê | Quando |
|--------|--------|--------|
| **D1 — Prova TEST** | 1 turno `wa:eval` → ledger `reserved→accepted→delivered` + kill-switch E5.4 | Segunda 09:00+ BRT, GO operacional |
| **D2 — 5 leads novos** | Coorte **nova** (slug próprio) com 5 conversas **nunca** do incidente | Só depois D1 verde |

Disparar 5 novos **sem** D1 verde = repetir risco do incidente com menos evidência.

## Check binário “pronto amanhã de manhã”

`PASS` se às 08:50 BRT o arquivo `evidence/PRD-09/monday-preflight-<stamp>.json` listar todos os itens P* abaixo `PASS` **e** a lista dos 5 leads (phones) estiver anexada. Sem isso = não dispara.

### Pré-voo (fazer **antes** das 09:00 — pode preparar já)

| ID | Item | Quem | Status agora |
|----|------|------|--------------|
| P1 | Chip Z-API live `connected` + `smartphoneConnected` | script T0 | DB connected; revalidar live |
| P2 | `BRAIN_INTERNAL_SECRET` em `.env.local` + brain HTTP ≠ 401 | ops | OK (rotado nesta sessão) |
| P3 | Assertividade no webhook deployada | ops | OK (código+deploy) |
| P4 | Coorte incidente `active=false`, RPC membros ativos = 0 | DB | OK |
| P5 | Campanha Camila `paused` + `dry_run=true` | DB | OK |
| P6 | Runbook + script `e2e/run_monday_preflight.py` | eng | **FALTA** (criar na prep) |
| P7 | Lista dos **5 novos** phones + nomes (não do incidente) | **Marcelo** | **FALTA** |
| P8 | 5 leads no CRM com phone, product, **ficha** (`lead_state` ready) | eng pós-P7 | **FALTA** |
| P9 | 5 conversas `bot_active`, owner Camila, `wa_qr` na instância certa | eng pós-P7 | **FALTA** |
| P10 | Coorte nova `test-piloto-YYYYMMDD` com **só** esses 5, `active=false` até GO D2 | eng | **FALTA** |
| P11 | Commit/redeploy SHA parity (opcional p/ Master Gate; recomendado p/ TEST) | eng | dirty WT / incompleto |
| P12 | Secrets: confirmar `CAMILA_CONDUCTOR_ALLOW_LIVE=false` até GO D2 | ops | confirmar valor real amanhã |

### Sequência operacional segunda

**09:00 — D1 (obrigatório primeiro)**

1. Preflight JSON verde.
2. GO Marcelo: `release_state OFF→TEST` (Camila only).
3. 1 turno no `wa:eval` existente → exigir `delivered` no ledger.
4. Você responde no fio (`acertou`) → label nova no metadata (não backfill).
5. Kill-switch ON ou volta `OFF` → 0 provider call novo (E5.4).
6. Se D1 falhar: **parar**. Não abrir D2.

**Após D1 PASS — D2 (5 novos)**

1. GO Marcelo explícito: “ativar coorte `test-piloto-…` + ALLOW_LIVE se conductor for o caminho”.
2. Ativar coorte nova (`active=true`), incidente continua `false`.
3. Abrir **1** lead primeiro (canário humano), não as 5 de uma vez.
4. Se OK: liberar as outras 4 com teto (ex.: max 1 opening/lead, caps do kernel).
5. Janela só 09–18 BRT; fim do dia → `OFF` + coorte `active=false`.

## O que você precisa me passar hoje (bloqueante D2)

Para cada um dos 5:

- telefone E.164
- nome / salão (greeting)
- origem (lista fria? inbound?)
- consentimento / base legal ok para cold se for outbound

Sem essa lista, amanhã só D1 (`wa:eval`) fica “pronto para disparar”.

## Opções de caminho de envio (D2)

| Opção | Mecanismo | Risco |
|-------|-----------|-------|
| **A (recomendada)** | Conductor + kernel sob `TEST`, coorte nova, `ALLOW_LIVE=true` só na janela | Controlado; cadência kernel |
| **B** | Campanha cold-outreach nova (não a paused do incidente) | Mais parecida com o incidente; evitar até D1+kill verdes |
| **C** | Brain manual por conversa | Bom p/ 1 canário; ruim p/ 5 |

## Decisão pedida agora

1. Confirma: amanhã **primeiro só D1**, e D2 só se D1 passar?
2. Envia a lista dos 5 novos (ou diz “amanhã só D1, leads depois”).
