# Plano de Build — Pipeline de Cold Outreach NexvyBeauty

> **Sessão:** autônoma (oneshot+loop) · **Data:** 2026-07-15 · **Worktree:** `SaasPlugin_vite-cold-outreach` (branch `feat/cold-outreach-pipeline` de `origin/main` b6644d6)
> **Objetivo:** entregar o CÓDIGO 100% pronto do pipeline, **gated OFF**. O disparo real (número burner + start do warm-up) = ativação do Marcelo.
> **Fontes:** `COLD-OUTREACH-SCRIPT-ANALISE-2026-07-15.md` (copy+estratégia) · `LDR-BDR-OUTBOUND-BLUEPRINT-2026-07-15.md` (mapa técnico) · `reference_deploy_pipeline_nexvybeauty_vps`.

## Critério de sucesso (imperativo → declarativo)

O build está PRONTO quando **todos** os checks binários abaixo estão verdes:

1. **Motor anti-ban** codado: warm-up ramp, teto diário, jitter 40-180s, janela 9-18h Seg-Sex, dedupe 24h → `deno check` verde.
2. **Segment-gate** recusa `descarte`/`afiliado`/`revisao` e só passa `salao_cliente`+qualified+phone_is_br → teste unitário verde.
3. **Kill-switch** pausa a campanha quando taxa de bloqueio/report > limiar → teste unitário verde.
4. **Script wired**: template com tokens `[Nome]/[SeuNome]/[salão]/[detalhe IG]/[serviço]` + 2 follow-ups (D+2, D+4/5) + objeções, zero link na 1ª msg → snapshot do render.
5. **Ordem de disparo**: 26 semente-limpa → 66 is_seed → massa (por is_seed/qualification) → teste do seletor.
6. **IG DM** frente separada (1 DM/sessão, sem link até "quero") → módulo próprio, não herda números do WhatsApp.
7. **Instrumentação** por etapa (entregue/lida/respondida/engajada/demo/venda) grava em `platform_crm_journey_events` → smoke insere evento.
8. **Handoff** pra Duda no "quero"/demo → reusa handoff P10 (mesmo thread).
9. **Opt-out runtime**: "PARE/SAIR" → grava `platform_crm_lead_optout` + para cadência → teste E2E dry-run.
10. **Deploy dry-run**: edges com `deno check` verde; smoke por dados semeados dispara em **DRY-RUN** (nunca número real); número burner é **CONFIG**, não hardcode.

## Fases (cada uma = PR de origin/main)

