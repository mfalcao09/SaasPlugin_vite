-- ============================================================================
-- Fonte nova: STJ Dados Abertos (card C0.10)
--
-- POR QUE UMA FONTE SEPARADA de 'stj-atos':
--   'stj-atos' aponta para transparencia.stj.jus.br (atos NORMATIVOS do STJ),
--   que está atrás de Cloudflare (403). Fica cadastrada como pendência para
--   quando houver acesso institucional.
--
--   Esta fonte é OUTRA coisa: decisões terminativas e acórdãos do DJe-STJ,
--   publicados pelo próprio STJ no portal CKAN de Dados Abertos —
--   HTTP 200, sem autenticação, sem anti-bot, atualizado diariamente,
--   licença CC-BY, e JÁ pseudonimizado na origem (#{nome_da_parte}).
--
--   Conteúdo distinto + acesso distinto = fonte distinta. Não sobrescrevemos
--   a linha 'stj-atos'.
--
-- Divisão formal do diário (Res. STJ/GP 19/2024, desde 29/11/2024):
--   · atos JUDICIAIS (decisões, intimações) → DJEN + este dataset aberto
--   · atos ADMINISTRATIVOS (súmulas, portarias) → DJe-STJ próprio (bloqueado)
-- ============================================================================

insert into public.fontes_diarios
  (nome, sigla, url_base, esfera, poder, uf, modo_acesso, parser_key, cron_expr, config_json)
values
  ('DJe-STJ — Decisões e Acórdãos (Dados Abertos)', 'STJDA',
   'https://dadosabertos.web.stj.jus.br', 'judiciario', 'judiciario', null,
   'api', 'stj-dados-abertos', '0 15 * * 1-6',
   jsonb_build_object(
     'dataset_id', 'integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica',
     'licenca', 'CC-BY',
     'pseudonimizado_na_origem', true,
     'observacao', 'Cobre decisões terminativas e acórdãos. Atos normativos do STJ virão em momento futuro (declarado pelo próprio STJ nas notas do dataset).'
   ))
on conflict (sigla) do nothing;
