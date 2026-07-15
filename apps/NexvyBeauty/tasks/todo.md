# P2 — Execução: Nina · Lia proativa · Roteador (2 PRs)

> **Sessão:** 2026-07-15 · **Base:** `origin/main` (`4aa1b06`, já tem o handoff P10)
> **Blueprint:** `tasks/P2-AGENTES-NINA-NEXVY-ORQUESTRADOR-2026-07-15.md`
> **Critério de PRONTO:** código 100% implementado + typecheck + smoke fora de produção + PRs cortados. NÃO exige teste em WhatsApp real (smoke posterior do Marcelo).
> _(o todo.md anterior — frente booking Calendly, concluída 2026-07-02 — está no git history)_

## Regra de fronteira (por que 2 PRs)
- **PR-A NUNCA toca `platform-sales-brain/index.ts`** (o motor que atende a Duda LIVE). Baixo risco, deployável.
- **PR-B concentra TODA mudança no brain** (roteador + modo retenção da Nina). Alto blast-radius, aguarda GO.
- Acoplamento seguro: `nina-health-scan` nasce gated (`NINA_HEALTH_SCAN_ENABLED`, default OFF). Só ligar DEPOIS do PR-B em produção.

---

## PR-A — `feat/p2-nina-lia-greeting` (de origin/main)

- [ ] **A1. Migration prompt da Nina** (`migrations_platform_crm/`): UPDATE `primary_objective` + `additional_prompt` por ID (`d925bb6e…`). NÃO toca is_active/active_in_whatsapp/agent_type.
- [ ] **A2. Edge `nina-health-scan`** (gated `NINA_HEALTH_SCAN_ENABLED`, default OFF): varre orgs provisionadas, detecta renovação D-7, localiza/pina conversa na Nina + dispara 1 msg abertura template. Non-fatal, idempotente.
- [ ] **A3. Migration cron**: `cron.schedule('nina-health-scan-daily', '0 9 * * *', …)` (padrão vault service_role_key). No-op enquanto edge está flag OFF.
- [ ] **A4. Greeting proativo da Lia** (`_shared/onboarding-handoff.ts` + `cakto-plan-provisioning.ts`): após pinar a Lia, dispara 2 bolhas + registra como bot; `provisionFromOrder` PULA `sendWelcomeWhatsApp` quando `greeted`. Flag OFF → idêntico ao atual.
- [ ] **A5. Nexvy aposentado (papel):** Lia assume o greeting; sem prompt; sem mudança no banco (decisão E1).
- [ ] **A6. typecheck + deploy PR-A + PR aberto.**

## PR-B — `feat/p2-roteador-agent-type` (de origin/main) — AGUARDA GO

- [ ] **B1. Roteador por `agent_type`**: `isSdrAgent`/`isCloserAgent` checam `agent_type` como primário + fallback match-nome.
- [ ] **B2. Matar o `agents[0]`** (l.275): `pickSdrPersona` → `?? null`.
- [ ] **B3. Modo retenção da Nina no brain:** `isRetentionAgent` + `retentionActive` (sem links/preço; RETENTION_RULE_BLOCK; neutraliza "VENDAS").
- [ ] **B4. Migration backfill**: Duda `custom→sdr`; Nina `custom→retention`. Validar agent_type real ANTES.
- [ ] **B5. SMOKE (fora de prod):** unit test Deno do roteador + comando `tmp-eval-agents` documentado p/ pós-deploy.

---

## Premissas declaradas (§8.1)
1. Estado dos 6 agentes = blueprint (read-only de hoje). Validar agent_type real como pré-condição do deploy PR-B.
2. `NINA_HEALTH_SCAN_ENABLED` só liga DEPOIS do PR-B em produção.
3. Lia `agent_type` fica `support` (o handoff P10 busca `support`+`%implanta%`).

## Review
_(preencher ao fim)_
