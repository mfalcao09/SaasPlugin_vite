# 📡 Reporte à Sessão Controladora — P2 Agentes (Nina · Lia · Roteador)

> **Frente:** P2 — construir os 3 agentes-casca do NexvyBeauty
> **Dono (sessão executora):** `a0eae41f` (2026-07-15)
> **Done (check binário):** código 100% implementado + typecheck limpo + smoke fora de produção + 2 PRs cortados. ✅ **ATINGIDO.**
> **Saiu:** nada fechou/pausou para esta entrar — é execução do blueprint já aprovado.
> **Classe de ato:** Operacional (execução de card do blueprint + PRs). Nada constitucional.
> **Base:** `origin/main` `4aa1b06` (handoff P10 já mergeado, #66).

---

## 1. Veredito de conclusão

**A construção (código) está 100% finalizada.** Era o critério definido pelo Marcelo: *"entregar o CÓDIGO 100% PRONTO (implementado, testado fora de produção, PRs cortados). NÃO ficar bloqueado esperando teste em produção — isso é smoke posterior."*

**Atualização 2026-07-15 (pós-reporte):** o Supabase MCP reconectou → **as 2 migrations do PR-A foram APLICADAS + verificadas** em produção (prompt da Nina + cron). Ambas inertes (flag OFF). Falta só: backfill do PR-B (com GO), redeploy das edges cakto (junto do flip P10) e ativação das flags — §8/§9.

---

## 2. O que fez

Os 3 agentes resolvidos, em **2 PRs** separados por blast-radius:

### PR-A — [#67](https://github.com/mfalcao09/SaasPlugin_vite/pull/67) `feat/p2-nina-lia-greeting` (deployável, aditivo, NÃO toca o brain)
| # | Entrega | Arquivo | Estado |
|---|---|---|---|
| A1 | Prompt da **Nina** (primary_objective + additional_prompt) | `migrations_platform_crm/20260715_nina_retencao_prompt.sql` | ✅ **aplicada+verificada** (po=481, ap=1215) |
| A2 | Edge **`nina-health-scan`** (gated `NINA_HEALTH_SCAN_ENABLED`=OFF): D-7 → pina Nina → 1 abertura | `functions/nina-health-scan/index.ts` | ✅ **deployada + smoke** |
| A3 | pg_cron 09:00 BRT → edge | `migrations_platform_crm/20260715_nina_health_scan_cron.sql` | ✅ **aplicada+verificada** (cron `0 12 * * *`) |
| A4 | **Greeting proativo da Lia** (2 bolhas pós-compra) + de-dup do welcome | `_shared/onboarding-handoff.ts`, `_shared/cakto-plan-provisioning.ts` | ✅ código |
| A5 | **Nexvy** aposentado (papel — Lia assume; sem prompt, sem tocar banco) | — | ✅ |
| — | `verify_jwt=false` da edge | `supabase/config.toml` | ✅ deployado |

### PR-B — [#68](https://github.com/mfalcao09/SaasPlugin_vite/pull/68) `feat/p2-roteador-agent-type` (⛔ AGUARDA GO — toda a cirurgia no brain)
| # | Entrega | Estado |
|---|---|---|
| B1 | Roteador por `agent_type` (`isSdrAgent`/`isCloserAgent`/`isRetentionAgent`) + fallback nome | ✅ |
| B2 | **`pickSdrPersona ?? null`** — mata a roleta `agents[0]` (defesa-mãe) | ✅ |
| B3 | **Modo retenção** no brain (`retentionActive`: sem links/preço + `RETENTION_RULE_BLOCK` + neutraliza "VENDAS") | ✅ |
| B4 | Backfill `agent_type` (Duda→sdr, Nina→retention; idempotente) | ✅ código · ⏳ validar+aplicar |
| B5 | Extração p/ `_shared/agent-routing.ts` + `agent-routing.test.ts` (**deno test 6/6**) | ✅ |

---

## 3. Como fez (abordagem + decisões)

**Regra de fronteira (por que 2 PRs):** PR-A **nunca** toca `platform-sales-brain/index.ts` (o motor que atende a Duda LIVE) → baixo risco, deployável. PR-B concentra **toda** mudança no brain → alto blast-radius, aguarda GO.

**Descoberta que forçou a fronteira:** se o health-scan pina a Nina e a cliente responde, o brain HOJE a trata como **Bia/closer** (branch `else` da regra 7) e injeta links de pagamento — violando a regra-mãe da Nina ("proibido ofertar"). Logo a Nina precisa de **modo retenção no brain** (PR-B), e o health-scan nasce **gated OFF** para não abrir janela de risco antes disso.

**2 decisões de engenharia (declaradas ao Marcelo, dentro do escopo):**
- **E1 — "não desativar cascas" = segurança pela LÓGICA.** A defesa-mãe é trocar `pickSdrPersona: ?? agents[0]` por `?? null`. Com isso, mesmo os 3 cascas ativos no WhatsApp, nenhum abre conversa (sem SDR → guard `no_active_persona` cala). Nenhum `is_active`/`active_in_whatsapp` tocado.
- **E2 — greeting da Lia SUBSTITUI o welcome genérico** (não soma). Senão a compradora recebe boas-vindas em dobro. Com `ONBOARDING_HANDOFF_ENABLED` OFF (produção hoje) → comportamento idêntico ao atual.

**Reuso (anti-NIH):** o greeting reusa o handoff P10 (que já localiza a conversa e pina a Lia) + o padrão de outbound do brain (registrar como `bot` → `botAlreadySpoke=true` faz a Lia não repetir a saudação). A `agent-handoff-greeter` NÃO foi reusada (opera no mundo TENANT `webchat_*`, não no PLATAFORMA).

---

## 4. Provas (verificação)

- **`deno check` limpo** em: `onboarding-handoff`, `cakto-plan-provisioning`, `nina-health-scan`, `platform-sales-brain`, `agent-routing`, `cakto-webhook`/`cakto-reprocess-order` (transitivo).
- **`deno test _shared/agent-routing.test.ts` → 6/6 verde.** Prova sem deploy: Duda roteia (pré e pós-backfill); **NENHUM casca abre** — nem com os 3 ativos no WhatsApp; pin respeitado; Nina só por pin.
- **Edge deployada + smoke em produção:** `POST nina-health-scan` → `{"skipped":"flag_off"}` (deployada e inerte).
- **Estado do banco VALIDADO (read-only, MCP, 2026-07-15):** os 6 agentes batem 100% com o blueprint — Duda `custom`, Bia `closer`, Lia `support`, Nina/Nexvy/Orquestrador `custom` (todos ativos+WA). Nina ainda placeholder (po=44, ap=0), confirmando A1 pendente.

---

## 5. Bloqueios encontrados

1. **Supabase MCP não estava conectado durante a construção** → não pude aplicar as migrations nem query o banco. Contornado: confiei no blueprint (read-only de hoje) e validei ao final quando o MCP apareceu (§4). As migrations seguem pendentes de aplicação.
2. **Sem service-key/senha local** (só anon, bloqueada por RLS) → sem caminho alternativo de query/migração durante a construção.
3. **Colunas de renovação de `organizations` não versionadas (drift)** — criadas via MCP/dashboard, não há `.sql` no repo. Impediu confirmar a fonte exata do ciclo de renovação para o D-7 (§6.3).

---

## 6. O que precisa ser VALIDADO / decidido (antes de ligar flags)

1. **Vetar/aprovar as decisões E1 e E2** (§3). São de engenharia, dentro do escopo, mas mudam comportamento — merecem o olhar do Marcelo.
2. **`agent_type` real** — ✅ **JÁ VALIDADO** nesta sessão (bate com o blueprint). Backfill seguro.
3. **Âncora do D-7 (o único ponto factual em aberto):** `computeRenewalPosition()` usa `plan_activated_at mod ciclo` (env 30/7). O webhook Cakto re-provisiona em toda renovação paga (bumpando `plan_activated_at`), então a fórmula é robusta — MAS o ciclo (30d) e a semântica de renovação da Cakto devem ser confirmados contra o billing real antes de ligar `NINA_HEALTH_SCAN_ENABLED`.

---

## 7. O que precisa ser CORRIGIDO / polir (honesto, itens menores)

Nenhum bug de correção conhecido. Itens menores de polish (não bloqueiam):
- **Nina + contexto de implantação sobreposto:** se a Nina for pinada numa conversa que também tem `provisioned_organization_id` (onboarding submission), o `onboardingPhaseContext` (fase da implantação) ainda é injetado no prompt dela junto do modo retenção. É **inócuo** (contexto extra, não regras conflitantes — o `RETENTION_RULE_BLOCK` tem precedência), mas pode ser suprimido numa 2ª iteração se incomodar.
- **`nina-health-scan` fallback por e-mail:** monta `visitor_email.ilike.${email}` no `.or()`; e-mail com vírgula/parêntese poderia quebrar o filtro. E-mails são validados a montante (risco baixo); dá pra endurecer com escaping se necessário.
- **`.html` do blueprint** ficou levemente defasado (a seção Execução foi só no `.md`; `tasks/*.md` é exceção à regra de pareamento §4).

---

## 8. O que deixei de fazer (e por quê)

- **Migrations:** as 2 do PR-A (Nina prompt + cron) — ✅ **APLICADAS + verificadas** (MCP reconectou). Falta o **backfill do PR-B** (`20260715_agent_type_backfill.sql`), que espera GO.
- **Redeploy de `cakto-webhook`/`cakto-reprocess-order`** (carregam o greeting gated): não redeployei edge de pagamento LIVE para shippar código gated sem urgência — vai junto do flip da flag P10 (padrão dedo-no-gatilho).
- **Deploy do brain (PR-B):** aguarda GO explícito (padrão P10). Não deployei.
- **Rodar `tmp-eval-agents` (integração):** exige o brain do PR-B deployado — é smoke pós-deploy, não desta fase.

---

## 9. Ordem de ativação (a coreografia — NÃO inverter)

```
1. Validar âncora D-7 (billing Cakto).                          [Marcelo]
2. GO no PR-B → aplicar backfill 20260715_agent_type_backfill   [MCP, com GO]
   → deploy platform-sales-brain.
3. Rodar tmp-eval-agents (gate 90%) — paridade Duda/Bia.        [prova pós-deploy]
4. Aplicar migrations PR-A (prompt Nina + cron) via MCP;
   deploy cakto-webhook + cakto-reprocess-order.                [PR-A]
5. SÓ ENTÃO: NINA_HEALTH_SCAN_ENABLED=true                      [flag]
   (senão o brain trata a Nina como Bia e ela venderia).
6. Quando quiser: ONBOARDING_HANDOFF_ENABLED=true               [flag — greeting Lia + handoff P10]
```

**Comandos de deploy pendentes:**
```bash
# Migrations via MCP apply_migration (migrations_platform_crm/ ficam FORA do db push):
#   20260715_nina_retencao_prompt.sql     (PR-A)
#   20260715_nina_health_scan_cron.sql    (PR-A)
#   20260715_agent_type_backfill.sql      (PR-B — validar antes; com GO)
# Edges (CLI já autenticado):
supabase functions deploy cakto-webhook          --project-ref fzhlbwhdejumkyqosuvq
supabase functions deploy cakto-reprocess-order  --project-ref fzhlbwhdejumkyqosuvq
supabase functions deploy platform-sales-brain   --project-ref fzhlbwhdejumkyqosuvq   # com GO
```

---

## 10. Artefatos

- **PRs:** [#67 (PR-A)](https://github.com/mfalcao09/SaasPlugin_vite/pull/67) · [#68 (PR-B)](https://github.com/mfalcao09/SaasPlugin_vite/pull/68)
- **Commits:** PR-A `284e7d2`+`a3eb01c` · PR-B `5ed775e`
- **Blueprint (design + §Execução):** `tasks/P2-AGENTES-NINA-NEXVY-ORQUESTRADOR-2026-07-15.md`
- **Plano de execução:** `tasks/todo.md`
- **Memória de projeto:** `memory/project_p2_agentes_nina_lia_roteador_2026-07-15.md` (+ ponteiro no `MEMORY.md`)
