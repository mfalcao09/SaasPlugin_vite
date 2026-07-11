# P1.B — Lux L4 · WORKLIST de hardcodes (aplicação mecânica)

> **2026-07-11 · sessão `6cf2fc02`** · pareado com a rubric `TEMPLATE-UI-GESTAO_v2-2026-07-11.md`.
> **Escopo do grep:** `src/components/superadmin/**` (= host `gestao.*` / Lux). O tree `src/components/admin/**` é `app.*` (Beauty Rosé) e **NÃO entra** nesta varredura.
> **Fonte:** greps `pink-[0-9]` (29) · `blue-[0-9]` (61) · `rose-[0-9]` (14) · `#EC4899` (8) · `#0A52D1` (1, fora do escopo gestao) — rodados verbatim nesta sessão.
> **Objetivo:** um agente Sonnet aplica a coluna "→ ALVO" **cegamente** nas linhas marcadas `TROCAR`. As linhas `MANTER` estão listadas para o agente **NÃO tocar** e para a verificação de grep saber que são resíduo esperado.

---

## 0 · A ÚNICA decisão que precisa do olho do Marcelo (ler antes de aplicar)

**Balde "azul decorativo" (17 ocorrências, marcadas `azul-decorativo*` em §3.2).** São ícones de **KPI/seção** e um acento de valor que estavam `text-blue-500`/`text-blue-600` **sem carregar significado** (não é canal, não é temperatura, não é status). Ex.: `Target` no card "Volume de Deals", `FileText`/`Users`/`Clock`/`Layers` como ícones de cabeçalho, `Lightbulb` do resumo de IA, e os acentos coloridos dos KPIs "Novos" (azul) / "Por canal" (rosa).

- **Opção A (default da worklist): colapsar tudo para `text-primary`** → visual **monocromático navy/gold** coerente com a receita Lux (F3: ícone de KPI = `text-primary`). É o que a §3.2 assume.
- **Opção B: manter a paleta multi-hue "dashboard colorido"** (cada KPI/seção com sua cor). Nesse caso o balde §3.2 vira `MANTER` e só sobram as **2 blues de ação-pura** (§3.1) + os **15 rosa-legado** (§2) como troca obrigatória.

> ⚠️ **Efeito colateral da Opção A:** os KPI-cards do `SalesLeadsManager`/`SuperAdminDashboard` hoje misturam `text-primary` + `text-blue-500` + `text-amber-500` + `text-emerald-500` + `text-pink-500`. Colapsar só azul+rosa (deixando amber/emerald, que têm cobertura semântica warm/success) deixa a paleta **meio-limpa**. Se a intenção é dashboard monocromático, o `amber`/`emerald` decorativos (fora do escopo dos greps de marca) também deveriam cair — **isso é o que o Marcelo decide aqui**. As linhas amber/emerald **não** estão na worklist (não são hue de marca); só menciono para a decisão ser informada.

**Enquanto o Marcelo não decidir: aplicar §2 (rosa-legado) e §3.1 (2 blues de ação) — que são inequívocos — e segurar o balde §3.2.**

---

## 1 · Como aplicar (regras mecânicas)

1. Só editar linhas `TROCAR`. Nunca tocar `MANTER`.
2. Substituição é **classe-por-classe** na mesma linha, preservando modificadores de opacidade/estado (`/10`, `/20`, `dark:`, `hover:`) — só troca o hue:
   - `text-pink-500`/`text-blue-500` (ícone/acento) → `text-primary`
   - `bg-pink-500 text-white` → `bg-primary text-primary-foreground`
   - `bg-pink-100 text-pink-600` → `bg-primary/10 text-primary`
   - `bg-pink-500/10 ... text-pink-500 border-pink-500/20` (badge) → `bg-muted text-muted-foreground border-border` (badge neutro)
   - callout `bg-pink-500/10 border-pink-500/20` + `text-pink-700 dark:text-pink-300` → `bg-muted border-border` + `text-foreground` (sub → `text-muted-foreground`)
   - `text-blue-600 hover:text-blue-700` (botão) → `text-primary hover:text-primary/80`
3. Após aplicar: `npx tsc --noEmit -p tsconfig.app.json` verde + re-rodar os greps (§4 checklist da rubric) → pink-500/blue restantes devem bater exatamente as listas `MANTER` (§4–§7).
4. **`advanced` (bloco de formulário):** os 3 arquivos (Editor:60, Palette:25, Node:28) DEVEM ficar com o MESMO valor. Trocar `bg-pink-500` → `bg-violet-500` nos três (mantém a categoria distinta do `input: bg-blue-500`, sem hue de marca).

