-- B4 — Camada 1 da classificação de carteira (determinística, sem score).
-- Aplicada em prod como `b4_carteira_classificacao_camada1` (20260722051443).
--
-- CONTEXTO: o sync de histórico do WhatsApp criou 84.194 "clientes" no org de teste,
-- 0 com nome real. Origem: `upsert_clientes_whatsapp` gravava o telefone como nome
-- quando o pushName vinha vazio, e o LID do Evolution (15-18 dígitos) passava pelo
-- normalizador. Resultado: a carteira da dona vira um lixão inutilizável.
--
-- ESTRATÉGIA: classificar, NUNCA deletar. `carteira_estado` é reversível com um UPDATE;
-- DELETE numa tabela com 7 FKs não é. A tela filtra por carteira_estado='principal'.
--
-- SUCEDE: 20260714_f6_carteira_whatsapp.sql (que criou normalize_phone_br + a RPC).

-- ---------------------------------------------------------------------------
-- is_br_dialable: "este número é discável no Brasil?" — determinístico, sem heurística.
-- Mata de uma vez: LID (>13 díg), número curto, país != 55, DDD inexistente (pega 0800
-- e US disfarçado), celular sem o 9 obrigatório e fixo com primeiro dígito inválido.
-- ---------------------------------------------------------------------------
create or replace function public.is_br_dialable(p text)
 returns boolean
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  ddd text;
  ddds text[] := array[
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99'];
begin
  -- rejeita LID (>13 dígitos), curto, e não-55
  if p is null or p !~ '^55[0-9]{10,11}$' then return false; end if;
  ddd := substring(p from 3 for 2);
  -- DDD inexistente mata 0800 e US disfarçado
  if not (ddd = any(ddds)) then return false; end if;
  if length(p) = 13 then
    return substring(p from 5 for 1) = '9';        -- celular: 9 obrigatório
  else
    return substring(p from 5 for 1) ~ '[2-5]';    -- fixo: 2-5
  end if;
end $function$;

comment on function public.is_br_dialable(text) is
  'B4: telefone E.164-BR realmente discável. Base determinística da Camada 1.';

-- ---------------------------------------------------------------------------
-- Colunas de estado da carteira.
-- tipo_contato    : o QUE é (cliente/lead/ruido/grupo/nao_br/lid)
-- carteira_estado : ONDE aparece (principal/a_revisar/lixeira) — é isto que a UI filtra
-- revisado_em/por : trava de decisão humana. Nenhum classificador automático pode
--                   sobrescrever uma linha que a dona já julgou.
-- client_score / sinais_wa: reservados para a Camada 2 (score por sinais de conversa).
-- ---------------------------------------------------------------------------
alter table public.clientes
  add column if not exists tipo_contato         text        not null default 'cliente',
  add column if not exists carteira_estado      text        not null default 'principal',
  add column if not exists client_score         smallint,
  add column if not exists sinais_wa            jsonb,
  add column if not exists classificacao_motivo text,
  add column if not exists excluded_at          timestamptz,
  add column if not exists revisado_em          timestamptz,
  add column if not exists revisado_por         uuid;

create index if not exists idx_clientes_carteira
  on public.clientes (organization_id, carteira_estado);

comment on column public.clientes.carteira_estado is
  'B4: principal | a_revisar | lixeira. Reversível — a lista da dona filtra por principal.';
comment on column public.clientes.revisado_em is
  'B4: trava humana. Preenchido = nenhum classificador automático toca esta linha.';
