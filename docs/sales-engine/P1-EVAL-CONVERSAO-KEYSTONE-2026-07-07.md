# P1 — Eval de Conversão: o Keystone da Nave BDR

> **Data:** 2026-07-07 · **Autor:** Claude para Marcelo Silva · **Projeto:** SaasPlugin_vite
> **Contexto:** detalhamento do P1 definido em [NAVE-BDR-AUTONOMO-24-7-NEXVY-2026-07-07.md](NAVE-BDR-AUTONOMO-24-7-NEXVY-2026-07-07.md) §4-6. Grounding verificado em 2026-07-07: DDL real do sales-spark, runtime real da Duda (`platform-sales-brain`), reindex real da `cerebro-infra` (KVM4, via SSH), README do Hermes agent.
> **Critério de pronto (binário):** golden set 50+ rotulado · runner roda local e em CI · falso-descarte bloqueia PR · métricas de produção (opt-in/report-rate) ligadas ao dashboard.

---

## 0. TL;DR

O eval de conversão é **um portão único com quatro clientes**: (1) variantes de prompt do sales-spark (`ai_prompt_variants`), (2) o cérebro da Duda/Bia (`platform-sales-brain`), (3) as **skills do Hermes agent** (que se auto-editam SEM gate nativo — por isso o deploy dele é pós-P1), e (4) o corpus que o reindex da `cerebro-infra` reingere diariamente. Nada desses quatro muda em produção sem passar no golden set.

**Decisão de design:** casos do golden set vivem **em git** (`evals/sales/golden/*.jsonl`), não no banco — CI bloqueia PR sem credencial de banco, o caso é revisável em diff, e o mesmo arquivo gate-ia prompt E skill do Hermes. No banco (convenções sales-spark) ficam só `agent_eval_runs`/`agent_eval_results` (histórico/dashboard).

---

## 1. O que o eval mede — 3 camadas

| Camada | O quê | Como | Bloqueia PR? |
|---|---|---|---|
| **L1 — Rota** | A resposta termina na tag certa? `none` (continua/fecha) · `[PASSAR_BIA]` · `[ESCALAR_HUMANO]` · `[HANDOFF_HUMANO]` | Gera resposta via LiteLLM (mesmo modelo de prod), extrai tag, compara com `route_expected` | **Sim** — `false_discard = 0` (hard) e `route_accuracy ≥ 0.90` |
| **L2 — Fatos QCR** | `extractLeadFacts` extraiu certo? (`sub_vertical`, `tempo_atendimento_meses`, `num_clientes`, `ticket_medio`, `recorrencia`, `dor_flags[]`) + `computeQcrScore` bate | Determinístico: JSON expected vs actual (tolerância ±10% em `ticket_medio`); score é TS puro, unit-test direto | **Sim** — `facts_accuracy ≥ 0.85` |
| **L3 — Qualidade + produção** | Judge LLM (clareza, tom Duda, compliance opt-in, CTA, <100 palavras no BDR) + **métricas reais**: opt-in-sem-report, report-rate, opt-in→demo | Judge via tag `reasoning`; produção via dashboard (não CI) | **Não no MVP** — informativo até baseline estabilizar; report-rate↑ dispara circuit-breaker em prod |

### 1.1 "Falso-descarte" redefinido (diretiva pivotal)
No sistema atual **não existe rota de descarte** — diretiva do Marcelo (2026-07-05, verbatim no header de `20260705_playbook_qualificacao_v2.sql`): *"não tem desqualificação… pagou é cliente… nunca rejeitar venda"*. O QCR roteia a **OFERTA** (qual plano), nunca aceita/rejeita. Logo, falso-descarte no golden set =:
1. Qualquer resposta que **rejeite ou desestimule a venda** (comportamento proibido `reject_sale`);
2. `[ESCALAR_HUMANO]`/`[HANDOFF_HUMANO]` **por perfil ou tamanho de carteira** (regra 6 do prompt: JAMAIS);
3. `[PASSAR_BIA]` pra lead que já decidiu ou carteira pequena (regra 8: Duda fecha).

O **caso #1 do golden set é a falha real de 2026-07-04**: Duda desqualificou lead de "50 clientes" na 2ª mensagem sem perguntar ticket. Esse caso nunca mais passa.

---

## 2. Golden set — formato canônico (git)

`evals/sales/golden/duda-sdr.jsonl` (+ `bia-closer.jsonl`, futuro `bdr-outbound.jsonl`). Uma linha por caso (valores sintéticos/redigidos — **LGPD: nome/telefone reais NUNCA commitados**):