---

## 2 · TROCAR — rosa-legado (`pink-*`) · 15 ocorrências

| # | arquivo:linha | valor atual | → ALVO | categoria |
|---|---|---|---|---|
| 1 | `SuperAdminDashboard.tsx:164` | `text-pink-500` (CreditCard, KPI "Assinaturas") | `text-primary` | rosa-legado |
| 2 | `AuditLogs.tsx:38` | `bg-pink-500/10 text-pink-500 border-pink-500/20` (badge "E-mail") | `bg-muted text-muted-foreground border-border` | rosa-legado |
| 3 | `SalesLeadsManager.tsx:112` | `color: 'text-pink-500'` (KPI "Por canal") | `text-primary` | rosa-legado |
| 4 | `crm/products/tabs/BrainTab.tsx:89` | `color: 'text-pink-500'` (ícone de seção) | `text-primary` | rosa-legado |
| 5 | `crm/products/tabs/catalog/CatalogSync.tsx:29` | `text-pink-500` (RefreshCw) | `text-primary` | rosa-legado |
| 6 | `crm/products/tabs/chat/ChatTab.tsx:75` | `text-pink-500` (Bot icon) | `text-primary` | rosa-legado ⭐ mais visível |
| 7 | `crm/products/tabs/chat/ChatTab.tsx:97` | `bg-pink-100 text-pink-600` (avatar bolha bot) | `bg-primary/10 text-primary` | rosa-legado |
| 8 | `crm/products/tabs/chat/ChatTab.tsx:105` | `bg-pink-500 text-white` (bolha ativa) | `bg-primary text-primary-foreground` | rosa-legado |
| 9 | `crm/products/tabs/chat/ChatTab.tsx:114` | `bg-pink-500 text-white` (avatar bot) | `bg-primary text-primary-foreground` | rosa-legado |
| 10 | `crm/capture/form/PlatformCrmFormBlockEditor.tsx:1279` | `bg-pink-500/10 border border-pink-500/20` (callout) | `bg-muted border border-border` | rosa-legado |
| 11 | `crm/capture/form/PlatformCrmFormBlockEditor.tsx:1280` | `text-pink-700 dark:text-pink-300` (callout título) | `text-foreground` | rosa-legado |
| 12 | `crm/capture/form/PlatformCrmFormBlockEditor.tsx:1283` | `text-pink-600 dark:text-pink-400` (callout sub) | `text-muted-foreground` | rosa-legado |
| 13 | `crm/capture/form/PlatformCrmFormBlockEditor.tsx:60` | `advanced: 'bg-pink-500'` (cor da categoria) | `bg-violet-500` (sincronizar c/ 14,15) | rosa-legado (semi-semântico) |
| 14 | `crm/capture/form/PlatformCrmFormBlockPalette.tsx:25` | `advanced: 'bg-pink-500'` | `bg-violet-500` | rosa-legado (semi-semântico) |
| 15 | `crm/capture/form/PlatformCrmFormBlockNode.tsx:28` | `advanced: 'bg-pink-500'` | `bg-violet-500` | rosa-legado (semi-semântico) |

---

## 3 · TROCAR — azul (`blue-*`)

### 3.1 Azul de AÇÃO pura — troca inequívoca (2 ocorrências)

| # | arquivo:linha | valor atual | → ALVO | categoria |
|---|---|---|---|---|
| 16 | `crm/inbox/PlatformCrmQuickActionBar.tsx:87` | `text-blue-600 hover:text-blue-700` (Button "Catálogo") | `text-primary hover:text-primary/80` | azul-supersedido (ação) |
| 17 | `crm/commissions/PlatformCrmCommissionsManager.tsx:658` | `valueClassName="text-blue-600"` (valor "Comissões Aprovadas") | `text-primary` | azul-supersedido (valor/ação) |

### 3.2 Azul DECORATIVO — balde da decisão §0 (17 ocorrências; default=TROCAR→`text-primary`)

