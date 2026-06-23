# Relatório Estratégico: cloud-beauty-ai (Lovable) vs NexvyBeauty (produção)

O cloud-beauty-ai (CBA) evoluiu muito desde a análise anterior: hoje tem SSR real com error-handling de produção, agenda diária com 5 status, pacotes pré-pagos completos, scoring por regra configurável, web-push end-to-end e migrations versionadas — não é mais o protótipo Lovable raso de antes. As 11 dimensões abaixo foram verificadas linha-a-linha contra o código real dos dois repos (CBA no commit de 2026-06-23). O objetivo deste documento NÃO é declarar um vencedor de torcida: é mapear, com honestidade, **o que precisamos crescer no NexvyBeauty (NX)** reusando a infra real que já temos em produção (Evolution/WhatsApp, Cakto, ~119 edge functions, Docker/Traefik soberano), e onde o nosso moat é genuíno e difícil de copiar.

A leitura desconfortável primeiro: **o NX não é mais um superset estrito do CBA.** Existem capacidades de plataforma-de-app no CBA (SSR, gate de auth no shell, push real, pacotes pré-pagos de salão, scoring configurável, higiene de base) que hoje **não têm equivalente no NX** — algumas são features ausentes (baratas de portar), outras são dívida arquitetural real. A maior delas para o nicho salão é o **booking público de salão**, que o CBA tem ponta-a-ponta e o NX simplesmente não tem.

## Placar executivo

| Dimensão | Quem ganha | Placar (CBA / NX / Tie) | Confiança |
|---|---|---|---|
| 1. Arquitetura, stack, deploy & soberania | Empate (perfis opostos) | 5 / 5 / 1 | Alta |
| 2. CRM núcleo (leads, funis, scoring) | NX (leve) | 3 / 4 / 3 | Alta |
| 3. IA conversacional & agentes | NX | 3 / 6 / 1 | Média |
| 4. IA preditiva & ação (NBA, scoring, higiene) | Empate (eixos opostos) | 5 / 3 / 0 | Alta |
| 5. Automação (cadências, campanhas, workflows) | NX (folga) | 1 / 5 / 1 | Alta |
| 6. Omnichannel & inbox | NX | 3 / 6 / 0 | Alta |
| 7. Captação & páginas públicas | CBA (leve) | 3 / 5 / 1 | Alta |
| 8. Salão / ERP | CBA | 5 / 2 / 2 | Alta |
| 9. Analytics, metas, daily-report | NX (leve) | 3 / 4 / 2 | Alta |
| 10. Multi-tenant, billing, push/email | NX (decisivo) | 2 / 5 / 3 | Alta |
| 11. UI/UX & coesão | NX (leve) | 2 / 5 / 2 | Alta |

**Placar geral agregado:** NX vence 6 dimensões, CBA vence 2, empate em 3. Em features somadas: **CBA ~35 / NX ~50 / ~16 empates**. O NX domina em **execução operacional, automação, integrações vivas, monetização e governança**; o CBA domina em **maturidade de plataforma-de-app (SSR, push, PWA), ERP de salão profundo (pacotes pré-pagos) e fundamentos de captação/agendamento público**. A vantagem do NX é real, mas **mais estreita do que "superset" sugeriria** — e concentrada onde o CBA tem caminho difícil de alcançar.

## Onde o cloud-beauty-ai GANHA (o que precisamos crescer)

Esta é a seção mais importante. Agrupei por tema, em ordem de prioridade estratégica. Cada item traz o **porquê** e o **caminho concreto no NX** reusando infra existente.

### A. Booking público de salão — P0 ABSOLUTO (gap mais caro do nicho)

**O que o CBA tem:** `public-booking.functions.ts` + `agendar.$slug.tsx` production-grade — carrega serviço+profissional do salão por slug, gera slots reais por jornada do profissional (`hora_inicio`/`hora_fim` + `dias_atendimento` jsonb) menos a duração do serviço, valida conflito client+server contra a tabela `agendamento`, faz upsert de cliente por telefone e **escreve na mesma Agenda do salão**. Também vende pacote por link (`pacotes.$slug.tsx` → `comprarPacote` grava em `pacote_cliente` com validade).