```json
{"case_id":"gc-0001","agent":"duda_sdr","origin":"conv real 2026-07-04 redigida — falha 50-clientes",
 "transcript":[{"role":"lead","text":"Atendo umas 50 clientes há 2 anos"}],
 "facts_expected":{"sub_vertical":"cabeleireira","tempo_atendimento_meses":24,"num_clientes":50,"ticket_medio":null,"recorrencia":null,"dor_flags":[]},
 "route_expected":"none",
 "forbidden":["reject_sale","escalate_by_profile","invent_price"],
 "must_do":["perguntar_ticket_antes_de_rotear"],
 "outcome_label":"opt_in","weight":3,"tags":["adversarial","carteira-pequena","anti-desqualificacao"]}
```

**Distribuição alvo (50+ casos):** ~15 fluxo feliz (fecha com link) · ~10 hesitante→`[PASSAR_BIA]` (score≥70) · ~5 pediu-humano/sensível→`[ESCALAR_HUMANO]` · ~3 reclamação grave→`[HANDOFF_HUMANO]` · ~12 adversariais anti-desqualificação (carteira pequena, sem ticket, cético, "vou pensar") · ~5 extração de fatos difícil (números por extenso, ticket em faixa) · ~5 compliance (pedir opt-out, dado sensível). Fonte: export das conversas reais do platform_crm (projeto `fzhlbwhdejumkyqosuvq`) + redação de PII.

---

## 3. DDL — histórico de runs (convenções REAIS do sales-spark)

Segue o padrão verificado no baseline: PK `uuid DEFAULT gen_random_uuid()`, `organization_id` FK→`organizations(id) ON DELETE CASCADE`, enum = `text + CHECK _chk`, trigger `update_updated_at_column()`, RLS `user_belongs_to_organization + super_admin` e service_role full.

```sql
CREATE TABLE public.agent_eval_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    agent_kind text NOT NULL,
    git_sha text,
    prompt_variant_id uuid,          -- FK ai_prompt_variants(id), nullable
    hermes_skill_version text,       -- versão da skill candidata (pós-deploy Hermes)
    model text,                      -- modelo/tag LiteLLM usado na geração
    n_cases integer DEFAULT 0 NOT NULL,
    n_pass integer DEFAULT 0 NOT NULL,
    false_discard_count integer DEFAULT 0 NOT NULL,
    route_accuracy numeric,
    facts_accuracy numeric,
    judge_score numeric,
    passed boolean,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_eval_runs_agent_kind_chk CHECK ((agent_kind = ANY (ARRAY['duda_sdr'::text,'bia_closer'::text,'bdr_outbound'::text,'hermes_skill'::text]))),
    CONSTRAINT agent_eval_runs_status_chk CHECK ((status = ANY (ARRAY['running'::text,'passed'::text,'failed'::text,'error'::text])))
);

CREATE TABLE public.agent_eval_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,            -- FK agent_eval_runs(id) ON DELETE CASCADE
    organization_id uuid NOT NULL,
    case_id text NOT NULL,           -- ex.: 'gc-0001' (case vive em git)
    actual_route text,
    actual_facts jsonb DEFAULT '{}'::jsonb,
    route_pass boolean,
    facts_pass boolean,
    forbidden_violations jsonb DEFAULT '[]'::jsonb,
    judge jsonb DEFAULT '{}'::jsonb,
    pass boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
-- + PKs, FKs, trigger updated_at em runs, RLS org_access + service_role (padrão cadences_org_access)
```

Interop: o judge (L3) pode gravar espelho em `ai_quality_evaluations` (usa `score_conversion_potential` que já existe) — opcional, não bloqueia o MVP.

---

## 4. Runner

**Pré-requisito de refactor (mesmo padrão do `scenario-match.ts` do cakto-recovery):** extrair de `platform-sales-brain/index.ts` (~1000 linhas) as funções puras pra um módulo importável `brain-core.ts` — `buildPrompt()`, `computeQcrScore()` (já determinístico, linha ~562), parsing de tags. O Edge Function passa a importar de lá; o runner também. Zero mudança de comportamento.

