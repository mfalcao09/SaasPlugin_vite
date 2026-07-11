# Melhoria pós-lançamento — Apresentação visual rica de planos/produtos (propagação Meta + Cakto)

> **Pendência de feature/venda ESTACIONADA para pós-lançamento · 2026-07-11 · branch `feat/beauty-inbox-a1.2`**
> Análise de viabilidade. **Nenhum código alterado.** Groundwork para decisão do dono, não spec de build.

---

## 0. A verdade desconfortável primeiro

**[Certo] A promessa "cadastra uma vez, propaga rico pra AMBOS" só é entregável pela METADE.**

O catálogo Meta é 90% do caminho andado — a edge já aceita `image_url`, falta só popular a partir do plano. Barato, alto retorno.

**[Provável] O checkout da Cakto — que é justamente onde mora o ganho de conversão (depoimento, selo, cronômetro, header) — NÃO é automatizável pela API.** A `public_api` da Cakto que o código usa expõe só `token/`, `products/` e `offers/` (campos comerciais: nome, preço, recorrência, trial). Não há endpoint de checkout-builder. A camada visual do checkout Cakto vive na UI (`app.cakto.com.br/checkout-builder`) e continua **manual, por produto**.

Ou seja: o "single source of truth visual" que propaga pra tudo é uma meia-verdade. Meta = automatizável. Cakto visual = SOP manual. Vale fazer — mas com a expectativa calibrada, senão vira frustração ("por que a Cakto não atualizou sozinha?").

---

## 1. Estado atual (verificado, sem chute)

| Camada | O que existe hoje | Gap para "apresentação rica" |
|---|---|---|
| **Modelo de plano** (`platform_plans`) | `name`, `slug`, `description` (text), `highlight_label`, feature flags, `modules` (jsonb), `extra_features` (jsonb `Record<string,any>`) | **Sem `image_url`, sem galeria, sem depoimento estruturado** |
| **View pública** (`public_plans`) | Expõe display cols; **exclui `extra_features` de propósito** | Sem imagem; qualquer campo novo precisa entrar na view |
| **Sync Meta** (`platform-commerce-sync`) | Lê `public_plans` (só `name, slug, price_monthly, checkout_url`). Batch UPSERT **já suporta `image_url`** | Imagem só vem do **global** `platform_settings.meta_commerce_default_image_url` (=`null`). **Sem imagem por-plano** |
| **Sync Cakto** (`cakto-sync-offer` + `_shared/cakto-client.ts`) | Cria/atualiza **ofertas** (`/public_api/offers/`) e lista produtos (`/public_api/products/`). `CaktoOfferInput` = só campos comerciais | **Nenhum campo visual na API.** Sem endpoint de checkout-builder |

Observação: o webhook Cakto traz `product.image` (o produto TEM imagem no cadastro), mas o cliente só **lista** produtos — não cria/edita. Imagem do produto Cakto é setada **à mão no painel**.

---

## 2. Campos a adicionar aos planos (nosso sistema)

Proporcional ao uso real (Meta card = imagem única + nome + preço; Cakto = manual). Recomendação enxuta:

| Campo | Tipo | Serve a | Prioridade |
|---|---|---|---|
| `image_url` | `text` | **Card Meta** (WhatsApp/IG) + imagem do card na vitrine | **Alta — é o que destrava o item 2** |
| `highlights` | `text[]` ou `jsonb` | Bullets de benefício na vitrine/LP (Meta não usa) | Média |
| `gallery` | `jsonb` (`text[]`) | Galeria na LP; Meta usa `additional_image_urls` se um dia quisermos | Baixa |
| `testimonial` | `jsonb` (`{quote, author}`) | Prova social na LP (Cakto é manual) | Baixa |

**Atalho pragmático:** `image_url` como coluna dedicada (entra na view e no card Meta com custo mínimo). Galeria/destaques/depoimento cabem em `extra_features` (jsonb já existe) **se** só a LP consumir — mas a view exclui `extra_features`, então para a LP usar precisaria expor esses campos. Não crie 4 colunas de uma vez: **`image_url` resolve 80% do valor.**

