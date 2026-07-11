# P1.B — Lux L4: Mapa de Execução (inventário real + ondas + feature-audit)

> **2026-07-11 · sessão `6cf2fc02`** · escopo P1.B da governança de frentes (Lux L4, NexvyBeauty).
> **READ-ONLY em código** — este doc é a única escrita desta fase. O `.html` pareado vem na entrega final da frente.
> **Fontes lidas:** `HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md` · `PLANO-REDESIGN-LUX-GESTAO-2026-07-06.md` · `TEMPLATE-UI-GESTAO-2026-07-05.md` · `DELTA-PORTABILIDADE-100-2026-07-11.md` · `HANDOFF-REESTRUTURACAO-NEXVYBEAUTY-2026-07-06.md` · `DRIFT-SCAN-WORKLIST-2026-07-09.md` · registry (`registry.tsx`) · `index.css` · clone `oficial-vendus-v5`.

---

## 0 · Diretriz do Marcelo (âncora do escopo, verbatim)

> "O padrão é manter a identidade que criamos, tanto para gestao.* quanto para app.*. Isso deve ser preservado como estrutura visual. Agora as 47 telas que tínhamos, era uma preocupação **não somente visual, era de features, diferenças de produtos que 'tinha x não tinha'**. É mais abrangente do que apenas ajustes visuais."

**Leitura operacional:** o L4 não é só "trocar rosa por navy". É, por tela: (1) **identidade visual** = conformar à anatomia da família Lux (fonte-verdade = `lux-reference` + `index.css`, NÃO o azul do template v1); (2) **features** = auditar o que a tela **deveria ter e não tem** vs canônico `oficial-vendus-v5`, cruzando com a auditoria DELTA — e quando o gap já é de um pacote do plano-mestre, **vincular, não duplicar**.

---

## 1 · Verdade desconfortável primeiro (o que os docs erram)

**[Certo] As 47 telas pendentes NÃO estão "rosa chapado".** A arquitetura de tema é 100% por token: `:root.theme-nexvy-institucional` injeta `--primary: navy #213156` (claro) / `gold #dba341` (dark) no `<html>` do host `gestao.*`. **273 de 323** arquivos `.tsx` do superadmin já são token-only → **já renderizam navy automaticamente**, sem tocar 1 linha. Só **50 arquivos** carregam cor de marca hardcoded (pink/blue). Portanto o L4 visual real = (a) limpar esses 50 e (b) calibrar a **anatomia** das famílias — não "despintar rosa" de 47 telas.

**[Certo] O número "16 arquivos com rosa" está subdimensionado E mal-classificado.**
- `text-pink-*` aparece em **17 arquivos** (não 16); `#EC4899` em **7**. Mas ~metade do pink é **semântico legítimo** (canal Instagram = `bg-pink-500`, permitido pela rubric §1.3) e os `#EC4899` são **defaults de color-picker** (cor de tag/setor/estágio — dado do usuário, não vazamento de marca). **Rosa-legado real ≈ 7-8 arquivos** (§4).
- O resíduo **AZUL** é MAIOR e foi omitido dos docs: **42 arquivos** com `blue-*` hardcoded (§4.2). O template v1 prega `primary` no lugar de `blue-600` para ação — mas 42 telas ainda têm azul literal (parte semântico, parte drift real).

**[Certo] A rubric/template atual (`TEMPLATE-UI-GESTAO-2026-07-05`) ancora no AZUL SUPERSEDIDO.** §1.1 linha 19: `--primary/--accent/--ring | 218 91% 43% (#0A52D1) — azul Nexvy`. O `#0A52D1` foi **supersedido pelo Lux navy #213156** (HANDOFF-LUX-ROSE D1; DRIFT-SCAN L301 marca o doc como "candidato a ⚰️"). **Usar o template v1 como rubric no L4 = perpetuar o erro.** A **rubric v2** (§5) é pré-requisito da 1ª onda.

