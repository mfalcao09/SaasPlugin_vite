# Auditoria de Fidelidade 1:1 — CADÊNCIAS + CAMPANHAS (Vendus → NexvyBeauty plataforma)

> **Escopo:** portagem do módulo Cadências Inteligentes + Campanhas Inteligentes do CRM de tenant (Vendus) para o CRM de PLATAFORMA (super_admin, `platform_crm_*`).
> **Método:** read-only. Diff arquivo-a-arquivo (portado × original) das camadas edge, UI e hooks.
> **Data:** 2026-07-02 · **Read-only** (nenhuma fonte/Supabase/deploy tocado).

## Veredito rápido

| Métrica | Valor |
|---|---|
| **Cobertura funcional** | **~80% do fluxo tenant** (enrollment, agendamento, gatilhos, on-response, stop, prepare/start = 1:1 fiéis) |
| **Envio real** | **AI-driven inline → WEBCHAT** (não WhatsApp). Sai mensagem REAL **só se o lead tem conversa webchat aberta**; senão `skipped_no_channel` (no-op silencioso). |
| **Gaps reais (`[FALTA]`)** | **4** — sendo **1 crítico de recorrência** e **1 de AI-insights de campanha** |
| **Adições (`[ADICIONADO]`)** | **1** (geração de mensagem via gateway de IA — substituto do `manual-outreach`) |

---

## Contagem por tag

| Tag | Qtd |
|---|---|
| `[1:1]` (fiel, org-stripped + rename de tabela) | 7 |
| `[PLATFORM_CRM]` / `[MAPEADO-ERP]` (swap de schema documentado) | 9 |
| `[DROP-OK]` (drop justificado, sem canal WhatsApp) | 5 |
| `[FALTA]` (gap funcional real) | **4** |
| `[ADICIONADO]` | 1 |
| `[RENOMEADO]` | 6 (todos os edges `cadence-*`/`campaign-*` → `platform-*`) |
| `[CONSOLIDADO]` | 1 (`CadencePicker` absorvido / não portado — ver abaixo) |

---

## 1. O QUE SAI DE VERDADE vs NO-OP (a questão central)

### Envio (dispatch) — original vs portado

| | ORIGINAL (Vendus tenant) | PORTADO (plataforma) |
|---|---|---|
| **Canal** | WhatsApp (Evolution + Meta HSM) via `manual-outreach`/`-batch` | **Webchat interno** (`platform_crm_messages` + broadcast realtime) |
| **Geração da msg** | `manual-outreach` monta prompt (agente+contexto+histórico) e envia | **IA inline** via gateway env-driven (`AI_GATEWAY_URL`/`AI_API_KEY`/`AI_MODEL`) — `[ADICIONADO]` |
| **Sai mensagem?** | Sim, para qualquer telefone BR válido + opt-in | **Só se `platform_crm_conversations` status≠closed existe p/ o lead** |
| **Sem canal** | (não aplicável — telefone é o canal) | target/run → `skipped_no_channel` (**NO-OP silencioso, não é falha**) |

**Consequência operacional:** disparar campanha/cadência para um lead que **nunca abriu conversa no webchat** = 0 mensagens, marcado `skipped`. O envio proativo "a frio" (que no WhatsApp é o caso de uso principal) **não existe na plataforma até o canal WhatsApp ser plugado.** Ambos os edges documentam isso com `TODO(whatsapp)`.

- Evidência dispatch campanha: `platform-campaign-dispatcher/index.ts:286-294` (skip sem conversa) + `:334-367` (insert webchat + broadcast). Original: `campaign-dispatcher/index.ts:246-297` (fetch `manual-outreach-batch`).
- Evidência tick cadência: `platform-cadence-tick/index.ts:330-345` (skip sem conversa) + `:379-419` (insert+broadcast). Original: `cadence-tick/index.ts:298-341` (fetch `manual-outreach`).

---

## 2. Gatilhos, agendamento e recorrência

| Mecanismo | Status | Evidência |
|---|---|---|
| **Enrollment** (por lead_ids ou entry_filters+exclusion) | `[1:1]` fiel | `platform-cadence-enroll/index.ts:73-154` × `cadence-enroll/index.ts:52-132` |
| **Agendamento de steps** (`delay_value`/`delay_unit`/`execute_immediately`) | `[1:1]` idêntico | `platform-cadence-tick:66-72` × `cadence-tick:35-41` (mesma fn `computeScheduledAt`) |
| **Janela horária** (`execution_window` cadência / `recurrence` campanha) | `[1:1]` idêntico | `platform-campaign-dispatcher:53-69` × `campaign-dispatcher:27-43` |
| **Gatilho on-response** (para runs futuros, aplica stop_actions/tags/stage) | `[1:1]` fiel | `platform-cadence-on-response` + `platform-campaign-on-response` (idênticos, com swap `stage_id`→`current_stage_id`, `status:'human'`→`'waiting_human'+needs_human`) |
| **stop_on_purchase** (deal ganho) | `[MAPEADO-ERP]` | `platform-cadence-tick:270-282` (`platform_crm_deals.status='won'` ⟵ original usava join `pipeline_stages.stage_type='won'`) |
| **Stop manual** | `[1:1]` fiel | `platform-cadence-stop` × `cadence-stop` |
| **RECORRÊNCIA de campanha (re-snapshot periódico)** | **`[FALTA]` CRÍTICO** | ver abaixo |

