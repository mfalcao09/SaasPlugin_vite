# Estágio 0 Reformulado — Afiliados, Rastreamento & Captura (NexvyBeauty)

**Para:** Marcelo (fundador) · **Data:** 2026-06-19 · **Status:** desenho para revisão. Substitui o Estágio 0/1 do `DESENHO-ONBOARDING-NEXVYBEAUTY-REVISAO`.

> **Veredito build-vs-buy:** UTMify é referência de atribuição de mídia (atalho via API Token); Voxuy é referência de recuperação no WhatsApp. O que você pede — LP idêntica para todos, captura robusta antes do checkout e comissão/painel de afiliado — **nenhuma das duas entrega pronto**. É camada própria (Edge Function + tabelas + RLS, Seção 11). A base existe: o Cakto tem afiliados nativos e nosso schema de `leads` já é rico.

---

## Mini-benchmark — UTMify x Voxuy (o que copiar pro NexvyBeauty)

> Honestidade sobre incerteza: a doc oficial da UTMify é SPA em JS e **não pôde ser lida na íntegra** — a descrição vem das centrais de ajuda dos checkouts parceiros (Cakto, Kiwify, Monetizze etc.). "Funil blindado" da Voxuy **não é um produto nomeado** pela empresa (o motor real chama-se "Funil de Conversão"); é jargão de mercado. Há reclamações públicas (Reclame Aqui) sobre suporte/falhas de trackeamento em ambas — validar com **venda-teste real (PIX-teste)** antes de confiar 100%.

| Eixo | UTMify | Voxuy | O que COPIAMOS pro NexvyBeauty |
|---|---|---|---|
| **Função principal** | Fecha o "buraco negro" de atribuição entre anúncio (Meta/Google/TikTok) e venda no checkout. Slogan: "Trackeie suas vendas de forma precisa" | Automação de WhatsApp para **recuperar vendas** e converter leads, disparada pelo **status** do pedido | Da UTMify: o conceito de atribuição de 2 pontas. Da Voxuy: a recuperação por status |
| **Modelo de rastreio** | **HÍBRIDO de 2 pontas**: (1) script JS client-side (`cdn.utmify.com.br/scripts/utms/latest.js`) lê UTMs/src/sck na URL, persiste em **cookie 1st-party** e reanexa na URL do checkout; (2) **webhook server-side** da venda casa com a sessão de UTMs | **Só server-side por status de pagamento**: a Cakto envia postback a cada evento (PIX gerado, boleto gerado, abandono, aprovado, reembolso). **NÃO** captura UTM/src/click-id — não faz atribuição de mídia | A arquitetura de 2 pontas da UTMify é o coração do nosso desenho. Server-side é a **fonte de verdade** |
| **Atribuição de afiliado** | O afiliado vem **no payload server-side da venda** (a Cakto sabe quem é o dono do link), independente de cookie/UTM | **Não rastreia afiliado** — gap confirmado | Atribuição de afiliado é confiável via webhook server-side, **não** via cookie do browser do comprador |
| **Captura do lead** | Capta UTMs no clique e repassa pro checkout; o lead "vira venda" no webhook | Capta **telefone/nome/email/CPF/endereço** que o contato preenche **no checkout** (não no clique do botão Comprar) | A Voxuy mostra que a captura "no checkout" é frágil pro nosso caso; queremos captura **antes** do checkout (ver `captureMd`) |
| **Recuperação de quem não pagou** | Não é o foco (é atribuição/dashboard) | **Núcleo do produto**: cadência por status (PIX gerado sem pagar, boleto a vencer próximo dia / vence hoje / vencido, abandono de checkout — ex. 00h01) | Replicável 1:1 como camada própria: Edge Function ouve webhook Cakto (PIX/boleto gerado, abandono) e dispara WhatsApp |
| **Segredos / Seção 11** | API TOKEN (UTMify) e chave de webhook (Cakto) são **server-side** — fora do front. O script JS de UTMs é client por natureza (só lê/repassa params, sem segredo) — aceitável no front | Postback URL é server-side | Manter token UTMify e segredo webhook Cakto fora de `NEXT_PUBLIC_*`; script de UTMs no front é OK |
| **O que NÃO resolve** | Recuperação no WhatsApp; gestão de comissão de afiliado (é dashboard de mídia) | Atribuição de origem / anti-clone / UTM. Order bump/upsell só como "tipo de funil" | Build vs buy: podemos usar UTMify como atalho de atribuição, **mas** comissão de afiliado e painel do parceiro são camada própria nossa |

