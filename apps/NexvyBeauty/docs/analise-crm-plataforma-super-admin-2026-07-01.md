# CRM da Plataforma no Super-Admin — Validação (reimport × reuso) + Plano

**Data:** 2026-07-01 · **Contexto:** o super-admin do NexvyBeauty (a plataforma enquanto SaaS) precisa de um CRM para gerir a venda dos tenants (prospectar salão → converter assinante). Marcelo levantou a teoria: **reimportar** o CRM original (`mfalcao09/novo-remix-vendus-v4`, origem do fork), porque o fork teria "salon-izado muito" o CRM, enquanto o original foi pensado como CRM de venda de SaaS. Este documento valida a teoria **com base no código** (4 subagentes de inspeção + diff direto).

---

## 1. Veredito (leia primeiro)

| Afirmação da teoria | Status | Base |
|---|---|---|
| **(A)** O original é um CRM de venda de **SaaS** | ✅ **CONFIRMADO** | Zero salão no schema/UI; leads com BANT, SDR/closer, deals, comissões, cadências; `sales_leads` captura lead B2B (company_size, segment, current_tools, main_challenge) |
| **(B)** O fork **salon-izou** o CRM | ❌ **REFUTADO pelo código** | O CRM core (tabelas **e** componentes) é quase idêntico ao original; salão foi **adicionado ao lado**, não embutido no CRM |
| **Decisão** | **REUSAR, não reimportar** | Reimport = duplicar código quase idêntico (anti-padrão NIH). Reuso já está ~90% cabeado |

**Ressalva honesta:** há **uma** razão legítima para separar (não a contaminação) — evolução desacoplada. Detalhada na §4.

---

## 2. A prova (o diff, com número)

**Original (`crm-src`) é salon-FREE:** nenhuma tabela `clientes`/`agendamentos`/`servico_catalogo`/`profissionais`. O `leads` do original **não tem** nenhuma coluna de salão. → o original é 100% CRM de venda consultiva/SaaS.

**O fork NÃO mexeu no CRM core** — divergência de conteúdo dos componentes (original × fork):

| Componente | Tamanho | Linhas divergentes | % |
|---|---|---|---|
| `KanbanBoard.tsx` | 214 L | 2 | ~1% |
| `LeadsManager.tsx` | 433 L | 37 | ~8% |
| `LeadsTable.tsx` | 345 L | 9 | ~3% |
| `CommissionManager.tsx` | 353 L | 0 | **idêntico** |

+ **zero** menção a salão/agendamento/serviço/profissional **dentro** de `components/admin/kanban` e `components/admin/leads` do fork. O conjunto de arquivos de CRM é o **mesmo** (KanbanBoard/Column/Filters/LeadCard/Stage*, LeadsManager/Table/Tabs/Filters/KPICards/Bulk*/CreateLead/ImportLeads).

**`sales_leads` + `SalesLeadsManager` já existem nos DOIS** — idênticos. O "Leads Comerciais" do super-admin **é herdado do original**, não é coisa nova do fork.

**Conclusão factual:** o fork = **original + vertical de salão em tabelas/páginas separadas** (`clientes`, `agendamentos`, `servico_catalogo`). O CRM de vendas herdado permaneceu **intacto e SaaS-nativo**. Não existe "versão salon-izada do CRM" para se fugir — é o mesmo CRM.

---

## 3. O que o NexvyBeauty JÁ tem (inventário)

**Maquinaria de CRM de vendas — presente e viva** (herdada, escopada por `organization_id`):
- **Tabelas:** `leads` (current_stage_id, BANT, sdr_id/closer_id, deal_value, temperature, cadence_day, utm_*), `deals` (status won/lost/cancelled, closed_at), `pipeline_stages` (por produto, is_won/is_lost), `stage_values`, `lead_stage_history`, `commissions` + `commission_rules` + `payout_batches/items`, `custom_fields`, `tasks`, `interactions`, `lead_notes`, `lead_tags` + `lead_tag_assignments` + `tag_automations`, `cadences` (+steps/runs/enrollments/templates), `sales_squads` + `squad_members` + `distribution_config`, `sales_goals`, `lead_queue`, `lead_transfer_history`, `lead_nba_sugestao`, `lead_semantic_memory`.
- **UI:** `KanbanBoard` (drag-drop por etapa), `LeadsManager` (tabela+KPIs+filtros+bulk+import), `CommissionManager`, `GoalsManager`, `StageValueManager`, `CustomFieldsManager`, `SquadManager`, `TagsManager`, `CadencesManager`, `ReportsManager`.

**Platform-sales HOJE (o que "Leads Comerciais" faz):** `SalesLeadsManager` sobre a tabela **`sales_leads`** (global, sem org_id) — alimentada pela edge `capture-lead` a partir da LP pública. É **CRM raso**: 5 cards de stats + abas de status (new/contacted/qualified/converted/lost) + busca + nota + abrir WhatsApp. **Não tem** pipeline kanban, etapas, tarefas, atribuição a vendedor, comissão, cadência. A máquina pesada existe (lado tenant), mas o platform-sales **não a usa**.