**Por que importa:** Para um SaaS de SALÃO de beleza, "cliente final agenda o corte/manicure online" é o coração operacional. O NX hoje só tem o `PublicBooking.tsx` que é **Calendly de reuniões** (`booking_event_types`/`calendar_events`/Google Meet) — não seleciona serviço nem profissional do salão. Esse gap supera, em valor, toda a sofisticação de captação que o NX já vence.

**Caminho no NX (reusar infra real):**
1. Criar rota pública `/agendar/:slug` que lê serviço+profissional do módulo Salão (`servico_catalogo`, `profissionais` com `comissao_pct`/especialidades já existentes).
2. Edge function `salao-availability` que gera slots a partir de `hora_inicio`/`hora_fim` + `dias_atendimento` do profissional menos `duracao_minutos`, com conflito contra a Agenda real (`src/pages/salao/Agenda.tsx` já existe e tem o CRUD).
3. Escrever o agendamento na Agenda real e **disparar confirmação via Evolution** (`evolution-send`) — diferencial que o CBA não tem (WhatsApp real).
4. Capturar UTM no booking (o NX já faz isso em `PublicBooking`/`PublicForm` — reaproveitar).

Modelo exato a copiar: `getAvailableSlots`/`createPublicAgendamento`.

### B. Pacotes pré-pagos de serviços — P0 (paridade de ERP)

**O que o CBA tem:** catálogo full-CRUD (`pacote`: total_sessoes/valor/validade_dias/servicos_incluidos) + venda (`pacote_cliente` com `data_validade = addDays(inicio, validade_dias)`, rastreio `sessoes_usadas`/`total_sessoes`, status).

**Por que importa:** É receita recorrente do salão sobre o cliente final (pacote de 10 sessões, plano de manutenção). Confirmado por grep: **ausente no NX** — as refs a "pacote" no NX são do CRM/produto (`TagPackageGenerator`/`PostSaleTab`), não pacote pré-pago de serviços.

**Caminho no NX:**
1. Tabelas `pacote` e `pacote_cliente` no `migrations_salao/`.
2. Páginas de catálogo + venda no módulo Salão.
3. Baixa de sessão ao concluir agendamento (hook na Agenda) + `forma_pagamento = 'Pacote'`.
4. Opcional: link de pagamento via **Cakto** (`cakto-sync-offer`) para venda online do pacote — usar infra de cobrança que já temos.

### C. Plataforma-de-app: SSR + gate de auth no shell — P1

**O que o CBA tem:** `src/server.ts` com SSR real (TanStack Start) que normaliza os 500 que o h3 engole e serve error-page branded; `auth-middleware.ts` valida `supabase.auth.getClaims()` server-side **antes** de liberar o render. O NX é SPA puro servido por nginx (`try_files`), sem SSR e sem gate de auth na borda — a defesa do shell é só RLS.

**Por que importa:** (1) SEO/first-paint nas LPs públicas (apex/www/vendas) — hoje o NX perde isso. (2) Áreas sensíveis renderizam no client antes do gate. (3) Observabilidade: erro de runtime no NX fica no client, sem captura estruturada.

**Caminho no NX (sem reescrever tudo):**
1. SSR/SSG **apenas das rotas públicas** (LPs de venda/apex) — não precisa migrar o app inteiro de React Router para SSR.
2. Gate de auth na borda: como o NX já tem Traefik + edge functions, adicionar um middleware/edge que valide o JWT antes de servir áreas sensíveis fecha o gap sem trocar o runtime do SPA.
3. Logging estruturado de erros de app numa edge fn gateway.

### D. Web-push real + PWA com cache offline — P1