**[Certo] Os 27 commits desde o baseline `5e0e36c` NÃO fizeram o L4 visual.** Foram porte de features DELTA (inbox A1-A1.5, Meta Commerce, Tarefas, Mia por telefone, IG outbound, catálogo checkout, P0 mentira-silenciosa). O L4 de calibração de anatomia **segue integralmente pendente**. O que mudou: as telas de inbox ganharam qualidade de anatomia no porte fiel; e nasceu 1 tela nova (`v-tarefas`) fora da contagem original das 47.

---

## 2 · Inventário REAL das telas pendentes

Registry atual = **55 itens** (20 ERP + 35 Vendas). Era 54 no template v1; **`v-tarefas` foi adicionado** pós-baseline (commit `3135374`).

### 2.1 JÁ FEITAS (ondas L1-L3 — fora do L4)

| Tela | Família | Prova | Fonte |
|---|---|---|---|
| v-chat (Chat) | F1 | 86/100 exemplar calibrado | inbox `crm/inbox/*` |
| v-pipeline (Pipeline) | F2 | L2 no ar (bundle DcPLkMzY) | `crm/kanban/*` |
| v-leads (Leads) | F5 | L3 no ar, computed==REF | `crm/leads/*` |
| v-painel (Painel) | F3 | L3 no ar | `crm/inbox-sections/PlatformCrmInboxPanel` |
| v-radar-ia (Radar IA) | F3 | L3 no ar | `crm/inbox-sections/PlatformCrmInboxRadar` |
| v-follow-up (Follow-Up) | F5 | L3 no ar | `crm/inbox-sections/PlatformCrmInboxFollowup` |
| v-dashboard / v-operacao (Dashboard) | F3 | L3 no ar (mesmo componente `OperationCenter`) | `crm/operation/*` |

**7 itens feitos** (v-dashboard=v-operacao = 1 componente). Restante = **47 telas** (confirma o número do Marcelo) **+ v-tarefas (48ª, nova)**.

### 2.2 PENDENTES — as 47 (+1) por família e prioridade

> **Estado visual** — legenda: `HERDA` = token-only, já renderiza navy, falta só calibrar anatomia · `DRIFT-AZUL` = tem `blue-*` hardcoded a limpar · `DRIFT-ROSA` = rosa-legado real (§4) · Toda tela precisa da receita da família; marco só os desvios.

#### F3 — Dashboard / KPIs

| Tela (id) | Prio | Estado visual | Feature-gap vs V5 → vínculo |
|---|---|---|---|
| dashboard (Dashboard Plataforma) | P2 | HERDA + DRIFT-AZUL (`SuperAdminDashboard.tsx`) + DRIFT-ROSA (l.164) | — |
| ai-quality (Qualidade IA) | P2 | HERDA | — |
| health (Saúde) | P2 | HERDA | — |
| payments (Pagamentos Cakto) | P2 | HERDA | atribuição Cakto pende 1-pgto-teste → **PLANO-MESTRE** (não é L4) |
| v-relatorios (Relatórios) | P2 | HERDA | — |
| v-analytics (Analytics) | P3 | HERDA | **Dashboard de Jornada** (`lib/leadJourney`, 10 comps `journey/`) NÃO portado → **DELTA 🅲 / PLANO-MESTRE P2** |
| v-financeiro (Financeiro) | P2 | HERDA + DRIFT-AZUL (`PlatformCrmCommissionsManager`) | summaries comissões/metas re-expor → **DELTA 🅵** |

#### F5 — Tabela de gestão

