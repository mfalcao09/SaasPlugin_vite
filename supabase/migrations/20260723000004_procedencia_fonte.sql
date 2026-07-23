-- ============================================================================
-- Procedência da informação — exigida pela ingestão do CNJ (card C0.9)
--
-- MOTIVO: a API do CNJ (atos.cnj.jus.br) não entrega apenas o ato. Entrega
-- também a SITUAÇÃO (Vigente/Alterado/Revogado/Exaurido), o TEXTO CONSOLIDADO
-- e as RELAÇÕES entre normas — tudo declarado pela própria fonte oficial.
--
-- Sem estes campos, uma relação declarada pelo CNJ teria de ser gravada como
-- `proposta_por='ia'`, o que é FALSO e prejudica a revisão humana: o revisor
-- da AGDM trataria dado oficial como palpite de máquina, gastaria tempo
-- conferindo o que já é oficial e — pior — passaria a desconfiar igualmente
-- de tudo, inclusive do que de fato precisa de escrutínio.
--
-- Procedência é dado de primeira classe: fonte ≠ ia ≠ humano.
-- ============================================================================

-- 1. Identidade do ato na origem -------------------------------------------
alter table public.atos
  add column if not exists id_fonte  text,
  add column if not exists url_fonte text;

comment on column public.atos.id_fonte is
  'ID do ato no sistema de origem (ex.: atos.cnj.jus.br id=1313). Chave estável '
  'para reingestão idempotente e para resolver relações entre atos da mesma fonte.';

comment on column public.atos.url_fonte is
  'URL canônica do ato na origem (ex.: https://atos.cnj.jus.br/atos/detalhar/1313).';

-- Reingestão não pode duplicar: o mesmo ato da mesma fonte é um só registro.
create unique index if not exists atos_fonte_id_fonte_uidx
  on public.atos (fonte_id, id_fonte)
  where id_fonte is not null;

-- 2. Procedência da relação normativa --------------------------------------
-- 'fonte'  = declarada pelo órgão publicador (o CNJ diz "Altera a Portaria X"
--            e referencia o ato). Não é inferência nossa.
-- 'ia'     = proposta por modelo a partir de texto não estruturado.
-- 'humano' = inserida ou corrigida por revisor.
alter table public.norma_relacoes
  drop constraint if exists norma_relacoes_proposta_por_check;

alter table public.norma_relacoes
  add constraint norma_relacoes_proposta_por_check
  check (proposta_por in ('fonte', 'ia', 'humano'));

comment on column public.norma_relacoes.proposta_por is
  'Procedência: fonte (declarada pelo órgão publicador) | ia (inferida por '
  'modelo) | humano (revisor). Determina o rigor da revisão — relação vinda de '
  'fonte oficial não é palpite.';

-- 3. Evidência da relação, para auditoria ----------------------------------
alter table public.norma_relacoes
  add column if not exists evidencia text;

comment on column public.norma_relacoes.evidencia is
  'Trecho verbatim que fundamenta a relação (ex.: a ementa "Altera a Portaria '
  'n. 34, de 2019"). Permite ao revisor conferir sem reabrir a fonte.';

-- 4. Situação da norma na origem -------------------------------------------
-- O CNJ mantém a vigência atualizada. Guardar o valor bruto permite detectar
-- divergência entre o que a fonte diz e o que o nosso acervo derivou.
alter table public.normas
  add column if not exists situacao_fonte    text,
  add column if not exists situacao_fonte_em timestamptz;

comment on column public.normas.situacao_fonte is
  'Situação como declarada pela fonte (ex.: CNJ: Vigente/Alterado/Revogado/'
  'Exaurido). Divergência com `situacao` sinaliza que o nosso acervo derivou '
  'algo diferente do oficial — e isso precisa ser investigado, não silenciado.';