**Conclusão de build-vs-buy:** a UTMify é boa referência (e atalho válido via API Token) para a **atribuição de mídia**; a Voxuy é referência para a **recuperação no WhatsApp**. Mas o que o Marcelo pede de diferente — LP idêntica para todos, captura robusta antes do checkout, e **comissão/painel de afiliado** — nenhuma das duas entrega pronto. Isso é camada própria: Edge Function + tabelas próprias + RLS (Seção 11).

---

## ESTAGIO 0 reformulado — Descoberta & Compra (ponta a ponta)

> **Visão**: o cliente do salão se preocupa só em operar o negócio; nós entregamos gestão com IA nativa. O Estagio 0 é onde o lead **chega, é qualificado e compra** — e onde decidimos **quem ganha a comissão** (afiliado) e **de onde veio** (plataforma). A LP e o onboarding são **visualmente idênticos** para todos; o que muda é invisível: o código de rastreio.
>
> Legenda: 🟢 **JÁ EXISTE** · 🟡 **EXISTE PARCIAL** (precisa expandir) · 🔴 **NOVO**

### Fluxo numerado com critério verificável

| # | Passo | Estado | Critério VERIFICÁVEL (binário) |
|---|---|---|---|
| 1 | **Afiliado pega seu link** apontando para a LP única, ex. `nexvybeauty.com/vendas?ref=<código>&utm_source=meta&utm_campaign=...` | 🔴 NOVO | Existe tabela `affiliate_links`; ao gerar link, retorna URL com `?ref=` resolvível. Teste: abrir link → LP carrega 200 e o `ref` aparece no cookie 1st-party |
| 2 | **Lead clica no anúncio/link** e cai na LP `/vendas` (SalesPage.tsx) — **idêntica para todos** | 🟡 PARCIAL (LP existe, hoje só salva interesse em `sales_leads` sem botão Comprar — `SalesPage.tsx:85-109`) | A LP renderizada é byte-a-byte a mesma para `ref=A`, `ref=B` e sem `ref`. Teste visual: diff de screenshot = 0 |
| 3 | **LP captura e persiste o tracking**: lê `ref`, `utm_source/medium/campaign/term/content`, `referrer`, `landing_page` da querystring → grava em **cookie 1st-party** | 🟡 PARCIAL (hoje só 3 UTMs via `URLSearchParams` em `SalesPage.tsx:95-99`; faltam term, content, referrer, ref) | Após carregar a LP, `document.cookie` contém `ref` + 5 UTMs + referrer. Teste: recarregar sem querystring → cookie persiste |
| 4 | **Lead clica em "Comprar"** → abre o **modal de Captura Robusta** (multi-step) ANTES de ir ao checkout | 🔴 NOVO (não existe botão Comprar hoje) | Clicar em Comprar abre o modal; o lead é **imediatamente tagueado** server-side com `ref` + UTMs (passo 6) mesmo se abandonar o modal |
| 5 | **Captura Robusta multi-step** — coleta qualificação completa (campos e ordem exatos em `captureMd`). Mínimo: **nome completo, e-mail, WhatsApp** + qualificação | 🔴 NOVO | Modal só avança ao próximo step com campo válido; ao concluir, retorna `lead_id`. Teste: e-mail inválido bloqueia avanço; WhatsApp valida formato BR |
| 6 | **Cria/atualiza lead TAGUEADO server-side** numa Edge Function: `lead_channel='afiliado:<ref>'` ou `'organico'`, `lead_origin` derivado do UTM, `utm_*` completos, `referrer_url`, `landing_page`, `affiliate_id` resolvido do `ref` | 🟡 PARCIAL (tabela `leads` já tem `lead_origin`, `lead_channel`, `utm_*`, `source`, `landing_page`, `referrer_url`, `metadata` — schema completo; mas `sales_leads` da LP só tem 3 UTMs e **nenhum** `affiliate_id`) | Após submit, existe 1 row em `leads`/`sales_leads` com `affiliate_id` preenchido (quando `ref` válido) e os 5 UTMs. Teste: query retorna o lead com canal + plataforma |
| 7 | **Redireciona pro checkout Cakto PRE-PREENCHIDO** carregando o tracking: `pay.cakto.com.br/<CODIGO>?affiliate=<id>&src=<canal>&utm_source=...&email=<email>` (email pré-preenchido evita duplicidade) | 🟡 PARCIAL (o desenho já previa link pré-preenchido anti-email-duplicado; a Cakto **aceita** `affiliate`, `src`, `sck`, `utm_*` na URL — confirmado na pesquisa) | A URL do botão final contém `affiliate` + `src` + 5 UTMs + email. Teste: inspecionar `href` do redirect → todos os params presentes |
| 8 | **Pagamento na Cakto** (PIX/boleto/cartão). Eventos intermediários (PIX gerado, boleto gerado, abandono) habilitam **recuperação estilo Voxuy** | 🔴 NOVO (recuperação) / 🟢 checkout Cakto já é o canal de venda | Webhook recebe `pix_gerado`/`abandono` → dispara cadência WhatsApp. Teste: gerar PIX-teste sem pagar → mensagem sai |
| 9 | **Webhook de venda ATRIBUI ao afiliado**: a Edge Function lê `data.affiliate`, `data.sck`, `data.utm_*`, `data.customer`, `data.fbc/fbp` do payload Cakto, casa com o `lead` pelo email, grava `order.affiliate_id` e cria registro de **comissão** | 🟡 PARCIAL (cakto-webhook existe e provisiona, mas **NÃO captura afiliado** hoje — `cakto-webhook/index.ts` mapeia só `coupon_code`; sem `affiliate_email`/`affiliate_id`) | Após venda aprovada, existe row em `affiliate_commissions` ligada ao `affiliate_id` e ao `order`. Teste: "Send test event" da Cakto → comissão criada (idempotente por `data.id`/`refId`) |
| 10 | **Provisionamento pós-Cakto** (cria org + admin + email + billing por email do cliente) | 🟢 JÁ EXISTE (`cakto-webhook/index.ts:81-171`; `cakto-plan-provisioning.ts`) | Org + admin criados, email enviado. Já validado no fluxo atual — **não muda** |