| Tela (id) | Prio | Estado visual | Feature-gap vs V5 → vínculo |
|---|---|---|---|
| organizations (Empresas) | P2 | HERDA + DRIFT-AZUL | drill-down de org no-op (TEMPLATE L261 — verificar) |
| users (Usuários) | P2 | HERDA + DRIFT-AZUL | — |
| subscriptions (Assinaturas) | P2 | HERDA + DRIFT-AZUL | — |
| billing (Faturamento) | P2 | HERDA + DRIFT-AZUL | — |
| sales-payments (Pagamentos Vendas) | P3 | HERDA + DRIFT-AZUL (`SalesLeadsManager`) + DRIFT-ROSA (l.112) | — |
| audit (Logs) | P3 | HERDA + DRIFT-AZUL + DRIFT-ROSA (`AuditLogs.tsx:38`) | `font-mono` p/ payloads (template §279) |
| agent-tools (Ações dos Agentes) | P3 | HERDA + DRIFT-AZUL (`AgentToolsTab`) | `transfer_sector` religar (setor product-scoped) → **PLANO-MESTRE** |
| releases (Atualizações) | P3 | HERDA | — |
| affiliates (Afiliados) | P3 | HERDA | ⚠️ **never-touch-alone** (sessão conjunta obrigatória) |
| v-negocios (Negócios/Produtos) | P2 | HERDA + DRIFT-ROSA (hub tabs, ver 2.3) | **hub de conteúdo product-scoped inerte** → **DELTA 🅱 / PLANO-MESTRE P1** (o maior bloco) |
| v-setores (Setores) | P3 | HERDA (`#EC4899` = picker) | tabela setores product-scoped → **PLANO-MESTRE** |
| v-equipes (Equipes) | P3 | HERDA | gamificação metas (leaderboard/badges) → **DELTA 🅵** |
| v-templates (Templates) | P3 | HERDA | — |
| v-resultados (Resultados) | P3 | HERDA | — |
| v-respostas (Respostas Rápidas) | P2 | HERDA | — |
| v-campos (Campos personalizados) | P3 | HERDA | — |
| v-etiquetas (Etiquetas) | P3 | HERDA (`#EC4899` = picker) | — |
| v-webhooks (Webhooks) | P3 | HERDA | — |
| v-campanhas (Campanhas) | P2 | HERDA | AICampaignAssistant → **DELTA 🅵** |

#### F4 — Editor / Wizard

| Tela (id) | Prio | Estado visual | Feature-gap vs V5 → vínculo |
|---|---|---|---|
| v-agentes-ia (Agentes IA) | P2 | HERDA + DRIFT-AZUL (`AgentToolsTab`) | gerar-agente-com-IA + treino → **DELTA 🅱** |
| v-cadencias (Cadências) | P2 | HERDA | `ContextLibrary.tsx` JÁ existe; editor rico no hub = stub → **DELTA 🅶** |
| v-quiz (Quiz) | P3 | HERDA | — |
| v-formularios (Formulários) | P3 | HERDA + DRIFT-ROSA (`FormBlockEditor` l.1279 callout + `advanced` category) | — |
| v-form-vendedores (Form Vendedores) | P3 | HERDA | — |
| v-chatbot (ChatBot) | P3 | HERDA | — |
| v-widget (Widget) | P3 | HERDA | — |
| help (Central de Ajuda) | P3 | HERDA | — |

#### F6 — Configurações

| Tela (id) | Prio | Estado visual | Feature-gap vs V5 → vínculo |
|---|---|---|---|
| v-conexoes (Conexões) | P2 | HERDA + pink-semântico (IG connections — KEEP) | `instagram-send` (sender DM real) → **DELTA 🅴 / PLANO-MESTRE P3** |
| whatsapp (WhatsApp/Evolution) | P2 | HERDA | segredos mascarados (checar §F6) |
| integrations (Integrações) | P3 | HERDA | Google Calendar connect → **DELTA 🅵** |
| branding (Identidade Visual) | P3 | HERDA (color-pickers = dado) | — |
| email (E-mail) | P3 | HERDA + DRIFT-AZUL | — |
| v-whatsapp (WhatsApp captação) | P3 | HERDA | — |
| v-notificacoes (Notificações) | P3 | HERDA + DRIFT-AZUL (`NotificationManager`) | — |
| v-horarios (Horários) | P3 | HERDA | — |

#### F1 — Lista + Detalhe (variantes)

| Tela (id) | Prio | Estado visual | Feature-gap vs V5 → vínculo |
|---|---|---|---|
| v-mia (Mia) | P2 | HERDA (porte recente, boa anatomia) | Mia por telefone JÁ feita (commit `f2b88d0`) |
| v-agenda (Agenda) | P2 | HERDA + DRIFT-AZUL (calendar views) | Google Calendar connect → **DELTA 🅵** |
| support (Suporte) | P2 | HERDA | — |
| **v-tarefas (Tarefas)** ⭐novo | P2 | HERDA (porte TaskCenter V5, commit `3135374`) | nasceu fora das 47 — auditar anatomia F5/F1 |