**Infra de plataforma já pronta:** org master resolvida por `platform_settings.master_organization_id`; super-admin com 2 modos (**gestao** = `/super-admin`, **empresa** = operar uma org como tenant) decididos por hostname; troca de org via RPC `set_active_organization`; RLS `get_user_organization()` propaga o escopo sozinha.

---

## 4. As duas opções (honestas)

### Opção REUSO — operar o CRM existente escopado à org master *(recomendada)*
O super-admin opera a **SaaS-sales CRM já existente** como o CRM da **org master (Nexvy)**: leads = salões prospectados; um "produto" = a assinatura NexvyBeauty com um pipeline de venda de SaaS; deals = assinaturas fechadas; comissões/metas/cadências = venda da plataforma.
- **Custo:** baixo. Já há master-org + `set_active_organization` + modo empresa + toda a UI de CRM + `sales_leads` como inbound.
- **Prós:** zero duplicação; 1 CRM pra manter; aproveita cadência/comissão/squad de graça; drift impossível (é a mesma fonte).
- **Contras:** o `leads` da plataforma **compartilha schema** com o `leads` dos tenants (isolado por org_id/RLS, mas mesma tabela). Uma mudança futura no schema do CRM afeta os dois.

### Opção SEPARAR — tabelas `platform_*` dedicadas + UI própria no super-admin
Criar `platform_leads`/`platform_deals`/`platform_pipeline_*` + portar os componentes como `Platform*`.
- **Custo:** alto. Duplica ~30 tabelas + ~30 componentes **quase idênticos** + RLS + edge functions.
- **Prós:** **evolução desacoplada** — o CRM da plataforma evolui sem risco de mexer no CRM do tenant (e vice-versa). Isolamento físico.
- **Contras:** NIH/duplicação massiva; dobra manutenção; o "ganho" de isolamento já é entregue por org_id/RLS na Opção Reuso.

**A única pergunta que decide:** você quer que o CRM da plataforma **evolua independente** do CRM do tenant (campos/etapas próprios, sem acoplamento)? Se **não** → Reuso. Se **sim, forte** → Separar. Minha leitura: o isolamento por org_id já basta; **Reuso**.

---

## 5. Plano de plug (se REUSO)

1. **Semear** no master org um "produto" = *Assinatura NexvyBeauty* + `pipeline_stages` de venda de SaaS (ex.: Novo → Contatado → Demo → Proposta → Fechado-ganho/perdido).
2. **Surface no super-admin:** seção "Vendas da Plataforma" que abre o CRM do master org (KanbanBoard/LeadsManager) — reusar os componentes existentes apontados ao master (via modo empresa / `set_active_organization` já existente).
3. **Ligar o inbound:** promover `sales_leads` (captura da LP) → criar `leads` no master org (edge/trigger), transformando "Leads Comerciais" no **topo de funil** que abastece o pipeline real.
4. **Copy contextual:** rótulos "venda da plataforma" onde fizer sentido (sem tocar a lógica).
5. **(Opcional)** métricas de MRR/conversão de tenants reusando `ReportsManager`.

Estimativa: **dias, não semanas** (a maior parte é wiring + seed, não código novo).

---

## 6. Bônus — chat interno, Instagram, Facebook (do repo origem)

| Feature | Existe no original? | Portabilidade | Nota |
|---|---|---|---|
| **Instagram (DM)** | ✅ Completo (envia+recebe, webhook HMAC, OAuth BYO, segredos AES-256, usa `webchat_conversations`) | **Alta** — auto-contido | O NexvyBeauty já usa o mesmo inbox `webchat_conversations` → porte limpo |
| **Facebook** | ✅ Mas **só Lead Ads** (captura de lead via webhook Meta), **não** Messenger | **Alta** — auto-contido (`facebook_lead_integrations`/`_logs` + webhook) | "Messenger" na UI é cosmético; não há mensageria FB |
| **Chat interno (humano↔humano)** | ❌ **NÃO existe** — nem no original nem no fork | N/A — seria **net-new** | Só há: agente-IA "chief of staff" (fala COM o admin via WhatsApp) + notificações + presença. `feature_internal_chat` é flag sem produto |

**Correção importante:** "está tudo nesse código" vale para Instagram e Facebook-LeadAds, **mas não para o chat interno de equipe** — esse teria que ser construído do zero (tabela `team_messages` + canal realtime + UI). Não é porte, é feature nova.

---

## 7. Recomendação final

1. **CRM da plataforma:** **REUSO** escopado ao master org (a menos que você queira evolução desacoplada → aí Separar). Entrega o objetivo com custo de dias.
2. **Instagram + Facebook-LeadAds:** portes limpos e auto-contidos — agendáveis quando quiser reativá-los (lembrar: hoje desligados por não estarem funcionando; o porte os torna reais).
3. **Chat interno:** decisão à parte — é **construção nova**, não reaproveitamento. Não prometer como "já existe".
