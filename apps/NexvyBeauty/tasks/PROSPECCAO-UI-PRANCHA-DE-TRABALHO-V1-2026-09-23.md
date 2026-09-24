# Prospecção — prancha de trabalho da UI

**Data:** 2026-09-23  
**Status:** proposta para implementação  
**Fonte canônica:** CRM, banco e Harness. A UI é uma estação operacional, não a fonte de verdade.

## 1. Decisão de congelamento do CRM

O CRM trabalha com três níveis diferentes. Eles não podem ser misturados na mesma coluna ou no mesmo conceito visual:

```text
EXTRAÇÃO / LOTE
  └── PERFIL DE REDE (@handle, uma linha por origem)
        └── CARD DE LEAD (uma identidade comercial, N perfis/handles)
              └── ESTADO DO CRM (memória, estágio, próxima ação, Harness)
```

### 1.1 Perfil de rede

É o registro bruto/enriquecido que veio de Prospectagram, Server API, vídeo ou outra fonte.

- pode ter telefone, link, e-mail, bio e sinais de classificação;
- tem um `handle` próprio;
- pode estar ligado a um card por `imported_to_lead_id`;
- não é, sozinho, a identidade comercial definitiva;
- permanece no inventário mesmo depois de promovido ao CRM.

### 1.2 Card de lead

É a identidade comercial canônica de `platform_crm_leads`.

- um card pode conter vários handles;
- telefone igual + handles diferentes = um card, dois perfis;
- telefone e handle iguais = mesma ocorrência, sem duplicação;
- o card é a unidade de distribuição, conversa, memória e Harness;
- a UI deve mostrar todos os handles vinculados dentro do card.

### 1.3 Estado do CRM

`platform_crm_lead_state` guarda o estado operacional do card:

- estágio comercial;
- resumo e fatos;
- próxima ação;
- objeções e compromissos;
- consentimentos;
- dados necessários para o Harness.

Triagem não substitui estágio comercial. Um lead `principal` ainda pode estar pré-selecionado, contatado, em atendimento ou ganho.

### 1.4 Derivação visual do card

`triagem` continua sendo um atributo de perfil. Quando a UI agrupa perfis em um card, ela mostra um resumo derivado, sem sobrescrever a classificação individual:

```text
se existe perfil principal       → card com potencial principal
senão, se existe perfil semente  → card semente
senão, se todos estão removidos  → card removido/restaurável
senão                            → card não classificado
```

Campanhas não usam apenas o resumo do card: selecionam perfis elegíveis, deduplicam pelo card e escolhem o handle/canal autorizado para o contato. Assim, um card com dois handles não recebe dois disparos por acidente.

## 2. Baldes canônicos de triagem

O campo canônico é `platform_crm_extracted_leads.triagem`:

| Estado | Significado | Pode virar card? | Pode entrar em campanha? |
|---|---|---:|---:|
| `principal` | espaço-cliente: beleza + Brasil, alvo comercial | sim | somente após aprovação/elegibilidade |
| `semente` | afiliado, produtor, hub ou perfil útil para mineração/recrutamento | sim, com regra própria | não por padrão |
| `nao_classificado` | falta evidência, telefone ou enriquecimento | não automaticamente | não |
| `remocao_confirmada` | removido operacionalmente, mas restaurável | não | não |

Regras congeladas:

1. `segment` é projeção legada, não decisão de domínio.
2. `qualified` não define o balde e não significa automaticamente `principal`.
3. `excluded_at`/`platform_crm_lead_excluded` é lixeira LGPD destrutiva; não é `remocao_confirmada`.
4. Toda mudança de triagem passa pela Edge Function e gera histórico.
5. Enriquecimento altera o perfil original e reexecuta a triagem; não cria cópia.
6. O Harness só recebe público explicitamente elegível para a campanha.
7. Nenhuma campanha pode selecionar “todos aprovados” sem mostrar os critérios efetivos.

## 3. Proposta de navegação

```text
GESTÃO
├── Prospecção
│   ├── Entrada de leads
│   ├── Triagem
│   ├── Enriquecimento
│   └── Base de leads
├── Campanhas
└── Dashboard
```

