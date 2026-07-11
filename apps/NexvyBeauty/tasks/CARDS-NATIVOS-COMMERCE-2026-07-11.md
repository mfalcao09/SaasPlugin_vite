# Cards nativos de catálogo (Meta Commerce) para o CRM NexvyBeauty — Mapa API-first

> **Groundwork · 2026-07-11 · branch `feat/beauty-inbox-a1.2`**
> Peça técnica. Nada foi deployado, nenhum token real foi usado, nenhuma Graph
> chamada. Este documento + a edge `platform-commerce-sync` + o diff proposto são
> a base para a execução posterior na Meta.

---

## 0. Resposta direta à pergunta do dono

**"Dá pra automatizar o sync dos planos com o catálogo Meta pra não ter gap quando mudarem no gestão?"**

**[Certo] Sim, sem gap — e o padrão certo é trigger na origem, não polling.** O gap
só existe se a sincronização for manual ou por varredura periódica. A casa já tem
o padrão que elimina isso: um **trigger no `UPDATE`/`INSERT` de `platform_plans`**
que dispara a edge `platform-commerce-sync` via `pg_net` (`net.http_post`). No
instante em que o dono muda preço/nome/checkout no gestão, o commit da transação
dispara o UPSERT no catálogo Meta. O `retailer_id` estável `plan-<slug>` garante
que a re-sincronização **atualiza o mesmo item** (idempotente, nunca duplica).

**Divisão one-time × contínuo:**

| Natureza | O quê | Quem | Frequência |
|---|---|---|---|
| **One-time (humano, na Meta)** | Criar o Product Catalog · vincular à WABA · garantir token com `catalog_management` | Dono/você, no Business Manager ou via Graph | 1× |
| **Contínuo (automático, código)** | UPSERT dos planos no catálogo a cada mudança de `platform_plans` | Edge `platform-commerce-sync` disparada por trigger `pg_net` | Toda edição de plano |
| **Rede de segurança (opcional)** | `sync` full via cron | Cron 5–15min chamando `action:'sync'` | Baixa (idempotente) |

**Recomendação de robustez:** trigger (tempo-real) **+** cron de reconciliação
(pega qualquer disparo perdido — pg_net é best-effort, não transacional-garantido).

---

## 1. Ativos que já temos (inventário)

| Ativo | Valor | Onde vive |
|---|---|---|
| Business ID | `1331611869008138` | Meta Business Manager |
| WABA ID | `976904392005535` | Meta WhatsApp |
| Access token da connection | cifrado (`access_token_encrypted`) | `platform_crm_whatsapp_meta_connections` → `decryptSecret()` |
| `phone_number_id` | por connection | `platform_crm_whatsapp_meta_connections` |
| Page token (IG/FB) | cifrado (`page_access_token_encrypted`) | `platform_crm_instagram_connections` |
| Versão Graph fixada | `v21.0` | `_shared/meta-graph.ts` (`GRAPH_VERSION`) |
| Crypto de credencial | AES-256-GCM envelope | `_shared/meta-crypto.ts` |

Escopos que o dono citou ter: **page token**, **whatsapp_business_management**,
**instagram_manage_messages**.

---

## 2. Mapa de endpoints (Graph API `v21.0`)

### 2.1 Criar o Product Catalog — ONE-TIME
```
POST https://graph.facebook.com/v21.0/1331611869008138/owned_product_catalogs
Authorization: Bearer <SYSTEM_USER_TOKEN>
Body: { "name": "NexvyBeauty — Planos" }
→ { "id": "<catalog_id>" }
```
- **Permissão exigida:** `business_management` **+** `catalog_management`.
- **Grava:** `platform_settings.meta_commerce_catalog_id = <catalog_id>` (chave nova).

### 2.2 Criar/atualizar produtos (os 3–4 planos) — CONTÍNUO
Dois caminhos equivalentes; a edge usa o **batch** por ser upsert idempotente:

**Opção A — batch (usada pela edge):**
```
POST /v21.0/{catalog_id}/batch
Body: {
  "allow_upsert": true,
  "requests": [
    { "method": "UPDATE", "retailer_id": "plan-essencial",
      "data": {
        "name": "Essencial",
        "price": 21700,            // ⚠️ CENTAVOS (inteiro) — R$217,00
        "currency": "BRL",
        "url": "https://<checkout_url>",
        "image_url": "https://<imagem>",   // obrigatório p/ produto válido
        "availability": "in stock",
        "condition": "new",
        "brand": "Nexvy",
        "description": "Plano Essencial — assinatura mensal."
      } }
  ]
}
```

**Opção B — produto único:**
```
POST /v21.0/{catalog_id}/products
Body: { "retailer_id":"plan-essencial", "name":"Essencial", "price":21700,
        "currency":"BRL", "url":"...", "image_url":"...", "availability":"in stock" }
```
- **Permissão exigida:** `catalog_management`.
- **Campos mínimos:** `retailer_id`, `name`, `price` (centavos), `currency`,
  `image_url`, `url`. Meta **rejeita** produto sem `image_url` → ver §4 (imagem
  default via `platform_settings.meta_commerce_default_image_url`).