**O que o CBA tem:** pipeline push completo E **wired** em `criarNotificacao` (VAPID em `app_config` + `pushManager.subscribe` + `crm_push_subscription` + `sendPushToUser` via `@block65/webcrypto-web-push` + GC de subs mortas 404/410 + `sw.js` com handlers push/notificationclick). O `sw.js` do CBA também faz **offline app-shell** (network-first HTML + cache-first de assets hashados). O NX confirmou: tabela `push_subscriptions` **não existe** no DB e o `sw.js` é passthrough deliberado.

**Por que importa:** Engajamento do dono de salão (notificar novo lead/agendamento com app fechado) e resiliência offline. É a maior lacuna de "plataforma" do NX.

**Caminho no NX:**
1. Portar quase 1:1 de `cba/src/lib/push/*` (`push.server.ts` + `push.functions.ts`) + `public/sw.js` linhas 63-93 (Deno edge-compatible, encaixa nas edge functions).
2. Tabela `push_subscriptions(user_id, endpoint, p256dh, auth, ativo, ultimo_erro)`, VAPID em `platform_settings`.
3. Promover o `sw.js` de passthrough para network-first HTML + cache de assets.
4. **Pré-requisito:** granularizar preferências de notificação por-usuário/por-tipo/por-canal antes de ligar push (hoje o NX tem booleans por-ORG; o CBA tem `crm_notificacao_pref` por-usuário) — senão vira spam.

### E. Higiene de base de leads — P1 (suíte inteira ausente)

**O que o CBA tem:** `higiene.functions.ts` completo e wired em `app.crm.higiene.tsx`: `detectarDuplicatas` (telefone_norm/email_norm), `mergeLeads` (reparenta conversa/evento/oportunidade/nba/tarefa antes de deletar), `normalizarTelefones` em massa, `enriquecerLeadIA` (LLM lê histórico e grava perfil/interesses/resumo). Confirmado por grep: **NX tem zero disso** (os hits de "dedup" no NX são falsos positivos — dedup visual de cards).

**Por que importa:** Base suja mata conversão e estoura limites do WhatsApp. É feature ausente, não limitação de stack — barata e arquitetonicamente trivial de portar.

**Caminho no NX:** edge fn + UI espelhando `higiene.functions.ts`. O enriquecimento por IA pode reusar o `ai-router` que já temos.

### F. Scoring de lead configurável + cron real — P1

**O que o CBA tem:** `crm_score_regra` (peso -100..100 + decay_dias por evento, com migration+RLS+seed+CRUD na UI `app.crm.scoring.tsx`). O NX tem `recompute_lead_scores` com **fórmula hardcoded** (hot55/warm35/cold12, decay*2) e — confirmado por grep — **nenhum cron chama** a função: só comentário "Chamar via cron". O score do `LeadScoreBadge` pode estar estagnado.

**Caminho no NX:**
1. Tabela `score_regra` (evento, peso, decay_dias, ativo) + UI CRUD.
2. Agendar de fato via `pg_cron` (ou edge cron) — corrigir o writer ausente.
3. Considerar decay por-evento granular (msg recebida, etapa avançada) como o CBA.

### G. Entidade de oportunidade/deal ABERTO com forecasting — P2

**O que o CBA tem:** `crm_oportunidade` de 1ª classe (probabilidade 0-100 por negócio, estágios aberta→ganha, `getPipelineKpis` com forecasting ponderado `valor*prob/100`). O NX só materializa `deals` no fechamento (`status won/lost/cancelled`) — não tem pipeline de deals abertos com forecasting por negócio individual.

**Caminho no NX:** entidade de oportunidade aberta separada de leads e do deals de fechamento, com forecasting ponderado por negócio. O `StageValueManager` (forecasting por etapa) já existe — falta o nível por-deal.

### H. Itens menores de paridade (P2/P3)

