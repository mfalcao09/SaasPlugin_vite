# Prospecção — contrato de dados e arquitetura da UI

**Data:** 2026-09-23  
**Escopo:** NexvyBeauty / Gestão / Prospecção Ativa  
**Status:** contrato documentado; triagem canônica, histórico e primeira versão da resolução de identidade implementados em código  
**Fonte canônica:** modelo operacional do CRM, banco e Harness. A UI atual é material de transição.

**Congelamento do CRM:** concluído em 2026-09-23. A proposta de redesenho da UI está em `tasks/PROSPECCAO-UI-PRANCHA-DE-TRABALHO-V1-2026-09-23.md`.

## 1. Decisões de domínio

O Gestão não é o motor de extração. Ele recebe lotes produzidos externamente, mantém o inventário dos perfis, executa/recebe a triagem, oferece enriquecimento e opera o CRM.

```text
Prospectagram / futuro NexvyProspecta
              ↓ lote de importação
platform_crm_lead_extractions
              ↓ perfis brutos
platform_crm_extracted_leads
              ↓ ingestão + triagem automática
principal · semente · remoção_confirmada · não_classificado
              ↓
Base de Leads (todos os perfis processados e cards canônicos)
              ↓ eixo vertical do Harness
DB → Pré-selecionado → Contatado → Remarketing
                         → Em atendimento → Ganho / Perdido
```

### 1.1 Inventário, card e fase não são a mesma coisa

| Conceito | Fonte | Função |
|---|---|---|
| Perfil extraído | `platform_crm_extracted_leads` | Uma identidade Instagram encontrada em uma extração |
| Lead/card | `platform_crm_leads` | Pessoa/negócio que pode aparecer no CRM |
| Perfil dentro do card | várias linhas extraídas ligadas por `imported_to_lead_id` | Handles do mesmo lead |
| Base de Leads | inventário + cards canônicos | Casa permanente de todos os leads processados |
| Triagem | atributo do perfil/lista | Classificação pós-processamento: principal, semente, remoção ou não classificado |
| Jornada vertical | `platform_crm_lead_state` / estado do Harness | Uma única posição operacional ativa por vez |
| Operações horizontais | operações, campanhas, disparos e eventos | Várias podem coexistir e acompanhar a jornada |
| Movimento | transição de jornada ou handoff | Não troca a identidade de tabela; altera estado e registra histórico |

Não criar uma coluna de kanban para cada balde de triagem. Baldes são filtros/classificações da Base; fases verticais são o ciclo do CRM. Enriquecimento, campanha e disparo não são baldes concorrentes: são operações horizontais sobre o lead.

### 1.2 Matriz vertical × horizontal

| Camada | Natureza | Regra de coexistência | Fonte canônica |
|---|---|---|---|
| Triagem | horizontal de classificação | acompanha o lead; pode mudar por ação de triagem | `platform_crm_extracted_leads.triagem` |
| Jornada do Harness | vertical | exatamente um estado ativo por lead | `platform_crm_lead_state` + contrato Harness |
| Enriquecimento | horizontal operacional | pode estar pendente/em execução; bloqueia ações incompatíveis | operação de enriquecimento |
| Pré-seleção | transição/gate vertical | habilita entrada no universo de campanhas | estado `preselected` + ator/data |
| Campanha | horizontal relacional | várias campanhas históricas; regras impedem campanhas ativas incompatíveis | `campaign_id ↔ lead_id` |
| Disparo | evento horizontal | vários disparos auditáveis; cada um pertence a uma campanha | `dispatch_id` / eventos |
| Atendimento | estado vertical | tira o lead de prospecção/remarketing ativo | Harness/conversa |
| Opt-out/supressão | bloqueio horizontal | vence qualquer elegibilidade de outbound | opt-out/suppress-list |

`nao_classificado` significa “passou pela triagem e foi classificado como insuficiente”, nunca “aguardando triagem”.

## 2. Baldes de triagem

### Principal

Lead de mercado-alvo. Pode ter telefone ou não.

`com telefone` e `sem telefone` são visões derivadas de `telefone IS NOT NULL`, não classificações distintas.

### Semente

Lead de beleza com potencial de mineração, referência ou recrutamento, normalmente pela regra de seguidores. Não entra automaticamente na fila de disparo.