### O que é NOVO vs JÁ EXISTE (resumo)
- **JÁ EXISTE:** LP `/vendas`, captura de 3 UTMs, webhook Cakto, provisionamento org+admin+email, schema rico de `leads`, link de checkout pré-preenchido (no desenho).
- **EXISTE PARCIAL (expandir):** UTMs completos na LP, persistência em cookie 1st-party, taguear o lead da LP em `leads` (não só `sales_leads`), captura de afiliado no webhook.
- **NOVO:** botão Comprar, modal de Captura Robusta multi-step, resolução de `ref`→`affiliate_id`, tabelas `affiliates`/`affiliate_links`/`affiliate_commissions`, cadência de recuperação WhatsApp, painel do afiliado.

---

## Arquitetura técnica — rastreamento, persistência e atribuição

### A. Captura e persistência do `ref`/afiliado (querystring → cookie → server-side)

Espelha o modelo de 2 pontas da UTMify (pesquisa):

1. **Querystring (entrada):** o link do afiliado/anúncio carrega `?ref=<código>&utm_source=...&utm_medium=...&utm_campaign=...&utm_content=...&utm_term=...`. O `ref` é o **canal** (parceiro/afiliado); os `utm_*` são a **plataforma** (meta/google). Os dois eixos viajam juntos.
2. **Cookie 1st-party (persistência):** a LP lê esses params no carregamento e grava num **cookie 1st-party do domínio NexvyBeauty** (sobrevive ao hop LP→checkout e a recargas). É o mesmo princípio confirmado na doc da Kiwify ("a informação fica em cookies e é usada toda vez que uma compra é feita"). Hoje a LP só lê 3 UTMs via `URLSearchParams(window.location.search)` (`SalesPage.tsx:95-99`) e **não persiste em cookie** — gap a fechar.
3. **Lead server-side (fonte de verdade):** no clique em Comprar / submit do modal, uma **Edge Function** recebe os params (do cookie + do form) e grava o lead. **Nunca** depender só do client (Seção 11). A função resolve `ref`→`affiliate_id` consultando `affiliate_links`.