- **retailer_id estável = `plan-<slug>`** → chave natural do UPSERT.

### 2.3 Vincular catálogo à WABA — ONE-TIME (necessário só p/ product message no WhatsApp)
```
POST /v21.0/976904392005535/product_catalogs
Body: { "catalog_id": "<catalog_id>" }
```
- **Permissão exigida:** `whatsapp_business_management` (temos).
- **Alternativa sem Graph:** WhatsApp Manager → Catálogo → conectar (UI).

### 2.4 Enviar product message no WhatsApp — CONTÍNUO (runtime da conversa)
Single-product interactive message:
```
POST /v21.0/{phone_number_id}/messages
Body: {
  "messaging_product": "whatsapp",
  "to": "55DDDXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "product",
    "body": { "text": "Nosso plano Essencial 👇" },
    "footer": { "text": "Toque para ver e assinar" },
    "action": {
      "catalog_id": "<catalog_id>",
      "product_retailer_id": "plan-essencial"
    }
  }
}
```
- **Permissão:** o mesmo token da connection que já envia mensagem (Cloud API).
- **Multi-produto** (`type:"product_list"`) existe, mas para 3–4 planos o
  single-product por card é mais limpo e clicável.

### 2.5 Instagram — generic template com botão de URL — CONTÍNUO
O IG DM **não** renderiza product message do catálogo do jeito do WhatsApp; o
equivalente é o **generic template** (cartão com imagem + título + botão `web_url`):
```
POST /v21.0/{fb_page_id}/messages
Body: {
  "recipient": { "id": "<IGSID>" },
  "messaging_type": "RESPONSE",
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "Plano Essencial",
          "subtitle": "R$ 217/mês",
          "image_url": "https://<imagem>",
          "buttons": [{ "type": "web_url", "url": "https://<checkout_url>",
                        "title": "Assinar" }]
        }]
      }
    }
  }
}
```
- **Permissão:** `instagram_manage_messages` (temos) + page token (temos).
- Não depende do catálogo — usa os mesmos campos do plano (título/preço/imagem/url).

---

## 3. Permissões — o que temos × o que falta

| Ação | Escopo exigido | Temos? | Gap / passo humano |
|---|---|---|---|
| Criar catálogo (`owned_product_catalogs`) | `business_management` + `catalog_management` | ❓ `catalog_management` provavelmente **não** | **Gerar system-user token com `catalog_management`** no Business Manager |
| Upsert de produtos (`/batch`, `/products`) | `catalog_management` | idem acima | idem — mesmo token do catálogo |
| Vincular à WABA (`/product_catalogs`) | `whatsapp_business_management` | ✅ | nenhum |
| Product message WhatsApp | token da Cloud API (já em uso) | ✅ | nenhum |
| Generic template IG | `instagram_manage_messages` + page token | ✅ | nenhum |

