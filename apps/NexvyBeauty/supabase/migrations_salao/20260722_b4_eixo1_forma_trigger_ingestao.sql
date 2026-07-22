-- EIXO 1 — FORMA. Único eixo que decide na IMPORTAÇÃO.
-- Aplicada em prod como `b4_eixo1_forma_trigger_ingestao`.
--
-- REGRA (decisão do Marcelo, 22/07): a relação comercial (agendamento/pagamento) NÃO
-- participa da importação. No dia zero de um legado não existe agendamento nenhum no
-- sistema — se a transação fosse ramo da importação, 100% dos contatos cairiam no
-- "não" e a carteira nasceria vazia. Quebra de fluxo no exato momento em que o cliente
-- forma a percepção de valor do produto.
--
-- Portanto: classificação é FAXINEIRO, não PORTEIRO.
--   Eixo 1 (forma)    → único que decide na entrada; só rebaixa quem não tem forma
--                       de telefone. Determinístico, roda em 100%, custo zero.
--   Eixo 2 (relação)  → carimbo CONTÍNUO, só promove, nunca rebaixa. Vazio no dia
--                       zero, e isso é normal.
--   Eixo 3 (assunto)  → agente lê a conversa DEPOIS e tira quem não é do salão.
--
-- Ausência de conversa ou de agendamento NÃO é evidência de não-cliente.
--
-- Trigger em vez de patch na RPC porque `upsert_clientes_whatsapp` é apenas UMA das
-- portas de inserção — o trigger cobre também qualquer caminho futuro de ingestão.
--
-- PROVA (4 casos sintéticos, inseridos e removidos):
--   LID 18 díg + tag whatsapp        → lixeira / lid
--   celular BR válido + tag whatsapp → principal          <- ENTRA, não bloqueia
--   0800 + tag whatsapp              → lixeira / nao_br
--   0800 SEM tag whatsapp (manual)   → principal, intocado <- decisão humana preservada
create or replace function public.clientes_classifica_forma()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  tel text;
  so_digitos text;
begin
  -- Só toca contato vindo da ingestão do WhatsApp. Cliente digitado pela dona é
  -- decisão humana e não passa por classificador nenhum.
  if not ('whatsapp' = any(coalesce(NEW.tags, array[]::text[]))) then
    return NEW;
  end if;

  -- telefone_normalizado é GENERATED STORED e ainda não existe num BEFORE trigger;
  -- calcula pela mesma função que gera a coluna.
  tel := public.normalize_phone_br(NEW.telefone);
  so_digitos := regexp_replace(coalesce(NEW.telefone, ''), '\D', '', 'g');

  if tel is null or not public.is_br_dialable(tel) then
    NEW.tipo_contato := case
      when tel is null or length(so_digitos) > 13 then 'lid'
      else 'nao_br'
    end;
    NEW.carteira_estado      := 'lixeira';
    NEW.excluded_at          := now();
    NEW.classificacao_motivo := 'eixo1-forma: telefone nao discavel na ingestao WhatsApp';
  end if;

  -- DISCÁVEL: não decide nada aqui de propósito. Cai no default 'principal' e ENTRA
  -- na carteira. O Eixo 3 refina depois.
  return NEW;
end $function$;

drop trigger if exists trg_clientes_classifica_forma on public.clientes;
create trigger trg_clientes_classifica_forma
  before insert on public.clientes
  for each row execute function public.clientes_classifica_forma();

comment on function public.clientes_classifica_forma() is
  'Eixo 1 (forma) na ingestao WhatsApp. Só rebaixa numero nao-discavel. Nunca bloqueia entrada de numero valido — classificacao e faxineiro, nao porteiro.';
