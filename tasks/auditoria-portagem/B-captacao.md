# Auditoria B — Captação (fidelidade da portagem)

> Read-only. Gerado 2026-07-02. App: `apps/NexvyBeauty`.
> **NÃO** é certo-vs-errado — é fidelidade. Distingue *arquivos* de *features*.

---

## 0. A reviravolta que dissolve o "gap 72→10"

O enunciado ("original 72+21+8 → port 10") compara **duas coisas diferentes**. Há **dois universos de Captação** no mesmo repo:

| Universo | Path | Papel | Estado |
|---|---|---|---|
| **TENANT** (cabeleireira, `/admin` + cockpit) | `src/components/admin/capture/` (74) + `forms/` (19) + `flowbuilder/` (8) + webchat | motor visual completo | **cópia FIEL do original**, com +2 arquivos novos |
| **PLATAFORMA** (super_admin, `platform_crm_*`) | `src/components/superadmin/crm/capture/` (10) + hooks `data/usePlatformCrm*` + edges `platform-*` | projeção platform-side (MÁXIMA: tenant↔plataforma nunca funde) | CRUD real de dados; builders visuais = `TODO(edge)` |

**Prova de que o original NÃO foi perdido** (`diff` de árvore app real × `.vendus-src-reference`):
- `admin/capture/`: **72 arquivos idênticos** ao reference + 2 ADICIONADOS (`channels/FormTemplatesSection.tsx` 204L, `channels/WhatsAppTemplatesSection.tsx` 168L).
- `admin/flowbuilder/`: **8 idênticos**.
- `admin/forms/`: 19 (reference tem 21 → 2 arquivos *ausentes* no app real, ver §5).
- Consumido tenant-side por `src/cockpit/CaptacaoHub.tsx`, `QuizHub.tsx`, `FormsHub`, `WhatsAppHub`, `RelatoriosComercial.tsx` via `lazy(import('@/components/admin/capture/...'))`.

Logo o catálogo abaixo classifica cada arquivo do **original (reference)** contra **onde ele vive hoje**:
- **[1:1]** = existe idêntico em `src/components/admin/capture|forms|flowbuilder` (motor tenant preservado).
- **[PLATFORM_CRM]** = também tem uma projeção rasa/desacoplada no port dos 10 (platform-side).
- **[CONSOLIDADO]** = N subcomponentes originais colapsados em 1 arquivo do port.
- **[FALTA]** = builder visual profundo **não** reproduzido platform-side (fica só tenant-side).

O port dos 10 **não substitui** nada; **adiciona** o espelho platform-side. "10 vs 102" é maçã-vs-laranja.

---

## 1. Contagem de FEATURES (não arquivos)

O original de 102 arquivos encapsula **~9 features** (muitos arquivos = subcomponentes de 1 builder):

| # | Feature | Arquivos originais | Peso (linhas) |
|---|---|---|---|
| F1 | **Funis / FlowCanvas** (canvas visual base) | 8 (`FlowBlockNode`, `FlowCanvas`, `FlowConnections`, `FlowToolbar`, `FunnelBlockEditor`, `AutoSwitchConfig`, `AgentSwitchEditor`, `useFlowViewport`) | — |
| F2 | **Quiz** (builder + create + inspector) | 30 (`quiz/**`) | 5.036 |
| F3 | **ChatBot** | 8 (`chatbot/**`) | 1.419 |
| F4 | **WhatsApp** (flow builder de canal) | 7 (`whatsapp/**`) | 1.412 |
| F5 | **Widget** (bolha embed) | 8 (`widget/**`) | 1.431 |
| F6 | **Appearance** (tema/preview compartilhado) | 5 (`appearance/**`) | 1.293 |
| F7 | **Channels hub + Results/Analytics/Templates/Reports** | 9 (`channels/**`) | — |
| F8 | **Forms** (builder + design + responses) | 21 (`forms/**`) | 7.321 |
| F9 | **FlowBuilder** (genérico, usado por webchat/cadência) | 8 (`flowbuilder/**`) | 1.571 |
| +  | **SellerLeadForm** | 1 (`seller-form/`) | 254 |

