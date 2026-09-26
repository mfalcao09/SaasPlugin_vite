# Nova Prospecção Ativa — Redesign do Dashboard

## Fase 0 — Congelamento visual e operacional

**Status:** concluída em 26/09/2026 07:11 BRT  
**Escopo:** contrato de leitura e critérios de aceite para o redesenho visual.  
**Sem alteração de layout nesta fase.**

## 1. Objetivo do congelamento

Estabelecer o que pode mudar visualmente e o que não pode mudar durante o
redesign. O dashboard é uma representação executiva do CRM; ele não cria uma
segunda fonte de verdade e não altera a lógica operacional.

## 2. Fonte canônica

O dashboard lê a Edge Function `leads-operational-snapshot`.

O CRM/Harness continua sendo a fonte canônica dos estágios operacionais. A
classificação de triagem é uma categoria persistida do lead e não muda o estágio
operacional por conta própria.

O lead continua morando fisicamente em `platform_crm_leads` / Base de Leads.
Enriquecimento, revisão, pré-seleção e campanhas são operações sobre o lead,
não novas casas físicas.

## 3. Contratos congelados

### Base de Leads

Categorias mutuamente exclusivas de triagem exibidas no dashboard:

- Principal
- Semente
- Não classificados
- Remoção confirmada

Essas categorias são baldes acessíveis. O dashboard não deve tratá-las como
erro, descarte ou ausência de lead.

### Estágio Operacional

Estágios verticais mutuamente exclusivos, sempre derivados do CRM:

- Na Base (`db`)
- Pré-selecionados (`preselected`)
- Contatados (`contacted`)
- Em atendimento (`service`)
- Remarketing (`remarketing_pool`)
- Não Contatar (`do_not_contact`)
- Fechamento (`closing`)
- Onboarding (`onboarding`)

Regra: somente o CRM/Harness altera o estágio. A UI apenas representa e filtra
esse valor.

### Ações Pendentes

São filas de trabalho, não categorias adicionais do lead:

- Não classificados → CTA `Revisar leads`
- Para enriquecimento → CTA `Enriquecer leads`
- Leads pré-selecionados → CTA `Programar disparo`
- Campanhas com problema → CTA `Ver campanhas`

Cada ação pendente deve ter CTA para a tela operacional correspondente.

### Atualização

- O botão `Atualizar` faz refetch da EF, sem recarregar a página.
- A EF grava auditoria somente após concluir o snapshot.
- O timestamp visual deve preferir `audit.completed_at` persistido.
- `status=success` só existe quando a auditoria foi gravada.
- `snapshot_version` identifica a versão persistida daquele refresh.

## 4. Baseline registrado

Consulta direta ao banco, produto `NexvyBeauty`, em 26/09/2026 07:11 BRT:

| Grupo | Valor |
|---|---:|
| Cards na Base | 40.032 |
| Com telefone | 23.069 |
| Principal | 29.585 |
| Semente | 2.409 |
| Não classificados | 3.364 |
| Remoção confirmada | 4.674 |
| Na Base | 40.011 |
| Em atendimento | 1 |
| Remarketing | 14 |
| Não Contatar | 6 |
| Pré-selecionados | 0 |
| Contatados | 0 |
| Fechamento | 0 |
| Onboarding | 0 |

Os quatro baldes de triagem somam 40.032 cards. Os estágios operacionais também
somam 40.032 cards.

## 5. Permitido no redesign

- Reorganizar hierarquia visual e espaçamento.
- Reduzir textos explicativos.
- Melhorar contraste entre número, título e informação secundária.
- Usar cores semânticas por categoria e estado.
- Adicionar ícones, hover, focus e microanimações discretas.
- Transformar blocos em cards executivos.
- Manter CTAs e filtros existentes, tornando-os mais claros.

## 6. Bloqueado no redesign

- Alterar números ou fórmulas de contagem.
- Criar uma categoria “Enriquecimento” como moradia do lead.
- Criar um segundo estágio operacional na UI.
- Mover fisicamente leads por alteração visual.
- Alterar a fonte dos estágios para a UI.
- Esconder Não classificados ou Remoção confirmada.
- Inventar percentuais, gráficos ou métricas não fornecidos pela EF.
- Remover rotas ou páginas antigas.
- Alterar EFs, migrations ou contratos de dados sem uma fase própria.

## 7. Critérios de aceite da Fase 1

A primeira mudança visual só será aceita se:

1. O dashboard continuar exibindo exatamente os valores do baseline atual.
2. O título ficar limpo, sem parágrafos conceituais.
3. `Atualizar` permanecer no canto superior direito.
4. O refresh não provocar reload da página.
5. O horário exibido vier da auditoria persistida quando disponível.
6. Principal, Semente, Não classificados e Remoção confirmada continuarem
   visíveis como baldes distintos.
7. O bloco Base de Leads ganhar hierarquia executiva sem criar nova semântica.
8. Nenhuma página fora do dashboard for alterada.
9. Build e validação visual em desktop e larguras menores passarem.

## 8. Próxima fase liberada

**Fase 1 — Primeiro viewport executivo:** cabeçalho, refresh persistido e cards
da Base de Leads. O Estágio Operacional e as Ações Pendentes ficam intactos até
a validação visual desta primeira entrega.