| Item | CBA tem | NX faz |
|---|---|---|
| **KB estruturada navegável** (categorias/artigos, `visivel_para_ia`) | `kb.functions.ts` | só material de treino bruto concatenado |
| **Copiloto human-in-the-loop (MIA)** | sugere→aprova→executa (4/10 tipos no executor) | agente 100% autônomo, sem modo assistido revisável |
| **Playbook/objeções como entidades editáveis** | `crm_playbook` + `crm_objecao` com contador de uso | embutido no prompt |
| **Templates estáticos de mensagem + Quick Replies** | `templates.functions.ts` CRUD | só `campaign_contexts` gerados por IA |
| **Builder de workflow trigger→action numa UI única** | `app.crm.workflows` | lógica condicional fragmentada em edge functions |
| **Webhooks de SAÍDA assinados (HMAC)** | subsistema completo (não-wired) | só webhooks de entrada |
| **Landing-page builder** | `createLanding` + rota pública | ausente (NX captura via form/quiz/funil) |
| **SLA de permanência por etapa** + event-log unificado | `sla_horas` em etapa + `crm_lead_evento`/`crm_audit` | só `max_accept_time` (aceite) e `lead_stage_history` |
| **Multi-funil nomeado por org** | `crm_funil` | pipeline-por-produto |
| **Profissionais: editar/excluir + KPIs mensais** | CRUD + faturamento por profissional | insert-only, sem KPI |
| **Financeiro: delete + recorte mensal** | `gte/lte` por mês + delete | insert-only, sem mês, sem delete |
| **Histórico de daily-report em tabela** | `crm_daily_report` (UNIQUE+RLS+índice) | só notification efêmera |
| **Guard de supply-chain no build** | `bunfig minimumReleaseAge 24h` | `npm install` cru no Dockerfile |
| **Versionar tabelas de IA em migrations** | migrations presentes | `ai_insights`/`ai_prompt_experiments`/`lead_semantic_memory` só em `types.ts` (drift) |

## Onde o NexvyBeauty GANHA (nosso moat)

Lista com evidência verificada no código. Estas são capacidades em **produção real** com integrações vivas — exatamente as que o CBA não tem caminho curto para construir.

1. **IA que AGE, não só sugere (diferencial decisivo único).** `lead-nba` gera `mensagem_sugerida`+`canal_sugerido` via tool-calling estruturado; `LeadNbaCard` botão "Aplicar (WhatsApp)" dispara via `evolution-send` (301 linhas, Evolution API real) e marca `aplicada`. O CBA nem tem coluna `mensagem_sugerida` no schema — para na sugestão.

2. **Automação ponta-a-ponta em produção.** Campanhas: `campaign-start` (snapshot+weightedPick anti-flood) → `campaign-dispatcher` (cron 1/min, lock, pausa, auto-complete, pós-campanha) → `manual-outreach` → `evolution-send`. No CBA, `crm_campanha_envio` tem **1 writer e zero consumers** (grep provado): a fila nunca envia. Cadências com janela horária, `stop_rules`, condições por passo; `cadence-on-response` wired no `evolution-webhook` (linhas 2042/2051) para parar em tempo real — no CBA a flag `parar_ao_responder` é inerte.

3. **WhatsApp em nível de produção.** `evolution-send` com 13 tipos de mensagem (vs só-texto no CBA); `evolution-proxy` (1259 linhas) com ciclo de vida completo de instância (QR/connect state-aware/sync/logout/multi-instância/self-service); `evolution-webhook` (2886 linhas) hardened com lock atômico, dedup por unique-constraint, download de mídia com 5 fallbacks. O CBA é stub no lifecycle de instância.

4. **Monetização e governança reais (verificado live no DB).** Gateway **Cakto** real (`cakto-webhook` valida secret + `cakto-plan-provisioning` idempotente org+plano+billing_history); enforcement de quota **inbypassável** confirmado aplicado no banco (triggers `trg_enforce_max_users`/`trg_enforce_max_ai_agents` + funções existem live); impersonação in-session real (`set_active_organization` RPC live); email transacional completo (Resend + React Email + fila + suppression + unsubscribe). O CBA: zero gateway (grep), trial cosmético, email no-op que retorna `{ok:false}`.

