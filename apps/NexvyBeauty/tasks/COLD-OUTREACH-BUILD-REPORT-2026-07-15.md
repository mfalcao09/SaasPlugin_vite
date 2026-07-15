# Cold Outreach NexvyBeauty — Relatório de Build (código 100%, gated OFF)

> **Sessão:** autônoma (oneshot+loop) · **Data:** 2026-07-15 · **Branch:** `feat/cold-outreach-pipeline` (de `origin/main` b6644d6) · **Worktree isolado.**
> **Fontes:** `COLD-OUTREACH-SCRIPT-ANALISE-2026-07-15.md` (copy+estratégia) · `LDR-BDR-OUTBOUND-BLUEPRINT-2026-07-15.md` (mapa técnico).
> **Estado:** código pronto e verde. **Nada dispara** — número burner + start do warm-up = ativação do Marcelo.

## Resposta desconfortável primeiro

Os dois motores platform-side que existiam (`platform-cadence-*` e `platform-campaign-*`) são **webchat-only e exigem conversa já aberta** — inúteis para cold (que é justamente contatar quem não tem conversa). E o `manual-outreach` é tenant (lê tabelas vazias no lado plataforma). Então **~55% do que você precisa não existia**: canal-adapter WhatsApp/IG platform-side, warm-up ramp, teto diário, kill-switch, segment-gate no disparo e opt-out runtime. Foi tudo construído do zero, isolado do #68 (brain), das edges cakto e da esteira `demo-*`.

## O que foi construído (com prova)

### Núcleo puro anti-ban (`_shared/cold-outreach/`) — a maior alavanca
Módulos DB-agnósticos e testáveis (`deno test`, **40/40 verdes**):

| Módulo | Papel | Check binário |
|---|---|---|
| `anti-ban.ts` | warm-up ramp (~20/dia, dobra a cada 2-3d, cap 200), teto diário, jitter 40-180s, janela 9-18h Seg-Sex (America/Sao_Paulo), dedupe 24h, kill-switch (block>5% / report>2% / falhas consecutivas) | ✅ 11 testes |
| `segment-gate.ts` | dispara SÓ `salao_cliente`+qualified+phone_is_br; bloqueia afiliado/revisao/descarte/só-IG; ordem 26 semente-limpa → 66 is_seed → massa | ✅ 7 testes |
| `script.ts` | copy VENCEDORA WA+IG (abertura + 2 follow-ups + objeções), tokens `[Nome]/[SeuNome]/[salão]/[detalhe IG]/[serviço]`, A/B determinístico, **guard "zero link na 1ª msg"** | ✅ 7 testes |
| `opt-out.ts` + `inbound-plan.ts` | classifica SAIR/PARE (opt-out prioritário) vs "quero"; planeja opt-out (para cadência) / handoff (Duda) | ✅ 11 testes |
| `persona.ts` | seletor BDR (`prospector`) próprio, isolado do `agent-routing.ts` do #68 | ✅ 4 testes |

### Migrations (`migrations_platform_crm/`) — prontas p/ `apply_migration`
- `20260715_cold_outreach_engine.sql`: `platform_crm_cold_{campaigns,outreach_queue,daily_counters,instance_health}` + RPC `pcrm_cold_bump_counter`. RLS super_admin. **`dry_run=true` por default** em toda campanha.
- `20260715_seed_bdr_prospector.sql`: persona BDR "Bento · Prospecção" (`agent_type='prospector'`, 1º-toque→opt-in, **não vende**, inerte até o motor selecionar). Idempotente.
- `20260715_cold_outreach_cron.sql`: cron do tick (1/min) — **passo de ativação**, no-op sem campanha ativa.
- Opt-out reusa `platform_crm_lead_optout` (já existe); instrumentação reusa `platform_crm_journey_events` + `pcrm_log_journey_event` (já existem) — sem tabela nova.

### Edges (`supabase/functions/`) — `deno check` verde
- `platform-evolution-send/`: twin do `evolution-send` (org→product; `evolution_instances`→`platform_crm_evolution_instances`). Burner por `instance_id`; **oficial Meta intocado** (outra tabela). Auth service_role.
- `platform-cold-outreach/`: o MOTOR. Ações `enqueue` / `tick` / `on-inbound` / `status`. **DUPLO GATE** de envio: `campaign.dry_run` + env `COLD_OUTREACH_ENABLED`. `finalidade` flipa p/ `prospeccao_comercial_b2b` **só no envio real** (dry-run preserva `audiencia_ads`).
- `config.toml`: os 2 edges com `verify_jwt=false` (auth interna na função).