### 2.3 Nota crítica — `v-negocios` é um HUB, não 1 tela

`v-negocios` (P2, 1 item no registry) expande num hub de **~13 abas** (`crm/products/tabs/*`): Brain, Materials, Objections, PostSale, Playbook, Catalog(Manager/Sync/Importer/Editor), Chat, Agents, Cadence, Dashboard, Reports, Settings, Squad, Kanban, PricingPlans. **Aqui visual (L4) e feature (DELTA 🅱) se sobrepõem ao máximo:** a UI está portada 1:1 mas o backend é stub (`useProductHubStubs.ts` → `toast.info` + query `[]`, confirmado). **No L4, tratar SÓ o visual dessas abas** (calibrar anatomia + limpar `ChatTab`/`BrainTab`/`CatalogSync` rosa); o **backend product-scoped é DELTA 🅱 / PLANO-MESTRE P1 — vincular, não construir aqui.**

---

## 3 · Plano de ondas executável

**Princípio (template §298):** a 1ª tela de cada família roda o **loop GAN completo** (rubric v2, máx 4 iterações); as demais propagam a receita já calibrada. Ordem = famílias primeiro (reuso de receita), prioridade dentro.

| Onda | Escopo (famílias/telas) | Nº | Check binário |
|---|---|---|---|
| **L4.0 — Rubric v2 + cleanup** | Escrever `TEMPLATE-UI-GESTAO_v2` (rubric ancorada em Lux navy/gold, §5) + varrer os ~8 arquivos rosa-legado (§4.1) + triar 42 arquivos azuis (§4.2: separar semântico de drift, corrigir drift) | ~50 arq | `grep` de `pink-500` no gestao = só canais IG · `blue-*` restante = só semântico (status/info) · `tsc` verde |
| **L4.1 — F3 Dashboards** | dashboard, ai-quality, health, v-relatorios, v-analytics, v-financeiro, payments (v-operacao=dashboard) | 7 | 1ª (dashboard) GAN≥85 rubric v2 · demais herdam · computed navy no ar |
| **L4.2 — F5 Tabelas (ERP core)** | organizations, users, subscriptions, billing, sales-payments, audit, releases, agent-tools | 8 | GAN≥85 na 1ª F5 · `DropdownMenu` por linha · identidade §3.3 · skeleton anatômico |
| **L4.3 — F5 Tabelas (Vendas gestão)** | v-negocios(list), v-setores, v-equipes, v-templates, v-resultados, v-respostas, v-campos, v-etiquetas, v-webhooks, v-campanhas(list) | 10 | propaga receita F5 · zero hex marca · abas hub Negócios só-visual |
| **L4.4 — F4 Editors/Wizards** | v-agentes-ia, v-cadencias, v-quiz, v-formularios, v-form-vendedores, v-chatbot, v-widget, help | 8 | 1ª F4 GAN≥85 · footer sticky · stepper · dirty-state · FormBlockEditor rosa limpo |
| **L4.5 — F6 Configurações** | v-conexoes, whatsapp, integrations, branding, email, v-whatsapp, v-notificacoes, v-horarios | 8 | 1ª F6 GAN≥85 · segredos mascarados · zona de perigo · IG pink mantido (semântico) |
| **L4.6 — F1 variantes + fecho** | v-mia, v-agenda, support, v-tarefas + auditoria anatômica das abas do hub Negócios | 4 + hub | GAN≥85 · Sheet mobile · `affiliates` em sessão CONJUNTA à parte |

**Total: 45 itens-tela + hub Negócios (13 abas visual) + affiliates (conjunta) ≈ 47-48.** Cada onda ≤10-12 (respeita D6 teto paralelismo). 1 workflow por vez (D6).

**Estimativa (só-visual L4):** ~1 dia por onda com paralelismo Opus (1 braço/tela na onda + revisão adversarial) = **~6-7 dias** para o visual puro. **As features vinculadas (DELTA 🅱🅲🅴🅵🅶) NÃO entram nesse número** — são ~26-31 dev-days do PLANO-MESTRE, frente separada.

