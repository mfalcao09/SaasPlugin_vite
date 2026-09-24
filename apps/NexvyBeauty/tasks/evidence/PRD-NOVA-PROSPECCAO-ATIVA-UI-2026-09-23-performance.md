# Evidência — leitura operacional e métricas

Data: 2026-09-23  
Projeto remoto: `fzhlbwhdejumkyqosuvq` (NexvyBeauty)

## Correção aplicada

- O resumo do Dashboard deixou de fazer múltiplas contagens sobre a view pesada.
- As métricas agora são calculadas diretamente nas tabelas canônicas: leads,
  estados do Harness, perfis, operações, opt-outs, campanhas e targets.
- A listagem continua usando o snapshot operacional, sem alteração no contrato
  dos cards.
- Foram adicionados somente índices aditivos em
  `20260923_prospeccao_snapshot_performance.sql`.

## Verificação

- Antes dos índices, a consulta paginada do snapshot excedia 30 segundos.
- Depois dos índices, a mesma consulta retornou 5 cards em aproximadamente
  0,55s.
- Totais canônicos reconciliados:
  - cards: `36.668`;
  - cards com telefone: `23.022`;
  - operações ativas: `0`;
  - estágios: `db=36.647`, `remarketing_pool=14`, `service=1`,
    `do_not_contact=6`;
  - triagem: `principal=29.585`, `semente=2.409`,
    `remocao_confirmada=4.674`;
  - supressão: `0`;
  - atividade de campanha: `0`.

## Segurança/regressão

- O snapshot e o histórico de operações sem autenticação continuam retornando
  `401`.
- Os testes determinísticos de migration, identidade, agrupamento por telefone
  e triagem continuam verdes: `9/9`.
- Nenhum estado vertical do Harness foi escrito nesta etapa.
