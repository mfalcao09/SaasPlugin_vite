-- B4 — Backfill da Camada 1 (determinística, reversível: muda ESTADO, não apaga).
-- Aplicada em prod como `b4_backfill_camada1_classificacao` (20260722051615).
--
-- Roda em TODOS os orgs (o bug do LID-vira-nome afeta qualquer um que ingeriu WA),
-- mas com WHERE que protege quem tem nome curado ou revisão manual.
--
-- RESULTADO MEDIDO no org de teste (5da38ea6…, 84.194 linhas):
--   lixeira/lid    45.237   LID não-resolvido (>13 dígitos)
--   lixeira/nao_br 35.745   DDD inexistente, 0800, celular sem 9, fixo inválido
--   a_revisar/lead  3.212   BR discável sem nome — fila de revisão da dona
--   -------------------------------------------------------------------
--   nome curado na lixeira: 0     transação na lixeira: 0     revisado_em sobrescrito: 0

-- ===== PASSO A — CAMADA 1 POSITIVA (o cinto de segurança) =====
-- Quem tem QUALQUER referência transacional é cliente POR DEFINIÇÃO. Determinístico,
-- sem score. Isto impede que a cliente que "foi 1x, adorou e volta em 6 meses" — que
-- agendou e pagou mas mandou 1 mensagem — seja jogada na lixeira por baixo volume.
-- As 7 tabelas são TODAS as que têm FK para clientes.id.
update public.clientes c
set tipo_contato = 'cliente',
    carteira_estado = 'principal',
    excluded_at = null,
    classificacao_motivo = 'camada1_positiva: possui historico transacional'
where c.revisado_em is null
  and (
       exists (select 1 from public.agendamentos               t where t.cliente_id = c.id)
    or exists (select 1 from public.lancamentos                t where t.cliente_id = c.id)
    or exists (select 1 from public.orcamentos                 t where t.cliente_id = c.id)
    or exists (select 1 from public.ordens_servico             t where t.cliente_id = c.id)
    or exists (select 1 from public.pacote_clientes            t where t.cliente_id = c.id)
    or exists (select 1 from public.veiculos                   t where t.cliente_id = c.id)
    or exists (select 1 from public.salon_client_field_requests t where t.cliente_id = c.id)
  );

-- ===== PASSO B — classificar o ruído de WhatsApp SEM prova transacional =====
-- Só toca quem: veio do WhatsApp (tag), tem nome numérico/vazio (sintoma do bug do
-- LID), NÃO tem transação e NÃO foi revisado pela dona.
-- Discável -> a_revisar (nunca auto-lixeira um número BR bom: o custo de errar contra
-- um lead real é assimétrico). Não-discável -> lixeira (recuperável por UPDATE).
update public.clientes c
set tipo_contato = case
      when c.telefone_normalizado is null then 'lid'
      when length(regexp_replace(coalesce(c.telefone,''), '\D', '', 'g')) > 13 then 'lid'
      when not public.is_br_dialable(c.telefone_normalizado) then 'nao_br'
      else 'lead'
    end,
    carteira_estado = case
      when public.is_br_dialable(c.telefone_normalizado) then 'a_revisar'
      else 'lixeira'
    end,
    excluded_at = case
      when public.is_br_dialable(c.telefone_normalizado) then null
      else now()
    end,
    classificacao_motivo = case
      when public.is_br_dialable(c.telefone_normalizado)
        then 'camada1: BR discavel, sem nome real -> fila de revisao da dona'
      else 'camada1: telefone nao discavel (LID/0800/DDD inexistente) -> lixeira recuperavel'
    end
where c.revisado_em is null
  and 'whatsapp' = any(c.tags)
  and (c.nome is null or btrim(c.nome) = '' or btrim(c.nome) ~ '^[0-9()+\s-]+$')
  and not (
       exists (select 1 from public.agendamentos               t where t.cliente_id = c.id)
    or exists (select 1 from public.lancamentos                t where t.cliente_id = c.id)
    or exists (select 1 from public.orcamentos                 t where t.cliente_id = c.id)
    or exists (select 1 from public.ordens_servico             t where t.cliente_id = c.id)
    or exists (select 1 from public.pacote_clientes            t where t.cliente_id = c.id)
    or exists (select 1 from public.veiculos                   t where t.cliente_id = c.id)
    or exists (select 1 from public.salon_client_field_requests t where t.cliente_id = c.id)
  );
