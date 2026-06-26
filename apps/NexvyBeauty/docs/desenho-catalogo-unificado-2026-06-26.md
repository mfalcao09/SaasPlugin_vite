# Desenho — Catálogo Unificado (NexvyBeauty)

> **Serviços · Pacotes · Produtos** sobre `products` + `tipo` — **opção (B) aprovada** · 2026-06-26
> **Pacotes pagos no salão (sem Cakto por ora).** Rascunho para aprovação — **nenhum código escrito ainda.**

---

## 1. Decisão

- O usuário (cabeleireira/manicure/lash/podóloga…) vê **3 telas**: **Serviços**, **Pacotes**, **Produtos** *(Produtos = revenda física, net-new)*.
- Backing único: **tabela `products` + coluna `tipo`** (`servico | pacote | produto | oferta`). **Opção (B): pacote TAMBÉM mora em `products`**.
- **Pagamento de pacote = no salão (presencial).** O atendente **vende** (cria a venda) e **dá baixa em sessão** na mão. A compra via **Cakto / link de pagamento fica adiada** (dormente) — onda futura.
- O cérebro de IA (pitch/objeções/cadência) **não é tela** — é uma **aba avançada dentro de cada item**. `oferta` é só fallback no banco, **sem tela**.
- Régua: a cabeleireira pensa em *serviço, pacote, cliente, agenda, dinheiro*. Se ela precisa aprender uma palavra do sistema ("Oferta"), está errado.

## 2. Estado atual (medido no banco)

| Tabela | Papel | Linhas | Acoplamento |
|---|---|---|---|
| `products` | oferta de CRM (espinha do motor) | 1 | **46 tabelas** com FK `product_id` |
| `servico_catalogo` | serviços (catálogo) | 4 | agenda — `agendamentos.servico_id` (FK) |
| `pacotes` | catálogo de pacotes | 2 | **só** `pacote_clientes.pacote_id` (1 FK) + colunas Cakto (dormentes) |
| `pacote_clientes` | pacotes vendidos | 2 | venda/resgate |
| `lancamentos` | faturamento | — | solto (`tipo`+`categoria`, sem FK) |

**O trunfo:** as **46 FK tables** (CRM/IA/vendas) continuam apontando pra `product_id` — **intocadas**.

## 3. Modelo final — `products` + `tipo`

Sem colunas novas de domínio: reaproveita o que `products` já tem + o `settings jsonb`.

| Campo lógico | `servico` | `pacote` | `produto` |
|---|---|---|---|
| `name` | nome | nome | nome |
| `category` | **nicho** (cabelo/unha/cílios/sobrancelha/maquiagem/podologia/estética) | — | categoria |
| `description` | descrição | descrição | descrição |
| `pricing` (jsonb) | preço | valor | preço |
| `status` | ativo → published/draft | ativo | ativo |
| `settings.duracao_minutos` | ✅ | — | — |
| `settings.total_sessoes / validade_dias / servicos_incluidos` | — | ✅ | — |
| `settings.cakto_offer_slug / cakto_checkout_url` | — | **dormente** (futuro link de pagamento) | — |
| `settings.estoque / sku` | — | — | ✅ (futuro) |
| campos CRM (`pitch_*`,`icp`,`objections`,`knowledge_base`…) | null (aba IA opcional) | null | null |

## 4. Telas

- **Serviços** = `products WHERE tipo='servico'` → form nome/nicho/duração/preço → alimenta **agenda + faturamento**.
- **Pacotes** = `products WHERE tipo='pacote'` → form nome/sessões/validade/serviços incluídos/valor.
  - **Vender pacote (presencial):** atendente escolhe cliente + pacote → cria `pacote_clientes` (sem checkout).
  - **Dar baixa em sessão:** 1 clique decrementa as sessões quando a cliente vem.
- **Produtos** = `products WHERE tipo='produto'` → revenda física + estoque (**net-new**).
- Em cada item: aba avançada **"🤖 IA / Como vender"** (recolhida) editando os campos CRM da **mesma linha**.
- Captura (quiz/funil/WhatsApp/widget): seletor "qual produto?" vira **"pra qual serviço/pacote?"** (filtra por `tipo`) e grava o `product_id`. **Motor inalterado.**

## 5. Migração — passo a passo (risco por passo)

**5.0 Schema** — 🟢 baixo
```sql
alter table products add column tipo text not null default 'oferta'
  check (tipo in ('servico','pacote','produto','oferta'));
```

