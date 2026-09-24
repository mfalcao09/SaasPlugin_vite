# Auditoria do schema — matriz vertical × horizontal

**Data:** 2026-09-23  
**Escopo:** NexvyBeauty / Gestão / Nova Prospecção Ativa  
**Status:** auditoria concluída; migration mínima aplicada e validada em 2026-09-23
**Fonte canônica:** CRM, banco e Harness. A UI é uma prancha operacional.

## 1. Regra arquitetural congelada

Todo lead mora na Base de Leads. Não existe migração física para uma tela de enriquecimento, pré-seleção ou campanha.

```text
BASE UNIVERSAL: platform_crm_leads + perfis/origens
        │
        ├── eixo vertical: exatamente uma fase do Harness
        │       db → preselected → contacted → remarketing_pool
        │                         → service → closing → onboarding
        │                         └→ do_not_contact
        │
        └── eixos horizontais coexistentes:
                triagem · handles/origens · enriquecimento · campanhas
                disparos · opt-out/supressão · memória · auditoria
```

Uma ação horizontal pode bloquear uma operação incompatível, mas não troca a casa do lead. A mudança vertical é exclusiva e sempre histórica.

## 2. Resultado da auditoria

| Domínio | Schema atual | Situação contra a matriz | Decisão |
|---|---|---|---|
| Identidade/card | `platform_crm_leads`, `platform_crm_extracted_leads.imported_to_lead_id` | Parcialmente adequado. A ingestão já consegue agrupar telefone igual + handles diferentes; falta a UI exibir isso como um card com N perfis. | Manter. Corrigir/adotar a leitura canônica no novo Base de Leads. |
| Triagem | `platform_crm_extracted_leads.triagem` + `platform_crm_extracted_lead_triage_history` | Adequado após a triagem canônica. A classificação é por perfil; o card deve derivar seu resumo. | Manter. Nenhuma coluna de “fila de enriquecimento”. |
| Base universal | `platform_crm_leads` + staging de perfis | Existe, mas a UI antiga mistura Base, busca e fila de enriquecimento. | Nova UI trata a Base como casa permanente. |
| Jornada vertical | `platform_crm_lead_state.derived_stage` e Harness | Existe e já é a fonte efetiva do Harness. `platform_crm_leads.current_stage_id` é uma segunda representação histórica/legada. | Não criar terceiro estágio. Declarar `derived_stage` como canônico para a nova UI e preparar reconciliação do legado. |
| Pré-seleção | `derived_stage = 'preselected'` | Existe como estágio, mas sem metadados explícitos de quem/quando/por quê. | Acrescentar operação/evento de pré-seleção; o estágio continua no `lead_state`. |
| Campanhas | `platform_crm_campaigns`, `platform_crm_campaign_targets` | Relação campanha↔lead já existe e tem deduplicação por campanha. | Reusar. A inclusão em campanha é relação, não flag solta. |
| Disparos | `campaign_targets` + `cold_outreach_queue` + `journey_events` | Existe, mas está fragmentado entre o motor de campanhas e cold outreach. | Não duplicar tabelas agora; a nova UI deve consumir adapters/EFs sobre as tabelas existentes. |
| Enriquecimento | views/filtros de telefone ausente + chamada Apify | Não há operação persistida de enriquecimento com seleção, lote, status, erro e idempotência. | Criar a única tabela nova da migration mínima: operações horizontais. |
| Opt-out/supressão | `platform_crm_lead_optout` + flags no cold outreach | Existe, mas a elegibilidade está distribuída em código e metadados. | A nova EF de elegibilidade consolida a regra; não migrar os dados para uma tabela concorrente agora. |
| Transferências | `platform_crm_lead_transfer_history` | Cobre transferência de usuário/squad, não movimentos entre módulos/operações. | A nova operação registra handoff operacional; não reutilizar a tabela de squad. |
| Auditoria | `platform_crm_journey_events`, triage history, campaign target timestamps | Há peças suficientes, sem uma operação comum para UI. | Usar `lead_operations` para intenção/execução e `journey_events` para eventos de jornada. |

## 3. Lacunas mínimas que impedem a nova UI

### 3.1 Operação horizontal persistida

Criar `platform_crm_lead_operations` como registro de intenção e execução de ações da UI.

