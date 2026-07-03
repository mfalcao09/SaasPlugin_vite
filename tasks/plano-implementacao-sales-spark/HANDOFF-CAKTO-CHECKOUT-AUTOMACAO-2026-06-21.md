# HANDOFF — Automação de Checkout Cakto (NexvyBeauty) ✅ DONE / EM PRODUÇÃO

> **Para:** sessão master/coordenadora + sessão da vitrine `/vendas`.
> **Frente:** afiliados/pagamentos · **Data:** 2026-06-21 · **Sessão:** `e6154015-9d5b-486c-8440-caad60c6b36d`
> **Branch:** `feat/afiliados-proprios` (`acf23be`) · **Em prod (main):** `3ba8635`

---

## TL;DR
A geração dos links de checkout Cakto dos planos foi **automatizada**. Antes: colar link à mão em `platform_plans`. Agora: **1 botão "Sincronizar com a Cakto"** no super-admin (Pagamentos → Vínculo de planos) que descobre os produtos na Cakto, casa cada um com o plano (por **nome** ou **preço**), gera as ofertas **mensal + anual** e grava as URLs. **No ar e verificado** (6 links HTTP 200).

## Estado em produção (verificado em 2026-06-21)
| Plano | Mensal | Anual | Produto Cakto | Status |
|---|---|---|---|---|
| Trial (R$0) | — | — | — | pulado (grátis) |
| Starter (R$247 / 2470) | `pay.cakto.com.br/pgbqvbc` | `pay.cakto.com.br/y9t5rao` | `f23d881f-6f9b-4b15-8596-8a31b34a3fb9` | sincronizado (200) |
| Pro (R$391 / 3910) | `pay.cakto.com.br/3cmp8i2` | `pay.cakto.com.br/35p4eig` | `2714084a-42b9-464b-b9f1-b6b3f1eea30c` | sincronizado (200) |
| Premium (R$587 / 5870) | `pay.cakto.com.br/hqete53` | `pay.cakto.com.br/f49okf4` | `e77c9869-4a42-48f4-819b-0a263327c077` | sincronizado (200) |

Colunas gravadas por plano: `checkout_url` (mensal), `checkout_url_yearly` (anual), `checkout_url_cakto` (espelho da mensal), `cakto_offer_slug`, `cakto_product_id`.

## O que foi construído
**Backend (Supabase, projeto `fzhlbwhdejumkyqosuvq`):**
- `supabase/functions/_shared/cakto-client.ts` — `caktoCreateOffer/UpdateOffer/RetrieveOffer/ListOffers/ListProducts`, `buildCaktoCheckoutUrl`, `slugFromCaktoUrl`.
- `supabase/functions/cakto-sync-offer/index.ts` (**novo**, deployado) — gate super_admin; 2 modos: `{plan_id}` (1 plano) e `{all:true}` (todos + auto-match produto↔plano por nome/preço); reconciliação de oferta por **preço+recorrência** (reusa/atualiza/cria); monta URL `${CAKTO_CHECKOUT_BASE}/${slug}`.

**Frontend (`app.nexvybeauty.com.br`):**
- `src/hooks/usePlatformPlans.ts` — `useSyncCaktoOffer` (1 plano) + `useSyncAllCaktoPlans` (bulk).
- `src/components/superadmin/plans/PlanFormDialog.tsx` — dispara sync ao salvar um plano (não-bloqueante).
- `src/components/superadmin/payments/CaktoPlanMapping.tsx` — **redesenho 1-clique**; removidos os campos manuais Slug/URL (agora read-only gerados); botão "Sincronizar com a Cakto".

## Deploy realizado
- Edge Function `cakto-sync-offer` → deployada no Supabase.
- Frontend: **só o commit do Cakto** foi cherry-pickado p/ `main` (`b4975b9 → 3ba8635`, FF), VPS `/opt/stacks/saasplugin-vite` `git pull` + rebuild Docker `--no-cache` (`nexvy-beauty`), Traefik hot-reload. Provado: string nova no bundle servido (`/usr/share/nginx/html/assets/SuperAdmin-*.js`) + HTTP 200.
- ⚠️ **IMPORTANTE p/ a master:** o branch `feat/afiliados-proprios` carrega a **feature de afiliados inteira (8 commits)** que **NÃO foi para produção**. Só o checkout Cakto (`3ba8635`) está em prod. O resto é release separado.

## Para a sessão da vitrine `/vendas`
Já pode consumir, lendo `platform_plans` (planos pagos ativos):
- `checkout_url` (mensal) e `checkout_url_yearly` (anual) — botões de assinatura.
- `Trial` é gratuito (sem checkout).
- Os 4 planos: Trial, Starter, Pro, Premium (preços na tabela acima).

## Como operar daqui pra frente
- **Mudou o preço** de um plano → clicar "Sincronizar com a Cakto" (gera oferta nova; assinantes ativos da oferta antiga não são afetados).
- **Plano novo** → criar 1 produto na Cakto com o **mesmo nome do plano** → "Sincronizar" (auto-match por nome).
- **Pré-req:** API key da credencial `platform` (`cakto_credentials`) com escopo `write offers` — **já OK**.
- **Domínio próprio de checkout** (`checkout.nexvybeauty.com.br`): Cakto não suporta nos docs (só `pay.cakto.com.br`). Base é env `CAKTO_CHECKOUT_BASE` (default `https://pay.cakto.com.br`) — trocar 1 var se a Cakto liberar ou se montar 302 no Traefik.

## Memórias gravadas (cross-sessão)
- `reference_cakto_offer_api_checkout_url_2026-06-20.md` — API Cakto ofertas/produtos.
- `feedback_cakto_checkout_ux_oneclick_2026-06-21.md` — UX 1-clique + deploy isolado de feature-branch.

## Coordenação / não-conflito
Esta sessão tocou apenas `cakto-*` + telas de admin de planos (CaktoPlanMapping/usePlatformPlans/PlanFormDialog). **Não** tocou a vitrine `/vendas` (SalesPage) nem outros arquivos da sessão paralela. Cherry-pick isolado garante que nada da feature de afiliados vazou p/ prod.

## Localização da sessão
- JSONL: `/Users/marcelosilva/.claude/projects/-Users-marcelosilva-Projects-GitHub/e6154015-9d5b-486c-8440-caad60c6b36d.jsonl`
- cliSessionId: `e6154015-9d5b-486c-8440-caad60c6b36d`