**5.1 Serviços → products** — 🟡 médio (re-aponta FK da agenda; ids preservados)
```sql
insert into products (id, organization_id, name, category, description, tipo, status, settings, pricing)
  select id, organization_id, nome, categoria, descricao, 'servico',
         case when ativo then 'published' else 'draft' end,
         jsonb_build_object('duracao_minutos', duracao_minutos),
         jsonb_build_object('preco_base', preco_base)
  from servico_catalogo;

alter table agendamentos drop constraint agendamentos_servico_id_fkey;
alter table agendamentos add constraint agendamentos_servico_id_fkey
  foreign key (servico_id) references products(id);
-- servico_catalogo → VIEW de compat (leitura)
```

**5.2 Pacotes → products** — 🟡 médio (**sem pagamento agora** → sem edge functions)
```sql
insert into products (id, organization_id, name, description, tipo, status, pricing, settings)
  select id, organization_id, nome, descricao, 'pacote',
         case when ativo then 'published' else 'draft' end,
         jsonb_build_object('valor', valor),
         jsonb_build_object('total_sessoes',total_sessoes,'validade_dias',validade_dias,
           'servicos_incluidos',servicos_incluidos,'cakto_offer_slug',cakto_offer_slug,
           'cakto_checkout_url',cakto_checkout_url)  -- cakto_* dormentes
  from pacotes;

alter table pacote_clientes drop constraint pacote_clientes_pacote_id_fkey;
alter table pacote_clientes add constraint pacote_clientes_pacote_id_fkey
  foreign key (pacote_id) references products(id);
-- pacotes → VIEW de compat
```
**Código a ajustar** (`from('pacotes')` → `products WHERE tipo='pacote'`, campos no `settings`):
- `src/cockpit/levers.ts`, `src/cockpit/AiGrowth.tsx`, `src/cockpit/Relatorios.tsx`, `src/pages/salao/ClienteDetail.tsx`, `supabase/functions/salao-public-bootstrap` (catálogo).
- **Construir** (era gap): tela **"Vender pacote" + "dar baixa em sessão"** (insert/decrement em `pacote_clientes`).
- **Desligar** a compra pública: `src/pages/PublicSalaoPacotes.tsx` (tirar o botão "Comprar" / a rota) — vira vitrine sem checkout, ou some.
- **NÃO tocar** (dormentes/fora de escopo): `salao-buy-pacote`, `cakto-sync-offer`, `cakto-webhook`.
- ❌ **NÃO** confundir com `useTagPackage` / `TagPackageGeneratorDialog` (pacote de **tags**, outro conceito).

**5.3 Produtos (revenda)** — 🟢 net-new, sem migração.
**5.4 UI** — 🟢 telas = views filtradas por `tipo`; aba IA escondida quando `tipo≠oferta`.

## 6. Blast radius & risco

- ✅ **46 FK tables (CRM/IA/vendas) intocadas** — permanecem em `product_id`. *É o motivo de (B) ser seguro.*
- 🟡 **Agenda:** 1 FK re-apontada (ids preservados → agendamentos existentes resolvem).
- 🟡 **Pacote:** 1 FK + ~5 sites de leitura. **Sem edge function de pagamento** (Cakto adiado) → risco caiu de 🟠 pra 🟡.
- **Dados minúsculos:** 1 product · 4 serviços · 2 pacotes · 2 vendas → quase greenfield.

## 7. Verificação (anti-phantom)

- Build → deploy (`--no-cache`) → grep da string servida no container.
- **Click-test logado** (agora **sem pagamento real** — tudo in-app):
  1. criar **Serviço** → aparece na **agenda** + entra no faturamento;
  2. criar **Pacote** → **vender presencial** (cria a venda) → **dar baixa em 1 sessão** (decrementa);
  3. criar **Quiz** apontando pra um serviço (grava `product_id` certo).
- `servico_catalogo` e `pacotes` viram **views de compat** → rollback = re-apontar as 2 FKs.

## 8. Fora de escopo (decidido)

- **Compra via Cakto / link de pagamento** → adiada (dormente). Onda futura: religar `cakto-sync-offer`/`cakto-webhook`/`salao-buy-pacote` lendo `products tipo=pacote`.
- **Não** tocar nos 46 FK tables — `product_id` permanece a espinha.
- **Não** mexer em tag-packages (conceito diferente).
- **Rejeitado:** segregar a captura em `servico_id`/`pacote_id` (46 tabelas polimórficas — alto risco, ganho só semântico).

---

### Próximo passo
Aprovar → implementar em ondas: **(1) `tipo` + Serviços** (menor risco) → **(2) Produtos revenda** → **(3) Pacotes: catálogo + vender/baixa presencial** (Cakto fica pra depois). Cada onda: build → deploy → click-test → prova.