> **Por que cookie não basta:** cookie/pixel client é frágil (AdBlock, iOS, clonagem). A atribuição **definitiva** é o webhook server-side da venda (igual UTMify/XTracky). O cookie só carrega o tracking até o checkout; quem fecha a conta é o webhook.

### B. Como os UTMs viajam até o webhook (LP → checkout → venda)

| Hop | Mecanismo | Risco se faltar |
|---|---|---|
| Anúncio → LP | UTMs na querystring do anúncio | — |
| LP → checkout Cakto | **Reanexar** os params na URL do botão Comprar (`pay.cakto.com.br/<COD>?utm_source=...&src=<canal>&affiliate=<id>`). A Cakto persiste em cookie 1st-party dela e associa ao pedido | Sem isso o UTM **se perde no hop** (confirmado na pesquisa) |
| Checkout → webhook | A Cakto faz POST server-to-server com `data.utm_*`, `data.affiliate`, `data.sck`, `data.fbc/fbp`, `data.customer` | Sem parser desses campos, a venda não é atribuída |

### C. Parâmetros que a Cakto aceita / retorna (da pesquisa)

| Param | Aceito na URL do checkout? | Retorna no webhook? | Nota |
|---|---|---|---|
| `utm_source/medium/campaign/term/content` | ✅ (ex. `pay.cakto.com.br/AA58c2n?src=test&utm_source=facebook`) | ✅ `data.utm_source/medium/term/content/campaign` (doc oficial `event-history.md`) | Padrão GA |
| `affiliate` | ✅ (`?affiliate=dZkmk2PZ`) | ✅ `data.affiliate` | **(A VERIFICAR)** formato: a doc lista `data.affiliate` sem tipar; algumas fontes indicam ser o **email** do afiliado — confirmar com "Send test event" antes de codar o parser |
| `src` | ✅ (origem geral do tráfego, livre — recomendado pela UTMify) | **(A VERIFICAR)** a doc lista `sck` mas **não confirma `src` literal** no payload | Usar `src=<canal>` na URL; checar se volta no webhook |
| `sck` | ✅ (source checkout — origem específica da compra) | ✅ `data.sck` | — |
| `fbc` / `fbp` | (cookies do Facebook) | ✅ `data.fbc`, `data.fbp` | Para reenvio Meta CAPI server-side |
| `data.customer` | — | ✅ name/email/phone/docType/docNumber/birthDate | Casa o lead pelo email |
| `data.id` / `data.refId` | — | ✅ | **Chave de idempotência** obrigatória (anti-duplicação de comissão) |

### D. Tabelas novas sugeridas