---

## LISTA DE `[FALTA]` (gaps reais)

### FALTA-1 🔴 CRÍTICO — `campaign-recurring-snapshot` não portado (recorrência morta)
- **Original:** `.vendus-src-reference/supabase/functions/campaign-recurring-snapshot/index.ts` (cron 15min) — para cada campanha `status=active & schedule_type=recurring`, re-resolve a audiência e enfileira **novos** targets (UNIQUE `(campaign_id,lead_id)` evita duplicar quem já recebeu).
- **Portado:** **NÃO EXISTE** `platform-campaign-recurring-snapshot`. Confirmado: só 8 folders `platform-c*` (nenhum recurring).
- **Por que é gap e não drop-ok:** a UI portada **OFERECE "Recorrente"** e grava `recurrence` no banco — `CampaignWizard.tsx:526` (`<RadioGroupItem value="recurring">`), `:231` (persiste `recurrence`). O `platform-campaign-dispatcher` respeita a janela (`withinWindow` case `recurring`). **Porém, sem o re-snapshot, uma campanha recorrente envia UMA vez ao público inicial e nunca mais re-enfileira** leads novos/retornantes. A UI promete recorrência que o motor não cumpre.
- **Impacto:** feature visível quebrada silenciosamente (campanha fica "active" para sempre, sem novos envios).

### FALTA-2 🟡 — `campaign-ai-insights` não portado (AI-insights de campanha)
- **Original:** `campaign-ai-insights/index.ts` — agrega targets (taxa de resposta, melhores horários, breakdown por contexto) e chama LLM (Lovable Gateway) para 3 insights acionáveis. Renderizado por `AICampaignAssistant.tsx` embutido em `CampaignDetail.tsx:166`.
- **Portado:** **NÃO EXISTE** edge nem `AICampaignAssistant`. O `CampaignDetail.tsx:16` portado documenta o drop explicitamente ("AICampaignAssistant … não existe no schema de plataforma"). `CampaignReports.tsx` portado tem só KPIs/breakdowns **estáticos** (Por Agente / Por Contexto), calculados no client — **sem a camada LLM**.
- **Nota:** o breakdown "Por Número" (WhatsApp) foi corretamente `[DROP-OK]` (`evolution_instances` cross-módulo). Mas o **insight de IA** era canal-agnóstico (só lê `campaign_targets`) — **poderia ter sido portado** apontando p/ `platform_crm_campaign_targets` + gateway de IA já disponível. É gap, não drop-necessário.

### FALTA-3 🟡 — `cadence-api` (REST pública `cdn_`) sem backend na plataforma
- **Original:** `cadence-api/index.ts` — API REST com key `cdn_` (SHA-256 em `cadence_api_keys`): GET cadences/stats, POST enroll/stop, GET enrollments.
- **Portado:** `CadenceApiKeys.tsx` (a **UI** de gestão de keys) foi portada, **MAS**: (a) a tabela `platform_crm_cadence_api_keys` **não existe** (a UI é um shell com TODOs — `CadenceApiKeys.tsx:14,46,66`); (b) o edge `platform-cadence-api` **não existe**; (c) `CadenceApiKeys.tsx:71` aponta `baseUrl` para `/functions/v1/cadence-api` (o edge **de tenant**, que autentica contra `cadence_api_keys` de tenant — cross-módulo, provavelmente 401 na plataforma).
- **Impacto:** a aba "API" das cadências é **cosmética** — nenhuma chave persiste, nenhum endpoint responde. Menor (feature de integração externa, não core de envio).

### FALTA-4 🟢 MENOR — `delay_from='enrollment'` degradado (herdado, não regressão)
- No `cadence-tick` original (`:348-351`) o cálculo de `delay_from='enrollment'` já era aproximado (usa `now` com comentário de "approximation"). O portado (`platform-cadence-tick:425-434`) **simplificou removendo o ramo `delay_from`** — sempre agenda a partir de `now`. Efeito idêntico ao original na prática (o original também não implementava de verdade). Registrado por completude.

---

## LISTA DE `[ADICIONADO]`

### ADIC-1 — Geração de mensagem via gateway de IA inline
- Ambos `platform-cadence-tick` (`generateCadenceMessage`, `:129-186`) e `platform-campaign-dispatcher` (`generateCampaignMessage`, `:86-141`) **adicionam** um gerador de texto via gateway de IA (persona do `platform_crm_agent_configs` + histórico webchat), que **substitui** a delegação ao `manual-outreach` do original. Justificado: a plataforma não tem `manual-outreach` (é edge de tenant, acoplado a Evolution/Meta). Comportamento equivalente em espírito (agente+contexto+histórico → mensagem), canal diferente.

---