---

## 3. Propagação pro catálogo Meta (caminho exato)

A edge já tem o encaixe. Caminho mínimo, sem tocar na lógica de batch:

1. **Migration:** `ALTER TABLE platform_plans ADD COLUMN image_url text;` + recriar `public_plans` incluindo `image_url` (a view é `DROP/CREATE` — trivial).
2. **Edge `platform-commerce-sync`:**
   - `PublicPlan` interface: adicionar `image_url: string | null`.
   - `select('name, slug, price_monthly, checkout_url')` → adicionar `image_url`.
   - `planToBatchRequest`: usar `plan.image_url ?? defaultImage` como `image` (fallback pro global que já existe). ~5 linhas.
3. Pronto: cada plano com imagem própria vira card visual no WhatsApp/IG; sem imagem, cai no default global. **Meta rejeita produto sem `image_url`** — então o fallback global continua sendo a rede de segurança.

Custo: **1 migration + ~5 linhas na edge.** Zero credencial nova (o gap `catalog_management` do doc CARDS-NATIVOS é pré-requisito de qualquer sync Meta, não desta melhoria).

---

## 4. Propagação pro checkout da Cakto — investigação

**[Provável] Não há caminho de API para a camada visual do checkout.**

- O cliente da casa (`_shared/cakto-client.ts`) fala com `api.cakto.com.br/public_api/`: `token/`, `products/` (só GET/list), `offers/` (create/update — campos comerciais).
- `CaktoOfferInput` não tem imagem, depoimento, selo, cronômetro nem header. A doc referenciada no código (`/api-reference/offers/create`) é comercial.
- Componentes ricos (imagem, depoimento, selo, header, lista, cronômetro) são configurados na UI `app.cakto.com.br/checkout-builder`, **por produto**.

**Conclusão registrada:** a parte visual do checkout Cakto é **manual (UI)**. O máximo que a automação faz hoje já faz: gerar a oferta e gravar a `checkout_url`. Enriquecimento visual do checkout = **SOP humano documentado**, não código.

> ⚠️ Confiança **[Provável]**, não [Certo]: baseado no cliente implementado + doc referenciada no código, não em varredura da doc oficial completa. Se algum dia a Cakto publicar API de checkout-builder, reabrir este item. Para fechar com [Certo], 15 min lendo `docs.cakto.com.br` resolvem — mas o custo/benefício de confirmar não muda a recomendação.

---

## 5. Esforço + recomendação

| Frente | Esforço | ROI |
|---|---|---|
| `image_url` por-plano → view → card Meta | **P** (1 migration + ~5 linhas + campo no editor de plano) | **Alto** — card visual real no WhatsApp/IG |
| Galeria + destaques + depoimento (modelo + expor na view + form admin) | **M** (4 campos, UI de edição, consumo na LP) | Médio — só LP, sem propagação |
| Checkout Cakto visual via API | **N/A** — API não expõe | — (fica SOP manual) |

**Recomendação:** fazer **só o P agora** quando sair do pós-lançamento — `image_url` por-plano fechando o único gap real do card Meta. Deixar galeria/destaques/depoimento como fase 2 (M), atrelada a quando a LP/vitrine precisar. **Não investir esforço tentando automatizar o visual da Cakto** — a API não expõe; registre como checklist manual no runbook de cadastro de produto. Calibrar a comunicação: "propaga automático pro Meta; Cakto visual é 1 passo manual no painel".

---

## Review

- **Meta:** encaixe pronto na edge; só falta `image_url` na origem (coluna + view + 5 linhas). Esforço **P**.
- **Cakto:** [Provável] sem API de checkout-builder — camada visual permanece manual (UI). Não automatizar.
- **Decisão pendente do dono:** (a) só `image_url` agora (P) ou (b) modelo visual completo galeria+destaques+depoimento (M, fase 2). Recomendação: (a).