**Port dos 10 (platform-side) cobre ~7 dessas 9 como CRUD + dados**, deixando os **builders visuais** (F1 canvas, F2/F3/F5 editores drag-drop) como `TODO(edge)`.

FEATURES: **original ≈ 9** · **port platform-side entrega ≈ 7 (rasas nos builders)** · **motor tenant preserva as 9 (1:1)**.

---

## 2. Catálogo — `capture/` (72 arquivos)

### 2a. Base de Funis / FlowCanvas (raiz, 9 arquivos incl. index)
| Arquivo original | Tag | Destino / razão |
|---|---|---|
| `AgentSwitchEditor.tsx` | `[1:1]` | idêntico em `admin/capture/`. Platform: parte do `openBuilder` não-portado. |
| `AutoSwitchConfig.tsx` | `[1:1]` | idem. |
| `FlowBlockNode.tsx` | `[1:1]` | idem (motor do canvas tenant). |
| `FlowBlockPalette.tsx` | `[1:1]` | idem. |
| `FlowCanvas.tsx` | `[1:1]` `[FALTA]`(platform) | vive tenant-side; platform `PlatformCrmCaptureFunnelsTab:136` = `TODO(edge): builder visual (FlowCanvas)`. |
| `FlowConnections.tsx` | `[1:1]` | idem. |
| `FlowToolbar.tsx` | `[1:1]` | idem. |
| `FunnelBlockEditor.tsx` | `[1:1]` `[FALTA]`(platform) | idem F1; editor de bloco não reproduzido platform-side. |
| `FunnelWebhookLogsTab.tsx` | `[1:1]` | idem. Platform usa `usePlatformCrmWebhooks` (aba própria, fora de Captação). |
| `useFlowViewport.ts` | `[1:1]` | hook do canvas, idêntico. |
| `index.ts` | `[1:1]` | barrel idêntico. |

### 2b. `appearance/` (5) — tema/preview compartilhado
| Arquivo | Tag | Razão |
|---|---|---|
| `AppearanceForm.tsx` | `[1:1]` | idêntico tenant. |
| `AppearanceLivePreview.tsx` | `[1:1]` | idem. |
| `FunnelAppearanceTab.tsx` | `[1:1]` `[FALTA]`(platform) | aparência do funil não existe platform-side (sem builder). |
| `ImageUploadField.tsx` | `[1:1]` | idem. |
| `PresetGallery.tsx` | `[1:1]` | idem. |

### 2c. `channels/` (9) — hub + seções → **CONSOLIDADO nos Tabs do port**
| Arquivo original | Tag | Destino no port |
|---|---|---|
| `FormsSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureFormsTab]` | tenant: `CaptacaoHub`/`FormsHub`. Platform: `PlatformCrmCaptureFormsTab` (CRUD raso). |
| `QuizSection.tsx` | `[1:1]` `[CONSOLIDADO→FunnelsTab(channel=quiz)]` | tenant: `QuizHub`. Platform: `PlatformCrmCaptureManager initialChannel='quiz'`. |
| `ChatBotSection.tsx` | `[1:1]` `[CONSOLIDADO→FunnelsTab(channel=chatbot)]` | tenant: `CaptacaoHub`. Platform: `initialChannel='chatbot'`. |
| `WidgetSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureWidgetsTab]` | tenant: `CaptacaoHub`. Platform: `WidgetsTab`. |
| `WhatsAppSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureWhatsAppTab]` | tenant: `WhatsAppHub`. Platform: `WhatsAppTab`. |
| `CaptureResultsSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureResultsTab]` | tenant: `CaptacaoHub` aba Resultados. Platform: `ResultsTab` (query real `platform_crm_leads`). |
| `CaptureAnalyticsSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureAnalyticsTab]` | tenant: `RelatoriosComercial`. Platform: `AnalyticsTab` (usa **recharts**). |
| `CaptureTemplatesSection.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureTemplatesTab]` | tenant: `QuizHub`. Platform: `TemplatesTab` (quiz+form templates do DB). |
| `CaptureReportsSection.tsx` | `[1:1]` `[MAPEADO→WebChatReportsTab]` | tenant: `RelatoriosComercial` importa `admin/webchat/WebChatReportsTab`. Sem par platform dedicado. |