| # | arquivo:linha | valor atual | → ALVO (Opção A) | categoria |
|---|---|---|---|---|
| 18 | `crm/commissions/PlatformCrmCommissionsManager.tsx:657` | `text-blue-500` (CheckCircle, SummaryCard) | `text-primary` | azul-decorativo* |
| 19 | `SuperAdminDashboard.tsx:93` | `text-blue-500` (Target, KPI "Volume de Deals") | `text-primary` | azul-decorativo* |
| 20 | `BillingManager.tsx:140` | `text-blue-500` (FileText) | `text-primary` | azul-decorativo* |
| 21 | `OrganizationDetailPage.tsx:445` | `text-blue-500` (Users) | `text-primary` | azul-decorativo* |
| 22 | `UsersManager.tsx:108` | `text-blue-500` (Users) | `text-primary` | azul-decorativo* |
| 23 | `EmailSettings.tsx:237` | `text-blue-500` (Clock) | `text-primary` | azul-decorativo* |
| 24 | `crm/products/tabs/PlaybookTab.tsx:397` | `text-blue-500` (Layers) | `text-primary` | azul-decorativo* |
| 25 | `crm/products/tabs/BrainTab.tsx:253` | `text-blue-500` (FileText "Arquivos") | `text-primary` | azul-decorativo* |
| 26 | `crm/team/PlatformCrmTeamManager.tsx:292` | `text-blue-500` (User) | `text-primary` | azul-decorativo* |
| 27 | `crm/agenda/PlatformCrmAgendaManager.tsx:222` | `text-blue-500` (LayoutGrid) | `text-primary` | azul-decorativo* |
| 28 | `crm/agents/AgentToolsTab.tsx:67` | `text-blue-500` (GitBranch) | `text-primary` | azul-decorativo* |
| 29 | `crm/agents/AgentToolsTab.tsx:74` | `text-blue-500` (GitBranch) | `text-primary` | azul-decorativo* |
| 30 | `crm/agents/AgentToolsTab.tsx:81` | `text-blue-500` (Target) | `text-primary` | azul-decorativo* |
| 31 | `crm/agents/AgentToolsTab.tsx:96` | `text-blue-500` (Thermometer) | `text-primary` | azul-decorativo* (⚠ Thermometer≈temperatura; se manter semântica, vira MANTER) |
| 32 | `crm/inbox/PlatformCrmAISummaryTab.tsx:151` | `text-blue-500` (Lightbulb, resumo IA) | `text-primary` | azul-decorativo* |
| 33 | `SalesLeadsManager.tsx:109` | `color: 'text-blue-500'` (KPI "Novos") | `text-primary` | azul-decorativo* (KPI-rainbow) |
| 34 | `crm/capture/PlatformCrmCaptureAnalyticsTab.tsx:231` | `color="text-blue-500"` (acento de KPI) | `text-primary` | azul-decorativo* (KPI-rainbow) |

**Subtotal TROCAR = 34** (15 rosa + 2 azul-ação + 17 azul-decorativo).

---

## 3.3 · Extensão mono-total (amber/emerald/orange decorativos) — aplicada na L4.0

> Decisão §6.5 da rubric (MONO TOTAL ratificada). Catalogados e **TROCADOS** os acentos DECORATIVOS `amber/emerald/orange` que são **KPI-rainbow** (arrays de KPI onde a cor é enfeite por card — os mesmos arrays que continham os azuis do §3.2). Critério: cor codifica ESTADO/significado → MANTER; "cada card com uma cor" → TROCAR. **6 itens.**

