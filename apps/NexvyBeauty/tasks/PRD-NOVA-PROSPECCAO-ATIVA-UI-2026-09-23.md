# PRD de desenvolvimento — Nova Prospecção Ativa

**Data:** 2026-09-23  
**Status:** aprovado para execução em loop  
**Escopo:** novas páginas aditivas dentro de Gestão → Prospecção Ativa  
**Fonte canônica:** CRM, schema, Edge Functions e Harness  
**Referências:**

- `tasks/PROSPECCAO-CONTRATO-DADOS-ARQUITETURA-UI-2026-09-23.md`
- `tasks/PROSPECCAO-SCHEMA-AUDITORIA-MATRIZ-2026-09-23.md`
- `tasks/PROSPECCAO-UI-PRANCHA-DE-TRABALHO-V1-2026-09-23.md`

## 1. Objetivo

Entregar uma nova UI operacional que permita:

1. importar lotes externos por Edge Function;
2. triar automaticamente e revisar manualmente;
3. manter todos os leads na Base de Leads;
4. agrupar múltiplos handles em um único card;
5. selecionar leads individualmente ou em lote;
6. executar enriquecimento como operação horizontal;
7. pré-selecionar leads para o Harness;
8. preparar campanhas e acompanhar disparos sem duplicar o lead;
9. mostrar dashboard de inventário, jornada, operações e bloqueios.

## 2. Preservação obrigatória

Adicionar um grupo/menu paralelo, sem excluir ou alterar as páginas atuais:

```text
Prospecção Ativa — atual
  Buscas · Base consolidada · Campanhas de disparo · Dashboard
  Enriquecimento · Importação por vídeo

Nova Prospecção Ativa
  Dashboard
  Ingestão de Leads
  Base de Leads
  Enriquecimento
  Campanhas & Disparos
```

Triagem não será uma página isolada: é o processamento obrigatório da Ingestão e também uma ação/revisão disponível na Base.

## 3. Contrato de domínio

### Vertical

Uma única posição operacional do lead, canônica em `platform_crm_lead_state.derived_stage`:

```text
db → preselected → contacted → remarketing_pool
                         → service → closing → onboarding
                         └→ do_not_contact
```

Transições verticais removem o lead da elegibilidade de posições incompatíveis e geram evento/histórico.

### Horizontais

Triagem, perfis/origens, enriquecimento, campanhas, disparos, opt-out, memória e auditoria coexistem e acompanham o card. Uma operação horizontal pode bloquear outra, mas não muda a casa do lead.

### Regras críticas

- `nao_classificado` significa “triado, mas sem evidência suficiente”, não “ainda não triado”;
- enriquecimento não é estado do lead;
- pré-seleção é o gate vertical para o universo de campanha;
- entrada em campanha é relação (`campaign_targets`), não booleano;
- cada disparo é evento/target da campanha;
- remoção confirmada é lista restaurável e também supressão operacional;
- telefone igual + handles diferentes = um card, N perfis;
- telefone e handle iguais = mesma ocorrência, sem novo perfil/card;
- opt-out e `do_not_contact` vencem toda elegibilidade de outbound.

## 4. Fases do loop de implementação

### Protocolo de execução contínua

As fases são executadas em loop contínuo, na ordem, sem intervalo ou pausa
artificial entre elas. Ao concluir uma fase, o agente deve imediatamente:

1. verificar o gate da fase;
2. registrar evidências;
3. corrigir falhas localizadas, se houver;
4. avançar para a fase seguinte.

O loop só deve parar quando ocorrer uma destas condições:

- falha de integridade de dados;
- regressão do Harness;
- teste de segurança ou autorização falhando;
- migration não idempotente ou não reversível no ambiente controlado;
- necessidade de uma decisão de domínio que altere este contrato.

Falhas comuns de implementação, tipagem, layout ou teste devem ser corrigidas
no próprio loop, sem devolver a decisão ao usuário. Cada fase deve terminar
com código, teste e evidência suficiente para permitir o avanço automático.

### Controle anti-trabalho perdido

O loop deve manter uma matriz de execução:

```text
ID | requisito | fase | arquivo/rota/EF | teste | evidência | status
```

Nenhuma fase fecha apenas porque o código foi escrito. O requisito só pode ser
marcado como concluído quando estiver implementado, testado e evidenciado. Ao
final de cada fase, a matriz e um changelog curto devem ser atualizados.

### Fase 0 — Contratos e proteção

- congelar contratos de identidade, triagem e Harness;
- adicionar testes de múltiplos handles;
- criar flag de navegação para as novas páginas;
- nenhum write da nova UI diretamente em tabela.

