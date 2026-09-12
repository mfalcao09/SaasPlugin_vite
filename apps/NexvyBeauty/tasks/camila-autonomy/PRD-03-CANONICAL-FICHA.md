# PRD-03 — Identidade, CRM e ficha canônica

## Objetivo

Garantir que toda resposta seja orientada por uma ficha durável da lead correta,
com memória longa, proveniência e atualização atômica.

## Modelo

- `platform_crm_lead_state`: estado atual por lead, com resumo, estágio
  derivado, próxima ação, objeções, compromissos, consentimentos e versão.
- `platform_crm_lead_memory`: memória append-only com tipo, conteúdo,
  `source_message_id`, confiança, validade, supersessão e embedding opcional.
- `platform_crm_messages`: transcript bruto e imutável.
- `platform_crm_journey_events`: eventos comerciais e outcomes.

O `lead_semantic_memory` existente não será reutilizado porque é
organization-scoped; a Camila opera no CRM de plataforma.

## Fluxo

1. Resolver telefone canônico e `lead_id`.
2. Recusar nome genérico, categoria ou telefone como nome humano.
3. Atualizar fatos somente a partir de inbound ou fonte externa identificada.
4. Gerar resumo progressivo sem perder fatos estruturados.
5. Recuperar fatos determinísticos e top-k semântico.
6. Montar snapshot versionado antes do brain.
7. Negar a resposta se lead, owner ou ficha não forem resolvidos.

## Requisitos de integridade

- Uma lead canônica por produto + telefone.
- Escrita atômica com lock otimista.
- Proibido substituir `metadata` a partir de snapshot antigo.
- Fato contradito é supersedido, nunca apagado sem trilha.
- Memória de uma lead nunca entra no contexto de outra.

## Check binário

PASS se 100% da coorte possuir `lead_id`, ficha e proveniência; replays
concorrentes não perderem campos; nomes reais do incidente forem resolvidos; e
o turno seguinte reler exatamente o estado persistido.

## Rollback

Feature flag retorna ao leitor anterior. As tabelas e memórias append-only são
preservadas para auditoria.
