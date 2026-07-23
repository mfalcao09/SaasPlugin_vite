-- B4 — fecha um furo que EU abri hoje.
-- Aplicada em prod como `b4_revoke_anon_trigger_classifica_forma`.
-- SUCEDE: 20260722_b4_eixo1_forma_trigger_ingestao.sql
--
-- `clientes_classifica_forma()` é a função do trigger BEFORE INSERT do Eixo 1. Criei
-- hoje e esqueci o revoke — ela ficou executável por `anon`, aparecendo no advisor como
-- a 14ª `anon_security_definer_function_executable`. As outras 13 são intencionais
-- (fluxo público de onboarding, convite, e os predicados de RLS); esta não era.
--
-- Achada ao reverificar o estado para atualizar o placar de GO LIVE, em vez de repetir
-- de memória o que eu tinha afirmado de manhã.
--
-- Função de trigger não deve ser chamável diretamente por ninguém: o executor a invoca
-- sem checar privilégio EXECUTE do chamador, então revogar NÃO quebra o trigger.
--
-- PROVA depois do revoke: inserido um LID de 18 dígitos com tag whatsapp ->
-- carteira_estado='lixeira', tipo_contato='lid'. O trigger continua classificando.
revoke all on function public.clientes_classifica_forma() from public, anon, authenticated;

comment on function public.clientes_classifica_forma() is
  'Eixo 1 (forma) na ingestao WhatsApp. Só rebaixa numero nao-discavel. Nunca bloqueia entrada de numero valido — classificacao e faxineiro, nao porteiro. Sem EXECUTE para ninguem: e funcao de trigger.';