O motor de extração fica fora do Gestão. A Entrada de leads recebe arquivos/envelopes produzidos externamente e chama `leads-import-profiles`.

O Prospectagram aparece apenas como **origem do lote**, não como módulo da UI.

## 4. Tela 1 — Entrada de leads

Objetivo: receber e acompanhar lotes, sem simular uma extração dentro do Gestão.

### Composição

- botão **Importar lote**;
- área para JSON/arquivo exportado;
- identificação da origem: Prospectagram, Server API, Vídeo, NexvyProspecta;
- nome opcional da leva;
- resumo antes do envio: perfis, handles únicos, telefones, duplicados, opt-outs;
- histórico de lotes com status `recebido`, `processando`, `concluído`, `erro`;
- contagem por triagem após processamento.

### Regra de interação

O usuário confirma o lote. A UI não classifica localmente, não deduplica como autoridade e não grava staging diretamente.

## 5. Tela 2 — Triagem

Esta é a principal prancha operacional.

### Cabeçalho

- total de perfis no inventário;
- total de cards canônicos;
- contagens por balde;
- fila sem telefone;
- fila com telefone;
- última atualização e último lote.

### Abas principais

```text
Todos | Principal | Semente | Não classificados | Remoção confirmada
```

Filtros secundários:

- lote/origem;
- com telefone / link / sem canal;
- país e idioma;
- seguidores;
- seguindo, posts, verificado;
- possui card / sem card;
- semente;
- aprovado para campanha;
- motivo da classificação.

### Unidade visual

A lista deve preferir **cards agrupados por lead** quando houver vínculo canônico:

```text
┌────────────────────────────────────────────────────────────┐
│ 🟢 PRINCIPAL   Marina Silva        +55 ...   2 handles     │
│ @marina.studio  @marinasilva.oficial                       │
│ Origem: Prospectagram · 2 perfis · 18,4k seguidores       │
│ [Ver card] [Enriquecer] [Mover] [Aprovar]                 │
└────────────────────────────────────────────────────────────┘
```

Perfis ainda não agrupados aparecem como cards de inventário, com indicação clara: **sem card canônico**.

### Painel lateral do registro

- identidade e todos os handles;
- origem de cada perfil;
- telefone e fonte do telefone;
- bio, categoria e sinais usados;
- veredito por camada: ICP, idioma, GEO, telefone;
- histórico da triagem;
- vínculo com card;
- ações: mover, marcar semente, enriquecer, abrir card, remover/restaurar.

Mover para outro balde exige motivo opcional e sempre exibe o efeito operacional.

## 6. Tela 3 — Enriquecimento

Objetivo: executar enriquecimento sobre uma seleção da Base de Leads, especialmente registros `nao_classificado` sem telefone. O lead não deixa de pertencer à Base; esta tela é a visão da operação.

### Cabeçalho

- “Não classificados” como filtro da Base de Leads;
- operações pendentes, em andamento, concluídas ou com erro;
- quantidade total;
- custo estimado do próximo lote;
- saldo/limite do provedor;
- tamanho do lote, padrão 200;
- botão **Enriquecer próximos 200**.

### Resultado de um lote

```text
Processados → telefone encontrado → sem telefone → erro → opt-out
```

Cada resultado atualiza o perfil original na Base de Leads. Depois, a Edge Function reexecuta a triagem:

```text
sem telefone → enriquecimento → telefone encontrado → classificação → principal/semente/revisão
```

A tela não deve criar uma segunda lista permanente de leads. Ela acompanha a operação e permite retornar ao registro original na Base de Leads.

### Seleção e movimentação operacional

Na Base de Leads, ações individuais e em lote criam operações auditáveis:

- **Enviar para enriquecimento:** cria operação pendente e bloqueia operações incompatíveis;
- **Reclassificar:** altera a triagem sem retirar o lead da Base;
- **Pré-selecionar:** move o lead no eixo vertical para o universo elegível de campanhas;
- **Preparar campanha:** cria vínculo com uma campanha, sem duplicar o lead;
- **Cancelar/retomar:** encerra ou reabre a operação conforme política.

## 7. Tela 4 — Base de leads