**`tools/evals/run-golden.ts` (Deno):**
1. Lê `evals/sales/golden/*.jsonl`;
2. Por caso: monta o prompt real via `brain-core.buildPrompt()` → gera resposta via **LiteLLM** (mesma tag/modelo de prod; env `LITELLM_BASE_URL`/`LITELLM_KEY`) → extrai tag (L1) → roda `extractLeadFacts` + `computeQcrScore` (L2, determinístico) → judge opcional (L3, tag `reasoning`);
3. Agrega: `false_discard_count`, `route_accuracy`, `facts_accuracy`; grava run no banco (se credencial disponível) e **sempre** imprime sumário + exit code: `false_discard>0 → exit 1` · `route<0.90 → exit 1` · `facts<0.85 → exit 1`.

**CI — `.github/workflows/eval-conversao.yml`:** dispara em PR que toque `apps/NexvyBeauty/supabase/functions/platform-sales-brain/**`, `evals/sales/**` ou (futuro) `hermes-skills/**`. Job roda o runner com secrets `LITELLM_*`; exit≠0 bloqueia merge; sumário vira comment no PR. Custo estimado/run: ~50 casos × 2 chamadas ≈ centavos na tag `volume` + judge `reasoning` amostrado.

**Local:** `deno task eval:golden` (mesmo script).

---

## 5. Integração com a auto-melhoria (cerebro-infra + Hermes)

### 5.1 cerebro-infra (KVM4 — paths reais verificados via SSH)
O gate do reindex (`/opt/stacks/cerebro-infra/reindex/run_reindex.sh` → `eval_gate.py`, `RAG_EVAL_THRESHOLD=0.7`, `RAG_EVAL_K=10`) **continua medindo retrieval** — ele gate-ia o ÍNDICE, e isso está certo. A conversão pluga por 3 pontos:
1. **Corpus vencedor:** novo dir `sources/workstreams/sales/` (em `/opt/stacks/cerebro-infra/data/sources/`) recebe JSONL semanal das mensagens/objeções **vencedoras** (label `opt_in`/`demo` sem report) — o reindex diário (cron 05:00 UTC, swap atômico + rollback) absorve. É a auto-melhoria real e gated do conhecimento de venda.
2. **Golden queries de conversão** adicionadas ao live-check pós-swap do `reindex-host.sh` (ex.: "como a Duda responde carteira de 50 clientes sem ticket?").
3. **Fix de discrepância encontrado na inspeção:** gate pré-swap usa `RAG_EVAL_K=10`, live-check pós-swap usa `k=6` — alinhar os dois em 10 (1 linha no `reindex-host.sh`).

### 5.2 Hermes agent (pós-P1 — é ELE o auto-improver, não o openclaw)
Hermes cria skills autônomas e **skills se auto-editam durante o uso, sem eval-gate nativo** (README verificado). Num BDR 24/7 isso é o vetor de drift→ban. Regra de deploy:
- Skills de venda = arquivos versionados em git (`hermes-skills/`, padrão agentskills.io); **prod monta read-only**;
- Auto-edição acontece em sandbox (backend Docker do Hermes) → vira **PR** → CI roda o golden set → merge humano (fase inicial); auto-merge só no P6, com baseline estável;
- Modelo do Hermes aponta pro LiteLLM (`reasoning` pra mensagem, `volume` pro resto) — any-model nativo;
- `command approval` + `container isolation` do Hermes ligados desde o dia 1.

---

## 6. Sequência de implementação (checks binários)

1. **Refactor `brain-core.ts`** → verifica: Edge Function importa do módulo, comportamento idêntico (testes atuais passam).
2. **Migration `agent_eval_runs`/`results`** → verifica: aplica limpa no projeto; RLS testada com JWT de org.
3. **Export + redação de 50+ conversas** do platform_crm → verifica: `wc -l` ≥50, zero PII no diff.
4. **Runner local** → verifica: caso gc-0001 (falha 50-clientes) FALHA contra o prompt antigo e PASSA contra o v2 — prova que o eval detecta o bug real.
5. **CI gate** → verifica: PR de teste com prompt sabotado (reintroduz desqualificação) é BLOQUEADO.
6. **Corpus vencedor + golden queries na KVM4** → verifica: reindex diário processa `workstreams/sales/` e live-check inclui as queries novas.

## 7. Flags de honestidade
- DDL/convenções sales-spark, tags da Duda, paths/envs da cerebro-infra: **[Certo]** (extraídos de arquivo/código/SSH em 2026-07-07).
- Hermes sem gate nativo de skill: **[Certo]** pelo README; comportamento real em produção **[Provável]** — validar no deploy.
- Thresholds 0.90/0.85: **[Palpite calibrado]** — ajustar após a primeira baseline run.
- Custo de CI por run: **[Provável]** — medir na primeira execução.
