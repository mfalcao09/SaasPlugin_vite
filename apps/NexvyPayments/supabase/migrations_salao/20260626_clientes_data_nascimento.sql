-- E1 inc.2 — Aniversariantes do mês (AI Growth)
-- Adiciona data de nascimento ao cliente pra alimentar a alavanca "aniversariantes
-- do mês". Coluna `date` (sem timezone — data de nascimento não tem hora/TZ).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_nascimento date;

CREATE INDEX IF NOT EXISTS idx_clientes_data_nascimento
  ON public.clientes (data_nascimento);

COMMENT ON COLUMN public.clientes.data_nascimento IS
  'Data de nascimento do cliente — identifica aniversariantes do mês (AI Growth).';