### 2d. `quiz/` (30 arquivos) — maior feature (5.036L)
Todos **[1:1]** em `admin/capture/quiz/**` (builder, create, builder/inspector). Platform-side: apenas **leitura de templates** (`TemplatesTab` via `platform_crm_quiz_templates`) e **criação de funil quiz** (CRUD). O **builder visual inteiro** (`QuizBuilder`, `QuizVisualCanvas`, `QuizBlockInspector`, `builder/QuizLiveCanvas`, `create/QuizCreateWithAI`, etc.) → **[FALTA]** platform-side (`TODO(edge)`).
Arquivos: `QuizAppearanceTab, QuizBlockInspector, QuizBlockPalette, QuizBuilder, QuizCategorizedPalette, QuizFlowTab, QuizInlinePreview, QuizIntegrationsTab, QuizManager, QuizPreviewTab, QuizSettingsTab, QuizShareTab, QuizVisualCanvas` + `builder/{Inspector,QuizBuilderShell,QuizLiveCanvas,StepsSidebar,inspector/{AppearanceTab,DisplayTab,StepTab}}` + `create/{QuizCreateFromScratch,QuizCreateWithAI,QuizCreationLauncher,QuizTemplateLibrary}`. → **`[1:1]` (tenant) + `[FALTA]` (builder platform)**.

### 2e. `chatbot/` (8) — 1.419L
`ChatBotAppearanceTab, ChatBotBlockPalette, ChatBotBuilder, ChatBotFlowTab, ChatBotManager, ChatBotPreviewTab, ChatBotSettingsTab, ChatBotShareTab` → **`[1:1]`** (tenant) + **`[FALTA]`** (builder platform; platform trata chatbot como `channel_type` no FunnelsTab, sem editor).

### 2f. `whatsapp/` (7) — 1.412L
`WhatsAppBlockPalette, WhatsAppBuilder, WhatsAppConnectionTab, WhatsAppFlowTab, WhatsAppManager, WhatsAppPreviewTab, WhatsAppSettingsTab` → **`[1:1]`** (tenant). Platform: `PlatformCrmCaptureWhatsAppTab` porta **`WhatsAppSettingsTab` 1:1** (dialog de config), mas **abstrai o provider** (`ConnectionTab` removida — Evolution×Meta "em aberto") e **`WhatsAppBuilder` → `[FALTA]`** (`TODO(edge)`). Edges platform existem: `platform-evolution-proxy`, `platform-meta-whatsapp-*`, `platform-meta-whatsapp-templates-sync`.

### 2g. `widget/` (8) — 1.431L
`WidgetAppearanceTab, WidgetBlockPalette, WidgetBuilder, WidgetFlowTab, WidgetManager, WidgetPreviewTab, WidgetSettingsTab, WidgetShareTab` → **`[1:1]`** (tenant). Platform: `PlatformCrmCaptureWidgetsTab` (CRUD `platform_crm_webchat_widgets`), mas **snippet `<script>` de embed = `TODO(edge)`** (depende do loader público) e **`WidgetBuilder` → `[FALTA]`**. Edges: `platform-webchat-api/bot/inbox` existem.

---

## 3. Catálogo — `forms/` (21 arquivos, 7.321L)

