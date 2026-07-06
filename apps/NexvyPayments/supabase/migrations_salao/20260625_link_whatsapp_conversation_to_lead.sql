-- Fix da raiz (Radar IA 3a+3b): toda conversa de WhatsApp deve ter um lead vinculado.
-- Sem lead_id, os botões "Chamar IA / Atribuir / Criar tarefa" do Radar ficam
-- desabilitados (eles exigem item.lead_id). O evolution-webhook já vincula no inbound;
-- este trigger é a rede de segurança que cobre conversas iniciadas manualmente
-- ("+ Nova Conversa") e qualquer outro caminho.
-- NOTA: leads.phone_normalized é coluna GERADA (a partir de phone) → nunca setar.
-- Aplicada live em 2026-06-25 no project fzhlbwhdejumkyqosuvq.

create or replace function public.link_whatsapp_conversation_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_phone text;
begin
  if NEW.channel is distinct from 'whatsapp' then return NEW; end if;
  if NEW.lead_id is not null then return NEW; end if;

  v_phone := coalesce(
    nullif(NEW.visitor_phone_normalized, ''),
    regexp_replace(coalesce(NEW.visitor_phone, ''), '\D', '', 'g')
  );
  if v_phone is null or length(v_phone) < 8 then return NEW; end if;

  select id into v_lead_id
  from public.leads
  where organization_id = NEW.organization_id and phone_normalized = v_phone
  limit 1;

  if v_lead_id is null then
    insert into public.leads
      (organization_id, name, phone, lead_origin, lead_channel, source, score)
    values
      (NEW.organization_id,
       coalesce(nullif(NEW.visitor_name, ''), v_phone),
       coalesce(nullif(NEW.visitor_phone, ''), v_phone),
       'whatsapp', 'whatsapp', 'whatsapp', 0)
    returning id into v_lead_id;
  end if;

  NEW.lead_id := v_lead_id;
  return NEW;
end;
$$;

drop trigger if exists trg_link_whatsapp_lead on public.webchat_conversations;
create trigger trg_link_whatsapp_lead
  before insert on public.webchat_conversations
  for each row execute function public.link_whatsapp_conversation_to_lead();

-- Backfill (rodado uma vez na aplicação live): conversas WhatsApp já existentes sem lead.
do $$
declare
  r record;
  v_lead_id uuid;
  v_phone text;
begin
  for r in
    select id, organization_id, visitor_phone, visitor_phone_normalized, visitor_name
    from public.webchat_conversations
    where channel = 'whatsapp' and lead_id is null
  loop
    v_phone := coalesce(
      nullif(r.visitor_phone_normalized, ''),
      regexp_replace(coalesce(r.visitor_phone, ''), '\D', '', 'g')
    );
    if v_phone is null or length(v_phone) < 8 then continue; end if;

    select id into v_lead_id
    from public.leads
    where organization_id = r.organization_id and phone_normalized = v_phone
    limit 1;

    if v_lead_id is null then
      insert into public.leads
        (organization_id, name, phone, lead_origin, lead_channel, source, score)
      values
        (r.organization_id,
         coalesce(nullif(r.visitor_name, ''), v_phone),
         coalesce(nullif(r.visitor_phone, ''), v_phone),
         'whatsapp', 'whatsapp', 'whatsapp', 0)
      returning id into v_lead_id;
    end if;

    update public.webchat_conversations set lead_id = v_lead_id where id = r.id;
  end loop;
end $$;
