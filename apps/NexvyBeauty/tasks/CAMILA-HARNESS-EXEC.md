# Camila Harness — execução

**Tipo:** A (implementar) · **Plano aprovado:** 2026-09-02  
**Regras:** `CAMILA-HARNESS-REGRAS.md`

Check mestre v1: política classifica as 5 certo + brain ignora stale em `conductor_wake` + edge dry + **0 outbound** em lead real.

**Trava anti-disparo (Marcelo 2026-09-03):** `CAMILA_CONDUCTOR_ALLOW_LIVE` permanece `false`. Sem isso, mesmo `dry_run:false` no body **não** acorda o brain.

---

## Fase 0 — Regras

**Status:** ✅

## Fase 1 — Política pura

**Status:** ✅ deno policy+trail

## Fase 2 — Brain `conductor_wake`

**Status:** ✅

## Fase 3 — Edge + config

**Status:** ✅

## Fase 4 — Dry-run classificação (testes)

**Status:** ✅

## Fase 5 — Jornada / fatos

| Entrega | Check |
|---------|--------|
| `camila-journey.ts` + inject no brain (prospector) | Jeissiane-like → `espaco_proprio` + PROIBIDO repergunta |

**Status:** ✅ 2026-09-03 (efêmero do histórico; sem tier-3 no `conversation_state`)

## Fase 6 — Raio-X / checkout path

| Entrega | Check |
|---------|--------|
| `camilaCloseGuard` + `sellsB2bWithCheckout` | “quero ver/contratar” → forbidColdR1; prospector fecha |

**Status:** ✅ goldens unitários (0 WA)

## Fase 7a — Viva em dry

| Entrega | Check |
|---------|--------|
| secrets: ENABLED=true, DRY_RUN=true, ALLOW_LIVE=false | invoke → `dry:true`, `woken:[]` |
| cron `platform-camila-conductor` 1/min | job active |
| 0 outbound novo nas 5 | delta 0 |

**Status:** ✅ 2026-09-03

## Fase 7b — Live allowlist

**Status:** ⏸ **código pronto, live BLOQUEADO** por pedido explícito (nenhum disparo/conversa com lead real).  
Para liberar no futuro: `CAMILA_CONDUCTOR_ALLOW_LIVE=true` **e** `CAMILA_CONDUCTOR_DRY_RUN=false` **e** body `dry_run:false` (triplo opt-in), só em janela comercial.

---

## Hotfix identidade + fecho

- B1→B2 no DB · `sellsB2bWithCheckout` · brain deployado
- Campanha cold: `paused` + `dry_run=true` (intocado)

## Modelo LLM

- **2026-09-03:** Camila `model` Flash → `anthropic/claude-sonnet-5` (igual Duda/Bia). Migration `20260903_camila_model_sonnet5.sql` aplicada no linked. Check: SELECT model = sonnet-5.