5. **Loop fechado de IA operacional.** LLM-as-Judge de produção (`evaluate-conversation`: 6 dimensões via tool-call, single+batch, persiste `ai_quality_evaluations`); A/B de prompt **wired no bot** (`prompt-experiment-pick` → `prompt_override` aplicado na geração real do `webchat-bot:2922`); handoff multi-agente sobre WhatsApp+webchat. O CBA não tem nada disso (grep 0-hit em judge/experiment).

6. **Roteamento de IA multi-provedor/multi-tenant.** `ai-router.ts` resolve provider+key por `organization_id`+capability (`org_ai_routing`/`org_ai_credentials`, key externa OpenAI OU gateway com fallback). O CBA é provedor único Lovable hardcoded.

7. **Soberania de hospedagem real e versionada.** `Dockerfile.app` + `docker-compose.yml` + `deploy-vps.sh` idempotente + Traefik file-provider (routers gestão/app/apex com letsencrypt, security-headers, healthcheck). O CBA depende 100% de Cloudflare+Lovable (caixa-preta, sem Dockerfile no repo). **Ressalva honesta:** soberania do NX é PARCIAL — cobre o frontend, mas o dado segue em Supabase Cloud e a IA default no OpenRouter (US).

8. **Captação de marketing superior.** Builders visuais (FormCanvas/FlowCanvas/QuizVisualCanvas com tema/preview); `form-submit` calcula score+tags+temperature+stage+distribuição; funil conversacional com AI takeover real; IA nos 3 artefatos; UTM/referrer/landing_page completos. O CBA cria por lista, sem canvas.

9. **Distribuição de leads e radar de oportunidades.** Fila (`lead_queue`) + presence-aware + estratégia por performance + auto-reassign + SLA de aceite; `opportunity-scan-run` (464 linhas, radar IA com ~25 filtros varrendo a base). O CBA é distribuição síncrona sem fila.

10. **UI/UX moderna onde pesa.** Tema dark/light real e wired (no CBA o `.dark` é código morto — `<html>` sem classe dark, sem next-themes); shell mobile dedicado (MobileBottomNav + framer-motion + haptics); onboarding multi-módulo profundo (1455 linhas + ActivationChecklist com contagem real).

## Detalhe por dimensão

### 1. Arquitetura, stack, deploy & soberania

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Framework & rendering (SSR vs CSR) | ✅ | 🟡 | CBA |
| Hosting / deploy topology | 🟡 | ✅ | NX |
| Reverse proxy / TLS / roteamento | 🟡 | ✅ | NX |
| Auth (gate no shell) | ✅ | 🟡 | CBA |
| Gateway de IA & flexibilidade de provedor | 🟡 | ✅ | NX |
| Residência de dados / soberania (LGPD) | 🟡 | 🟡 | Tie |
| PWA | ✅ | 🟡 | CBA |
| DX & guard-rails de supply-chain | ✅ | 🟡 | CBA |

**Veredito:** Empate de perfis opostos — CBA vence em maturidade de plataforma-de-app (SSR, gate de auth, PWA, supply-chain) ao custo de lock-in total; NX vence em soberania de infra e flexibilidade de IA.

### 2. CRM núcleo (leads, funis, oportunidades, scoring, distribuição, conversão)

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Modelo de lead (campos ricos / BANT) | ✅ | ✅ | Tie |
| Estágios/funis (kanban) | ✅ | ✅ | Tie |
| Oportunidades/deals abertos + forecasting | ✅ | 🟡 | CBA |
| Distribuição de leads (fila/presença/performance) | 🟡 | ✅ | NX |
| Conversão lead→cliente (dedup + merge) | ✅ | ✅ | Tie |
| Lead scoring com decay | ✅ | ✅ | CBA |
| Next-Best-Action acionável | ✅ | ✅ | NX |
| Filtros / bulk / radar de oportunidades | 🟡 | ✅ | NX |

**Veredito:** NX vence por leve margem — mais forte em execução com IA acionável; CBA mais forte em estrutura de pipeline clássico (deals abertos, scoring por regra).

