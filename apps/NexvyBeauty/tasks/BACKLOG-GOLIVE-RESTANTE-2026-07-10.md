> **Gerado:** 2026-07-10 · sessão GO-LIVE Beauty · workflow golive-gap-analysis (4 agentes)
> **Contexto:** pós-entrega A1.2/A1.3 (porte completo inbox V5 + canal por conversa + IG @nexvytech ATIVO com DM inbound provada).
> **Em execução no momento da geração:** A1.4 InboxFiltersDrawer (filtros canal/atendente/conexão/setor) · A1.5 melhorias wizard IG.

# BACKLOG ÚNICO — GO-LIVE NexvyBeauty (sintetizado 2026-07-10)

Legenda: **Esforço** S/M/L · **Status**: ✅ executável-já · ⏳ pende decisão/ação Marcelo · 🔧 em execução agora
Base de paths: `apps/NexvyBeauty/` (repo `SaasPlugin_vite`). Docs em `apps/NexvyBeauty/tasks/`.

**Dedupes aplicados:** B3+B4 (teto físico) absorvidos em C1/C2/C3 (G0a/G0b/Onda 1) — não listados separados. 3.1/3.2/3.3 idem. A1 composer (item 1.1) EXCLUÍDO (porte 38 componentes entregue). 7.2 (demo tour) absorvido pela Onda 3. transfer_sector e IG/Messenger: decisões já tomadas 07-09 (MANTER/REATIVAR) → viraram itens de build, não HITL.

---

## (A) Inbox/CRM plataforma

| # | Item | Evidência | Esf. | Status |
|---|---|---|---|---|
| A0 | InboxFiltersDrawer (filtros canal/atendente/conexão/setor) | `PlatformCrmInbox.tsx:66,800` | M | 🔧 em execução |
| A0b | Wizard IG: nome editável, credenciais em branco=manter, subscribe via API | escopo declarado pela orquestração | S | 🔧 em execução |
| A1 | transfer_sector completo: migration `sector_id` em `platform_crm_conversations` + tabela setores product-scoped + religar action + UI + edge de aceite c/ enforcement setor↔agente | LEVANTAMENTO 1.8 (decisão Marcelo 07-09: construir); `PlatformCrmLeadContextPanel.tsx:120`, `PlatformCrmTransferModal.tsx:333`, `PlatformCrmInbox.tsx:704`, `PlatformCrmAcceptTicketDialog.tsx:70` | M | ✅ |
| A2 | Pacote de migrations do inbox: `visitor_email`, `orchestrator_state`, `evolution_instance_id`, `metadata` (takeover), tabela histórico de transferências, match responsável (auto_notification), `platform_crm_payment_links`, `platform_crm_message_reactions`, `meta_connection_id`+RPC janela 24h | `PlatformCrmEditVisitorDialog.tsx:69`, `PlatformCrmTransferModal.tsx:116,247,261,271,345`, `PlatformCrmPaymentLinkDialog.tsx:69`, `usePlatformCrmMessageReactions.ts:60,196`, `PlatformCrmChatArea.tsx:63,263` | M | ✅ |
| A3 | Filtro por produto nos módulos ERP (Organizations/Subscriptions/Billing) — exige `product_id` em `organizations` (hoje só `plan_id`) | `OrganizationsManager.tsx:80`, `SubscriptionsManager.tsx:44`, `BillingManager.tsx:40` | M | ⏳ decisão de modelagem |
| A4 | E1/D3 multiproduto restante: LOTE L1-L13 product-aware, seed ~9 produtos, fix lead manual gravando `product_id NULL`, prova runtime F2 (2+ produtos), religar 10 stubs pós-Lux (branches não mergeadas) | LEVANTAMENTO 6.1 | L | ✅ |
| A5 | FormBuilder aba "Respostas" + runtime público `/f/:slug` (Edge/rota pública) | `PlatformCrmFormBuilder.tsx:42`, `PlatformCrmCaptureFormsTab.tsx:172` | M | ✅ |
| A6 | Presença online real do visitante (widget/edge emitir presence; hoje sempre false) | `PlatformCrmInbox.tsx:631` | S | ✅ |
| A7 | Transcode de mídia client-side (.mov→.mp4, webm→m4a) — deps `@ffmpeg/*` no app | `usePlatformCrmMediaUpload.ts:20,52,191` | M | ✅ |
| A8 | D6b suíte profunda Agentes IA (editor 13 abas vs 3 campos; UI supervisor) | LEVANTAMENTO 1.7 | L | ✅ |
| A9 | IG Direct + Messenger: restante dos 23 itens de `todo-ig-messenger-inbox.md` (só migration autorada, não aplicada) + **App Review Meta** (embed + vídeo) | LEVANTAMENTO 4.1 (REATIVADA 07-09) | L | ✅ código / ⏳ App Review (vídeo do Marcelo) |