**Corte visual-puro vs feature:** das 47, **~40 são visual-puro** (HERDA + calibração de anatomia + limpeza hardcode); **~7 carregam feature-gap** que **já pertence ao PLANO-MESTRE** (v-analytics/Jornada 🅲, v-negocios/hub 🅱, v-conexoes/IG-send 🅴, v-financeiro+v-equipes+v-campanhas+integrations 🅵, v-cadencias 🅶). **No L4 essas 7 recebem só o tratamento visual; a feature fica linkada.**

---

## 4 · O "lixo rosa" (e o azul omitido)

### 4.1 Rosa-legado REAL (corrigir no L4.0 → `bg-primary`/token ou semântico)

| # | Arquivo:linha | Uso | Ação |
|---|---|---|---|
| 1 | `crm/products/tabs/chat/ChatTab.tsx:75,97,105,114` | Bot icon + bolhas `bg-pink-500`/`bg-pink-100`/`text-pink-600` (chat de teste IA) | → `bg-primary`/`text-primary` — **o mais visível** |
| 2 | `superadmin/AuditLogs.tsx:38` | badge E-mail `bg-pink-500/10 text-pink-500` | → token neutro/semântico |
| 3 | `superadmin/SuperAdminDashboard.tsx:164` | ícone CreditCard `text-pink-500` | → `text-primary`/token |
| 4 | `superadmin/SalesLeadsManager.tsx:112` | KPI "Por canal" `color:'text-pink-500'` | → token |
| 5 | `crm/products/tabs/BrainTab.tsx:89` | `color:'text-pink-500'` (ícone seção) | → token |
| 6 | `crm/products/tabs/catalog/CatalogSync.tsx:29` | RefreshCw `text-pink-500` | → token |
| 7 | `crm/capture/form/PlatformCrmFormBlockEditor.tsx:1279-1283` | callout info em pink | → token/`muted` |
| 8 | `FormBlockEditor/Node/Palette` (`advanced:'bg-pink-500'`) | cor da categoria "advanced" da paleta de blocos | semi-semântico — remapear p/ token de categoria (baixa prio) |

### 4.2 KEEP — pink SEMÂNTICO (Instagram, permitido rubric §1.3 — NÃO tocar)

`PlatformCrmChannelBadge` · `PlatformCrmConversationList` · `ConversationMiniCard` · `reports/ChannelGrid` · `kanban/PlatformCrmKanbanLeadCard` · `connections/PlatformCrmInstagramConnectionsPanel` · `PlatformCrmInstagramWizard` · `PlatformCrmNewConnectionDialog`.

### 4.3 `#EC4899` = defaults de color-picker (DADO, não marca — baixa prio, opcional reseed)

`platformFormThemePresets.ts` · `hooks/useProductOnboarding.ts` · `tags/PlatformCrmTagsManager` · `sectors/PlatformCrmSectorFormDialog` · `kanban/PlatformCrmStageEditForm` · `agenda/booking/PlatformCrmEventTypeEditor` · `squads/PlatformCrmSquadsManager`. São swatches selecionáveis pelo usuário — só reseedar o **default** se estiver como cor inicial de marca.

### 4.4 AZUL residual — 42 arquivos (omitido dos docs, MAIOR que o rosa)

Triagem obrigatória no L4.0: separar **semântico** (status dot IA/bot `bg-blue-500` §1.3, info states, cor de evento de calendário = dado) do **drift real** (`text-blue-600` para ação/link → deve ser `primary`). Arquivos com mais suspeita de drift-ação: `SubscriptionsManager`, `BillingManager`, `UsersManager`, `OrganizationsManager`, `EmailSettings`, `PlatformCrmCommissionsManager`, `capture/form/PlatformCrmFormBlockPalette/Editor/Settings`, `products/tabs/ObjectionsTab`, `products/tabs/PlaybookTab`. Agenda/calendar (`CalendarMonth/Week/Day`, `EventModal`) = provável cor-de-evento (dado, keep).

---

## 5 · Rubric v2 necessária (pré-requisito do L4.0)