Esta é a casa universal dos leads. Ela mostra cards canônicos e perfis ainda não agrupados, inclusive `nao_classificado`. Enriquecimento, campanhas e disparos são operações/visões sobre esta base, não destinos que retiram o lead dela.

### Colunas principais

- card/identidade;
- handles vinculados;
- telefone/canais;
- triagem derivada dos perfis;
- estágio comercial;
- próxima ação;
- responsável/Harness;
- última interação;
- elegibilidade de campanha.

Além da triagem, a Base mostra o estado vertical atual e os overlays horizontais: enriquecimento pendente, pré-seleção, campanhas, último disparo e bloqueios.

### Detalhe do card

Abas:

```text
Resumo | Perfis e origens | Histórico | Conversas | Estado do CRM | Auditoria
```

O detalhe deve permitir abrir cada handle, mas as ações comerciais acontecem no card, não em uma linha isolada de perfil.

## 8. Tela 5 — Campanhas

Campanha é uma operação autorizada sobre cards elegíveis.

### Construtor de público

Filtros explícitos:

- triagem: principal por padrão;
- sementes: incluídas somente com autorização;
- estágio do CRM;
- canal disponível;
- telefone válido;
- opt-out e supressões;
- já contatados;
- janela de recência;
- responsável pelo atendimento.

### Fluxo

```text
Definir público → simular → revisar exclusões → criar rascunho
→ autorizar/armar → Harness executa → acompanhar respostas
```

A tela deve exibir a contagem em cada filtro e uma lista de exclusões explicadas.

## 9. Dashboard

O dashboard acompanha o funil real, não somente a origem dos dados:

```text
Perfis importados
→ não classificados
→ principais/sementes
→ cards criados
→ aprovados
→ pré-selecionados
→ contatados
→ em atendimento
→ ganhos
```

Indicadores mínimos:

- conversão por origem;
- taxa de agrupamento de handles;
- telefone encontrado pelo enriquecimento;
- tempo em `nao_classificado`;
- taxa de aprovação;
- campanhas por card;
- respostas, hard opt-outs e handoffs para Camila.

## 10. O que sai da UI atual

- “Revisão” como balde universal;
- `segment` como fonte de verdade;
- extração como módulo interno;
- aprovação confundida com classificação;
- tabela de perfis usada como se fosse CRM;
- lixeira usada como remoção reversível;
- campanhas baseadas em “todos aprovados” sem elegibilidade explícita.

## 11. Ordem de implementação

### Fase R1 — contrato e shell

- congelar tipos e transições;
- criar navegação Prospecção;
- criar componentes de balde e contadores;
- fazer a UI ler `triagem`.

### Fase R2 — Triagem

- substituir a tabela atual pela lista agrupável;
- painel de detalhe do perfil;
- histórico de triagem;
- remoção confirmada restaurável;
- reclassificação por Edge Function.

### Fase R3 — Entrada e enriquecimento

- importador de lotes;
- fila persistida de não classificados;
- enriquecimento em lotes;
- retorno automático à triagem.

### Fase R4 — Cards e Harness

- detalhe do card canônico;
- múltiplos handles;
- estado comercial;
- próxima ação e responsável;
- leitura de elegibilidade pelo Harness.

### Fase R5 — Campanhas e dashboard

- construtor de público;
- simulação e auditoria;
- criação/armação/desarme;
- métricas do funil.

### Radar futuro — NexvyProspecta

Quando o motor estiver pronto, ele entra como outra origem da Entrada de leads ou como módulo interno atrás do mesmo contrato. A UI não muda de modelo: muda apenas o provider da coleta.

## 12. Critério de sucesso da prancha

Um operador deve conseguir responder, sem abrir banco ou script:

1. De onde veio este perfil?
2. Quais handles pertencem ao mesmo lead?
3. Por que ele está neste balde?
4. O que falta para ele ser trabalhado?
5. Qual é a próxima ação do Harness?
6. Por que ele entrou ou não entrou numa campanha?
7. Como restaurar uma remoção operacional?

Se a UI não responder essas perguntas, ela ainda está mostrando dados, não operando o CRM.
