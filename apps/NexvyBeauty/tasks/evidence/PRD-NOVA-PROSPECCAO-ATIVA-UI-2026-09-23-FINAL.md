# Relatório final — Nova Prospecção Ativa

**Data:** 2026-09-23  
**Status:** entregue no escopo aprovado; aceite operacional do Apify diferido  
**Fonte canônica:** CRM, schema, Edge Functions e Harness — a UI é uma prancha operacional.

## 1. Resultado executivo

O loop entregou a base server-side e a nova UI aditiva para operar ingestão,
triagem, Base de Leads, enriquecimento, pré-seleção, campanhas e dashboard sem
alterar as telas legadas. Todo lead continua tendo uma única casa na Base de
Leads; as operações verticais e horizontais são representadas separadamente.

O único item não executado é o aceite real `running → succeeded → webhook` do
provedor Apify. Ele foi deliberadamente retirado do caminho crítico por decisão
do produto: a conta está sem crédito e o provedor respondeu `403
platform-feature-disabled / Too many outstanding invoices`. O contrato,
tratamento de erro, histórico, retry/cancelamento e limpeza foram mantidos e
testados; a execução real será retomada somente quando houver crédito.

## 2. Matriz final de aceite

| ID | Critério | Fase | Resultado |
|---|---|---:|---|
| C-01 | Harness usa `derived_stage` como eixo vertical | 0–1 | done |
| C-02 | Migrations idempotentes e sem duplicidade física | 1 | done |
| C-03 | Writes da UI passam por Edge Functions | 2–3 | done |
| C-04 | Ingestão Prospectagram com preview, confirmação e erro por linha | 4 | done |
| C-05 | Mesmo telefone + handles diferentes = 1 card/N perfis | 4–5 | done |
| C-06 | Seleção individual/lote, triagem e remoção restaurável | 5 | done |
| C-07 | Histórico, cancelamento e retry de operações | 5–6 | done |
| C-08 | Provedor real completa `running → succeeded → webhook` | 6 | deferred_external — Apify sem crédito; tentativa e erro documentados |
| C-09 | Campanhas aceitam apenas pré-selecionados elegíveis, sem duplicata | 7 | done |
| C-10 | Campanha tem controle `active/paused` e histórico | 7 | done |
| C-11 | Dashboard é rastreável às tabelas canônicas | 8 | done |
| C-12 | Build e smoke de segurança das funções novas | 2–8 | done |
| C-13 | Aceitação e rollout da entrega | 9 | done; C-08 encaminhado como gate externo |

## 3. Entrega técnica

### Migrations aplicadas no projeto NexvyBeauty

- `supabase/migrations_platform_crm/20260923_canonical_triage.sql`
- `supabase/migrations_platform_crm/20260923_prospeccao_operational_layer.sql`
- `supabase/migrations_platform_crm/20260923_prospeccao_extraction_sources.sql`
- `supabase/migrations_platform_crm/20260923_prospeccao_snapshot_performance.sql`

As migrations são aditivas, reaplicáveis e não movem leads existentes. A camada
operacional registra operações, snapshots, origens e índices; o Harness continua
canônico em `platform_crm_lead_state.derived_stage`.

### Edge Functions

- `leads-import-profiles`
- `leads-triage`
- `leads-operation`
- `leads-operation-history`
- `leads-operational-snapshot`
- `leads-ingestion-history`
- `leads-ingestion-reprocess`
- `nova-campaign-prepare`
- `nova-campaign-create`
- `nova-campaign-control`
- `nova-campaign-summary`

As funções foram deployadas no projeto remoto canônico `fzhlbwhdejumkyqosuvq`.
O projeto futuro NexvyProspecta não recebeu funções permanentes.

### UI nova

Foi adicionada a casca paralela “Nova Prospecção Ativa”, preservando as telas
atuais:

- Dashboard;
- Ingestão de Leads, com triagem integrada;
- Base de Leads, com cards canônicos, múltiplos handles, filtros, seleção
  individual/lote, ações e histórico;
- Enriquecimento, como ação/operação horizontal;
- Campanhas & Disparos.

Componente principal: `src/components/superadmin/crm/prospeccao/NovaProspeccaoWorkspace.tsx`.

## 4. Evidências executadas

- testes determinísticos de migration, identidade e triagem: **9/9 verdes**;
- `deno check` das Edge Functions novas: **verde**;
- build Vite: **verde**;
- smoke sem autenticação das funções operacionais: **11/11 retornaram 401**;
- importação/reprocessamento controlado: **2 perfis → 1 card/2 handles**;
- remoção confirmada/restauração: **2/2 restaurados**, sem resíduo;
- campanha controlada: prepare, target único, idempotência, `active → paused`
  e cleanup aprovados;
- Harness: transições e CAS preservados, sem alteração direta de
  `derived_stage` pela UI;
- snapshot remoto: **36.668 cards**, com `db=36.647`, `remarketing_pool=14`,
  `service=1`, `do_not_contact=6` e zero operações sintéticas ativas;
- performance: leitura otimizada para aproximadamente **0,55 s** no recorte
  controlado de cinco cards;
- verificação de browser: nenhum PAT, service role ou acesso privilegiado
  direto à tabela na nova UI.

Detalhes estão nos arquivos de evidência de Fases 4–7 e de performance no
mesmo diretório deste relatório.

## 5. Identidade e não destruição

- mesmo telefone com handles diferentes é agrupado no mesmo lead/card, com N
  perfis/handles;
- telefone e handle iguais são ocorrência duplicada e não geram novo perfil;
- remoção confirmada é uma lista restaurável, distinta da lixeira;
- nenhum lead foi fisicamente removido da Base durante os testes;
- operações de enriquecimento, campanha e disparo não criam uma segunda casa
  para o lead.

## 6. Risco ao Harness

Não foi identificada quebra. A migration é aditiva; o Harness continua lendo o
estágio derivado, preserva `version`, `facts` e CAS, e a UI não escreve o
estágio diretamente. A evidência correspondente está no checkpoint de Fase 1 e
na auditoria corrente.

## 7. Pendência explicitamente encaminhada

Quando houver crédito no Apify, executar apenas um fixture controlado do
enriquecimento e confirmar:

```text
queued → running → succeeded → webhook → perfil atualizado → triagem reexecutada
```

Depois, remover todo o fixture e atualizar apenas C-08. Essa pendência não
reabre migrations, UI, campanhas ou Harness sem evidência de regressão.

NexvyProspecta permanece no radar como futuro provider/módulo interno do Gestão,
fora deste PRD.