### Frentes por canal
- **WhatsApp**: campanha `channel='whatsapp'` → burner Evolution, script WA (2 follow-ups), gate 1.497.
- **Instagram DM (frente SEPARADA)**: campanha `channel='instagram'` → `passesInstagramGate` (segmento `acionamento_via_instagram`, sem telefone), script IG (1 follow-up, sem breakup), envio via `platform-ig-send`, **instância própria** (não herda números do WhatsApp).

### Handoff + opt-out runtime (sem tocar o brain #68)
- **Opt-out** "SAIR/PARE" → grava `platform_crm_lead_optout` + para a cadência (cancela follow-ups) + silencia a conversa (status ≠ `bot_active`).
- **Handoff** no "quero"/demo → `UPDATE platform_crm_conversations.current_agent_id = <Duda>` (padrão P10 `onboarding-handoff`, mesmo thread). Duda resolvida por `pickSdrPersona`.
- Tudo via action `on-inbound` do motor — **zero edição** no `platform-sales-brain`, nos webhooks compartilhados, nas edges cakto ou `demo-*`.

## Prova de funcionamento

```
deno test --no-check supabase/functions/_shared/cold-outreach/   →  40 passed | 0 failed
deno check --node-modules-dir=none <6 módulos> <2 edges>         →  EXIT 0
```

Cobrem os checks binários: motor anti-ban (1), segment-gate (2), kill-switch (3), script+zero-link (4), ordem de disparo (5), IG separado (6), opt-out para cadência (9), handoff→Duda (8). Instrumentação (7) via `journey_events` — validável no smoke live.

## Pipeline de deploy (SEM CI — 3 pipelines manuais)

```bash
# 1) EDGES (públicos, auth interna)
supabase functions deploy platform-evolution-send --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
supabase functions deploy platform-cold-outreach  --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt

# 2) MIGRATIONS (via MCP apply_migration — fora do db push)
#    20260715_cold_outreach_engine.sql
#    20260715_seed_bdr_prospector.sql
#    (20260715_cold_outreach_cron.sql → só na ATIVAÇÃO)

# 3) FRONT: não há UI de campanha nesta fase (motor é backend-only). Sem deploy VPS.
```

Sem secrets no bundle (§11 SaaS): `COLD_OUTREACH_SECRET` e `COLD_OUTREACH_ENABLED` vivem no ambiente do edge (server-side), nunca no front.

## Smoke dry-run (runbook) — `COLD-OUTREACH-SMOKE-2026-07-15.sql`

Semeia leads sintéticos + campanha `dry_run=true`, roda `enqueue`/`tick`/`on-inbound` e confere os asserts. Roda em sessão com o Supabase autenticado (o MCP não abriu nesta sessão autônoma). Passo-a-passo no `.sql` pareado.

## ⚠️ O que ficou de ATIVAÇÃO do Marcelo (o "único botão")

1. **Aplicar as 2 migrations** de schema/seed via `apply_migration` (interativo).
2. **Deploy dos 2 edges** (comandos acima).
3. **Rodar o smoke dry-run** (`COLD-OUTREACH-SMOKE-2026-07-15.sql`) e conferir verde.
4. **Provisionar o número BURNER**: criar instância Evolution dedicada (`platform-evolution-proxy` action `create_instance_self`), conectar QR, setar `product_id`. **NUNCA** o oficial Meta (11 95213-9912).
5. **Criar a campanha real** (`platform_crm_cold_campaigns`): `channel`, `agent_id`=Bento, `instance_id`=burner, `sender_name`, `status='warming'`. **Deixe `dry_run=true` no começo.**
6. **Ligar o cron** (`20260715_cold_outreach_cron.sql`).
7. **Start do warm-up (o disparo real)**: `dry_run=false` na campanha **E** `COLD_OUTREACH_ENABLED=true` no edge. Só então uma mensagem sai — começando pela **semente-limpa de 26**.
8. (Opcional, opt-out instantâneo) plugar `on-inbound` no `platform-evolution-webhook` — hoje o opt-out roda no tick (latência ≤ 1 min); o hook instantâneo é 1 linha, documentada.

## Review

- **Winner sintetizado, não escolhido**: a alavanca do doc (número não queimar + demo prova valor) virou código: anti-ban testável + segment-gate + kill-switch.
- **Isolamento respeitado**: #68 (brain/roteador), cakto, esteira `demo-*` e untracked intactos; motor 100% novo e self-contained.
- **Gated OFF de verdade**: duplo gate (dry_run + env) + número como CONFIG. Nada dispara sem os passos 4-7 acima.
- **Honestidade de estado**: as migrations NÃO foram aplicadas (banco não abriu na sessão) — código pronto, aplicação = ativação. `deno check`/`deno test` verdes provam o que É verificável sem DB.