## Componentes UI/hooks — mapa resumido

| Original | Portado | Tag |
|---|---|---|
| `campaigns/CampaignWizard.tsx` (45KB) | `campaigns/CampaignWizard.tsx` (31KB) | `[PLATFORM_CRM]` — menor por remover UI de instâncias WhatsApp |
| `campaigns/CampaignsList/Detail/ContextLibrary` | idem (`CampaignsList`, `CampaignDetail`, `ContextLibrary`) | `[1:1]`/`[PLATFORM_CRM]` |
| `campaigns/reports/CampaignReports.tsx` | `campaigns/CampaignReports.tsx` | `[PLATFORM_CRM]` — sem "Por Número", sem IA (ver FALTA-2) |
| `campaigns/AICampaignAssistant.tsx` | **— (dropado)** | **`[FALTA]`** (FALTA-2) |
| `campaigns/CampaignThroughputPanel.tsx` (view `v_campaign_throughput`) | **— (dropado)** | `[DROP-OK]` — view de infra WhatsApp/throughput de tenant; PlatformCrmCampaignsManager.tsx:16 documenta |
| `cadences/CadencePicker.tsx` | **— (não portado)** | `[CONSOLIDADO]` — seletor reutilizável; post_cadence é escolhido inline no CampaignWizard |
| `cadences/CadencesList/Detail/Reports/Wizard/ApiKeys/Manager` | idem (`Cadence*` + `PlatformCrmCadencesManager`) | `[1:1]`/`[PLATFORM_CRM]` (ApiKeys = shell, ver FALTA-3) |
| hooks `useCadence(s)/useCadenceMutations/useCampaigns/useCampaignContexts` | `data/usePlatformCrmCadences/Campaigns/CampaignContexts` | `[PLATFORM_CRM]` (org-stripped) |
| hook `useMassEmailCampaigns` | **— (não portado)** | `[DROP-OK]` — mass-email é outro subsistema, fora do escopo cadência/campanha WhatsApp |

---

## Observações transversais (não-gaps, mas dignas de nota)

- **CLAIM sem SKIP LOCKED:** original usa RPCs atômicas (`claim_campaign_targets`, `claim_campaign_preparation_jobs`, `exec_finalize_campaign_targets` com `FOR UPDATE SKIP LOCKED`/`UNNEST`). Portado usa **SELECT+UPDATE condicionado a status** (idempotente entre ticks, mas não à prova de corrida real). Justificado como "tenant-of-one → fair-share degenera p/ limite global". Aceitável enquanto for 1 tenant; **vira risco se a plataforma escalar dispatchers concorrentes** (documentado com TODO em `platform-campaign-dispatcher:10-14`, `platform-campaign-prepare:11-16`).
- **`PER_ORG_LIMIT=10` (fair-share) removido** no dispatcher portado — correto (não há múltiplas orgs na plataforma). Só `GLOBAL_LIMIT=100` sobrevive.
- **Cron não versionado:** nenhuma migration wira `cron.schedule`/`net.http_post` para `platform-cadence-tick`/`platform-campaign-dispatcher`/`-prepare` (nem para os originais). Consistente com o padrão do projeto (pg_cron configurado fora do repo). **Não é regressão da portagem**, mas significa que **mesmo os edges portados fiéis não disparam sozinhos até o cron ser criado no banco** — verificar em produção.
- **Guards WhatsApp corretamente removidos** (`whatsapp_opt_in`, `normalizePhoneBR`, `bot_loop_detected_at`, HSM Meta 24h): 5× `[DROP-OK]`, todos com `TODO(whatsapp)`.

---

## TOP-3 PRO MARCELO

1. **🔴 Recorrência de campanha está quebrada (FALTA-1).** A UI oferece "Recorrente" e grava `recurrence`, mas **não há `platform-campaign-recurring-snapshot`** — a campanha envia 1× ao público inicial e nunca re-enfileira. Ou porta o edge (é ~1:1, trocar tabelas + remover org + instância virtual webchat), ou **esconde a opção "Recorrente" do wizard** até portar. Não deixe a UI prometer o que o motor não entrega.

2. **🟡 Todo o motor "sai de verdade" SÓ no webchat.** Envio proativo a frio (o caso de uso #1 do WhatsApp) = `skipped_no_channel`. Está tudo documentado com `TODO(whatsapp)` e a lógica está pronta para receber o canal — mas hoje, **em produção, campanhas/cadências para leads sem conversa aberta = 0 mensagens**. Alinhe expectativa: isto é um motor de **follow-up de conversas existentes**, não de prospecção.

3. **🟡 Duas features "de vitrine" viraram shell:** AI-insights de campanha (FALTA-2, botão "Analisar campanha" sumiu) e a API REST `cdn_` de cadências (FALTA-3, aba "API" não persiste key nem responde endpoint — e ainda aponta para o edge de *tenant*). O AI-insights era canal-agnóstico e barato de reviver (gateway de IA já existe na plataforma). A API `cdn_` exige tabela + edge novos — decida se integração externa está no escopo antes de manter a UI visível.
