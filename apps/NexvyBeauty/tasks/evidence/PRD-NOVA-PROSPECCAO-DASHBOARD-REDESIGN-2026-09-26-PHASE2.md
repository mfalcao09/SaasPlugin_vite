# Nova Prospecção Ativa — Redesign do Dashboard

## Fase 2 — Estágio operacional

**Status:** implementada.

## Escopo

- O bloco `Estágio operacional` passou de uma lista visualmente uniforme para
  cartões compactos com identidade por estágio.
- Cada estágio recebeu ícone semântico, contagem tabular em destaque, borda e
  fundo cromático discreto.
- O hover repete a linguagem visual da Base de Leads, com elevação e reforço
  da borda.

## Invariantes

- Os oito estágios permanecem visíveis: Na Base, Pré-selecionados, Contatados,
  Em atendimento, Remarketing, Não Contatar, Fechamento e Onboarding.
- As contagens continuam lendo exclusivamente `summary.by_stage`.
- Nenhuma EF, migration, rota ou regra de elegibilidade foi alterada.
- A exclusividade operacional permanece responsabilidade do CRM.
- O build de produção e `git diff --check` passaram.

## Critério de validação visual

1. O bloco deve ser percebido como um funil operacional, sem texto explicativo
   adicional.
2. Os estágios devem ser diferenciáveis em uma leitura rápida.
3. A contagem deve ter mais peso visual que o rótulo.
4. O hover deve dar vida ao painel sem sugerir uma ação que ainda não existe.

