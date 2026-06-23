# Mapeamento Segregado Definitivo — NexvyBeauty

> Consolidacao das 3 varreduras (Admin / Uso / Super-admin+Orfaos) sob a premissa de segregacao cravada pelo dono (Marcelo).
> Data: 2026-06-23 · Regra de ouro: "a cabeleireira usa isso pra ATENDER/VENDER/AGENDAR (=USO), pra CONFIGURAR/GERIR o salao (=ADMIN), ou e o operador da plataforma cobrando assinatura (=SUPER-ADMIN)?"

---

## 1. Resumo executivo (o erro atual)

O erro de IA do produto nao e apenas "uso misturado dentro do Admin" — e mais grave: **existem DOIS sistemas de USO paralelos e quase-duplicados**:

- **CRM** (`/crm`, `Index.tsx`): SellerInbox, LeadsKanban, SellerBookings, TaskCenter, AIChat, CadenceView, PlaybookView…
- **Admin** (`Admin.tsx`): InboxManager, KanbanBoard, LeadsManager, CalendarManager, AgentsManager, CampaignsManager…

Por isso as 3 varreduras classificaram os **mesmos conceitos** (inbox, pipeline, leads, captacao) de formas **opostas** conforme qual arquivo cada uma olhou. Ex.: `InboxManager` foi marcado `admin_salao` na varredura Uso e `uso` na varredura Super-admin.

Alem disso, o `Admin.tsx` hoje empacota numa **unica nav fixa** tanto USO diario (inbox, pipeline, leads, agenda, agentes, campanhas, cadencias, captura, radar) quanto ADMIN puro (team, products, sectors, company, plan, payments, integrations, webhooks, custom-fields, schedules).

**Solucao:** Cockpit de ~7 itens (USO, linguagem de salao) + um unico item **Admin** (Gestao/Configuracoes) + **Super-admin** isolado. Pre-requisito critico: **escolher 1 implementacao por funcao duplicada** antes de cravar o Cockpit, senao a nav nova entrega 2 portas pra mesma sala.

---

## 2. COCKPIT — nav da cabeleireira (USO, ~7 itens)

| # | Item (label leigo) | Agrupa (funcoes de USO) |
|---|---|---|
| 1 | **Inicio** / "Meu Dia" | OperationCenter, ModuleHub, /salao/Dashboard, ProductDashboard, Novidades, Ajuda |
| 2 | **Conversas** | InboxManager (WebChatInbox, AttendancePanel) + SellerInbox, Respostas Rapidas, Radar IA |
| 3 | **Clientes & Leads** / "Meus Clientes" | LeadsManager (KPIs, filtros, criar, importar, bulk, transferir), KanbanBoard/LeadsKanban, /salao/Clientes |
| 4 | **Captacao** / "Atrair Clientes" | Quiz, Formularios, ChatBot, Widget, WhatsApp, Templates, Resultados, Analytics, + paginas publicas (PublicSalaoBooking /s, PublicBooking /agendar, PublicForm /f, PublicChat /c, PublicQuiz /q, BookingConfirmation, Pacotes) |
| 5 | **Minha IA** | AgentsManager (operar/supervisionar), CampaignsManager, CadencesManager/CadenceView, AIChat (copiloto), AIKnowledgeManager |
| 6 | **Agenda** / "Minha Agenda" | /salao/Agenda, SellerBookings, CalendarManager (parte de operar), TaskCenter, Goals (acompanhar progresso) |
| 7 | **Dinheiro** / "Meu Faturamento" | FinancialPanel (minhas comissoes), ReportsManager (operacional), Playbook, Objections, Materials |

---

## 3. ADMIN DO SALAO — item unico, sub-agrupado

### 3.1 Gestao
| Funcao | Localizacao |
|---|---|
| Equipes | TeamManager (membros, papeis, permissoes, convites) |
| Squads | SquadManager, SquadDistributionConfig, SquadPerformanceCard |
| Setores | SectorsManager |
| Produtos | ProductListPage / ProductDetailPage |
| Servicos | /salao/Servicos |
| Profissionais | /salao/Profissionais |
| Financeiro do salao | FinancialDashboard, /salao/Financeiro (consolidado/DRE) |
| Comissoes | CommissionManager |
| Metas (setup) | GoalsManager |
| Materiais (estoque) | MaterialManager |
| Relatorios gerenciais | ReportsManager (escopo BI) |
| Pagamentos | CaktoAdminPanel, CaktoRecoveryPanel |
| Valor por estagio | StageValueManager |
| Atribuicao de leads | AssignmentManager |
| Estagios do pipeline | StageManagerDialog |

