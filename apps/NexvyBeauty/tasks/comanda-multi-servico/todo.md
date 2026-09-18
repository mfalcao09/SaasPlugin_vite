# Comanda Multi-Serviço — Agendamento Público (`/s/:slug`)

> Origem: pedido do Marcelo pra transformar o wizard público unisserviço do
> NexvyBeauty numa "cesta/comanda" multi-serviço, multi-profissional, com
> cross-sell, fracionamento de horário (gap scheduling) e forma de pagamento
> pretendida. Referências de domínio: spec do Gemini (2026-09-11, arquivos em
> `~/Downloads/gemini-code-*`) + comanda do ZapCorte (concorrente, barbearia).
> **Decisão de arquitetura (Marcelo, 2026-09-11): fonte única de verdade.**
> Rejeitada a tabela `booking_order_items` paralela da spec do Gemini —
> `agendamentos` continua sendo a única fonte item a item; `comandas` é só
> cabeçalho (cliente + pagamento + total), sem duplicar dado de item.

## Estado atual (mapeado em 2026-09-11)

- Rota real: `App.tsx:295` → `/s/:slug` → `src/pages/PublicSalaoBooking.tsx`
  (260 linhas, monolítico, `useState` local, wizard de 5 passos unisserviço).
- 3 edge functions Deno: `salao-public-bootstrap`, `salao-availability`
  (grade fixa 30min, 1 serviço + 1 profissional), `salao-public-booking`
  (1 insert em `agendamentos`, WhatsApp + notificação + comissão afiliado).
- `agendamentos` é tabela **compartilhada** com Agenda interna (`Agenda.tsx`,
  `DemoAgenda.tsx`, `useAgendamentosAsEvents.ts`), financeiro e comissão —
  1 linha = 1 serviço. Já tem `forma_pagamento` (editável em `Agenda.tsx:212`,
  hoje só usada pós-atendimento pelo admin).
- Anti-double-booking hoje = índice único exato
  `(organization_id, profissional_id, data, hora)` — não pega overlap de
  durações diferentes. `btree_gist` **não** está habilitado ainda.
- `servico_catalogo.categoria` é texto livre por tenant (sem taxonomia fixa)
  → cross-sell não pode depender de nome de categoria hardcoded.

## Achados dos vídeos do ZapCorte (frames via ffmpeg, 2026-09-11)

Vídeos analisados: `~/Downloads/ZAPCORTE/*.mov` (10min06 = tour do admin;
44s = site público do cliente). Frames extraídos por detecção de cena.

1. **Upsell por serviço, no checkout** — modal "Upsells Personalizados —
   *Corte Social*: selecione quais ofertas aparecem para este serviço no
   checkout", com checkbox por serviço (Barba R$20, Sobrancelha R$5),
   configurado na tela de Serviços. → **Valida `servico_cross_sell`.**
   Ajuste: o gatilho deles é no **checkout**, não ao adicionar o item.
2. **Encaixe back-to-back com duração exata** na agenda: 14:00–14:40,
   14:40–15:20, 15:20–16:00, 16:00–16:36, 16:35–17:16. **Não** é grade fixa
   de 30min. → Nossa `STEP = 30` fixa desperdiça agenda e piora muito com
   comanda (soma de durações raramente cai em múltiplo de 30).
3. **`Tipo de Serviço: Principal | Extra`** no cadastro do serviço —
   *"Serviços principais aparecem na lista inicial. Extras são adicionais
   rápidos."* → Resolve a poluição do catálogo plano (hoje o Studio Flor
   mostra 12+ serviços numa lista única no passo 1).
4. **Catálogo público visual**: foto por serviço, preço cheio riscado +
   preço promocional, duração, descrição curta, botão "Agendar Agora".
5. **Pausa/intervalo (almoço)** bloqueada na agenda (faixa hachurada
   "PAUSA"); no seletor público os slots pulam de 11:30 para 13:00.
   → Nosso motor não conhece pausa: um roteiro longo atravessa o almoço.
6. **Horário de funcionamento por dia da semana** (Dom fechado, Seg–Sex
   08:00–20:00) e do **estabelecimento**, não só do profissional.