**Gate:** testes de contrato passam e páginas legadas continuam acessíveis.

**Métrica:** 100% dos contratos críticos documentados; testes de identidade e
triagem verdes; 0 rota legada removida ou quebrada.

### Fase 1 — Migration mínima

Aplicar `20260923_prospeccao_operational_layer.sql` conforme a auditoria:

- `platform_crm_lead_operations`;
- view/RPC `platform_crm_lead_operational_snapshot`;
- índices mínimos;
- sem mover dados nem criar estados concorrentes.

**Gate:** preflight, aplicação controlada, smoke test, regressão do Harness e
limpeza do teste.

**Métrica:** migration idempotente; 0 duplicidades introduzidas; todas as
transições Harness verdes; 0 registro sintético restante.

#### Gate obrigatório de não quebra do Harness

O Harness continua lendo `platform_crm_lead_state.derived_stage`. A nova UI
nunca deve escrever o estágio diretamente e nunca deve usar
`platform_crm_leads.current_stage_id` como fonte canônica.

O teste controlado deve provar:

```text
db → preselected → contacted
preselected → remarketing_pool
contacted/preselected → service
qualquer estágio operacional → do_not_contact
```

Também deve confirmar que o roster do piloto continua retornando apenas
`derived_stage = 'preselected'`, preservando `version`, `facts` e o CAS. A
tabela `platform_crm_lead_operations` registra intenção/execução, mas não
altera `derived_stage` diretamente.

### Fase 2 — Edge Functions de operação

Criar/ajustar contratos server-side:

- `leads-import-profiles`: recebe lote, normaliza, deduplica, agrupa e triageia;
- `leads-triage`: altera classificação e registra histórico;
- `leads-operation`: cria/cancela/reexecuta enriquecimento, pré-seleção e handoff;
- `leads-operational-snapshot`: leitura agregada para a UI;
- `leads-operation-history`: histórico sob demanda por card;
- `nova-campaign-prepare`: transforma pré-selecionados em targets sem duplicação;
- `nova-campaign-control` e `nova-campaign-summary`: arma/desarma e histórico operacional;
- dispatcher existente continua sendo o único responsável pelo disparo.

**Gate:** nenhum endpoint aceita service role/PAT no browser; idempotência;
opt-out bloqueia; transições verticais usam o contrato do Harness e não
`current_stage_id`.

**Métrica:** 100% dos writes passam por Edge Function; endpoints testados com
autenticação; retry idempotente; opt-out respeitado.

### Fase 3 — Nova casca de navegação

- criar grupo “Nova Prospecção Ativa”;
- rotas e permissões novas;
- manter componentes antigos intactos;
- componente compartilhado de seleção em lote, filtros e painel lateral.

**Gate:** navegação visual e links funcionam; nenhuma regressão das rotas antigas.

**Métrica:** 5 novas páginas acessíveis; 100% das rotas legadas preservadas;
seleção individual e em lote funcionando.

### Fase 4 — Ingestão + triagem

- upload/colar JSON do Prospectagram;
- preview e confirmação;
- status do lote;
- resultado da triagem por balde;
- reabertura por lote/origem;
- erros por linha sem abortar lote válido.

**Gate:** importar fixture real anonimizada; validar contagens e múltiplos handles.

**Métrica:** contagens da UI iguais às do backend; telefone igual + handles
diferentes gera 1 card e N perfis; telefone + handle iguais não duplica.

### Fase 5 — Base de Leads

- card canônico como unidade visual;
- N handles dentro do card;
- filtros por triagem, jornada, fonte, telefone, operações e bloqueios;
- ações individual/lote: reclassificar, remover/restaurar, enviar para enriquecimento, pré-selecionar;
- detalhe com histórico, origem, handles, estado vertical e operações horizontais.

**Gate:** um lead em enriquecimento continua visível na Base e fica bloqueado apenas para ações incompatíveis.

**Métrica:** operações individual e em lote; estados queued/running/succeeded/
failed/cancelled; retry idempotente; 0 clone de lead.

### Fase 6 — Enriquecimento

- seleção de perfis/leads;
- criação de operação `enrichment`;
- lotes, progresso, retry e erro;
- histórico por card via `leads-operation-history`;
- atualização do perfil original;
- reexecução da triagem após resultado;
- custo/saldo exibidos quando fornecidos pelo provedor.

**Gate:** teste individual, lote, retry e cancelamento; nenhum clone na Base.