- **F1 — Migrations + estado** (constrói o schema): warm-up state, daily counters, kill-switch state, opt-out runtime, colunas/eventos de instrumentação, seed persona BDR. Ficheiros SQL prontos para `apply_migration` (aplicação = ativação do Marcelo em sessão interativa).
- **F2 — Persona BDR + roteador**: `agent_type='prospector'` + prompt 1º-toque→opt-in + reconhecimento `isProspectorAgent()` (sem tocar no brain #68). Draft inerte.
- **F3 — Motor `platform-cold-outreach`** (edge nova): fork adaptado do `manual-outreach` lendo `platform_crm_*` + camada anti-ban (warm-up/teto/jitter/segment-gate/kill-switch) + script wired, **DRY-RUN** atrás de flag OFF.
- **F4 — Opt-out runtime + handoff**: handler "SAIR/PARE" → optout + para cadência; handoff pra Duda no "quero". Sem editar o brain #68.
- **F5 — IG DM front**: módulo separado (mecânica própria).
- **F6 — Smoke + docs + PRs**: `deno check`, testes, smoke por dados semeados em dry-run, cortar PRs, atualizar docs.

## Guardrails

- Worktree ISOLADO. NÃO tocar: `platform-sales-brain` (#68), edges `cakto-*`, edges `demo-*`/esteira. Preservar untracked.
- Deno: `deno check --node-modules-dir=none`. Sem npm desnecessário.
- Número burner = CONFIG (secret/tabela), nunca hardcode. Nada dispara de verdade.

## Estado de exploração (preenchido pós-subagentes)

### Explorador 1 — cadence + campaign engine
- **Motores existentes são webchat-only + exigem conversa aberta** → `skipped_no_channel` (cadence tick :339-344; campaign dispatcher :287-291). Cold = contatar quem NÃO tem conversa → inúteis como estão.
- Operam em `platform_crm_leads`, **não** em `platform_crm_extracted_leads` (só `leads-import-profiles`/`leads-extraction-webhook` leem os extraídos).
- **Herdável:** lock otimista idempotente (tick :223-230; dispatcher :224-233), janela horária (`withinWindow`), jitter de agendamento das campanhas (prepare :127 `randomBetween`), scaffolding de rotação de instância (prepare :53-62,:117-125).
- **Ausente (o que faz o cold):** warm-up ramp (a), teto diário/número (b), kill-switch por bloqueio (g), quality-drop (h), jitter em cadência (c), canal-adapter WhatsApp/IG.
- **DECISÃO:** motor DEDICADO `platform-cold-outreach` (lê extracted_leads direto; anti-ban em `_shared/cold-outreach/`), sem tocar dispatchers compartilhados. Reuso padrões, não edito.

### Explorador 2 — Evolution/send/IG
- **`platform-evolution-send` NÃO existe** (só referenciado em `platform-process-post-sale-scheduled:195-200`) → CRIAR twin do `evolution-send` (troca `organization_id`→`product_id`, `evolution_instances`→`platform_crm_evolution_instances`). Send text = `POST /message/sendText/{instanceName} {number,text}`; presence = `/chat/sendPresence`.
- Servidor Evolution vem de `platform_settings.evolution_go_url`+`evolution_go_global_api_key` (single-row). Instância = row em `platform_crm_evolution_instances` (name+instance_token). Burner = row dedicada `is_default=false`, escolhida por `instance_id`. Oficial Meta = `platform_crm_whatsapp_meta_connections` (outra tabela → isolado).
- IG: `platform-ig-send` EXISTE (Graph API, `platform_crm_instagram_connections`, DM `POST /{page}/messages`, janela 24h via rpc). Canal separado.

### Explorador 3 — cadência/roteador/personas
- Cadência p/ portar: bolhas 800ms (máx 2), dedupe 24h por (lead,agent), fila 24h/48h max 2, janela 09-18 Seg-Sex. Gateway openrouter `google/gemini-2.5-flash`.
- `platform_crm_product_agents.agent_type` = varchar(50) SEM CHECK → `'prospector'` inserível sem constraint. Prompt vive em `additional_prompt`. Seed molde = INSERT idempotente da Lia (`20260714_onboarding_fase_handoff.sql:180-213`).
- **`agent-routing.ts`/`.test.ts` são novos no #68 (NÃO em origin/main)** → F2 usa seletor PRÓPRIO em `_shared/cold-outreach/persona.ts`, não estende `agent-routing.ts`.

### Explorador 4 — handoff/opt-out
- Handoff P10 reusável = `onboarding-handoff.ts` → `UPDATE platform_crm_conversations SET current_agent_id=<Duda>` (Duda via `isSdrAgent`). `agent-handoff-greeter` é de outro stack (não serve).
- `platform_crm_lead_optout` (id, product_id, handle, telefone, reason, created_at, UNIQUE(product_id,telefone)) — ninguém escreve em runtime hoje; ingestão filtra por ela.
- Opt-out sem tocar brain/#68: motor faz scan de inbound no tick + action `on-inbound`. Parar cadência = cancelar minha própria fila.

### Explorador 5 — leads/segment/instrumentação
- Gate: `segment='salao_cliente' AND qualified AND telefone<>'' AND excluded_at IS NULL` + NOT EXISTS optout/excluded. View `platform_crm_consolidated_leads` (dedup). Ordem: `is_seed AND qualified` (26 semente-limpa) → `is_seed` (66) → massa. `ORDER BY is_seed DESC, seguidores DESC`.
- `journey_events` sink via `pcrm_log_journey_event`. event_type válidos: `message_sent`(entregue)/`message_read`(lida)/`first_message_in`(respondida)/`conversation_accepted`(engajada)/`meeting_created`(demo)/`sale_completed`(venda)/`cadence_*`. **`lead_id`→`platform_crm_leads`**; lead frio não-importado → `lead_id=NULL`+`payload{handle}`.
- `finalidade` default `audiencia_ads` (schema diz "só ads, não outreach"). Motor grava `finalidade='prospeccao_comercial_b2b'` **só no envio real** (dry-run não flipa) → coerente com "trigger = ativação do Marcelo".

## Review

_(preenchido ao final)_