Campos mínimos:

```text
id, product_id, lead_id, extracted_lead_id
operation_type: enrichment | preselection | handoff | triage_review
status: queued | running | succeeded | failed | cancelled
source_module, target_module
requested_by, requested_at, started_at, finished_at
idempotency_key, payload, result, error
created_at, updated_at
```

Regras:

- `lead_id` e `extracted_lead_id` podem coexistir; a operação informa se atua no card, no perfil ou nos dois;
- uma operação ativa idêntica é única por `idempotency_key`;
- enriquecimento atua no perfil, mas o lead continua na Base;
- pré-seleção altera o eixo vertical via EF e grava o evento/resultado;
- `handoff` prepara a futura passagem NexvyProspecta → Gestão sem criar segunda identidade;
- a tabela não dispara mensagens e não substitui `campaign_targets` nem `cold_outreach_queue`.

### 3.2 Projeção de elegibilidade

Criar uma view/RPC de leitura — não uma tabela duplicada — para a nova UI:

```text
platform_crm_lead_operational_snapshot
```

Ela combina:

- card e handles vinculados;
- triagem por perfil e resumo do card;
- `platform_crm_lead_state.derived_stage`;
- operações ativas;
- campanhas e último disparo;
- opt-out/supressão;
- `can_preselect`, `can_enrich`, `can_campaign`, `can_dispatch` e respectivos motivos.

As decisões de escrita continuam nas Edge Functions. A view apenas evita que cada tela reconstrua uma regra diferente.

## 4. Migration mínima proposta

Arquivo futuro: `20260923_prospeccao_operational_layer.sql`.

### Deve fazer

1. Criar `platform_crm_lead_operations` com RLS `super_admin`, índices por produto/status/lead e unique parcial para operação ativa idêntica.
2. Criar a view/RPC de snapshot operacional.
3. Criar, se necessário, índices de leitura em:
   - `platform_crm_lead_state(product_id, derived_stage)`;
   - `platform_crm_extracted_leads(product_id, triagem, telefone)`;
   - `platform_crm_campaign_targets(lead_id, status)`.
4. Adicionar comentários documentando que `derived_stage` é a fonte do Harness e `current_stage_id` permanece legado até a reconciliação.

### Não deve fazer

- não mover ou copiar leads para uma tabela de enriquecimento;
- não criar coluna `enrichment_status` no lead como se enriquecimento fosse estado vertical;
- não criar `preselected boolean` concorrente com `derived_stage`;
- não substituir campanhas, alvos ou fila de cold outreach;
- não incluir NexvyProspecta como fluxo ativo nesta migration;
- não alterar as páginas legadas da seção atual.

## 5. Critério de aprovação da migration

### 5.1 Proteção explícita do Harness

Existe risco de quebra se a nova UI ou a migration passar a tratar
`platform_crm_leads.current_stage_id` como fonte de verdade. O Harness atual
lê `platform_crm_lead_state.derived_stage`; portanto:

- `derived_stage` não pode ser renomeado, removido ou substituído;
- não criar outro campo de estágio ou um `preselected boolean` concorrente;
- toda transição vertical deve passar pela Edge Function que preserva `version`,
  `facts` e o CAS de `platform_crm_lead_state`;
- `current_stage_id` permanece legado até uma reconciliação própria, fora desta
  migration;
- a tabela de operações não pode alterar estágio diretamente.

O gate de regressão do Harness deve provar, em ambiente controlado:

```text
db → preselected → contacted
preselected → remarketing_pool
contacted/preselected → service
qualquer estágio operacional → do_not_contact
```

Também deve confirmar que o roster do piloto continua encontrando somente
leads cujo `platform_crm_lead_state.derived_stage = 'preselected'`.

Antes de aplicar:

1. preflight de duplicidade e integridade dos FKs;
2. validar que nenhuma operação ativa duplicada será criada;
3. aplicar em ambiente controlado;
4. testar enriquecimento individual/lote, pré-seleção, cancelamento e retry;
5. confirmar que um lead continua visível na Base durante qualquer operação;
6. confirmar que `do_not_contact`/opt-out vence todas as elegibilidades;
7. limpar dados sintéticos e só então aplicar em produção.
