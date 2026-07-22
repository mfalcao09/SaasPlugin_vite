-- B4 — `is_br_dialable` rejeitava celular pré-2012 (12 dígitos).
-- Aplicada em prod como `b4_fix_is_br_dialable_celular_antigo`.
-- SUCEDE: 20260722_b4_carteira_classificacao_camada1.sql (onde a função nasceu).
--
-- O ERRO: assumi que número de 12 dígitos (55 + DDD + 8) é sempre TELEFONE FIXO, e
-- exigi que o primeiro dígito local fosse [2-5]. Mas 12 dígitos também é CELULAR
-- ANTIGO — anterior à adição do nono dígito (2012).
--
-- IMPACTO EM PRODUÇÃO: **ZERO.** `normalize_phone_br` insere o nono dígito ANTES de
-- `is_br_dialable` ser chamada (`551198765432` -> `5511998765432`), então o caso nunca
-- chegava à função pelo caminho real. Verificado: 0 linhas resgatáveis na lixeira.
-- A correção vale como defesa — se um 12 dígitos chegar sem normalização, agora passa.
--
-- CONTEXTO DA DESCOBERTA (Fase 0 do plano da carteira): ao aplicar a regra direto nos
-- JIDs crus do Evolution, 72 de 350 contatos apareciam como rejeitados — e esses 72
-- concentram 66.775 mensagens (82% da conversa, 927 msgs/contato contra 59 dos demais).
-- O alarme era falso porque eu tinha pulado o normalizador na medição, mas a regra
-- estava mesmo errada e a correção fica.
--
-- A CORREÇÃO: para 12 dígitos, o primeiro dígito local válido é [2-9]. Só 0 e 1 são
-- inválidos (0 = prefixo de tronco, 1 = serviços especiais). A distinção
-- fixo-vs-celular-antigo não importa: a pergunta é "disca?", e ambos discam.
--
-- SUÍTE: 20/20 casos OK — os 15 originais mais celular antigo 6/7/8/9xxx (aceitos)
-- e local começando 0 e 1 (rejeitados).
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
    return substring(p from 5 for 1) = '9';        -- celular atual: 9 obrigatório
  else
    -- 12 dígitos = fixo (2-5) OU celular pré-2012 (6-9). Só 0 e 1 são inválidos.
    return substring(p from 5 for 1) ~ '[2-9]';
  end if;
end $function$;

comment on function public.is_br_dialable(text) is
  'B4: telefone E.164-BR realmente discavel. 12 digitos = fixo (2-5) OU celular pre-2012 (6-9).';