```text
affiliates            -- o parceiro
  id, name, email, status, commission_pct (ou rule_id), created_at
affiliate_links       -- cada link/código de rastreio
  id, affiliate_id (fk), ref_code (único, = ?ref=), default_utm_*, label, created_at
leads / sales_leads   -- EXPANDIR: hoje sales_leads só tem utm_source/medium/campaign
  + utm_term, utm_content, referrer_url, landing_page, lead_channel, lead_origin,
  + affiliate_id (fk), source
orders (cakto_orders) -- EXPANDIR
  + affiliate_id (fk), affiliate_raw (= data.affiliate cru), src, sck, utm_* completos
affiliate_commissions -- NOVO (hoje commissions é só p/ sellers internos)
  id, affiliate_id (fk), order_id (fk), amount, pct_applied,
  status (pending|approved|paid), idempotency_key (= data.id/refId)
```

### E. Como casa com o código atual

- **`SalesPage.tsx:85-109`** — hoje captura 3 UTMs e salva interesse em `sales_leads`. **Mudança:** ler `ref` + 5 UTMs + referrer, persistir em cookie, e no botão Comprar chamar a Edge Function de captura. A LP continua idêntica visualmente.
- **`sales_leads` (types.ts:9437-9496)** — só `utm_source/medium/campaign`. **Mudança:** adicionar `utm_term`, `utm_content`, `referrer_url`, `landing_page`, `lead_channel`, `affiliate_id`. (A tabela `leads` "full" já tem quase tudo — `lead_origin`, `lead_channel`, `utm_*`, `source`, `landing_page`, `referrer_url`, `metadata` — falta só `affiliate_id`.)
- **`cakto-webhook/index.ts`** — hoje `mapCaktoOrderForUpsert` captura só `coupon_code` (`cakto-client.ts:71`) e **não** mapeia afiliado. **Mudança:** ler `data.affiliate`/`data.sck`/`data.utm_*`/`data.fbc/fbp`, gravar em `cakto_orders` + criar `affiliate_commissions` (idempotente por `data.id`). O fluxo de provisionamento (`index.ts:81-171`) **não muda**.
- **`cakto-plan-provisioning.ts:1-326`** — provisionamento por email. **Não muda**; só passa a conviver com a atribuição de afiliado gravada antes/junto.
- **Referência já existente no codebase:** `hotmart_orders.affiliate_email` é a **única** tabela com afiliado hoje (isolada, sem virar lead). Serve de modelo de coluna, mas precisamos do vínculo `lead`↔`order`↔`commission` que ela não tem.

---

## Captura Robusta — multi-step (estilo Cakto), campos e por quê

### Por que capturar ANTES do checkout (e não deixar pro checkout Cakto)
A Voxuy mostra o anti-padrão: ela captura os dados **no checkout** (telefone/nome/email/CPF que "o contato preenche no checkout"). Isso significa que **quem abandona o checkout some**. Para o NexvyBeauty queremos o oposto: **taguear e qualificar o lead no clique em Comprar**, antes do redirect — assim o lead fica salvo server-side mesmo se nunca pagar, e habilita recuperação. É a captura robusta que o Marcelo pediu (referência: a captação multi-step da própria Cakto — instagram, dores do negócio, nome, CNPJ, aceite).

### Campos e ordem exata (mínimo + qualificação)

| Step | Campo | Obrigatório | Por quê | Critério verificável |
|---|---|---|---|---|
| 1 | **Nome completo** | ✅ | Identidade do lead; pré-preenche checkout | Não avança vazio |
| 1 | **E-mail** | ✅ | **Chave anti-duplicidade** (casa lead↔venda no webhook por `data.customer.email`); pré-preenche o checkout Cakto | Regex de email; bloqueia inválido |
| 1 | **WhatsApp** | ✅ | Canal de recuperação (estilo Voxuy) e de relacionamento | Valida formato BR (DDD + 9 dígitos) |
| 2 | **Instagram do salão** | recomendado | Espelha a captação Cakto; enriquece o lead | Aceita @handle ou URL; opcional |
| 2 | **Principal dor hoje** (ex.: agenda no papel, WhatsApp bagunçado, sem controle de caixa) | recomendado | Qualificação → score/temperatura (o `funnel-submit` já faz scoring: `score`, `tags`, hot/warm/cold) | Seleção registrada em `metadata` |
| 3 | **Nome do negócio / salão** | recomendado | Contexto comercial | Opcional |
| 3 | **CNPJ** (ou "ainda não tenho") | opcional | Espelha a captação Cakto; segmenta MEI vs estabelecido | Se preenchido, valida 14 dígitos |
| 4 | **Aceite de termos + LGPD** | ✅ | Base legal para contato/WhatsApp; espelha o aceite Cakto | Checkbox marcado obrigatório |