| # | arquivo:linha | valor atual | → ALVO | categoria |
|---|---|---|---|---|
| B1 | `SalesLeadsManager.tsx:110` | `color: 'text-amber-500'` (KPI "Qualificados") | `text-primary` | amber decorativo (KPI-rainbow, mesmo array de #33/#3) |
| B2 | `SalesLeadsManager.tsx:111` | `color: 'text-emerald-500'` (KPI "Convertidos") | `text-primary` | emerald decorativo (KPI-rainbow, mesmo array de #33/#3) |
| B3 | `SuperAdminDashboard.tsx:76` | `text-emerald-500` (TrendingUp, KPI "ARR Total") | `text-primary` | emerald decorativo (KPI-rainbow, mesma grid de #19/#1) |
| B4 | `SuperAdminDashboard.tsx:130` | `text-orange-500` (Building2, KPI "Empresas") | `text-primary` | orange decorativo (KPI-rainbow, mesma grid de #19/#1) |
| B5 | `crm/capture/PlatformCrmCaptureAnalyticsTab.tsx:237` | `color="text-emerald-500"` (KPI "Conclusões") | `text-primary` | emerald decorativo (KPI-rainbow, mesmo array de #34) |
| B6 | `crm/capture/PlatformCrmCaptureAnalyticsTab.tsx:249` | `color="text-orange-500"` (KPI "Score médio") | `text-primary` | orange decorativo (KPI-rainbow, mesmo array de #34) |

**MANTER (semântico, NÃO tocado):** todos os demais amber/emerald/orange codificam estado — `--success`/`--warning` tokens, badges de status (Ativo/Em Atraso/Suspenso/Pendente/Confirmado), WhatsApp emerald, "IA atendendo"/online/não-lidas emerald, temperatura (Flame/Thermometer orange, `warm`), card "Saúde=Operacional" (SuperAdminDashboard:181/185/186), par Sucesso/Erros (AgentToolExecutionsPanel:58/61), mapas de categoria (BrainTab SOURCE_TYPES, FormBlock CATEGORY_COLORS `logic:orange`), auto-save/janela-24h/stale.

> ⚠️ **RESÍDUO rainbow fora do mandato a/e/o (decisão do Fable):** os KPI-cards mono-total deixaram irmãos decorativos em hues NÃO cobertos por esta extensão (o mandato L4.0 era `amber/emerald/orange`): `SuperAdminDashboard.tsx:110` (Users **violet**, "Leads na Plataforma") · `:147` (Users **cyan**, "Usuários") · `PlatformCrmCaptureAnalyticsTab.tsx:243` (TrendingUp **purple**, "Conversão"). São o MESMO padrão KPI-rainbow — pela §6.5 (mono total) também colapsariam para `text-primary`, mas ficaram FORA da troca cega por não serem amber/emerald/orange. **Sinalizado para ratificação do orquestrador** (troca trivial se aprovada).

---

## 4 · MANTER — pink Instagram (semântico, §1.3 rubric) · 14 · NÃO TOCAR

`crm/inbox/PlatformCrmChannelBadge.tsx:36` · `crm/inbox/PlatformCrmConversationList.tsx:111` (gradiente IG) · `crm/inbox/PlatformCrmConversationList.tsx:501` (filtro canal IG) · `crm/connections/PlatformCrmInstagramConnectionsPanel.tsx:17,47,66` · `crm/connections/PlatformCrmInstagramWizard.tsx:138,150,151` · `crm/connections/PlatformCrmNewConnectionDialog.tsx:75,76` · `crm/kanban/PlatformCrmKanbanLeadCard.tsx:77` · `crm/inbox-sections/ConversationMiniCard.tsx:41` · `crm/inbox-sections/reports/ChannelGrid.tsx:18`.

---

## 5 · MANTER — blue semântico · 42 · NÃO TOCAR

| Grupo | arquivo:linha |
|---|---|
| Canal (webchat/facebook) | `ChannelBadge.tsx:33` · `inbox-sections/reports/ChannelGrid.tsx:19` |
| Temperatura fria | `leads/PlatformCrmLeadDetail.tsx:428` · `inbox-sections/RadarActionsConfig.tsx:29` · `inbox/PlatformCrmLeadContextPanel.tsx:314` · `inbox-sections/FollowupActiveLeadsTable.tsx:69` |
| Status IA/bot | `inbox/PlatformCrmChatArea.tsx:519` |
| Canal e-mail (Mail) | `agenda/booking/notifications/PlatformCrmRemindersList.tsx:31,35` · `agenda/booking/notifications/PlatformCrmNotificationsAutomationTab.tsx:95` |
| Tipo notificação "system" | `notifications/PlatformCrmNotificationManager.tsx:29,117,118` · `notifications/PlatformCrmCreateNotificationDialog.tsx:34` |
| Cor de evento de agenda (DADO) | `agenda/PlatformCrmCalendarDayView.tsx:15,19` · `agenda/PlatformCrmCalendarWeekView.tsx:22,26` · `agenda/PlatformCrmCalendarMonthView.tsx:25` · `agenda/PlatformCrmEventModal.tsx:67` |
| Status de booking "agendado" | `agenda/booking/PlatformCrmBookingStatusBadge.tsx:23` |
| Badge de papel (seller/gestor/vendedor) | `team/PlatformCrmMemberCard.tsx:35` · `UsersManager.tsx:58` · `OrganizationDetailPage.tsx:255` |
| Badge de plano/tier | `SubscriptionsManager.tsx:87,99,119` · `OrganizationsManager.tsx:324` · `SuperAdminDashboard.tsx:26` · `BillingManager.tsx:84` |
| Tipo de log "Empresa" | `AuditLogs.tsx:30` |
| Meta WA (status IN_APPEAL + preview botão WA) | `connections/PlatformCrmMetaWhatsAppTemplatesPanel.tsx:30,136` |
| Paleta de categoria (bloco/quiz/objeção/brain/settings) | `capture/form/PlatformCrmFormBlockPalette.tsx:22` · `capture/form/PlatformCrmFormBlockEditor.tsx:57` · `capture/form/PlatformCrmFormBlockNode.tsx:25` · `capture/quiz/PlatformCrmQuizCategorizedPalette.tsx:45,46` · `products/tabs/ObjectionsTab.tsx:51` · `products/tabs/BrainTab.tsx:47` · `EmailSettings.tsx:29` |
| Badge de info | `capture/form/PlatformCrmFormSettings.tsx:217` |

> Nota incidental: `inbox/PlatformCrmConversationList.tsx:500` usa `bg-[#0866FF]` (azul-marca **Meta/Messenger**) — semântico de canal, **MANTER**.

---

## 6 · MANTER — rose semântico (negativo/categoria/mídia) · 14 · NÃO TOCAR

`capture/form/PlatformCrmFormLivePreview.tsx:440` (Não `red→rose`, preview) · `capture/quiz/PlatformCrmQuizBlockInspector.tsx:481,482` (Falso) · `capture/quiz/PlatformCrmQuizVisualCanvas.tsx:292,293,294` (Falso) · `capture/quiz/PlatformCrmQuizCategorizedPalette.tsx:102,103` (categoria accent) · `agenda/booking/PlatformCrmBookingStatusBadge.tsx:29,30` (Cancelado) · `agenda/booking/PlatformCrmBookingTimeline.tsx:93,104` (Falhou) · `inbox/PlatformCrmChatInput.tsx:708,709` (Camera/mídia — **⚠ único a dar eyeball:** rose acentua o botão de câmera do composer; não é canal nem estado; se destoar do Lux, promover a decisão à parte — mas **não é o rosa-marca `#EC4899`**, então fora do escopo mecânico).

---

## 7 · MANTER — `#EC4899` = dado de color-picker · 8 · NÃO TOCAR

`capture/form/platformFormThemePresets.ts:155,260` (⚠ **default** de tema de form — opcional reseed p/ token se quiser tirar rosa do default; baixa prio) · `sectors/PlatformCrmSectorFormDialog.tsx:37` · `products/hooks/useProductOnboarding.ts:103` (seed estágio) · `squads/PlatformCrmSquadsManager.tsx:34` (swatch "Rosa") · `tags/PlatformCrmTagsManager.tsx:44` · `kanban/PlatformCrmStageEditForm.tsx:38` · `agenda/booking/PlatformCrmEventTypeEditor.tsx:76`. Todos são **swatches selecionáveis / seeds** = dado do usuário.

---

## 8 · Fora do escopo gestao — `#0A52D1` residual (1) · decisão à parte

`src/config/brand.ts:94` → `accent: '#0A52D1', // nexvy-blue`. É o **único `#0A52D1` literal vivo** (o outro está só num comentário do `index.css`). Fica em config de marca do `app.*` (que hoje é Beauty Rosé, `primaryColor #C54B60`). **Não é tela do gestao** e o guard host-aware impede vazamento pro Lux — mas é azul-supersedido órfão. **Decisão do Marcelo (não-mecânica):** o `accent` do `app.*` deveria ser a família rosé (ex.: `#F2DFD5` do handoff Rosé), não azul. Deixado FORA da troca cega desta worklist.

---

## 9 · Placar

| Balde | Qtd | Ação |
|---|---|---|
| Rosa-legado (`pink-*`) | **15** | TROCAR → token |
| Azul de ação pura | **2** | TROCAR → `text-primary` |
| Azul decorativo (balde da decisão §0) | **17** | TROCAR→`text-primary` (default) OU MANTER (Opção B) |
| **Subtotal TROCAR** | **34** | (17 mínimo se Opção B: 15 rosa + 2 azul-ação) |
| Pink Instagram | 14 | MANTER (semântico) |
| Blue semântico | 42 | MANTER (semântico/dado) |
| Rose semântico | 14 | MANTER (negativo/categoria/mídia) |
| `#EC4899` picker | 8 | MANTER (dado) |
| **Subtotal MANTER** | **78** | |
| `#0A52D1` em `brand.ts` | 1 | decisão à parte (app.*, não-mecânico) |
| **TOTAL catalogado** | **113** | |
