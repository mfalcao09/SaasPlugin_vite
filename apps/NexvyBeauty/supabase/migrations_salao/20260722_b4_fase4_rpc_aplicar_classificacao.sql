-- B4 / FASE 4 — aplicação da classificação, com a PRECEDÊNCIA em SQL.
-- Aplicada em prod como `b4_fase4_rpc_aplicar_classificacao`.
--
-- POR QUE A PRECEDÊNCIA MORA AQUI: ela é a regra que protege o cliente real de um
-- agente que errou. Se vivesse no TypeScript, dependeria de cada chamador lembrar de
-- aplicá-la. Aqui é impossível pular.
--
-- ORDEM, SEM EXCEÇÃO:
--   1. decisão humana (revisado_em)  -> nada sobrescreve, nunca
--   2. transação (Eixo 2)            -> continua cliente/principal; o agente NÃO
--                                       rebaixa quem agendou ou pagou. A evidência
--                                       é gravada mesmo assim (serve à análise)
--   3. agente (Eixo 3)               -> só decide o que sobrou
--
-- MAPEAMENTO assunto -> tag (decisão do Marcelo: pessoal é tag como cliente):
--   salao      -> lead        + principal   (fala de serviço, ainda não comprou)
--   misto      -> misto       + principal   (a sogra que também faz a unha lá)
--   pessoal    -> pessoal     + principal   (VISÍVEL na carteira; o gate de disparo
--                                            é que a exclui de campanha)
--   indefinido -> indefinido  + a_revisar   (agente sem evidência -> fila humana)
--
-- PROVA (sintéticos, inseridos e removidos): o agente tentou marcar os 3 como
-- 'pessoal' — o pior erro possível dele.
--   revisada pela dona -> travado_humano       ficou 'cliente', evidência nem gravada
--   com agendamento    -> cliente_transacional ficou 'cliente', evidência gravada
--   sem nada           -> classificado         virou 'pessoal'
create or replace function public.carteira_classificar_aplicar(
  p_cliente_id uuid,
  p_assunto    text,
  p_sinais     jsonb
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rev   timestamptz;
  v_org   uuid;
  v_trans boolean;
begin
  if p_assunto not in ('salao','pessoal','misto','indefinido') then
    raise exception 'assunto invalido: %', p_assunto;
  end if;

  select revisado_em, organization_id into v_rev, v_org
  from public.clientes where id = p_cliente_id;
  if v_org is null then return 'cliente_inexistente'; end if;

  -- 1) decisão humana é soberana
  if v_rev is not null then return 'travado_humano'; end if;

  -- 2) transação nunca é rebaixada
  select exists (
       select 1 from public.agendamentos    t where t.cliente_id = p_cliente_id
    union all select 1 from public.lancamentos    t where t.cliente_id = p_cliente_id
    union all select 1 from public.ordens_servico t where t.cliente_id = p_cliente_id
    union all select 1 from public.orcamentos     t where t.cliente_id = p_cliente_id
    union all select 1 from public.pacote_clientes t where t.cliente_id = p_cliente_id
  ) into v_trans;

  if v_trans then
    -- guarda a evidência (vale para a análise de carteira), mas mantém a relação
    update public.clientes
       set sinais_wa = p_sinais,
           tipo_contato = 'cliente',
           carteira_estado = 'principal',
           classificacao_motivo = 'eixo2: transacao prevalece sobre o agente'
     where id = p_cliente_id;
    return 'cliente_transacional';
  end if;

  -- 3) o agente decide o resto
  update public.clientes
     set sinais_wa = p_sinais,
         tipo_contato = case p_assunto
           when 'salao'   then 'lead'
           when 'misto'   then 'misto'
           when 'pessoal' then 'pessoal'
           else 'indefinido' end,
         carteira_estado = case
           when p_assunto = 'indefinido' then 'a_revisar'
           else 'principal' end,
         classificacao_motivo = 'eixo3-agente: assunto=' || p_assunto
   where id = p_cliente_id;

  return 'classificado';
end $function$;

revoke all on function public.carteira_classificar_aplicar(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.carteira_classificar_aplicar(uuid, text, jsonb) to service_role;

comment on function public.carteira_classificar_aplicar(uuid, text, jsonb) is
  'Fase 4: aplica a saida do agente respeitando a precedencia humano > transacao > agente. A regra mora no SQL para nao depender de o chamador lembrar dela.';