**[Provável] O único gap real é `catalog_management`.** Os tokens atuais
(page / whatsapp_business_management / instagram_manage_messages) cobrem o
runtime de envio e a vinculação, mas **não** cobrem criar catálogo nem escrever
produtos. Passo humano na Meta: **criar um System User no Business Manager
(1331611869008138), dar a ele acesso ao catálogo com `catalog_management`, gerar
um token permanente e guardá-lo** — a edge o lê da mesma connection ou de uma
chave dedicada em `platform_settings` (decisão do dono; a edge hoje reusa o token
da connection e devolve erro estruturado #200 se faltar o escopo).

---

## 4. A edge `platform-commerce-sync` (ENTREGA 2)

`apps/NexvyBeauty/supabase/functions/platform-commerce-sync/index.ts` — **autorada,
`deno check` verde, DEPLOYADA (v3 ACTIVE, 2026-07-11)** *(errata 2026-07-11: versão
anterior deste doc dizia "NÃO deployada")*.

- **Action `sync`**: lê `public_plans` (`name, slug, price_monthly, checkout_url`,
  ordenado por preço) → monta requests `UPDATE` → `POST /{catalog_id}/batch`.
- **retailer_id** = `plan-<slug>` (estável, idempotente).
- **price** = `Math.round(price_monthly * 100)` (centavos).
- **catalog_id** = `platform_settings.meta_commerce_catalog_id`.
- **image_url** = `platform_settings.meta_commerce_default_image_url` (opcional;
  sem ela o produto vai sem imagem e a Meta pode marcar como incompleto — por
  isso é chave configurável, não hard-coded).
- **Credenciais**: connection ativa (`platform_crm_whatsapp_meta_connections`) +
  `decryptSecret` — padrão meta da casa.
- **Auth**: `authenticatePlatformAgent` (super_admin JWT **ou** service_role +
  `actorUserId` — o caminho do trigger/cron).
- **Idempotente + erros estruturados**: `{ ok, error, message, code, subcode,
  fbtrace_id, http_status, ... }`; itens sem slug/checkout/preço são **pulados
  com `skipped[]`**, nunca derrubam o batch inteiro.
- **`dryRun: true`**: devolve os requests montados sem chamar a Graph — bom p/
  conferir o mapeamento antes de ligar.

### 4.1 Ligar o sync automático (SQL de referência — NÃO aplicado aqui)
```sql
create extension if not exists pg_net;

create or replace function public.trg_commerce_sync_on_plan_change()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := current_setting('app.settings.functions_url') || '/platform-commerce-sync',
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body    := jsonb_build_object('action','sync','actorUserId', '<super_admin_uuid>')
  );
  return coalesce(new, old);
end $$;

create trigger commerce_sync_after_plan_change
  after insert or update of name, price_monthly, checkout_url on public.platform_plans
  for each row execute function public.trg_commerce_sync_on_plan_change();
```
> O SQL exato de leitura do `functions_url`/`service_role_key` segue o que a casa
> já usa nos demais disparos pg_net (GUC/Vault) — ajuste na migration de execução.

> ⚠️ **FORMATO DA KEY — RESOLVIDO (investigação 2026-07-11, sessão 5de0b2f1):**
> o `app.settings.service_role_key` do Vault/GUC DEVE conter a key **NOVA
> (`sb_secret_…`, 41 chars)** — NUNCA a service_role legada (JWT `eyJ…`, 219 chars).
> Prova empírica no projeto `fzhlbwhdejumkyqosuvq`:
> 1. Sonda no runtime das edges: `SUPABASE_SERVICE_ROLE_KEY` injetada = formato
>    `sb_secret` (41 chars). A legada NÃO está no env → `token === serviceRoleKey`
>    do `authenticatePlatformAgent` nunca bate com ela.
> 2. Repro do bug: `Bearer <legada>` → passa o gateway, mas a função devolve
>    `401 {"error":"Invalid token"}`.
> 3. Fix validado live: `Bearer <sb_secret>` + `actorUserId` super_admin →
>    **HTTP 200** no `dryRun` da `platform-commerce-sync` (gateway aceita
>    `sb_secret` mesmo com `verify_jwt` default — hipótese contrária refutada).
>
> **Decisão de fix: (c) padronizar callers na key nova** — zero mudança de código.
> Hardening futuro opcional (se rotação de keys entrar em cena): comparar também
> contra a lista `SUPABASE_SECRET_KEYS` (env plural que o runtime já injeta), pois
> durante rotação há 2+ secret keys ativas e `SUPABASE_SERVICE_ROLE_KEY` contém só uma.

---

## 5. Sequência de execução (quando sair do groundwork)

1. **[humano/Meta]** Criar System User + token com `catalog_management`.
2. **[humano/Meta]** `POST /1331611869008138/owned_product_catalogs` → catalog_id.
3. **[humano/DB]** Gravar `meta_commerce_catalog_id` (+ `meta_commerce_default_image_url`) em `platform_settings`.
4. **[humano/Meta]** Vincular catálogo à WABA `976904392005535`.
5. ~~**[código]** Deploy `platform-commerce-sync`~~ ✅ FEITO (v3 ACTIVE 2026-07-11); `dryRun:true` conferido (4 planos: 3 upserts + `trial` skipped por `missing_checkout_url`) → falta só o `sync` real (backfill). Obs.: o `dryRun` de 2026-07-11 já devolveu `catalog_id` `975221148843266` e credencial `env:META_COMMERCE_TOKEN` configurados — passos 1–3 aparentam concluídos; conferir o 4 (vínculo WABA) antes do runtime de conversa.
6. **[código/migration]** Criar o trigger `pg_net` em `platform_plans` (§4.1). **⚠️ Usar a key NOVA (`sb_secret_…`) no Vault/GUC — a legada (JWT) leva 401 no gate interno; ver box "FORMATO DA KEY — RESOLVIDO" no §4.1.**
7. **[código]** Aplicar o diff do runtime (ENTREGA 3 — product message/IG template) no `platform-webchat-inbox`.
8. **[verificação]** Editar um plano no gestão → conferir item atualizado no catálogo (`GET /{catalog_id}/products?fields=retailer_id,name,price`).

---

## 6. Riscos e decisões pendentes do dono

- **[Certo] `catalog_management` é o bloqueio.** Sem esse token nada escreve no catálogo. É passo humano na Meta.
- **[Provável] Imagem dos planos.** Planos não têm coluna de imagem hoje. Decisão: uma imagem default por marca (rápido) vs imagem por plano (exige coluna nova em `platform_plans`). A edge suporta as duas via `meta_commerce_default_image_url`.
- **[Palpite] Moeda.** Fixei `BRL`. Se algum dia houver plano em outra moeda, vira coluna.
- **[Certo] Remoção de plano.** UPSERT não apaga. Plano despublicado continua no catálogo até um `action:'prune'` (DELETE) — marcado como TODO na edge, fora deste groundwork.
- **Token dedicado × reuso do token da connection.** A edge hoje reusa o token da connection. Se o dono preferir isolar o token de catálogo, é uma chave nova em `platform_settings` — troca de 3 linhas na edge.