O `TEMPLATE-UI-GESTAO-2026-07-05` é **canonicamente bom em estrutura** (famílias F1-F6, §2 receitas, §3 transversais, §4 processo GAN, §5 mapa de telas) — **preservar tudo isso**. O que muda no `_v2`:

1. **§1.1 Paleta efetiva → RE-ANCORAR no Lux.** Trocar `--primary/--accent/--ring 218 91% 43% (#0A52D1) azul` por **navy `221.8 44.7% 23.4%` (#213156)** no claro e **gold `38.1 68% 55.7%` (#dba341)** no dark (valores verbatim de `index.css:278,383`). Idem `--gradient-primary` (azul→cyan) → gradiente navy/gold do `lux-reference`.
2. **§1.2 Proibições → adicionar:** "azul institucional `#0A52D1`/`blue-*` para ação = SUPERSEDIDO, reprova" (hoje o doc AINDA prescreve azul como primary — contradição a corrigir).
3. **§1.3 Cores de significado → manter** (Instagram pink, temperatura). **Exceção:** "Status IA/bot ativo = dot `bg-blue-500`" pode conflitar com o gold-dark; validar contraste ou trocar por token.
4. **§1.4 Tipografia → Lux usa stack Apple (SF Pro)** dentro de `.theme-nexvy-institucional` (não Inter). O template v1 diz "Inter única" — isso vale p/ `app.*`, não p/ gestao Lux. Corrigir.
5. **§4 Checklist binário → trocar** "grep sem hex de MARCA" para incluir **pink-legado (§4.1) E blue-ação (§4.4)**; e "computed navy #213156" no lugar de qualquer referência azul.
6. **§5 Mapa → atualizar p/ 55 itens** (add `v-tarefas`) e marcar os 7 P1 como ✅ referência-viva.

**Nome/versão:** `TEMPLATE-UI-GESTAO_v2` (Smart Versioning) — `.md` + `.html` pareados na entrega.

---

## 6 · Vínculos com o plano-mestre (não duplicar)

| Feature-gap detectado no L4 | Pertence a | Ação no L4 |
|---|---|---|
| Hub Negócios backend inerte (8 tabelas `platform_crm_*` + edges twin) | DELTA 🅱 / PLANO-MESTRE P1 (~11-12d) | só visual das abas |
| Dashboard de Jornada (`lib/leadJourney` + 10 comps) | DELTA 🅲 / PLANO-MESTRE P2 (~2-3d) | só visual de v-analytics/v-relatorios |
| `instagram-send` (sender DM) | DELTA 🅴 / PLANO-MESTRE P3 | só visual de v-conexoes |
| Re-exposição (comissões, gamificação, GCal, AICampaign) | DELTA 🅵 (~1.5-2d) | só visual de v-financeiro/v-equipes/v-agenda/v-campanhas |
| Cadência (contextos + editor rico no hub) | DELTA 🅶 (~2-3d) | `ContextLibrary` já existe; só visual |
| `transfer_sector` + setor product-scoped | DECISÃO Marcelo 07-09 (construir) | só visual de v-setores/agent-tools |

---

## 7 · Ressalvas de método (honestidade)

- **[Provável]** "HERDA = já navy" é inferência da arquitetura de token (confirmada: 273/323 token-only + `index.css` com navy live em `:278`/gold `:383`), **não** verificação computed-style tela-a-tela no browser. A prova final de cada onda exige o computed==REF do roteiro padrão (HANDOFF §7).
- **[Certo]** Contagem de hardcode por `grep` de classes Tailwind estáticas — não pega cor montada dinamicamente em runtime (ex.: `stage.color` do banco, que é dado legítimo). Os `#EC4899` de picker são justamente esse caso.
- **[Palpite]** Estimativa ~6-7 dias visual-puro assume paralelismo Opus 1-braço/tela e que F3/F5/F6 propagam limpo após a 1ª calibração — risco: se a receita divergir do Lovable numa família nova, roda GAN completo (até 4 iter) e atualiza o `_v2` (não forka por tela, template §298).
- **Não fiz** revisão adversarial visual (Fable sem crédito = dívida herdada do HANDOFF §9) — este doc é só o mapa; a calibração e a prova são a execução da frente.
</content>