### 3.2 Configuracoes
| Funcao | Localizacao |
|---|---|
| Empresa | CompanySettings |
| Plano (visualizar) | PlanSelector |
| Horarios | BusinessHoursManager |
| Notificacoes | NotificationManager, AutoNotificationSettings |
| Campos personalizados | CustomFieldsManager |
| Etiquetas/Tags (criar) | TagsManager, TagAutomationsPanel |
| Conexoes | EvolutionInstancesPanel |
| Integracoes | IntegrationsManager (Email, ApiKeys, Hotmart, Sankhya, Doppus, MassEmail, AIRouting) |
| Webhooks | WebhooksManager |
| Brain Manager | guardrails/personalidade dos agentes |
| Conta | /configuracoes (senha, GCal, 2FA) |
| Perfil | /perfil |
| Install da org | Install.tsx (quando admin da org) |

### 3.3 Outros
Suporte (SupportTickets scope=admin), AcceptInvite, Login, ResetPassword, Unsubscribe (compliance email), AdminDashboard.tsx (resolver — possivel duplicata).

---

## 4. SUPER-ADMIN — so plataforma/assinatura

| Funcao | Localizacao |
|---|---|
| Dashboard de plataforma | SuperAdminDashboard (MRR/ARR/orgs) |
| Organizacoes | OrganizationsManager, OrganizationDetailPage |
| Usuarios globais | UsersManager |
| Planos comerciais | PlansManager |
| Assinaturas | SubscriptionsManager |
| Faturamento | BillingManager |
| Gateway pagamento | CaktoSuperAdminPanel |
| White-label | PlatformSettings |
| Email SaaS | EmailSettings |
| Saude do sistema | SystemHealth |
| Auditoria | AuditLogs |
| Leads comerciais (da plataforma) | SalesLeadsManager |
| Evolution global | EvolutionManager |
| Central de Ajuda (CRUD) | HelpManager |
| Releases | ReleasesManager |
| Qualidade IA | AIQualityPanel |
| Auditoria de agentes | AgentToolExecutionsPanel |
| Suporte aos saloes | SupportTickets scope=super_admin |
| SalesPage / Install / gestao.nexvybeauty | landing, bootstrap, contexto super-admin |

---

## 5. Ambiguos (fronteira) — com recomendacao

| Funcao | Tensao | Recomendacao |
|---|---|---|
| **Inbox duplicado** (SellerInbox vs InboxManager) | 2 telas pro mesmo fim | Escolher InboxManager como canonica; aposentar/rebaixar SellerInbox. **Decidir antes de cravar a nav.** |
| **Pipeline/Leads/Agenda duplicados** | 2-3 telas por conceito | 1 componente canonico por item; demais deprecated. Agenda=/salao/Agenda (simples) + CalendarManager (gerencial→Admin). |
| **Agentes IA** | operar=uso / editar=config | Cockpit mostra ativos+supervisao; editor pesado como sub-tela. Mesma tela, 2 profundidades. |
| **Relatorios** | operacional=uso / BI=admin | Filtrar por role; 2 pontos de entrada, mesma tela. |
| **Financeiro do salao** | meu faturamento=uso / DRE=admin | Split por escopo: "Meu Faturamento" no Cockpit, "Financeiro do Salao" no Admin. |
| **Plano** | ver=admin / cobrar=super-admin | Ver em Admin>Config; cobrar dispara Super-admin. Fora do Cockpit. |
| **Campanhas/Cadencias** | setup=config / disparo=uso | Cockpit>Minha IA (dono cravou IA como USO). |
| **Tags** | criar=config / aplicar=uso | Criar em Admin>Config; aplicar inline em Conversas/Clientes. |
| **Widget** | customizar=uso / deploy=tecnico | Cockpit>Captacao; embed e detalhe interno. |
| **Termos/Privacidade/NotFound** | legal/erro | Paginas de sistema, fora da taxonomia de nav. |

---

## 6. Orfaos / legado / morto (candidatos a remover ou esconder)

- `/oficina/*` — ERP de oficina legado (Dashboard, Clientes, Veiculos, Ordens, Orcamentos, Financeiro). Vertical morta fora do escopo NexvyBeauty.
- `/demo/salao` e `/demo/salao/*` — demo publico read-only com seed; mover pra marketing ou remover de producao.
- `/docs`, `/docs/:track`, `/docs/:track/:slug` — documentacao tecnica publica de status incerto; confirmar ou remover.
- `AdminDashboard.tsx` — sem tab ativo; provavel duplicata do OperationCenter; consolidar com Inicio ou deletar.
- Modulo "ERP Oficina" no ModuleHub — card de nav pra vertical morta; remover do hub.
- `SalesPage` (apex), `/termos`, `/privacidade` — paginas publicas de funil/legal; paginas de sistema, nao item de Cockpit/Admin.

---

## 7. Nota do Conselheiro (risco de Frankenstein)

O maior risco da segregacao NAO e a taxonomia (essa esta clara). E o **codigo duplicado**: inbox, pipeline, leads e agenda existem em 2-3 implementacoes cada (CRM-side vs Admin-side vs /salao). Se o Cockpit so "renomear o Admin", a cabeleireira tera 2 inboxes, 2 kanbans, 2 agendas — pior UX que hoje. **Pre-requisito inegociavel:** o dono escolhe 1 componente canonico por funcao duplicada ANTES de implementar a nova nav. Sem essa decisao, o Cockpit nasce Frankenstein.