### 3. IA conversacional & agentes

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Configuração de agentes (persona/modelo/handoff) | ✅ | ✅ | NX |
| Runtime conversacional ao vivo (tool-call/handoff) | 🟡 | ✅ | NX |
| Base de conhecimento (KB curada) | ✅ | 🟡 | CBA |
| RAG / embeddings | ✅ | ✅ | Tie |
| Copiloto assistido (MIA) | 🟡 | 🟡 | CBA |
| Playbook + objeções | ✅ | 🟡 | CBA |
| LLM-as-Judge | ⬜ | ✅ | NX |
| A/B testing de prompt | ⬜ | ✅ | NX |
| Insights de IA | ✅ | ✅ | NX |
| Roteamento multi-provider | 🟥 | ✅ | NX |

**Veredito:** NX vence (6×3×1) em IA de loop fechado em produção (judge, A/B wired no bot, handoff sobre WhatsApp); CBA mais forte em conhecimento curado e copiloto assistido. Dívida real do NX: migrations de IA vazias (drift).

### 4. IA preditiva & ação (NBA + execução, scoring, higiene)

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| NBA generativo por lead | ✅ | ✅ | NX |
| NBA → EXECUTAR (mensagem + disparo real) | ⬜ | ✅ | NX |
| Scoring com decay temporal | ✅ | 🟡 | CBA |
| Regras de scoring configuráveis | ✅ | ⬜ | CBA |
| Detecção de duplicatas | ✅ | ⬜ | CBA |
| Merge de leads | ✅ | ⬜ | CBA |
| Normalização de telefones | ✅ | ⬜ | CBA |
| Enriquecimento de lead por IA | ✅ | 🟡 | CBA |

**Veredito:** Empate de eixos opostos — no eixo AÇÃO o NX vence sozinho (NBA dispara WhatsApp real); no eixo AMPLITUDE/CONFIGURABILIDADE o CBA domina (suíte de higiene inteira + scoring configurável que o NX não tem).

### 5. Automação (cadências, campanhas, workflows, templates, cron)

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Cadências multi-step | 🟡 | ✅ | NX |
| Stop-on-response em tempo real | 🟥 | ✅ | NX |
| Campanhas (envio em massa) | 🟥 | ✅ | NX |
| Workflows condicionais trigger→action | 🟡 | 🟡 | Tie |
| Templates de mensagem reutilizáveis | ✅ | 🟡 | CBA |
| Cron/tick que executa de fato | 🟡 | ✅ | NX |
| Envio real WhatsApp na automação | 🟡 | ✅ | NX |

**Veredito:** NX vence com folga — campanhas E2E reais (o CBA tem fila sem worker, nunca envia), cadências com janela/condições, stop-on-response wired. CBA só vence em templates estáticos e no único cron versionado em migration.

### 6. Omnichannel & inbox

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| WhatsApp Evolution (envio) | 🟡 | ✅ | NX |
| WhatsApp inbound (webhook) | 🟡 | ✅ | NX |
| Gestão de instância (QR/lifecycle) | 🟥 | ✅ | NX |
| Inbox unificada (fila/aceite/transfer) | 🟡 | ✅ | NX |
| Multicanal real (canais com inbound) | 🟡 | 🟡 | CBA |
| Webchat público + auto-bot | ✅ | ✅ | NX |
| Webhooks de SAÍDA assinados | 🟡 | ⬜ | CBA |
| Integrações auxiliares (calendar/billing/email) | 🟡 | ✅ | NX |

**Veredito:** NX vence — mais profundo e em produção no canal que importa (WhatsApp). CBA é mais largo em arquitetura multicanal (esqueleto IG/Meta) e tem webhooks de saída — mas boa parte é blueprint não-wired.