> Ordem desenhada para **fricção crescente**: os 3 campos críticos (nome+email+whatsapp) primeiro, garantindo o lead mesmo se o usuário abandonar nos steps de qualificação. Cada step só avança com validação binária (sem isso, é "checklist de boa intenção").

### Como resolve o e-mail duplicado
O e-mail coletado no Step 1 é injetado na URL do checkout Cakto **pré-preenchido** (`pay.cakto.com.br/<COD>?email=<email>&affiliate=<id>&...`). Como o provisionamento pós-Cakto cria org+admin **por email do cliente** (`cakto-webhook/index.ts:81-171`), garantir que o email do lead = email do checkout = email da venda **elimina a divergência** que causa org/admin duplicado. (A robustez final é a idempotência por `data.id`/`refId` no webhook.)

### Como habilita recuperação de quem não pagou (estilo Voxuy)
Como o lead já está salvo server-side **com WhatsApp** antes do pagamento, quando a Cakto disparar `pix_gerado`, `boleto_gerado` ou `abandono_checkout`, a Edge Function aciona a cadência WhatsApp (ex.: 00h01 após gerar, "vence próximo dia", "vence hoje", "vencido") — replicando o Funil de Conversão da Voxuy como **camada própria** (a Voxuy não rastreia afiliado/UTM, então mantemos atribuição em casa). **(A VERIFICAR)** payload/eventos exatos de abandono da Cakto com "Send test event" real.

---

## Atribuição & comissão — quem vendeu, como remunerar, painel mínimo

### Como saber quem vendeu (cadeia de atribuição)
1. **No clique:** o `ref` (cookie 1st-party) já resolve `affiliate_id` e taguei o lead (`lead_channel='afiliado:<ref>'`).
2. **No checkout:** o `affiliate`/`src` viajam na URL; a Cakto associa ao pedido por **cookie 1st-party dela** OU pelo param explícito.
3. **Na venda (fonte de verdade):** o webhook Cakto traz `data.affiliate` + `data.sck` + `data.utm_*`. A Edge Function casa pelo email (`data.customer.email`) e grava `order.affiliate_id`. Server-side = confiável, não depende do cookie do comprador.

> **Política de clique (decisão de produto):** a Cakto suporta **último-clique vs primeiro-clique configurável por produto**, e a **janela do cookie** é definida pelo produtor (1 dia, 30 dias, indeterminado — **(A VERIFICAR)** default exato não documentado). Em "último clique", se outro afiliado entra na cadeia, ele vence. Isso precisa ser decidido conscientemente (ver `openDecisions`).

### Registrar a comissão (idempotente)
- Tabela **`affiliate_commissions`** (NOVA — hoje só existe `commissions` para sellers internos, ligada a `rule_id`, **não** a afiliado externo).
- Na venda aprovada: criar row `{affiliate_id, order_id, amount, pct_applied, status='pending', idempotency_key=data.id}`.
- **Idempotência obrigatória** por `data.id`/`data.refId` (reentregas do webhook não podem duplicar comissão — Seção 6).
- Estados: `pending` (venda aprovada) → `approved` (passou janela de reembolso/chargeback) → `paid`. Eventos `reembolso`/`chargeback` da Cakto revertem para `cancelled`.

### Escopo MÍNIMO do painel do afiliado
| Recurso | Conteúdo | Critério verificável |
|---|---|---|
| **Meu link** | Link próprio com `?ref=<code>` (de `affiliate_links`); botão copiar; opção de adicionar `&src=` por canal | Link gerado abre a LP e taguei o lead |
| **Minhas vendas** | Lista de `orders` com `affiliate_id` = eu (data, valor, status) | Bate com webhook aprovado |
| **Minha comissão** | Soma por status (pending/approved/paid) de `affiliate_commissions` | Total = soma das rows do afiliado |