Quando o provedor externo estiver sem crédito ou bloqueado por faturamento, a
execução real do provedor não bloqueia a entrega da UI/backend. Nesse caso, o
gate externo fica registrado como aceite operacional diferido; o contrato
server-side, o caminho de erro, cancelamento, retry, histórico e limpeza devem
estar comprovados sem consumir saldo.

**Métrica:** 100% das operações têm histórico; sucesso, erro e cancelamento
refletidos na UI; o lead permanece na Base.

### Fase 7 — Campanhas & Disparos

- construtor de público a partir do snapshot;
- filtro obrigatório de estágio, triagem, canal e supressão;
- pré-seleção antes da preparação;
- vínculo card↔campanha;
- preview de duplicados e inelegíveis;
- preparação, dry-run, arma/desarma e acompanhamento;
- histórico de campanha/disparo por card.

**Gate:** nenhuma campanha inclui `do_not_contact`, opt-out, card não pré-selecionado ou target duplicado.

**Métrica:** 0 target inelegível; 0 target duplicado; pré-seleção, preparação,
dry-run, arma/desarma e histórico demonstráveis.

### Fase 8 — Dashboard

- inventário por triagem/origem;
- distribuição por estágio vertical;
- operações horizontais pendentes;
- funil pré-selecionado → campanha → disparo → resposta → atendimento;
- métricas de erro, supressão e enriquecimento.

**Gate:** cada número do dashboard é rastreável ao snapshot ou às tabelas canônicas.

**Métrica:** 100% dos indicadores têm origem identificada e conferem com query
de validação; nenhum número é calculado apenas no frontend.

### Fase 9 — Aceitação e rollout

- testes E2E controlados;
- visual review das novas telas;
- habilitação gradual por flag;
- monitoramento de Edge Functions;
- decisão de substituir telas legadas somente em PRD futuro.
- registrar explicitamente gates externos diferidos, se houver, sem tratá-los
  como falha de implementação.

## 5. Critérios de aceite globais

- a UI nova não acessa Prospectagram nem NexvyProspecta diretamente;
- a UI nova não usa PAT, service role ou PostgREST privilegiado;
- todo write passa por Edge Function;
- todo lead continua tendo uma única casa: Base de Leads;
- múltiplos handles aparecem dentro do mesmo card quando a identidade é compartilhada;
- remoção confirmada é navegável e reversível;
- ações individuais e em lote são idempotentes e auditáveis;
- vertical e horizontal não são misturados no mesmo campo;
- campanhas e disparos permanecem separados de pré-seleção;
- páginas antigas permanecem intactas;
- NexvyProspecta fica no radar como futuro provider/módulo interno, sem implementação neste PRD.

## 6. Auditoria final obrigatória do loop

Antes de declarar o PRD concluído, gerar:

`tasks/evidence/PRD-NOVA-PROSPECCAO-ATIVA-UI-2026-09-23-FINAL.md`

O relatório deve conter:

1. matriz completa de requisitos, sem itens em `planned`, `partial` ou
   `blocked`; gates externos diferidos devem usar `deferred_external`, com
   motivo, evidência e procedimento de retomada;
2. migrations aplicadas, arquivos/checksums e resultado do preflight;
3. Edge Functions, rotas e componentes entregues;
4. testes unitários, integração, E2E, Harness e segurança;
5. páginas novas versus páginas legadas preservadas;
6. casos de múltiplos handles;
7. operações individuais e em lote;
8. prova de que nenhum lead foi removido fisicamente da Base;
9. prova de que nenhum PAT/service role chegou ao browser;
10. pendências residuais encaminhadas para outro PRD.

### Definition of Done

O loop pode reportar `concluído` quando todas as fases 0–9 estiverem `done`,
todas as métricas de implementação estiverem verdes, a matriz de execução
estiver 100% rastreada e o relatório final existir. Um aceite operacional
externo pode permanecer como `deferred_external` quando houver decisão
explícita de produto e ausência de crédito/serviço externo; isso deve estar
fora do caminho crítico, com evidência do bloqueio e encaminhamento para a
retomada. Não é permitido mascarar um teste não executado como sucesso.

## 7. Ordem imediata de execução

1. revisar/aprovar a auditoria e a migration mínima;
2. escrever a migration e seu teste estrutural;
3. aplicar em ambiente controlado e limpar o teste;
4. implementar `leads-operation` e o snapshot;
5. construir a casca e a Base de Leads novas;
6. integrar ingestão/triagem;
7. integrar enriquecimento;
8. integrar campanhas/disparos;
9. fechar dashboard e aceitação.