### 7. Captação & páginas públicas

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Booking público de SALÃO | ✅ | ⬜ | CBA |
| Venda de pacotes por link público | ✅ | ⬜ | CBA |
| Form builder visual + form público | 🟡 | ✅ | NX |
| Quiz builder + quiz público (scoring) | 🟡 | ✅ | NX |
| Funil/chatbot público | 🟡 | ✅ | NX |
| Landing page builder | 🟡 | ⬜ | CBA |
| Geração de captação por IA | 🟡 | ✅ | NX |
| Materiais / anexos de apoio | 🟡 | 🟡 | Tie |
| Captura de UTM / atribuição | ⬜ | ✅ | NX |

**Veredito:** CBA vence por leve margem — domina o núcleo de agendamento público do salão (booking + pacote + landing) que o NX não tem; o NX domina captação de marketing (builders visuais, pipeline com distribuição, UTM). Para o nicho, o gap do NX é mais caro.

### 8. Salão / ERP

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Agenda / Agendamentos | ✅ | ✅ | CBA |
| Catálogo de serviços | ✅ | ✅ | NX |
| Profissionais (cadastro + KPIs) | ✅ | 🟡 | CBA |
| Clientes | ✅ | ✅ | Tie |
| Financeiro / Lançamentos | ✅ | 🟡 | CBA |
| Dashboard do salão | ✅ | ✅ | Tie |
| Pacotes pré-pagos | ✅ | ⬜ | CBA |
| Equipe / gestão de acesso | ✅ | 🟡 | CBA |
| Comissão (campo + cálculo) | 🟥 | 🟥 | NX |

**Veredito:** CBA vence — vantagem real em pacotes pré-pagos (NX ausente) e profundidade operacional (agenda diária, KPIs por profissional, financeiro com mês/delete). NX tem trunfos genuínos: lead→cliente nativo no agendamento + reuso de dado cross-módulo.

### 9. Analytics, metas, relatórios & daily-report

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Daily-report com LLM | ✅ | ✅ | NX |
| Entrega do daily-report (email) | 🟡 | ✅ | NX |
| Cron que dispara o daily-report | ⬜ | 🟥 | NX |
| Histórico persistido de relatórios | ✅ | 🟡 | CBA |
| Página Analytics com recharts | ✅ | ✅ | Tie |
| Funil/win-loss/conversão | ✅ | ✅ | Tie |
| Metas de venda (progresso) | ✅ | ✅ | CBA |
| Insights de IA persistidos | 🟡 | ✅ | NX |

**Veredito:** NX vence por leve margem (IA mais robusta: tool-call, dry_run, email+insights). CBA mais coeso: histórico de daily-report em tabela e progresso de meta on-the-fly (no NX `achieved_value` não tem writer). Ambos sem cron real de daily-report.

### 10. Multi-tenant, super-admin, billing/planos, notificações/push/email

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Multi-tenancy + RLS | ✅ | ✅ | Tie |
| Impersonação / login-as | 🟡 | ✅ | NX |
| Painel super-admin | 🟡 | ✅ | NX |
| Billing / gateway de cobrança | 🟥 | ✅ | NX |
| Planos / quotas / trial (enforcement) | 🟡 | ✅ | NX |
| Notificações in-app | ✅ | ✅ | Tie |
| Push (web-push real) | ✅ | ⬜ | CBA |
| PWA (SW com cache) | ✅ | 🟡 | CBA |
| Email transacional | 🟥 | ✅ | NX |
| Audit log | ✅ | ✅ | Tie |

**Veredito:** NX vence decisivamente — tem o núcleo de SaaS comercial (Cakto real, quota inbypassável live, email completo, impersonação in-session). CBA só supera em push/PWA, mas aí supera com folga (push wired + offline app-shell).

### 11. UI/UX & coesão

| Feature | CBA | NX | Vencedor |
|---|---|---|---|
| Shell de navegação / sidebar agrupada | ✅ | ✅ | CBA |
| Coesão (produto único vs apps colados) | ✅ | 🟡 | CBA |
| Tema dark/light funcional | 🟥 | ✅ | NX |
| Polimento premium do salão | ✅ | ✅ | Tie |
| Modo demo | ✅ | ✅ | CBA |
| Onboarding (wizard) | 🟡 | ✅ | NX |
| Shell mobile dedicado | ⬜ | ✅ | NX |
| Topbar global / ações compartilhadas | 🟡 | ✅ | NX |