### Remoção confirmada

É simultaneamente:

1. uma lista navegável e pesquisável;
2. um registro de supressão para impedir reentrada automática;
3. um estado reversível por ação humana.

O usuário pode abrir a lista, revisar o motivo e mover um registro para `principal` ou `não_classificado`. Essa ação deve registrar ator, data, motivo e origem da decisão. A reversão não deve apagar o histórico de que o lead já foi removido.

Enquanto estiver nesse balde, o perfil não é elegível para promoção, pré-seleção ou campanha.

### Não classificado

É uma categoria persistida da Base de Leads, não uma casa separada nem um estado de processamento incompleto. Deve ser visível na UI e elegível para a ação de enriquecimento/revisão.

Enquanto estiver nesse balde:

- permanece na Base de Leads;
- não é elegível para pré-seleção/campanha enquanto não houver mudança de triagem;
- pode receber uma operação de enriquecimento sem sair da Base;
- conserva o dado bruto, a origem e o histórico da operação;
- após o enriquecimento, a triagem é reexecutada e o registro pode continuar não classificado ou mudar de balde.

## 3. Contrato de identidade e deduplicação

Esta é a regra mais importante para o classificador/importador.

### 3.1 Normalização

Antes de comparar:

- `handle`: remover `@`, URL e espaços; normalizar para lowercase;
- `telefone`: manter somente dígitos e normalizar para E.164/BR conforme regra vigente;
- valores vazios, `None`, `null` e equivalentes devem virar `NULL` real;
- comparação de identidade nunca deve usar nome como chave forte.

### 3.2 Matriz de decisão

| Handle | Telefone | Resultado |
|---|---|---|
| igual | igual | Não cria novo card nem novo perfil canônico. Atualiza/enriquece o registro existente e mantém ocorrência/auditoria da nova extração. |
| diferente | igual | Reutiliza o mesmo `platform_crm_lead_id`, cria ou mantém um segundo perfil Instagram e liga ambos ao mesmo card por `imported_to_lead_id`. |
| igual | ausente em uma linha | Reutiliza o perfil pelo handle; pode preencher telefone se a nova fonte trouxer um número válido. |
| diferente | diferente | Cria novo lead/card se o balde permitir promoção. |
| qualquer | telefone em supressão ativa | Não cria lead acionável; registra o perfil na lista de remoção/supressão. |

### 3.3 Exemplo obrigatório

```text
Lead L-001
├── @salao_a  · telefone 5511999999999 · principal
└── @salao_a_oficial · telefone 5511999999999 · principal
```

Isso é **um card e dois perfis**, nunca dois cards.

```text
Lead L-001
└── @salao_a · telefone 5511999999999
```

Uma segunda ocorrência com o mesmo handle e telefone não cria uma nova identidade. Pode ser mantida como ocorrência da extração para auditoria, mas não como outro perfil/card.

### 3.4 Triagem em leads com múltiplos perfis

A triagem é inicialmente por perfil, porque cada handle pode apresentar sinais diferentes. A elegibilidade do card é derivada:

- o card pode ser elegível se tiver ao menos um perfil `principal`;
- perfis `remoção_confirmada` ficam suprimidos individualmente;
- um perfil removido não apaga automaticamente outro perfil principal do mesmo card;
- `não_classificado` não promove o card sozinho;
- opt-out/soft ou hard opt-out sempre vence a elegibilidade comercial.

## 4. Contrato mínimo de importação

### 4.1 Contrato de origem: Prospectagram

O extrator atualmente usado não coleta o DOM do Instagram. Ele roda na aba autenticada do Prospectagram e consulta, pela sessão do navegador, o Supabase próprio do produto:

- projeto: `mhxepwzehytpqaryjbnn`;
- tabela: `perfil`;
- filtro: `Proprietario = e-mail da sessão`;
- paginação: 1.000 registros por página.

Referências operacionais:

- `~/Library/CloudStorage/OneDrive-Pessoal/Downloads/nexvy-serper-harvest/prospectagram_browser_extract.js`;
- `~/Library/CloudStorage/OneDrive-Pessoal/Downloads/nexvy-serper-harvest/README-prospectagram-browser-extract.md`;
- `~/Library/CloudStorage/OneDrive-Pessoal/Downloads/nexvy-serper-harvest/insert_prospectagram_enriquecidos.py`.