> **Build vs buy:** a Cakto tem **programa de afiliados nativo** (link com cookie de clique, comissão por venda). O painel mínimo acima pode ser apenas uma **leitura** dos dados que já gravamos via webhook — ou, num primeiro momento, delegar pagamento de comissão à própria Cakto e nós só **espelharmos** para o dashboard (decisão no `openDecisions`). Nenhuma das referências (UTMify/Voxuy) gere comissão de afiliado — essa camada é nossa.

---

## DELTA no roadmap — Estagio 0 vira robusto

O Estagio 0 deixa de ser "LP que salva interesse" e passa a ser **checkout assistido + tracking de 2 eixos + captura robusta + atribuição de afiliado**. Sugiro dividir em **Fase 3 expandida** (a jornada de compra) e uma **NOVA Fase A — Afiliados & Atribuição** (a infra de quem ganha a comissão), porque misturar as duas explode o escopo.

### Fase 3 EXPANDIDA — Checkout assistido + tracking + captura
| Item | Por quê | Critério verificável | Esforço | Dependência |
|---|---|---|---|---|
| Botão "Comprar" na LP `/vendas` | Hoje a LP não tem botão (só salva interesse) | Clicar abre o modal de captura | **P** | — |
| Modal Captura Robusta multi-step | Qualificação completa + lead salvo antes do pagamento | E-mail/WhatsApp inválido bloqueia; conclui retornando `lead_id` | **M** | botão Comprar |
| Persistir `ref`+5 UTMs+referrer em cookie 1st-party na LP | Hoje só 3 UTMs, sem cookie (`SalesPage.tsx:95-99`) | Recarregar sem querystring → cookie persiste | **P** | — |
| Edge Function de captura (lead tagueado server-side) | Não depender do client (Seção 11) | Submit cria 1 row em `leads` com canal+plataforma | **M** | modal |
| Redirect Cakto pré-preenchido com tracking + email | Anti email-duplicado + propagação de UTM/afiliado | `href` do botão final tem `affiliate`+`src`+5 UTMs+email | **P** | captura, Fase A |
| Cadência de recuperação WhatsApp (estilo Voxuy) | Recuperar PIX gerado/boleto/abandono | PIX-teste sem pagar → mensagem sai | **M** | webhook eventos Cakto **(A VERIFICAR)** payload |

### Fase A NOVA — Afiliados & Atribuição
| Item | Por quê | Critério verificável | Esforço | Dependência |
|---|---|---|---|---|
| Tabelas `affiliates` + `affiliate_links` | Não existe modelo de afiliado hoje (gap) | Gerar link retorna URL com `?ref=` resolvível | **M** | — |
| Resolver `ref`→`affiliate_id` na captura | Saber o canal (parceiro) | Lead com `ref` válido grava `affiliate_id` | **P** | Fase 3 captura |
| `cakto-webhook` lê afiliado/UTM/fbc do payload | Hoje só pega `coupon_code` (`cakto-client.ts:71`) | "Send test event" → `order.affiliate_id` preenchido | **M** | tabelas |
| Tabela `affiliate_commissions` idempotente | `commissions` atual é só seller interno | Venda aprovada → 1 comissão (sem duplicar em reentrega) | **M** | webhook |
| Painel mínimo do afiliado (link/vendas/comissão) | Parceiro precisa ver o que ganhou | 3 telas batem com dados do webhook | **M** | comissões |
| Validar `data.affiliate`/`src` empiricamente | Formato incerto (A VERIFICAR) | Test event mostra tipo real antes de codar parser | **P** | acesso Cakto |