7. **O ZapCorte NÃO tem carrinho multi-serviço no público.** Ele resolve
   com combos pré-montados vendidos como serviço único ("Corte + Barba,
   45min, R$45→R$30") + upsell no checkout + chat de IA guiando. Ou seja:
   o carrinho com fracionamento multi-profissional que o Marcelo quer é
   **diferenciação real**, não cópia — não há UX de referência pronta.

### Ajustes no plano decorrentes dos achados

**Entram no escopo (sem isso o multi-serviço nasce torto):**
- **A. Fim da grade rígida de 30min dentro da comanda.** Os itens de uma
  mesma comanda encaixam back-to-back (item 2 começa exatamente quando o
  item 1 termina). Candidatos de horário de *início* da comanda = grade de
  30min ∪ horários de término de agendamentos já existentes do profissional
  (maximiza ocupação sem oferecer horário esquisito tipo 14:07).
  Sem isso: "Barba 20min + Corte 50min" (70min reais) consumiria 90min de
  agenda e perderia opções de horário.
- **B. Pausa/intervalo do profissional.** `profissionais` ganha
  `intervalo_inicio time` / `intervalo_fim time`. Sem isso, roteiro longo
  atravessa o almoço do profissional.

**Recomendado (custo baixo, ganho alto — confirmar com o Marcelo):**
- **C. `servico_catalogo.tipo` ('principal' | 'extra')** — catálogo do
  passo 1 mostra só os principais; extras entram como adicional rápido no
  cross-sell. Custo: 1 coluna + filtro na UI + campo em `Servicos.tsx`.
- **D. Cross-sell em dois momentos:** inline ao adicionar (contextual, como
  na spec do Gemini) **e** varredura final no passo de revisão (como o
  ZapCorte faz no checkout).

**Fora de escopo (registrado, não fazer agora):**
- Imagem por serviço (upload/storage) e preço promocional riscado.
- Horário de funcionamento variável por dia da semana / do estabelecimento.
- Combos pré-montados como serviço único.
- Chat de IA guiando o agendamento no site público.

## Decisões fechadas com o Marcelo

1. **Schema:** fonte única (`agendamentos` continua item a item); `comandas`
   é cabeçalho novo, sem duplicar item. Sem tabela paralela de itens.
2. **Cross-sell:** tabela de configuração por tenant (`servico_cross_sell`),
   não heurística fixa por nome de categoria.
3. **Plano:** gravado aqui antes de iniciar qualquer edição de código.

## Modelo de dados (migration nova)

Arquivo: `supabase/migrations_salao/20260912_comanda_multiservico.sql`

```sql
-- 1. Comanda — cabeçalho (cliente + pagamento + total). Zero duplicação de item.
CREATE TABLE IF NOT EXISTS public.comandas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id                uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome              text NOT NULL,
  cliente_telefone          text NOT NULL,
  cliente_email             text,
  forma_pagamento_pretendida text, -- 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
  valor_total               numeric NOT NULL DEFAULT 0,
  duracao_total_minutos     int NOT NULL DEFAULT 0,
  desconto                  numeric NOT NULL DEFAULT 0,
  acrescimo                 numeric NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'confirmado'
                            CHECK (status IN ('confirmado','cancelado','concluido')),
  origem                    text DEFAULT 'publico',
  utm_source text, utm_medium text, utm_campaign text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comandas_org_idx ON public.comandas (organization_id);

-- 2. agendamentos ganha vínculo com a comanda (nullable — não quebra
--    agendamento interno criado direto na Agenda, sem comanda).
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS comanda_id      uuid REFERENCES public.comandas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_order int NOT NULL DEFAULT 1;

-- 3. Cross-sell — configuração por tenant (não heurística de nome fixo).
CREATE TABLE IF NOT EXISTS public.servico_cross_sell (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  servico_origem_id   uuid NOT NULL REFERENCES public.servico_catalogo(id) ON DELETE CASCADE,
  servico_sugerido_id uuid NOT NULL REFERENCES public.servico_catalogo(id) ON DELETE CASCADE,
  prioridade          int NOT NULL DEFAULT 0,
  ativo               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, servico_origem_id, servico_sugerido_id)
);
CREATE INDEX IF NOT EXISTS servico_cross_sell_origem_idx
  ON public.servico_cross_sell (organization_id, servico_origem_id) WHERE ativo;

-- 3b. Pausa/intervalo do profissional (achado #5 do ZapCorte) — sem isso
--     um roteiro longo atravessa o almoço.
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS intervalo_inicio time,
  ADD COLUMN IF NOT EXISTS intervalo_fim    time;

-- 3c. Tipo do serviço (achado #3) — só se o Marcelo aprovar o item C.
ALTER TABLE public.servico_catalogo
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'principal'
  CHECK (tipo IN ('principal','extra'));

-- 4. Overlap real (substitui a garantia do índice único exato, que não
--    pega durações diferentes se cruzando). Trigger, não coluna GERADA,
--    pois conversão de timezone não é IMMUTABLE em Postgres.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS periodo tstzrange;

CREATE OR REPLACE FUNCTION public.fn_agendamentos_set_periodo()
RETURNS trigger AS $$
BEGIN
  NEW.periodo := tstzrange(
    (NEW.data + NEW.hora) AT TIME ZONE 'America/Sao_Paulo',
    (NEW.data + NEW.hora + make_interval(mins => COALESCE(NEW.duracao_minutos, 30))) AT TIME ZONE 'America/Sao_Paulo',
    '[)'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agendamentos_set_periodo ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_set_periodo
  BEFORE INSERT OR UPDATE OF data, hora, duracao_minutos ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamentos_set_periodo();

-- backfill das linhas existentes (forçar o trigger) — ver pendência técnica abaixo

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_no_overlap_gist
  EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)
  WHERE (status IN ('agendado','confirmado','chegou'));
-- Índice único antigo (agendamentos_no_doublebook_uidx) mantido em paralelo
-- nesta release como cinto-e-suspensório; remover numa migration seguinte
-- depois de validar em produção.

-- 5. RLS (mesmo padrão de `pacotes`)
ALTER TABLE public.comandas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servico_cross_sell ENABLE ROW LEVEL SECURITY;
-- policies: select/insert/update por organization_id = profiles.organization_id
-- (usar pacotes_select / pacotes_insert / pacotes_update como modelo literal)

-- 6. RPC transacional — grava 1 comanda + N agendamentos atomicamente.
CREATE OR REPLACE FUNCTION public.fn_confirmar_comanda(payload jsonb)
RETURNS jsonb AS $$
-- itera payload->'itens', insere agendamentos com comanda_id + execution_order;
-- se qualquer EXCLUDE constraint disparar (23P01), toda a transação desfaz e a
-- function propaga o erro pro caller (edge function traduz pra 409).
$$ LANGUAGE plpgsql;
```

**Pendência técnica a validar na implementação** (execução, não decisão):
o backfill do `periodo` nas linhas existentes precisa forçar o trigger sem
lock longo em tabela quente — fazer em lotes se o volume justificar, e só
adicionar a constraint EXCLUDE depois do backfill completo (senão a
constraint falha nas linhas com `periodo` nulo).

## Fluxo do wizard público (renomeado pro domínio "comanda")

1. **Catálogo** → adicionar à comanda (multi-seleção) + cross-sell inline
   (via `servico_cross_sell`, "Clientes que fazem X também adicionam Y").
   Sticky bottom bar mobile-first: qtd itens, duração total, subtotal, `Avançar`.
2. **Preferência de atendimento**: único profissional (só se cobrir 100% dos
   itens) / profissional de preferência / automático (mais rápido).
3. **Motor de horários**: bloco contínuo monoprofissional → sequencial
   multiprofissional sem intervalo → fracionamento (gap scheduling) se não
   houver bloco contínuo suficiente no dia. Aplica precedência técnica
   (química/coloração → lavagem/tratamento → corte → escova; unhas/sobrancelha
   são independentes).
4. **Dados do cliente** + forma de pagamento pretendida (PIX / Cartão Crédito /
   Cartão Débito / Dinheiro) — microcopy "pagamento no estabelecimento".
5. **Revisão da comanda** + confirmar → chama `fn_confirmar_comanda` via RPC.

Visual: preservar integralmente o design atual (cabeçalho institucional fixo,
paleta neutra com gradiente vinho/rosa, cards com bordas arredondadas) e
otimizar pra toque em mobile.

## Arquivos (lista exata)

### Frontend
- `src/pages/PublicSalaoBooking.tsx` — reescrito, fino, orquestra os passos.
- NOVO `src/hooks/useComandaBooking.ts` — estado do carrinho (itens, cross-sell
  dispensados, totais, modo de preferência).
- NOVO `src/components/booking/publico/CatalogoStep.tsx`
- NOVO `src/components/booking/publico/CrossSellCard.tsx`
- NOVO `src/components/booking/publico/ComandaBar.tsx` (sticky bar + drawer)
- NOVO `src/components/booking/publico/PreferenciaProfissionalStep.tsx`
- NOVO `src/components/booking/publico/RoteiroHorarioStep.tsx`
- NOVO `src/components/booking/publico/DadosClienteStep.tsx`
- NOVO `src/components/booking/publico/RevisaoComandaStep.tsx`

### Backend (edge functions Deno)
- `supabase/functions/salao-public-bootstrap/index.ts` — incluir
  `servico_cross_sell` ativo no payload de bootstrap.
- `supabase/functions/salao-availability/index.ts` — **reescrita**: entrada
  = array de `servico_id[]` + modo de preferência (+ `profissional_id`
  preferido, opcional); saída = roteiros candidatos (contínuo / sequencial /
  fracionado), cada um com itens `{servico_id, profissional_id, inicio, fim}`.
- `supabase/functions/salao-public-booking/index.ts` — aceita comanda
  completa (cliente, forma de pagamento, roteiro escolhido); chama
  `fn_confirmar_comanda` via `sb.rpc(...)` em vez de insert solto. Preservar
  o que já existe: upsert de cliente, WhatsApp (evolution-send), notificação
  in-app pros admins, atribuição de comissão de afiliado.
- NOVO `supabase/functions/_shared/servicePrecedence.ts` — heurística de
  ordenação técnica (química → tratamento → corte → escova; serviços
  independentes ficam livres), compartilhada entre availability e booking.

### DB
- NOVO `supabase/migrations_salao/20260912_comanda_multiservico.sql`
  (schema completo acima).

## Ordem de execução

- [ ] **Fase 0 — Migration.** Criar `comandas`, `servico_cross_sell`, colunas
      em `agendamentos`, extensão + trigger + backfill + constraint EXCLUDE,
      RPC `fn_confirmar_comanda`, RLS. Rodar em staging primeiro.
      **Check binário:** inserir 2 agendamentos do mesmo profissional com
      horários que se sobrepõem (durações diferentes) → o segundo insert
      falha com `23P01`, não passa silenciosamente.
- [ ] **Fase 1 — Motor de horários.** `_shared/servicePrecedence.ts` +
      reescrita de `salao-availability`.
      **Check binário (3 cenários, todos têm que passar):**
      (i) comanda de 2 serviços de 45min cada, profissional com só 2 janelas
      de 45min separadas por 45min → devolve roteiro **fracionado**, não
      "sem horários disponíveis";
      (ii) comanda "Barba 20min + Corte 50min" → o 2º item começa
      exatamente no fim do 1º (**back-to-back**), consumindo 70min de
      agenda, não 90min;
      (iii) profissional com intervalo 12:00–13:00 → nenhum roteiro
      proposto invade a **pausa**.
- [ ] **Fase 2 — Gravação.** `salao-public-booking` reescrita (RPC
      transacional) + `salao-public-bootstrap` (inclui cross-sell).
      **Check binário:** confirmar uma comanda de 2 itens grava 1 linha em
      `comandas` + 2 linhas em `agendamentos` com o mesmo `comanda_id`,
      cada uma com seu `execution_order`.
- [ ] **Fase 3 — Frontend.** `useComandaBooking` + componentes do wizard,
      substituindo o `PublicSalaoBooking.tsx` atual.
      **Check binário (done da entrega):** no tenant de teste
      (`/s/meuteste1`), montar uma comanda com 2 serviços de categorias
      diferentes, ver a sugestão de cross-sell, escolher "profissional de
      preferência", ver o roteiro fracionado quando aplicável, confirmar — e
      os 2 agendamentos aparecerem em `Agenda.tsx` (interno) agrupados pela
      mesma comanda, sem quebrar comissão / financeiro / WhatsApp /
      notificação que já leem de `agendamentos`.

## Fora de escopo desta fase (não pedido — não implementar)

- Venda de produtos dentro da comanda (existe na comanda do ZapCorte) — só
  serviços por enquanto.
- UI de admin pra configurar `servico_cross_sell` (a tabela existe; o cadastro
  das regras nesta fase pode ser via SQL/dashboard Supabase).
- Remoção do índice único antigo `agendamentos_no_doublebook_uidx` (fica como
  cinto-e-suspensório até validar a constraint EXCLUDE em produção).