| Arquivo original | Tag | Razão |
|---|---|---|
| `FormAIGenerator.tsx` | `[1:1]` `[FALTA]`(platform) | gerador IA de form; tenant-side só. |
| `FormBlockEditor.tsx` | `[1:1]` | idêntico tenant. |
| `FormBlockMedia.tsx` | `[1:1]` | idem. |
| `FormBlockNode.tsx` | `[1:1]` | idem. |
| `FormBlockPalette.tsx` | `[1:1]` | idem. |
| `FormBuilder.tsx` | `[1:1]` `[FALTA]`(platform) | `PlatformCrmCaptureFormsTab:142` = `TODO(edge): FormBuilder/FormCanvas`. |
| `FormCanvas.tsx` | `[1:1]` `[FALTA]`(platform) | idem. |
| `FormDesignPanel.tsx` | `[1:1]` | idem tenant. |
| `FormLivePreview.tsx` | `[1:1]` | idem. |
| `FormPreview.tsx` | `[1:1]` | idem. |
| `FormPublish.tsx` | `[1:1]` | idem. |
| `FormResponseDetail.tsx` | `[1:1]` | idem. |
| `FormResponses.tsx` | `[1:1]` `[FALTA]`(platform) | `FormsTab:152` = `TODO(edge): FormResponses`. Platform lê submissions em `ResultsTab` (agregado, sem detalhe). |
| `FormSettings.tsx` | `[1:1]` | idem tenant. |
| `FormThemePresetsSection.tsx` | `[1:1]` | idem. |
| `FormThemeWrapper.tsx` | `[1:1]` | idem. |
| `FormsManager.tsx` | `[1:1]` `[CONSOLIDADO→PlatformCrmCaptureFormsTab]` | manager tenant; platform vira CRUD raso. |
| `formThemePresets.ts` | `[1:1]` | dados de tema, idêntico. |
| `index.ts` | `[1:1]` | barrel. |
| `CustomFieldPicker.tsx` | `[FALTA]` (do app tenant) | **existe no reference, AUSENTE em `src/components/admin/forms/`**. Ver §5. |
| `OptionActionsEditor.tsx` | `[FALTA]` (do app tenant) | idem — ausente no app real. Ver §5. |

Platform-side: `usePlatformCrmForms` toca `platform_crm_forms` (+blocks/submissions/templates) → CRUD + templates OK; **builder e responses-detail = FALTA**.

---

## 4. Catálogo — `flowbuilder/` (8) e `seller-form/` (1)

| Arquivo | Tag | Razão |
|---|---|---|
| `flowbuilder/FlowBlockEditor.tsx` | `[1:1]` | 8/8 idênticos em `admin/flowbuilder/` (motor genérico p/ webchat/cadência). |
| `flowbuilder/FlowBlockNode.tsx` | `[1:1]` | idem. |
| `flowbuilder/FlowBlockPalette.tsx` | `[1:1]` | idem. |
| `flowbuilder/FlowBuilder.tsx` | `[1:1]` | idem. |
| `flowbuilder/FlowCanvas.tsx` | `[1:1]` | idem. |
| `flowbuilder/FlowListManager.tsx` | `[1:1]` | idem. |
| `flowbuilder/FlowTab.tsx` | `[1:1]` | idem. |
| `flowbuilder/index.ts` | `[1:1]` | idem. |
| `seller-form/SellerLeadFormManager.tsx` (254L) | `[1:1]` + `[PLATFORM_CRM→PlatformCrmSellerFormSection]` | **É a ÚNICA feature portada platform-side com paridade real e ampliada**: `PlatformCrmSellerFormSection` (404L, via `usePlatformCrmSellerFormConfig`). Menu `seller-form` no registry. |

Nota: `flowbuilder` (8) **não é feature de Captação em si** — é o motor de fluxo reusado por webchat/cadência. Contá-lo no "8" do enunciado infla o gap: platform-side ele reaparece como `platform-webchat-bot`/`platform-cadence-*` (edges), não como UI de Captação.

---

## 5. `[FALTA]` — gaps reais (sem justificativa de consolidação)

Dois tipos de FALTA. **Nenhum é perda do original** (o motor tenant está 1:1); são lacunas *platform-side* declaradas ou desvios de árvore:

### 5a. Builders visuais platform-side (TODO(edge) explícito no código)
Não são "faltas silenciosas" — são marcadas. Mas são funcionalidade real ausente do espelho platform:
1. **Funil — FlowCanvas/FunnelBlockEditor** — `PlatformCrmCaptureFunnelsTab.tsx:136`.
2. **WhatsApp — WhatsAppBuilder** — `PlatformCrmCaptureWhatsAppTab.tsx:145`.
3. **Form — FormBuilder/FormCanvas** — `PlatformCrmCaptureFormsTab.tsx:142`.
4. **Form — FormResponses (detalhe)** — `PlatformCrmCaptureFormsTab.tsx:152`.
5. **Widget — snippet `<script>` embed** — `PlatformCrmCaptureWidgetsTab.tsx:115` (depende do loader público).
6. **Quiz builder / QuizCreateWithAI / FormAIGenerator** — sem projeção platform (geração IA de quiz/form só tenant-side).

