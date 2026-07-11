> 🩹 **ERRATA (2026-07-09, controller · triagem 6cf2fc02, evidência verificada)** — §3 marca FALTA para itens JÁ ENTREGUES (07-05, commits 555badc+b349da4): U1 (PlatformCrmInbox.tsx:75-76 + LeadContextPanel 456L) · U2 (ConversationList.tsx:266-304) · U3 (platformCrmIdentity.ts) · A2 (AnalysisPanel.tsx:20,57-58 + edge) · A4 (usePlatformPresenceHeartbeat em PlatformShell.tsx:16) · A6 (booking-dispatcher/index.ts:81 via Cloud API). PERMANECEM FALTA: A1 (composer 8 comps) · A3 (decidido MANTER/construir) · A7 (followup-ai-draft inexistente) · U4 (eyeball Marcelo).
> Texto histórico preservado abaixo.

# RETOMADA — Modelo de UI (Remix Vendus) + Playbook na IA da ponta
> 2026-07-05 · Forense de 3 sessões (986d864f "Nexvybeauty CRM porting work" 481MB 26/06→03/07 · 7034f3dd · 81daecc0) + worktree `_wt-crm-pele-viva` + mapa de código do copiloto.
> Gatilho: "a UI está ruim, bagunçada" + "Sugerir Resposta IA" respondeu genérico ("piloto = teste gratuito" ❌).

## 1. A SESSÃO ENCONTRADA (linhagem completa)

| Sessão | Período | Papel |
|---|---|---|
| `986d864f` (CWD `/Projects/GitHub` — por isso parecia "outra conta") | 26/06→03/07 | **Autoridade.** Validou o modelo de UI (5 prints da shell Remix Vendus v4, 01/07 15:03) + porte 1:1 do atendimento + decisões D1-D10 + D3 multiproduto + domínio gestao.nexvy.tech |
| `7034f3dd` | 02/07 manhã | Fixou 6 critérios de DONE; morreu no session-limit |
| `81daecc0` | 02/07 | Retomada: portou os 3 motores server-side (93/96/96), documentou o inacabado, criou `tasks/CONTROLE-SESSOES-ORQUESTRACAO.md` (canônico) |
| Irmão: worktree `_wt-crm-pele-viva` (ERP FIC) | 03-04/07 | **Calibrou o design**: inbox Vendus v4 aprovada por rubric GAN 86/100 — spec reutilizável em `REF-VENDUS-INBOX.md` |

**Ponteiros canônicos:** `SaasPlugin_vite/tasks/CONTROLE-SESSOES-ORQUESTRACAO.md` (linhagem, 6 DONEs, 11 guardrails) · `tasks/auditoria-portagem/` (dossiês A-I + LOTE L1-L13 + D1-D10) · `tasks/d3-multiproduto/STATE.md` · `_wt-crm-pele-viva/apps/erp-educacional/docs/masterplans/{STATE-CRM-PELE-VIVA,REF-VENDUS-INBOX}.md`.

## 2. O MODELO DE UI — o que é e onde está

**Não é proposta: a estrutura já está EM PRODUÇÃO** em gestao.nexvy.tech. O que a sessão validou:

- **Shell modular padrão-Intentus** com 2 módulos no ModuleSwitcher: **VENDAS** (CRM Vendus 1:1 sobre `platform_crm_*`) e **ERP/Gestão** (super-admin). Nav dentro de cada ModuleDefinition (`src/components/superadmin/platform-shell/registry.tsx`, 54 itens, zero EmBreve).
- **Sidebar Vendas** (réplica do adminMenu do Vendus): Dashboard·Mia·Pipeline·Leads·Agenda · **Atendimentos** (Chat=Central de Atendimento, Painel, Radar IA, Follow-Up, Relatórios) · Automação&IA · Captação · Gestão · Configurações.
- **Tema:** claro da plataforma → evoluído (03/07, decisão sua) para **re-skin institucional azul Nexvy** (#0A52D1/#00D1FF) só no shell gestao.*; **NUNCA o dark do Remix** (guardrail #5). ⚠️ **Pende teu eyeball visual** (Chrome travou na madrugada de 03/07).
- **A MÁXIMA (lei, 01/07):** "vendemos um CRM+ERP para o tenant × teremos um CRM e um ERP para nossa operação" — nunca fundir através da fronteira tenant↔plataforma.
- **Paridade 1:1 obrigatória** (tua correção 01/07 18:43): porte = cópia com tema+desacoplamento, nunca "simplificação".

**O refinamento calibrado que AINDA NÃO foi aplicado ao gestao.\*** — é o "CRM Pele Viva" (irmão, no FIC): layout 3 painéis (lista redimensionável+persistida · thread central · painel de contexto do lead que vira Sheet no mobile), badges de canal por cor, quick-action bar (Cadência·Template·Agendar·Deal·Marcar quente·Analisar), painel de contexto com estágio+temperatura+valor+UTM+notas+timeline, filtros padrão GHL/Helena, estados vazio/carregando/erro. Inbox v3 **aprovada 86/100** e aplicada nos componentes reais do FIC. **Spec agnóstica pronta:** `REF-VENDUS-INBOX.md` (regra: nunca trazer o verde-lima do Vendus — usar paleta do destino).

**Por que você "não identificou a conversa":** o Chat atual do gestao.* já é o porte 1:1, mas (a) as abas por status (Atendimentos=humano / Agentes=IA / Em Fila) não sinalizam onde a conversa nova caiu; (b) sem badge de canal WhatsApp; (c) visitor_name veio "~" (teu nome de perfil no WhatsApp) sem fallback pro telefone; (d) painel de contexto do lead ausente. **Exatamente os pontos que o modelo Pele Viva resolve.**

## 3. CHECKLIST — o que falta (consolidado das 3 fontes)

### 3a. Atendimento (pendências-folha do CONTROLE + auditoria E-inbox)
| # | Item | Fonte |
|---|---|---|
| A1 | Composer: QuickReplies via `/`, Notas internas, LeadContextPanel ("Dados do Contato"), JourneyTimeline, ScheduleMessage, Forward | auditoria E-inbox [FALTA] |
| A2 | `PlatformCrmAnalysisPanel` = shell → falta edge `platform-analyze-conversation` | 81daecc0 |
| A3 | Bug latente `transfer_sector` no webhook-receiver (leads sem sector_id) | 81daecc0 |
| A4 | Presença online: heartbeat no front (`platform_crm_user_status`) p/ auto-assign disparar | 81daecc0 |
| A5 | Ações `send_email`/`notify_whatsapp`/`ai_agent_outreach` = no-op | 81daecc0 |
| A6 | `platform-booking-dispatcher` (L4): confirmações de booking não enviam | LOTE |
| A7 | `followup-ai-draft` (L13) + L5/L1/L10 | LOTE |
| A8 | Suíte profunda Agentes IA (D6b): supervisor persistido, humanização, test-chat | D6(b) — cruza com F2 do autopilot |

### 3b. UI (aplicar o modelo calibrado ao gestao.*)
| # | Item |
|---|---|
| U1 | Aplicar layout/UX `REF-VENDUS-INBOX` ao PlatformCrmInbox (3 painéis, badges de canal, contexto do lead, quick-actions) — paleta do gestao.* (azul institucional), NUNCA verde-lima/dark |
| U2 | Sinalização das abas (contadores + descrição "IA atendendo/Aguardando humano") + notificação visual de conversa nova |
| U3 | Fallback de identidade: nome→telefone formatado quando profile name for inútil ("~") |
| U4 | Teu eyeball do re-skin azul (pendente de 03/07) + P-CRM-01..11 do Pele Viva onde aplicável |

### 3c. Átomos seus (ninguém pode fazer por você)
Eyeball re-skin azul · sessão CONJUNTA ERP/AffiliatesPanel + módulo-por-host (guardrail never-touch-alone) · creds Utmify (P7, por último).

## 4. PLAYBOOK → IA DA PONTA (a causa do "piloto = teste gratuito")

**Mapa provado no código:** botão (PlatformCrmChatArea:454) → `PlatformCrmInbox.tsx:117` → EF `platform-sales-copilot` `{conversation_id}` → prompt = histórico 50 msgs + nome + **`PLATFORM_KNOWLEDGE_CONTEXT` HARDCODED (6 linhas genéricas, index.ts:36-42)** → gemini-2.5-flash. **Zero** leitura de products/agents/playbook. O porte REMOVEU o knowledge dinâmico que o `sales-copilot` tenant tem (ai_knowledge_base + products + objections + Cérebro do Produto, linhas 61-168).

**E o banco JÁ TEM o lugar certo:** `platform_crm_products` tem `knowledge_base, objections, pitch_15s/30s/2min, icp, differentials, plans, pricing, discount_policy, guarantee` — e `platform_crm_conversations.product_id` existe (D3). O Product Hub já edita parte disso (SettingsTab); BrainTab/ObjectionsTab/PlaybookTab são stubs aguardando twins.

### Proposta em 3 passos (A = subset estrito de C, nada se joga fora)
1. **A — religar o cano (~40 linhas, 1 EF):** `platform-sales-copilot` busca o produto via `conversation.product_id` e monta o knowledge com os campos acima (copiando o padrão do tenant); injeta também `founder_campaign_status.slots_left` (escassez VERDADEIRA em tempo real). Fallback = hardcoded atual quando product_id null. **+ carimbo:** o webhook WhatsApp de vendas passa a gravar `product_id` do NexvyBeauty na conversa/lead.
2. **Carga do conteúdo canônico:** popular a linha NexvyBeauty de `platform_crm_products` com o playbook real — oferta Piloto Fundadora 30/30/1 (piloto ≠ "teste gratuito"!), garantia com painel-juiz, conta por sub-vertical, objeções→respostas do KIT-COMERCIAL-PILOTO, regras invioláveis (PROIBIDO desconto; escassez só a real; preços do banco).
3. **C — destino (com D6b/F2):** twins `platform_crm_product_knowledge_sources`/`_objections` + EF de ingestão → destrava BrainTab/ObjectionsTab/PlaybookTab do hub; o MESMO knowledge alimenta o motor de resposta automática (F2). Editável no gestao.* — você atualiza a estratégia num lugar, todas as IAs bebem da mesma fonte.

## 5. ORDEM PROPOSTA
1. **Playbook A + carga** (horas; destrava a qualidade do copiloto JÁ e é pré-requisito do F2)
2. **UI U1-U3** (aplicar modelo Pele Viva ao Chat do gestao.*)
3. **Atendimento A1-A5** (composer completo + análise + presença)
4. **F2 autopilot** (motor de resposta com o mesmo knowledge) + A8/D6b juntos
5. A6/A7 + átomos seus em paralelo