O extrator normaliza cada linha para um card e entrega, entre outros, estes campos:

```text
handle, name, primeiro_nome, seguidores, seguindo, posts,
telefone, telefone_br_valido, whatsapp_link, email, instagram_url,
website, links, link_tipo, contato_fonte, categoria, account_type,
cnpj, is_verified, is_private, bio, origem_tipo, palavras_chave,
descricao_pesquisa, etapa, status_lead, created_at, has_phone
```

Regras já embutidas na origem:

- bio normalizada com NFKC;
- telefone procurado tanto nos campos nativos quanto em links de WhatsApp e agregadores;
- DDI estrangeiro não é reescrito como `55`;
- deduplicação preliminar por `handle` em lowercase;
- quando há duas ocorrências do mesmo handle, prefere a ocorrência com telefone;
- a saída representa perfil Instagram, não ainda um lead canônico do CRM.

O envelope legado de exportação é:

```json
{
  "source": "prospectagram perfil (Supabase, sessao navegador)",
  "total": 123,
  "cards": []
}
```

Esse formato deve ser aceito pelo adapter da Edge Function. A UI pode enviar o arquivo ou os `cards`, mas não pode acessar o Supabase do Prospectagram, capturar credenciais da sessão, usar `service_role` ou inserir diretamente no banco do Gestão.

### 4.2 Separação entre extração, triagem e persistência

O extrator pode trazer `qualificado` ou outros campos legados, mas esses valores não são a decisão canônica do CRM. A Edge Function deve:

1. validar e adaptar o card Prospectagram para o contrato interno;
2. normalizar handle, telefone, links e valores nulos;
3. criar a extração em `platform_crm_lead_extractions`;
4. fazer upsert idempotente em `platform_crm_extracted_leads`;
5. executar a triagem operacional;
6. resolver identidade por handle e telefone;
7. vincular múltiplos handles ao mesmo `platform_crm_lead`;
8. deixar não classificados na fila persistida de enriquecimento;
9. gerar o resumo do processamento para a UI.

O antigo `insert_prospectagram_enriquecidos.py` é referência histórica do mapeamento, não o contrato da UI. Ele usava `service_role` e PostgREST diretamente para inserir linhas em `platform_crm_extracted_leads`; esse caminho deve ser encapsulado no backend da Edge Function.

Todo provedor deve produzir um lote com:

```json
{
  "contract_version": "1",
  "provider": "prospectagram",
  "external_run_id": "opcional",
  "source_file_name": "prospectagram_export.json",
  "requested_at": "2026-09-23T00:00:00Z",
  "records": [
    {
      "handle": "salao_a",
      "name": "Salão A",
      "bio": "...",
      "followers": 12000,
      "phone": "5511999999999",
      "instagram_url": "https://instagram.com/salao_a",
      "website": null,
      "source_metadata": {},
      "classification": null
    }
  ]
}
```

`classification` pode vir vazio. O lote deve ser aceito mesmo sem classificação; nesse caso o registro nasce em `não_classificado` e vai para a fila de enriquecimento/revisão.

O importador deve gerar contagens de:

- recebidos;
- válidos;
- inválidos;
- novos perfis;
- handles já conhecidos;
- telefones que agruparam perfis;
- novos cards;
- enviados para cada balde;
- suprimidos;
- pendentes de classificação.

Nenhum import deve gravar diretamente em uma campanha ou disparar mensagem.

### 4.3 Resposta da Edge Function

O processamento deve retornar um resumo persistido e exibível:

```json
{
  "extraction_id": "uuid",
  "status": "done",
  "received": 1000,
  "valid": 984,
  "invalid": 16,
  "new_profiles": 700,
  "known_profiles": 284,
  "handles_grouped_by_phone": 37,
  "new_cards": 663,
  "principal": 512,
  "semente": 82,
  "remocao_confirmada": 140,
  "nao_classificado": 250,
  "suppressed": 12,
  "errors": []
}
```

O resumo não substitui as linhas persistidas. Ele é uma visão operacional da extração e deve permitir reabrir a lista filtrada por `extraction_id`.

## 5. Arquitetura futura do NexvyProspecta

O NexvyProspecta fica registrado como futuro provedor/módulo de extração, não como parte da implementação imediata.