### O que NÃO muda
- Provisionamento org+admin+email pós-Cakto (`cakto-webhook/index.ts:81-171`, `cakto-plan-provisioning.ts`) — **estável, mantém**.
- Schema rico de `leads` já cobre quase tudo; só falta `affiliate_id`.

---

## Decisões pendentes (suas) — antes de eu construir

1. CAPTURA: coletar nome+email+WhatsApp ANTES do redirect (modal próprio, lead salvo mesmo sem pagar) OU deixar a coleta no checkout Cakto (mais simples, mas perde quem abandona — anti-padrão Voxuy)? Recomendação: antes, no modal próprio.
2. MODELO DE COMISSÃO: usar o programa de afiliados NATIVO da Cakto (Cakto paga e nós só espelhamos no painel) OU gerir comissão própria em affiliate_commissions (mais controle, mais build)? Impacta esforço da Fase A.
3. JANELA DE COOKIE + ÚLTIMO vs PRIMEIRO CLIQUE: a Cakto deixa configurável por produto (1d/30d/indeterminado, default A VERIFICAR). Qual janela e qual atribuição em disputa entre dois afiliados?
4. CAMPOS DE QUALIFICAÇÃO: além de nome+email+WhatsApp, quais são obrigatórios vs opcionais (Instagram, dor principal, nome do salão, CNPJ, aceite LGPD)? Mais campos = mais fricção, menos conversão.
5. FORMATO de data.affiliate e presença de data.src no payload do webhook Cakto sao INCERTOS (A VERIFICAR) — precisa de um 'Send test event' real da Cakto antes de codar o parser de atribuição.
6. BUILD vs BUY do tracking de mídia: implementar propagação UTM + webhook próprios (mais controle, sem custo recorrente) OU usar UTMify via API Token (atalho, mas dependência e custo, e reclamações públicas sobre trackeamento)?
7. RECUPERAÇÃO WhatsApp: construir cadência própria (Edge Function ouvindo eventos Cakto) OU integrar Voxuy (pronta, mas não rastreia afiliado/UTM e payload/preço não são públicos)?
8. ESCOPO do painel do afiliado no MVP: só leitura (link/vendas/comissão) é suficiente para a 1a rodada, ou o Marcelo quer já saque/extrato/material de divulgação?


---

## ✅ Decisões travadas (2026-06-19) + pivot de checkout

Com base na sua revisão:

1. **Captura ANTES do checkout (modal próprio).** ✅ O lead é qualificado e salvo server-side no clique em "Comprar", antes de qualquer redirect.
2. **Rastreamento de mídia PRÓPRIO** (cookie 1st-party + webhook). ✅ Sem depender de UTMify.
3. **Comissão de afiliado gerida DENTRO do nosso sistema** (não delegar ao checkout). ✅ Tabelas `affiliates` / `affiliate_links` / `affiliate_commissions` nossas.

### 🔁 Possível pivot: sair da Cakto (taxas altas) → checkout próprio
Você sinalizou que **provavelmente vamos pivotar** e **não usar a Cakto** (taxas muito altas), construindo **o mesmo modelo que eles fazem** dentro do nosso sistema. Isso virou um **card separado** (benchmark dedicado: PSP direto + checkout próprio + split de comissão p/ afiliado + antifraude + economia de taxa).

**Implicação de arquitetura (importante):** como decidimos **capturar e taguear o lead ANTES do checkout** (decisão 1), a **atribuição do afiliado e do tracking acontece na NOSSA camada**, não na do meio de pagamento. Isso torna o desenho **provider-agnóstico**: o passo de "pagamento" vira um **plugue** (Cakto hoje; checkout próprio/PSP depois) sem refazer captura, tracking, lead ou comissão — tudo isso já mora no nosso banco.

> Em resumo: construímos **captura + tracking + afiliados + comissão** agora, de forma nossa; o **meio de pagamento** fica plugável e será decidido no card de benchmark do checkout próprio. As referências de payload/params da Cakto neste doc seguem válidas **enquanto** a Cakto for o checkout; ao trocar, só o adaptador de pagamento muda.