### 5b. Desvio de árvore no motor TENANT (o único gap que toca o original)
7. **`forms/CustomFieldPicker.tsx`** — existe no `.vendus-src-reference`, **ausente** em `src/components/admin/forms/`.
8. **`forms/OptionActionsEditor.tsx`** — idem, ausente no app real.
   → Precisa verificar se foram inlinados/renomeados ou se `FormBlockEditor` quebra sem eles. **Este é o achado que merece follow-up** (possível regressão tenant, não platform).

---

## 6. `[ADICIONADO]` — o que o port tem além do original

1. **`admin/capture/channels/FormTemplatesSection.tsx`** (204L) — novo no app real, sem par no reference.
2. **`admin/capture/channels/WhatsAppTemplatesSection.tsx`** (168L) — idem (templates WhatsApp aprovados, casado com `platform-meta-whatsapp-templates-sync`).
3. **Camada PLATFORM inteira** — 10 componentes `superadmin/crm/capture/` + ~5 hooks (`usePlatformCrmCaptureFunnels/Forms/Insights/Ops`, `usePlatformCrmQuizTemplates`, `usePlatformCrmWebchatWidgets`, `usePlatformCrmSellerFormConfig`) + edges `platform-webchat-*`, `platform-distribute-lead`, `platform-meta-whatsapp-*`, `platform-evolution-*`. **Isto não existia no original** (Vendus não tinha camada de plataforma) → é criação nova, não port.
4. **`AnalyticsTab` com recharts** e **`ResultsTab`** consultando `platform_crm_leads` diretamente — reescrita, não cópia.
5. **`PlatformCrmSellerFormSection`** (404L vs 254L original) — ampliado.

---

## 7. Veredito

**% da Captação ORIGINAL coberta:**
- **Motor tenant (o "original" de fato):** **~99%** — 72/72 capture + 8/8 flowbuilder + 19/21 forms + seller-form, todos 1:1. Único débito: 2 arquivos de forms (§5b).
- **Espelho platform-side (o "port dos 10"):** **~65%** em superfície de feature — cobre CRUD/dados/templates/results/analytics/seller-form/whatsapp-settings, mas **0% dos builders visuais** (canvas quiz/chatbot/widget/form/whatsapp) e 0% de geração-IA. Ponderado por peso (builders = ~60% das linhas do original), a cobertura *funcional* platform fica **~40%**.

**"10 vs 102" é falso gap:** 92 dos 102 arquivos continuam vivos e idênticos tenant-side. Os 10 são uma **camada nova** (platform), deliberadamente rasa nos builders (`TODO(edge)`, MÁXIMA tenant↔plataforma). Consolidação legítima (channels→tabs) explica parte; o resto é *scope* declarado, não perda.

### Top-3 para o Marcelo
1. **O gap numérico é ilusão de recorte.** O original NÃO foi portado para 10 — foi **preservado 1:1 em `src/components/admin/capture`** (tenant) e **espelhado parcialmente** em 10 componentes platform. Auditar "72→10" mede a camada errada.
2. **A dívida real platform-side são os 6 builders visuais** (`TODO(edge)` em Funnels/Forms/Widget/WhatsApp + Quiz/Form AI). Super_admin hoje **cria/lista/analisa** funis-quiz-form-widget, mas **não edita o fluxo visual** deles. Decisão de produto: precisa? Ou platform só orquestra e o tenant desenha?
3. **Regressão candidata (não-platform):** `forms/CustomFieldPicker.tsx` e `forms/OptionActionsEditor.tsx` sumiram do app tenant (existem só no reference). Confirmar se `FormBlockEditor`/`OptionActions` ainda funcionam — este é o único ponto onde algo do original pode ter **quebrado**, e passa despercebido porque não está na camada platform que todos olham.