Quando estiver pronto, há duas opções compatíveis com este contrato:

1. funcionar como provedor externo e enviar lotes para a ingestão do Gestão;
2. ser incorporado como módulo interno do Gestão, mantendo o mesmo contrato de lote e as mesmas entidades de triagem.

Em ambos os casos, o CRM do Gestão continua sendo a fonte canônica de:

- identidade comercial;
- triagem;
- supressão;
- cards;
- fases;
- campanhas;
- Harness.

Não compartilhar diretamente as tabelas dos dois Supabase. A futura integração deve ser idempotente, versionada e autenticada, com `provider`, `external_run_id` e `contract_version`.

## 5.1 Plano de implementação imediato

### Etapa A — adapter Prospectagram na Edge Function

Extrair o normalizador compartilhado para aceitar o envelope legado `cards[]` e convertê-lo ao formato interno. O adapter deve preservar o objeto original em `raw`, incluindo origem, links, data da leva e metadados de pesquisa.

### Etapa B — triagem como operação canônica

Unificar a classificação atualmente distribuída entre scripts e funções. A UI chama uma operação de triagem; a Edge Function classifica, grava `triagem`/`segment`, `is_seed`, motivo e timestamp, sem permitir que a UI escolha livremente a identidade do lead.

**Implementado:** a migration `20260923_canonical_triage.sql` cria `triagem` com os quatro estados (`principal`, `semente`, `nao_classificado`, `remocao_confirmada`) e uma tabela append-only de histórico. A Edge Function `leads-triage` aceita seleção por IDs ou handles, exige autenticação de agente da plataforma, grava a projeção `segment` apenas para compatibilidade e mantém a remoção confirmada reversível. A lixeira LGPD continua separada e destrutiva.

### Etapa C — resolução de identidade

Implementar a matriz da seção 3 em uma única rotina transacional ou RPC. Em particular, telefone igual com handle diferente deve reutilizar o mesmo card e inserir outro perfil ligado por `imported_to_lead_id`. Handle e telefone iguais devem ser idempotentes.

### Etapa D — fila de não classificados e enriquecimento

Expor na tela de Enriquecimento as linhas persistidas com `triagem = nao_classificado` e/ou sem telefone. O resultado do enriquecimento volta pela Edge Function, atualiza a linha original e reexecuta a triagem; não cria uma segunda cópia do lead.

### Etapa E — preparação de campanhas

Somente depois de a promoção para `platform_crm_leads` estar correta, ligar a seleção de público aprovado ao Harness. A campanha continua sendo rascunho até ser armada, com simulação e registro de autorização.

### Critério de aceite da primeira entrega

Um lote Prospectagram contendo:

- um handle novo com telefone;
- o mesmo handle repetido;
- dois handles diferentes com o mesmo telefone;
- um perfil sem telefone;
- um perfil não classificado;
- um perfil em remoção confirmada;

deve resultar em linhas idempotentes, um card com dois perfis no caso de telefone compartilhado, nenhuma duplicação no caso de handle+telefone idênticos e filas corretas na UI.

## 6. Arquitetura de telas

### Prospecção Ativa

#### Importações

Substitui a ideia de extração nativa dentro do Gestão.

Responsabilidades:

- importar JSON/CSV;
- validar contrato;
- mostrar prévia;
- confirmar lote;
- mostrar histórico de importações;
- acompanhar processamento e erros.

Fontes futuras: Prospectagram, NexvyProspecta, vídeo processado externamente e importação manual.

#### Triagem

Tela operacional com abas/filas:

- Não classificados;
- Principal;
- Sementes;
- Remoção confirmada;
- Todos os perfis.

Ações em lote:

- classificar;
- reclassificar;
- enriquecer;
- promover ao CRM;
- mover para remoção;
- restaurar da remoção;
- exportar.

#### Enriquecimento

Fila unificada de pendências:

- não classificado;
- sem telefone;
- telefone suspeito;
- bio/foto ausente;
- revisão manual solicitada.

O resultado atualiza a linha do inventário. Só a ação explícita de promoção cria/atualiza o card.

### CRM / Vendas

O board deve exibir somente o ciclo comercial. Cada card pode exibir:

- badge de triagem;
- quantidade de perfis;
- handles relacionados;
- telefone principal;
- origem;
- motion;
- status de elegibilidade.

