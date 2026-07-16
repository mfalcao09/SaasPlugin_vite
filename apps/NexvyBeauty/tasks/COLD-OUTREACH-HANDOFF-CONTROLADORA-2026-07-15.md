# HANDOFF → Controladora GO-LIVE (`local_a3502241…`) — Cold Outreach NexvyBeauty

> **De:** sessão executora `e2e2fb60` (build autônomo cold outreach) · **Para:** NexvyBeauty GO-LIVE controller · **Data:** 2026-07-15
> **Entregável:** [PR #75](https://github.com/mfalcao09/SaasPlugin_vite/pull/75) · branch `feat/cold-outreach-pipeline` (de origin/main b6644d6) · worktree `SaasPlugin_vite-cold-outreach`.
> **Estado:** código 100% pronto e verde (**40/40 deno test, deno check EXIT 0**), **gated OFF** (nada dispara). 4 commits: `9052180` núcleo · `6992fea` motor/migrations · `d99864a` docs · `f996b22` fixes validados.

## 1. O que foi feito

Pipeline platform-side de cold outreach WhatsApp+Instagram sobre os leads raspados (`platform_crm_extracted_leads`), 100% novo e self-contained:
- **Núcleo puro** `_shared/cold-outreach/` (6 módulos + 6 testes, 40 asserts): `anti-ban` (warm-up ramp, teto diário, jitter 40-180s, janela 9-18h Seg-Sex, dedupe 24h, kill-switch), `segment-gate` (só salao_cliente+qualified+phone; ordem 26 semente-limpa→66 is_seed→massa), `script` (copy vencedora WA+IG wired, tokens, A/B, guard zero-link), `opt-out`+`inbound-plan` (SAIR/PARE + "quero"→handoff), `persona` (seletor BDR isolado do #68).
- **Edges:** `platform-cold-outreach` (motor: enqueue/tick/on-inbound/status) + `platform-evolution-send` (twin burner). `config.toml` com verify_jwt=false.
- **Migrations** `migrations_platform_crm/20260715_`: `cold_outreach_engine.sql` (4 tabelas `platform_crm_cold_*` + RPC contador), `seed_bdr_prospector.sql` (persona "Bento" agent_type='prospector', inerte), `cold_outreach_cron.sql` (tick, ativação).
- **Docs:** relatório `.md`+`.html` + runbook `COLD-OUTREACH-SMOKE-2026-07-15.sql`.

## 2. Como foi feito (decisões-chave)

- **Motor novo, não reuso:** os `platform-cadence-*`/`platform-campaign-*` são webchat-only + exigem conversa aberta (inúteis pra cold); `manual-outreach` é tenant. Reaproveitei os *padrões* (lock idempotente, journey_events, seed idempotente da Lia), não editei os dispatchers.
- **Functional core / imperative shell:** toda a lógica de decisão (anti-ban, gate, opt-out/handoff) é pura e testável sem DB; o motor é glue fino. Por isso 40 testes provam o comportamento crítico sem tocar o banco.
- **Duplo gate:** `campaign.dry_run` (default true) + env `COLD_OUTREACH_ENABLED`. Número burner = CONFIG (`instance_id`). Oficial Meta (11 95213-9912) é outra tabela → fisicamente isolado.
- **Isolamento total:** zero edição em `platform-sales-brain` (#68), `agent-routing.ts` (#68, nem existe em origin/main), edges cakto, esteira `demo-*`, untracked. Diff = +2551, zero deleções (só config.toml +14).

## 3. Bloqueios encontrados

1. **Banco não abriu durante o build** (MCP Supabase não autenticado) → não apliquei migrations nem rodei smoke live durante a construção. **O MCP ficou disponível no fim da sessão** — usei-o **read-only** para validar schema (ver §4). Aplicação/deploy segue como ativação (não fiz mutação).
2. `agent-routing.ts`/`agent-routing.test.ts` são **novos no #68**, não em origin/main → não pude estendê-los sem colidir. Resolvi com seletor próprio (`persona.ts`), isolado.
3. `platform-evolution-send` **não existia** (só referenciado) → construí o twin.
4. **IG cold é fundamentalmente semi-manual** (ver §5/§7): a Graph API precisa do PSID do destinatário, que não existe pra @handle raspado.

## 4. Correções aplicadas na re-checagem (commit `f996b22`) — validadas read-only no schema live

Ao preparar este handoff fiz uma re-checagem de integridade + validei suposições no banco (`execute_sql`, só leitura). Achei e corrigi 4 itens (os 3 últimos eram best-effort-engolidos → não quebravam, mas degradavam):
- **Ordem de disparo (bug real):** `.order("tier")` é alfabético (`is_seed<massa<semente_limpa`) → invertia 26→66→massa. **Fix:** coluna `tier_rank` (0/1/2), enqueue seta, tick ordena por ela.
- **IG cold sem PSID:** `deliver()` IG agora retorna `manual=true` (não conta como falha, não tripa kill-switch); a fila vira `skipped` com o texto pronto pra DM manual.
- **Opt-out journey:** `conversation_closed_lost` **não existe** no enum → troquei por **`customer_lost`** (validado).
- **Silenciar conversa:** status `opted_out` **não existe** no enum (`bot_active/closed/human_active/waiting_human`) → troquei por **`closed`** (validado).

**Confirmado existente no schema (read-only):** todas as colunas de `platform_crm_extracted_leads`, `platform_crm_evolution_instances` (name/instance_token/status/is_default/product_id), `platform_crm_conversations` (current_agent_id/status), tabela `platform_crm_lead_excluded`, product `nexvybeauty`=`806b5975-e268-402e-a65c-9e9503271041`, event_types `message_sent/message_read/cadence_step_sent/conversation_accepted/first_message_in`.

## 5. O que NÃO foi feito (deliberado)

- **Aplicar migrations / deploy edges / rodar smoke live** — são ativação do Marcelo; o MCP só abriu no fim e não mutei prod sem pedido nesta virada.
- **UI de campanha** — motor é backend-only; campanhas são criadas via SQL (documentado no smoke). Front pode ser uma frente futura.
- **Personalização por LLM** do `[serviço]`/`[detalhe IG]` — usei script determinístico (garante zero-link + tom curto sem variância) + heurística `guessServico` por categoria/bio. LLM é enhancement opcional.
- **Hook de opt-out instantâneo** no `platform-evolution-webhook` — hoje o opt-out roda no tick (latência ≤ 1 min). O hook instantâneo é ~1 linha (documentado), mas edita um webhook compartilhado → deixei pra decisão.
- **Wiring do brain ao canal Evolution** — ver §7 (handoff).

## 6. O que precisa ser VALIDADO (live, quando ligar)

1. **Aplicar as 2 migrations** (engine + seed) e confirmar que sobem limpas (são aditivas; colunas/enums já validados; tabelas `platform_crm_cold_*` são novas, sem colisão esperada).
2. **Rodar o smoke** `COLD-OUTREACH-SMOKE-2026-07-15.sql` (dados sintéticos `smoke_*`, telefone fake, dry-run): provar enqueue (byTier), tick (`sent_dry` + counters + journey `message_sent` dry_run=true), on-inbound opt-out (grava `lead_optout` + fila `opted_out`), status. Limpa no fim.
3. **Config do servidor Evolution** (`platform_settings.evolution_go_url`/`evolution_go_global_api_key`) + a instância burner (name/instance_token/status='connected'/product_id).
4. **Filtros PostgREST `.or()`** do tick (validados conceitualmente, não rodados live) — o smoke confirma.

## 7. O que pode precisar CORREÇÃO / riscos a conhecer

- **[Importante] IG cold = frente semi-manual.** Não dá pra auto-DM @handle raspado (sem PSID — Meta). O motor faz enqueue+render+instrumentação; **o envio do DM é manual (1/sessão)**, exatamente como o COLD-OUTREACH §2B previu. Se a controladora esperava IG 100% automatizado, isso NÃO é possível pela API — é limite da Meta, não bug. Alternativa real: DM manual assistido (texto pronto na fila) OU ads click-to-DM (gera PSID) → aí o motor auto-responde.
- **[Importante] Handoff→Duda no burner Evolution:** o `on-inbound` marca `current_agent_id=Duda`, mas **o brain não é acordado pelo `platform-evolution-webhook`** (Evolution não chama o brain hoje — é gap conhecido, território #68). Logo, pós-handoff a conversa é da Duda mas a resposta automática dela depende de wiring brain↔Evolution que **não existe**. No canal oficial Meta o brain pegaria — mas cold usa o burner. **Decisão:** ou opera o pós-handoff via inbox humano, ou liga o brain ao Evolution (fora do escopo desta frente).
- **[LGPD] finalidade flip:** no envio REAL, o motor grava `finalidade='prospeccao_comercial_b2b'` no lead (o gate de finalidade que o blueprint marcou como constitucional). Só flipa no envio real (dry-run preserva `audiencia_ads`). O Marcelo (advogado) assume esse ato — não gateei (memória `feedback_nao_questionar_lgpd`).
- **Opt-out latência ≤1 min** (tick-based). Aceitável; instant-hook opcional.

## 8. Checklist de ATIVAÇÃO do Marcelo (o "único botão")

1. `apply_migration`: `20260715_cold_outreach_engine.sql` + `20260715_seed_bdr_prospector.sql`.
2. Deploy edges: `supabase functions deploy platform-evolution-send` e `platform-cold-outreach` (`--no-verify-jwt`).
3. Set env no edge: `COLD_OUTREACH_SECRET` (aleatório) e `COLD_OUTREACH_ENABLED=false` (por ora).
4. Rodar o smoke dry-run e conferir verde.
5. Provisionar o **burner** (instância Evolution dedicada via `platform-evolution-proxy` action `create_instance_self`, QR, `product_id`). NUNCA o oficial.
6. Criar campanha real (`platform_crm_cold_campaigns`: channel, agent=Bento, instance=burner, sender_name, status='warming', **dry_run=true**).
7. `apply_migration` do cron (`20260715_cold_outreach_cron.sql`).
8. **Start do warm-up (disparo real):** `dry_run=false` + `COLD_OUTREACH_ENABLED=true` → começa pela semente-limpa de 26.

## 9. Para a controladora decidir

- **Rodar o smoke dry-run agora?** O MCP Supabase está disponível — dá pra aplicar as migrations aditivas + rodar o smoke (dados sintéticos, DRY-RUN, cleanup) e ter a prova E2E live. Eu não fiz porque esta virada só pediu o report e a aplicação em prod estava enquadrada como ativação. **Recomendo autorizar** (risco baixo: aditivo + dry-run + synthetic).
- **IG:** aceitar a frente IG como semi-manual (texto pronto + DM 1/sessão) OU priorizar ads click-to-DM pra obter PSID?
- **Pós-handoff no burner:** operar via inbox humano por ora, ou pautar o wiring brain↔Evolution como frente separada?

Ver também: `COLD-OUTREACH-BUILD-REPORT-2026-07-15.{md,html}` (relatório) e memória `project_cold_outreach_pipeline_2026-07-15`.