> ⚠️ Verificação: `PlatformCrmScheduleMessageDialog.tsx:147,263,292` ainda referencia migration `20260709_platform_crm_scheduled_messages.sql` como "pende aplicar", mas "agendamento+cron" consta ENTREGUE — confirmar se migration foi aplicada e remover casts `(supabase as any)` (S).

## (B) Backend/edges

| # | Item | Evidência | Esf. | Status |
|---|---|---|---|---|
| B1 | Edge `platform-start-whatsapp-conversation` (paridade v5, entrega real; destrava ContactCard "conversar") | `PlatformCrmStartConversationDialog.tsx:137`, `PlatformCrmContactCardBubble.tsx:17,82` | M | ✅ |
| B2 | Edge `platform-check-whatsapp-number` (verificação de número; hoje toast) | `PlatformCrmChatArea.tsx:71,398`, `PlatformCrmLeadContextPanel.tsx:201,221` | S | ✅ |
| B3 | Edge `platform-meta-whatsapp-send` (template HSM via Cloud API) | `PlatformCrmSendTemplateDialog.tsx:83` | M | ✅ |
| B4 | `trigger_flow`: action `trigger-flow` no `platform-webchat-inbox` + enviar 1ª msg via Cloud API (hoje persist-only) | `PlatformCrmSendFlowDialog.tsx:49`; LEVANTAMENTO 1.3 (Top-8 #3) | M | ✅ |
| B5 | Suíte IA do inbox: edge `followup-ai-draft` plataforma (A7/L13) + `ai-reactivate` estendido (agent_id/objective/mode/extra_context) + multi-conexão + janela 24h + TemplatePicker nos dialogs | LEVANTAMENTO 1.2 (Top-8 #7); `PlatformCrmCallWithAIDialog.tsx:43,45,142,219`, `PlatformCrmFollowupAIDialog.tsx:30`, `PlatformCrmChatArea.tsx:68,419` | M | ✅ |
| B6 | Forward com vínculo `forwarded_from_message_id` | `PlatformCrmInbox.tsx:456` | S | ✅ |
| B7 | Migration versionada de `opportunity_scan_schedules` (**fire-now** — `db reset` quebraria) | LEVANTAMENTO 9.1 (Top-8 #1) | S | ✅ |
| B8 | LOTE adiados: L1 campanha recorrente, L4 lembrete booking WhatsApp, L5, L10 | LEVANTAMENTO 1.4 | M | ✅ |
| B9 | D5(b) Mia com botões inline Confirmar/Cancelar (aprovado verbatim 03/07) | LEVANTAMENTO 1.5 | M | ✅ |
| B10 | D7 webhooks de saída + D9 push | LEVANTAMENTO 1.6 | M | ✅ |
| B11 | Família TODO(edge) não-A1 (~25 hits): `platform-optimize-product-field`, `generate-agent-ai`, Google Calendar OAuth, booking dispatcher, CatalogSync gateway, BrainTab process-training-material etc. — triar e priorizar | FONTE 2 §"pende avulsos" (products/agents/agenda/capture) | L | ✅ (triagem primeiro) |

## (C) Onboarding/go-live do produto

| # | Item | Evidência | Esf. | Status |
|---|---|---|---|---|
| C1 | G0a encanamento do sync: conta WhatsApp (emulador+OTP Salvy), instância Evolution `syncFullHistory:true`, experimento ground-truth N≥50, consumer mínimo `MESSAGES_SET` | PLANO-EXECUCAO-ONBOARDING G0a | M | ⏳ pende "vai" do Marcelo (plano em handoff) |
| C2 | G0b profundidade REAL do history-sync em 3-5 números velhos (`min(wa_timestamp)`, ratificar copy "últimos meses") | PLANO G0b; LEVANTAMENTO 3.3 | S | ⏳ Marcelo indicar números |
| C3 | Onda 1 golden path (pago→voando): S1 QR on-the-fly + LGPD `consent_log`; S2 pipeline live idempotente (wamid); S4 derivação carteira→`clientes`; S3 Home de Valor; disparo 1-clique c/ rampa+jitter+circuit-breaker (`shared/outbound-guardrail`, contrato c/ sessão BDR); D-2 `enabled_modules` de `plan.modules`; auditoria quotas `max_*` | PLANO Onda 1; absorve LEVANTAMENTO 3.1/3.2 e B3/B4 (go-live original) | L | ⏳ pende "vai" |
| C4 | Onda 2 setup leve + tripulação: wizard S5 QR-first, pergunta revenda, galeria kit Lia+Vera, guardrails, evals 5-10 goldens/agente, gating `max_ai_agents` | PLANO Onda 2 | L | ⏳ pende "vai" |
| C5 | Onda 3 funil 2 demo: spike promoção demo→live, pool demo-tenants efêmeros, consentimento pré-scan, Home com véu, CTA→checkout (absorve V5 "demo que se vende sozinho") | PLANO Onda 3; LEVANTAMENTO 7.2 | L | ⏳ pende "vai" |
| C6 | F5 prova de fogo do funil completo (LP→WhatsApp→Duda→Bia→Cakto→pagamento-teste→org) | LEVANTAMENTO 2.1 | M | ✅ |
| C7 | Secrets `TELEGRAM_ALERT_BOT_TOKEN`/`CHAT_ID` (alerta C1 de falha de provisionamento — código pronto) | LEVANTAMENTO 2.2; go-live C1 | S | ⏳ ação Marcelo (~5min) |
| C8 | Atribuição Cakto: reconciliar slug `duda-sdr`×`duda` + 1 pagamento-teste + deploy workflow `wqkcbsgp4` (sem isso tudo cai em `sem_atribuicao`) | LEVANTAMENTO 2.3 | M | ✅ |
| C9 | Scoring determinístico `computeQcrScore()` (QCR PR÷217) | LEVANTAMENTO 2.4 (Top-8 #6) | M | ✅ |
| C10 | Transição-upgrade `[PASSAR_BIA]` + calibração do 35% com dado real | LEVANTAMENTO 2.5 | M | ✅ |
| C11 | Humanização (agrupamento/digitação) nas respostas dos agentes | LEVANTAMENTO 2.6 | S | ✅ |
| C12 | `founder_status` LEITURA no runtime (write provado; bifurca concierge×autopilot) | LEVANTAMENTO 2.7 (Top-8 #5) | S | ✅ |
| C13 | F3 CTA LP→`wa.me` com UTM + tracking 1st-party (verificar estado antes) | LEVANTAMENTO 2.8 | S | ✅ |
| C14 | Copy da LP: "15 vagas, 5/semana" contradiz 30/30/1 ratificado | LEVANTAMENTO 2.9 (Top-8 #4) | S | ✅ |
| C15 | Sync Cakto automático ao salvar plano (pedido 30/06) | LEVANTAMENTO 2.10 | S | ✅ |
| C16 | C4 watcher de queda de sessão WhatsApp (bot silencia sem avisar) | LEVANTAMENTO 3.5 | M | ✅ |
| C17 | C2/C3 painéis ativação/recuperado (parciais) | LEVANTAMENTO 3.6 | M | ✅ |
| C18 | LGPD do F6: base legal/consentimento no onboarding + DPA | LEVANTAMENTO 3.7 | S | ✅ (jurídico) |
| C19 | B8/Radar com matéria-prima — dependente de C3 (S2/S4); sem carteira roda a vazio no dia-0 | LEVANTAMENTO 3.4; go-live original | — | bloqueado por C3 |
| C20 | Arsenal §12 playbook-mestre: 33 itens `[ ]` (estado-do-contato, resgate checkout, handoffs, 10 testes aceitação, dashboard) + dedupe item-a-item com o que F2 já entregou | LEVANTAMENTO 8.1/8.2 | L | ✅ (dedupe primeiro) |
| C21 | Coortes piloto GTM: warm intros, ≥3 pagamentos reais, coortes 2-3, medição semanal, veredito semana 12 | LEVANTAMENTO 7.1 | — | ⏳ humano/Marcelo |
| C22 | Gaps CBA (7 de 9): Landings, NBA IA, Workflows, Squad, Materiais, Scoring standalone, tela Playbook | LEVANTAMENTO 7.3 | L | ⏳ Marcelo decidir quais valem |

## (D) Infra/UX geral

| # | Item | Evidência | Esf. | Status |
|---|---|---|---|---|
| D1 | Lux L4: 47 telas (P2=18 + P3=29) + limpeza rosa (16 arquivos) + TEMPLATE_v2 + rubric v2 | LEVANTAMENTO 5.1 (Top-8 #8); HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md | L | ✅ |
| D2 | Revisão adversarial Fable tela-a-tela L3+Rosé (nunca rodou — estava sem crédito) | LEVANTAMENTO 5.2 | M | ✅ |
| D3 | Eyeball U4 (re-skin do gestao) | LEVANTAMENTO 5.3 | — | ⏳ Marcelo |
| D4 | Migração domínio `gestao.nexvy.tech` + reskin neutro | LEVANTAMENTO 6.3 | M | ✅ |
| D5 | D1(b) Meta Cloud por produto + Utmify | LEVANTAMENTO 6.2 | M | ⏳ pende credenciais |
| D6 | Afiliados fases 2-5 (branch 224 commits stale): reimplementar sobre main ou descartar | LEVANTAMENTO 9.2/9.6 | L | ⏳ Marcelo |
| D7 | Telefonia Salvy (80%): mergear branch + secret + deploy | LEVANTAMENTO 9.3 | S | ⏳ Marcelo |
| D8 | PRECO: editar migrations `20260705_*` na fonte (re-provisionamento reintroduziria preço em texto nas personas) | LEVANTAMENTO 9.4 | S | ✅ |
| D9 | Higiene git: confirmar `stash@{0}` superseded por `cab7c7d` e dropar; push de `feat/beauty-lux-l4` (sem remoto, risco de perda) | LEVANTAMENTO 9.5/9.6 | S | ✅ |
| D10 | Limpeza stale: import morto de `EmBreve` (`platform-shell/registry.tsx:6`) + comentário stale linha 230 (todos os 36 itens já renderizam componentes reais) | FONTE 2 §Registry | S | ✅ |

---

**Resumo:** 43 itens (2 em execução, 9 bloqueados em Marcelo — sendo os de maior alavancagem: "vai" do plano Decolagem [C1/C3-C5], números velhos p/ G0b [C2], secrets Telegram [C7, 5min]). Fire-now técnico: B7 (migration `opportunity_scan_schedules`). Maiores blocos executáveis-já sem dependência: A1+A2 (setores+migrations inbox), B1-B5 (edges de paridade), C6/C8 (prova do funil + atribuição Cakto).