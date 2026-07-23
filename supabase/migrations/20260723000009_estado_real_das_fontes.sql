-- ============================================================================
-- Estado real de cada fonte (descoberto nos cards C0.4 / C0.6 / C0.8)
--
-- O seed da 0001 marcou as 6 fontes como ativas — otimismo de quando ninguém
-- tinha tentado acessá-las. Depois disso: DOU exige conta no INLABS, CNJ tem
-- API boa mas parser não escrito, STF não publica API e o BDJur do STJ está
-- atrás de Cloudflare.
--
-- Isso é DADO, não constante de código. Enquanto o motivo do bloqueio morava
-- num array em api-dev.mjs, a tela e o banco podiam discordar — e discordavam.
-- ============================================================================

update public.fontes_diarios set ativo = false,
  config_json = config_json || jsonb_build_object(
    'bloqueio', 'Aguarda credencial do INLABS (cadastro gratuito)')
 where sigla = 'DOU';

update public.fontes_diarios set ativo = false,
  config_json = config_json || jsonb_build_object(
    'bloqueio', 'API disponível; parser ainda não implementado')
 where sigla = 'CNJ';

update public.fontes_diarios set ativo = false,
  config_json = config_json || jsonb_build_object(
    'bloqueio', 'Sem API pública; lista curada desatualizada')
 where sigla = 'STF';

update public.fontes_diarios set ativo = false,
  config_json = config_json || jsonb_build_object(
    'bloqueio', 'BDJur atrás de Cloudflare')
 where sigla = 'STJ';

-- DOMS e DJMS seguem ativas: capturadas ponta a ponta, com fixture e hash.
update public.fontes_diarios set ativo = true
 where sigla in ('DOMS', 'DJMS');