**Veredito:** NX vence por pouco — dark-mode real (o do CBA é código morto), mobile app-like e onboarding profundo pesam em UI/UX 2026. CBA vence em coesão estrutural pura (produto único sob um layout) e demo mais amplo. Caminho do NX: unificar SalaoLayout + Sidebar do CRM num shell único com switcher de módulo sempre visível.

## Backlog priorizado p/ superar (Top 10)

Ordenado por impacto/esforço. Esforço: P=pequeno, M=médio, G=grande.

| # | Item | Dimensão | Esforço | Impacto | Reusa (infra NX) |
|---|---|---|---|---|---|
| 1 | **Booking público de salão** (slot por jornada + escreve na Agenda + confirma via WhatsApp) | 7 / Salão | G | Alto | Agenda salão, `evolution-send`, UTM de `PublicBooking` |
| 2 | **Pacotes pré-pagos de serviços** (catálogo + venda + baixa de sessão) | 8 | M | Alto | `migrations_salao`, módulo Salão, Cakto p/ pagamento |
| 3 | **Higiene de base de leads** (dedup + merge + normalização + enriquecimento IA) | 4 | M | Alto | edge fn + `ai-router` |
| 4 | **Scoring configurável + cron real** (tabela `score_regra` + `pg_cron`) | 2/4 | P | Alto | migration + `pg_cron` (já usado no scoring) |
| 5 | **Web-push real + SW com cache offline** | 10 | M | Alto | edge functions Deno, `sw.js`, `platform_settings` |
| 6 | **Versionar tabelas de IA/notificação em migrations** (matar drift) | 3/9 | P | Alto | `supabase/migrations/` |
| 7 | **Gate de auth na borda + SSR só das LPs públicas** | 1 | G | Médio | Traefik, edge fn proxy |
| 8 | **Entidade de oportunidade ABERTA + forecasting por negócio** | 2 | M | Médio | `deals`, `StageValueManager` |
| 9 | **Templates estáticos de mensagem + Quick Replies (CRUD na UI)** | 5 | P | Médio | inbox, `campaign_contexts` |
| 10 | **Profissionais (editar/excluir + KPIs mensais) + Financeiro (mês/delete)** | 8 | P | Médio | módulo Salão, dados de `agendamentos` |

Atalhos de alto retorno: itens **3, 4, 6, 9, 10** são P/M e fecham buracos de paridade rapidamente. Itens **1 e 2** são os de maior valor estratégico para o nicho (custam mais, mas são o coração do produto de salão).

## Veredito final

**O NX não é mais um superset estrito do CBA — e essa é a verdade desconfortável.** Vence 6 das 11 dimensões e domina onde mais importa comercialmente (automação E2E, WhatsApp profundo, monetização Cakto, IA que age, governança verificada em produção), mas ficou para trás em quatro frentes reais: **booking público de salão** (ausente — o gap mais caro do nicho), **pacotes pré-pagos** (ausente), **maturidade de plataforma-de-app** (SSR/gate de auth no shell/web-push/PWA offline) e **profundidade de ERP** (KPIs por profissional, financeiro com mês, scoring configurável + cron real).

A boa notícia: **a maioria desses gaps são features ausentes ou dívida arquitetural trivial, não limitações de stack** — e o moat do NX (integrações vivas Evolution/Cakto, soberania de infra, IA de loop fechado) é genuíno e difícil de copiar pelo CBA. Fechando o Top 5 do backlog (booking de salão, pacotes, higiene, scoring+cron, push), o NX volta a ser superset claro com a vantagem decisiva de já estar em produção soberana. A ressalva crítica permanente: a "soberania" do NX é parcial — cobre a hospedagem, mas o dado segue em Supabase Cloud e a IA no OpenRouter (US); para LGPD de verdade, residência de DADOS é o próximo capítulo.