O card abre um detalhe com todos os perfis Instagram agrupados, sem duplicar cards.

### Campanhas de disparo

Fluxo obrigatório:

```text
Selecionar público → validar elegibilidade → prévia → criar rascunho
→ simulação → armar → Harness executa
```

A UI nunca deve selecionar apenas “todos aprovados”. Deve mostrar por que cada lead está elegível e excluir explicitamente:

- remoção confirmada;
- opt-out;
- inbound quando a campanha é outbound;
- não classificado;
- semente, salvo autorização explícita;
- lead sem canal compatível.

### Dashboard de prospecção

Deve acompanhar a esteira real:

```text
Importados → Não classificados → Classificados → Promovidos
→ Pré-selecionados → Contatados → Em atendimento → Ganhos
```

“Aprovado” pode continuar existindo como autorização para campanha, mas não deve ser confundido com classificação.

## 7. Plano de implementação

### Fase 0 — contrato e reconciliação

- formalizar `triagem` e estados de enriquecimento;
- validar os dados já injetados;
- corrigir a deduplicação telefone/handle;
- garantir agrupamento por `imported_to_lead_id`;
- impedir remoção confirmada de entrar na fila outbound;
- definir a vista de elegibilidade.

### Fase 1 — Importações

- retirar os controles de extração da tela do Gestão;
- criar importador de lote;
- criar histórico e contagens de execução;
- manter Prospectagram como fonte externa.

### Fase 2 — Triagem e enriquecimento

- transformar `não_classificado` em fila visível no banco;
- adaptar Enriquecimento para essa fila;
- implementar restauração da remoção;
- registrar histórico de classificação.

### Fase 3 — CRM e perfis agrupados

- exibir múltiplos handles dentro do card;
- corrigir criação/reuso de lead;
- mostrar triagem e elegibilidade no detalhe;
- garantir que o Harness leia somente o estado comercial correto.

### Fase 4 — Campanhas

- construtor de público;
- simulação;
- rascunho/armar/desarmar;
- auditoria da autorização;
- integração completa com Harness.

### Radar futuro — NexvyProspecta

- definir adapter/provider;
- reaproveitar o contrato de importação;
- eventualmente incorporar o motor como módulo interno;
- não iniciar nesta frente.

## 8. Critérios de aceite essenciais

1. Um telefone com dois handles produz um card e dois perfis.
2. Mesmo telefone + mesmo handle não produz novo perfil/card.
3. Um lead removido pode ser restaurado manualmente.
4. Não classificado aparece no Gestão e pode ser enriquecido.
5. Não classificado não aparece em campanhas.
6. Remoção confirmada não aparece em campanhas, salvo restauração explícita.
7. Semente não entra em outbound automaticamente.
8. Todo card mostra seus handles agrupados.
9. Importar o mesmo lote duas vezes é idempotente.
10. A UI não executa extração; apenas importa, organiza, enriquece e opera o CRM.

## 9. Estado atual da implementação

- Etapa A concluída: `leads-import-profiles` aceita `cards[]` do Prospectagram e `profiles[]` do Apify.
- A normalização compartilhada reconhece os dois contratos e preserva o bruto em `raw`.
- A primeira resolução está em `_shared/platform-crm-extracted-lead-resolver.ts`.
- Perfis `salao_cliente` e `afiliado_infoproduto` podem ser promovidos a card e recebem `platform_crm_lead_state`.
- `revisao` e `descarte` permanecem no inventário, sem promoção ao CRM.
- Telefone igual com handle diferente reutiliza o card encontrado por telefone.
- Handle já vinculado reutiliza o card antes de consultar telefone.
- Foram adicionados testes unitários para normalização de handle, buckets promocionáveis e regressão do helper de telefone.
- A triagem canônica e o histórico já estão implementados em migration + Edge Function; a UI de Buscas/Base agora chama `leads-triage` para reclassificação, semente e promoção manual por telefone.
- O teste controlado de identidade já foi executado e limpo: dois handles com o mesmo telefone produziram um único card canônico.
- A migration e as Edge Functions já foram aplicadas/publicadas no ambiente alvo; ainda falta adaptar a tela de Enriquecimento e substituir as operações de lixeira/aprovação por contratos backend próprios.
