-- B5 — liga o handoff-para-humano nos agentes de tenant JÁ criados. APLICADA via
-- apply_migration 2026-07-22. O seed do apply-onboarding foi corrigido (can_transfer
-- =true + triggers default). Este backfill mira SÓ a assinatura do seed (can_transfer
-- =false E sem triggers E sem additional_prompt) para não sobrescrever agente que a
-- dona configurou deliberadamente sem escalação. Prova: os 3 agentes da org de teste
-- passaram a can_transfer=true + 4 triggers.
update public.product_agents
set can_transfer = true,
    handoff_triggers = array[
      'A cliente pede explicitamente para falar com uma pessoa, atendente ou humano',
      'A cliente reclama, está insatisfeita, irritada ou ameaça cancelar',
      'Cobrança errada, reembolso ou problema de pagamento que você não resolve',
      'Você não consegue responder mesmo consultando a base de conhecimento'
    ]
where can_transfer = false
  and (handoff_triggers is null or handoff_triggers = '{}')
  and (additional_prompt is null or btrim(additional_prompt) = '');
