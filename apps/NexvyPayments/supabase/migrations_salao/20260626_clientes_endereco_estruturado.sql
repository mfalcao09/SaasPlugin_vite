-- Endereço estruturado do cliente (pra classificar por região). CEP preenche
-- logradouro/bairro/cidade/uf (via ViaCEP no front); número e complemento manuais.
-- Mantém a coluna `endereco` legada (texto livre), recomposta no save.
alter table public.clientes
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text;

-- Índice pra segmentação por região (cidade/uf por org).
create index if not exists idx_clientes_regiao on public.clientes (organization_id, uf, cidade);
