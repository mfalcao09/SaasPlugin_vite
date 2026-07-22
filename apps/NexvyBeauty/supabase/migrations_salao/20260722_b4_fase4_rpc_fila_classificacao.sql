-- B4 / FASE 4 — a fila do classificador, em SQL.
-- Aplicada em prod como `b4_fase4_rpc_fila_classificacao`.
--
-- A primeira versão montava a fila no TypeScript ("cliente com sinais_wa nulo") e
-- depois procurava a conversa. Resultado medido: 3 de 3 sem conversa — porque o
-- filtro pegava também os 80.982 da lixeira, que nunca trocaram mensagem. Cada um
-- desses seria uma chamada de LLM desperdiçada.
--
-- O join "cliente que TEM conversa" é a própria definição da fila. Em SQL ele é uma
-- linha; no cliente vira duas queries e trabalho jogado fora.
--
-- Ordena por volume de conversa DESC: contato com mais histórico dá evidência mais
-- confiável, e é onde a classificação vale mais. Se o orçamento acabar no meio, o que
-- ficou de fora é a cauda, não a cabeça.
create or replace function public.carteira_fila_classificacao(
  p_organization_id uuid,
  p_limite          integer default 10
) returns table (cliente_id uuid, conversation_id uuid, telefone text, mensagens bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.id, w.id, c.telefone_normalizado,
         (select count(*) from public.webchat_messages m
           where m.conversation_id = w.id and coalesce(m.content,'') <> '')
  from public.clientes c
  join public.webchat_conversations w
    on w.organization_id = c.organization_id
   and w.visitor_phone_normalized = c.telefone_normalizado
  where c.organization_id = p_organization_id
    and c.sinais_wa is null          -- ainda não classificado
    and c.revisado_em is null        -- decisão humana é soberana: nem entra na fila
  order by 4 desc
  limit greatest(p_limite, 1);
$function$;

revoke all on function public.carteira_fila_classificacao(uuid, integer) from public, anon, authenticated;
grant execute on function public.carteira_fila_classificacao(uuid, integer) to service_role;

comment on function public.carteira_fila_classificacao(uuid, integer) is
  'Fase 4: fila do classificador — só cliente que TEM conversa, sem classificacao e sem decisao humana. Ordenada por volume desc: mais historico = evidencia melhor.';
