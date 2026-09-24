# Evidência — fixture E2E de importação

Data: 2026-09-23

## Contrato que será fechado

Um lote controlado do Prospectagram contendo dois perfis com telefones iguais e
handles diferentes deve resultar em:

- duas linhas em `platform_crm_extracted_leads`;
- um único `platform_crm_leads` card;
- dois `imported_to_lead_id` iguais;
- dois perfis visíveis no detalhe do card;
- `created_cards=1` e `grouped_by_phone=1`;
- remoção automática de toda a massa sintética ao final.

## Execução concluída

O teste foi executado contra a Edge Function publicada `leads-import-profiles`,
com produto NexvyBeauty e identificadores sintéticos únicos, usando JWT
temporário de `super_admin` apenas no runner server-side. Resultado:

```text
staged=2
created_cards=1
grouped_by_phone=1
cards=1
handles=2
cleanup=passed
```

Durante a primeira tentativa o loop encontrou e corrigiu duas lacunas reais:

1. a constraint de `source` não aceitava `prospectagram`; foi criada a migration
   aditiva `20260923_prospeccao_extraction_sources.sql`;
2. o resolver criava `lead_state` sem `derived_stage`; agora todo card novo entra
   explicitamente em `db`, preservando a elegibilidade do Harness.

O contrato de identidade também permanece coberto pelos testes determinísticos
de normalização/triagem (`5/5` verdes). Nenhum token, telefone ou identificador
de PII foi registrado na evidência.
