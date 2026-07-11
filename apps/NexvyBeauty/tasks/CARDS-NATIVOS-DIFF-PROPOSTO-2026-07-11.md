# Diff PROPOSTO — product message (WhatsApp) + generic template (IG) no runtime da conversa

> **Groundwork · 2026-07-11 · NÃO aplicado.** Este é um plano de edição para o
> **orquestrador** aplicar depois em `apps/NexvyBeauty/supabase/functions/platform-webchat-inbox/index.ts`.
> Nesta sessão o arquivo **não foi tocado** (frente ativa alheia). Os anchors de
> linha referem-se ao estado atual do arquivo (2732 linhas).

---

## 1. Objetivo

Quando o orquestrador/IA decide mandar um **plano** numa conversa que já tem
conexão Meta, entregar um **card nativo** em vez de texto+link:

- **WhatsApp** (`channel='whatsapp'`) → *interactive product message* (§2.4 do doc principal), puxando `product_retailer_id = plan-<slug>` do catálogo.
- **Instagram** (`isInstagramConversation`) → *generic template* com botão `web_url` (§2.5).
- **Fallback** para o comportamento atual (texto + link do checkout) sempre que: não houver `catalog_id` configurado, o plano não tiver `retailer_id`, ou a Graph recusar o card. **Nunca deixa de responder.**

O contrato de persistência/broadcast fica **idêntico** — só muda o *payload* de
entrega no canal externo. Os caminhos webchat/texto/mídia atuais ficam intactos.

---

## 2. Como o card é solicitado (novo campo `product`)

O `performOutboundSend` ganha um campo opcional `product`. Quem chama (ex.:
`platform-sales-brain` ao ofertar um plano, ou o agente clicando "enviar card do
plano") passa:

```ts
product: {
  retailer_id: 'plan-essencial',          // = plan-<slug>
  // fields para o fallback e para o generic template do IG (o WhatsApp puxa
  // tudo do catálogo, mas IG/fallback precisam dos dados do plano):
  title: 'Essencial',
  price_label: 'R$ 217/mês',
  image_url: 'https://…',
  checkout_url: 'https://…',
}
```

`opts.content` continua sendo o texto de acompanhamento (vira `body.text` do card
no WhatsApp e a mensagem de fallback).

---

## 3. Diff proposto (hunks)

### 3.1 Imports — reusar o que já existe
Nenhum import novo é obrigatório: `decryptSecret`, `GRAPH_BASE`, `graphFetch`,
`GraphError` já estão importados (linhas 121-122). Só adicionamos helpers locais.

### 3.2 Novo tipo no `opts` de `performOutboundSend` (anchor: linha ~622-635)
```diff
   opts: {
     conversationId: string;
     content: string;
     senderId: string | null;
     media?: OutboundMediaInput | null;
     replyToMessageId?: string | null;
     extraMetadata?: Record<string, unknown> | null;
     assumeConversation: boolean;
     clientTempId?: string | null;
     senderType?: 'agent' | 'bot';
+    /** ONDA cards-nativos: quando presente, tenta entregar um card de produto
+     *  (WhatsApp product message / IG generic template). Fallback = texto+link. */
+    product?: {
+      retailer_id: string;
+      title?: string | null;
+      price_label?: string | null;
+      image_url?: string | null;
+      checkout_url?: string | null;
+    } | null;
   },
```

### 3.3 Novos helpers de entrega (inserir perto de `deliverViaWhatsAppCloud`, ~linha 214)
```diff
+/** catalog_id configurado (one-time) em platform_settings. null = não ligar cards. */
+async function resolveCommerceCatalogId(supabase: any): Promise<string | null> {
+  const { data } = await supabase
+    .from('platform_settings')
+    .select('meta_commerce_catalog_id')
+    .limit(1)
+    .maybeSingle();
+  return (data?.meta_commerce_catalog_id as string | null) ?? null;
+}
+
+/**
+ * Product message no WhatsApp Cloud API (single-product interactive).
+ * Mesma resolução de connection do deliverViaWhatsAppCloud (active mais recente).
+ * `bodyText` vira interactive.body.text (a Cloud API exige body não-vazio).
+ */
+async function deliverProductViaWhatsAppCloud(
+  supabase: any,
+  toPhone: string,
+  catalogId: string,
+  retailerId: string,
+  bodyText: string,
+): Promise<{ wamid: string | null; error: string | null; errorDetail: GraphDeliveryErrorDetail | null }> {
+  try {
+    const { data: conn } = await supabase
+      .from('platform_crm_whatsapp_meta_connections')
+      .select('id, phone_number_id, access_token_encrypted')
+      .eq('status', 'active')
+      .order('created_at', { ascending: false })
+      .limit(1)
+      .maybeSingle();
+    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
+      return { wamid: null, error: 'no_active_connection', errorDetail: null };
+    }
+    const token = await decryptSecret(conn.access_token_encrypted as string);
+    const to = String(toPhone ?? '').replace(/\D/g, '');
+    if (!to) return { wamid: null, error: 'no_destination_phone', errorDetail: null };
+
+    const payload = {
+      messaging_product: 'whatsapp',
+      to,
+      type: 'interactive',
+      interactive: {
+        type: 'product',
+        body: { text: String(bodyText || 'Confira 👇').slice(0, 1024) },
+        action: { catalog_id: catalogId, product_retailer_id: retailerId },
+      },
+    };
+    const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
+      method: 'POST',
+      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
+      body: JSON.stringify(payload),
+    });
+    const data = await res.json().catch(() => ({}));
+    if (!res.ok) {
+      const g = data?.error ?? {};
+      const detail: GraphDeliveryErrorDetail = {
+        message: String(g?.message ?? `graph ${res.status}`).slice(0, 300),
+        code: typeof g?.code === 'number' ? g.code : null,
+        subcode: typeof g?.error_subcode === 'number' ? g.error_subcode : null,
+        fbtrace_id: g?.fbtrace_id ? String(g.fbtrace_id) : null,
+        http_status: res.status,
+      };
+      return { wamid: null, error: detail.message, errorDetail: detail };
+    }
+    return { wamid: data?.messages?.[0]?.id ?? null, error: null, errorDetail: null };
+  } catch (e) {
+    return { wamid: null, error: String(e).slice(0, 300), errorDetail: null };
+  }
+}
+
+/**
+ * Generic template (1 elemento, botão web_url) numa DM do Instagram.
+ * Mesma resolução de connection/IGSID do deliverViaInstagram.
+ */
+async function deliverProductViaInstagramTemplate(
+  supabase: any,
+  conversation: { visitor_id?: string | null; instagram_connection_id?: string | null },
+  product: { title?: string | null; price_label?: string | null; image_url?: string | null; checkout_url?: string | null },
+): Promise<{ igMid: string | null; connectionId: string | null; error: string | null; errorDetail: GraphDeliveryErrorDetail | null }> {
+  let connectionId: string | null = null;
+  try {
+    let conn: Record<string, any> | null = null;
+    if (conversation.instagram_connection_id) {
+      const { data } = await supabase
+        .from('platform_crm_instagram_connections')
+        .select('id, fb_page_id, page_access_token_encrypted, status')
+        .eq('id', conversation.instagram_connection_id)
+        .maybeSingle();
+      conn = data ?? null;
+    }
+    if (!conn) {
+      const { data } = await supabase
+        .from('platform_crm_instagram_connections')
+        .select('id, fb_page_id, page_access_token_encrypted, status')
+        .eq('status', 'active')
+        .order('created_at', { ascending: false })
+        .limit(1)
+        .maybeSingle();
+      conn = data ?? null;
+    }
+    if (!conn?.page_access_token_encrypted || !conn?.fb_page_id) {
+      return { igMid: null, connectionId: null, error: 'no_active_instagram_connection', errorDetail: null };
+    }
+    connectionId = String(conn.id);
+    if (conn.status !== 'active') return { igMid: null, connectionId, error: 'instagram_connection_inactive', errorDetail: null };
+    if (!product.checkout_url) return { igMid: null, connectionId, error: 'missing_checkout_url', errorDetail: null };
+
+    const igsid = String(conversation.visitor_id ?? '').replace(/^ig:/, '').trim();
+    if (!igsid) return { igMid: null, connectionId, error: 'no_destination_igsid', errorDetail: null };
+
+    const token = await decryptSecret(String(conn.page_access_token_encrypted));
+    const payload = {
+      recipient: { id: igsid },
+      messaging_type: 'RESPONSE',
+      message: {
+        attachment: {
+          type: 'template',
+          payload: {
+            template_type: 'generic',
+            elements: [{
+              title: String(product.title ?? 'Plano'),
+              ...(product.price_label ? { subtitle: String(product.price_label) } : {}),
+              ...(product.image_url ? { image_url: String(product.image_url) } : {}),
+              buttons: [{ type: 'web_url', url: String(product.checkout_url), title: 'Assinar' }],
+            }],
+          },
+        },
+      },
+    };
+    const res = await graphFetch<{ message_id?: string }>(
+      `/${conn.fb_page_id}/messages`, token, { method: 'POST', body: JSON.stringify(payload) },
+    );
+    return { igMid: res?.message_id ?? null, connectionId, error: null, errorDetail: null };
+  } catch (e) {
+    if (e instanceof GraphError) {
+      const detail: GraphDeliveryErrorDetail = {
+        message: String(e.graph?.message ?? e.message).slice(0, 300),
+        code: typeof e.graph?.code === 'number' ? e.graph.code : null,
+        subcode: typeof e.graph?.error_subcode === 'number' ? e.graph.error_subcode : null,
+        fbtrace_id: e.graph?.fbtrace_id ? String(e.graph.fbtrace_id) : null,
+        http_status: e.status,
+      };
+      return { igMid: null, connectionId, error: detail.message, errorDetail: detail };
+    }
+    return { igMid: null, connectionId, error: String(e).slice(0, 300), errorDetail: null };
+  }
+}
```

### 3.4 Branch WhatsApp — tenta card, cai pra texto (anchor: linhas 729-763)
```diff
   if (conversation.channel === 'whatsapp') {
     const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
-    const { wamid, error: deliveryError, errorDetail } = await deliverViaWhatsAppCloud(
-      supabase,
-      dest,
-      String(opts.content ?? ''),
-      resolvedMedia
-        ? { kind: resolvedMedia.persistMedia.kind, url: resolvedMedia.deliverUrl,
-            caption: resolvedMedia.effectiveCaption || null, filename: resolvedMedia.persistMedia.filename }
-        : null,
-    );
+    // Card nativo primeiro (só quando pedido, sem mídia, e com catálogo ligado).
+    let wamid: string | null = null;
+    let deliveryError: string | null = null;
+    let errorDetail: GraphDeliveryErrorDetail | null = null;
+    let deliveredAsProduct = false;
+    if (opts.product?.retailer_id && !resolvedMedia) {
+      const catalogId = await resolveCommerceCatalogId(supabase);
+      if (catalogId) {
+        const r = await deliverProductViaWhatsAppCloud(
+          supabase, dest, catalogId, opts.product.retailer_id, String(opts.content ?? ''),
+        );
+        if (r.wamid) { wamid = r.wamid; deliveredAsProduct = true; }
+        else console.warn('[platform-webchat-inbox] product card falhou, fallback texto:', r.error);
+      }
+    }
+    if (!wamid) {
+      const r = await deliverViaWhatsAppCloud(
+        supabase, dest, String(opts.content ?? ''),
+        resolvedMedia
+          ? { kind: resolvedMedia.persistMedia.kind, url: resolvedMedia.deliverUrl,
+              caption: resolvedMedia.effectiveCaption || null, filename: resolvedMedia.persistMedia.filename }
+          : null,
+      );
+      wamid = r.wamid; deliveryError = r.error; errorDetail = r.errorDetail;
+    }
     const deliveryMeta = wamid
-      ? { ...(message.metadata ?? {}), wamid, delivery_status: 'sent', channel: 'whatsapp_cloud' }
+      ? { ...(message.metadata ?? {}), wamid, delivery_status: 'sent', channel: 'whatsapp_cloud',
+          ...(deliveredAsProduct ? { wa_type: 'interactive_product', product_retailer_id: opts.product?.retailer_id } : {}) }
       : { ...(message.metadata ?? {}), delivery_status: 'failed',
           delivery_error: deliveryError, delivery_error_detail: errorDetail };
```
> O resto do bloco (update de metadata + `deliveryWarning`) fica igual.

### 3.5 Branch Instagram — mesma lógica (anchor: linhas 770-805)
```diff
   if (isInstagramConversation(conversation)) {
-    const { igMid, connectionId, error: deliveryError, errorDetail } = await deliverViaInstagram(
-      supabase, conversation, String(opts.content ?? ''),
-      resolvedMedia ? { kind: resolvedMedia.persistMedia.kind, url: resolvedMedia.deliverUrl } : null,
-    );
+    let igMid: string | null = null;
+    let connectionId: string | null = null;
+    let deliveryError: string | null = null;
+    let errorDetail: GraphDeliveryErrorDetail | null = null;
+    let deliveredAsProduct = false;
+    if (opts.product?.checkout_url && !resolvedMedia) {
+      const r = await deliverProductViaInstagramTemplate(supabase, conversation, {
+        title: opts.product.title, price_label: opts.product.price_label,
+        image_url: opts.product.image_url, checkout_url: opts.product.checkout_url,
+      });
+      if (r.igMid) { igMid = r.igMid; connectionId = r.connectionId; deliveredAsProduct = true; }
+      else { connectionId = r.connectionId; console.warn('[platform-webchat-inbox] IG template falhou, fallback texto:', r.error); }
+    }
+    if (!igMid) {
+      const r = await deliverViaInstagram(
+        supabase, conversation, String(opts.content ?? ''),
+        resolvedMedia ? { kind: resolvedMedia.persistMedia.kind, url: resolvedMedia.deliverUrl } : null,
+      );
+      igMid = r.igMid; connectionId = r.connectionId ?? connectionId; deliveryError = r.error; errorDetail = r.errorDetail;
+    }
     const deliveryMeta = igMid
       ? { ...(finalMessage.metadata ?? {}), ig_mid: igMid, delivery_status: 'sent', channel: 'instagram',
+          ...(deliveredAsProduct ? { ig_type: 'generic_template' } : {}),
           ...(connectionId ? { connection_id: connectionId } : {}) }
       : { ...(finalMessage.metadata ?? {}), delivery_status: 'failed',
           delivery_error: deliveryError, delivery_error_detail: errorDetail,
           ...(connectionId ? { connection_id: connectionId } : {}) };
```

---

## 4. Como o chamador passa `product`
Onde hoje o orquestrador chama `performOutboundSend({... content, ...})`, para
mandar um card ele adiciona `product`. O `content` de fallback deve conter o link
do checkout (o texto que já é enviado hoje) — assim, se o card falhar, a mensagem
de texto+link atual é entregue sem perda. Exemplo:

```ts
await performOutboundSend(supabase, {
  conversationId, senderId, assumeConversation: true,
  content: `Plano Essencial (R$ 217/mês): ${plan.checkout_url}`,   // fallback intacto
  product: {
    retailer_id: `plan-${plan.slug}`,
    title: plan.name, price_label: `R$ ${plan.price_monthly}/mês`,
    image_url: defaultPlanImage, checkout_url: plan.checkout_url,
  },
});
```

> `platform-sales-brain` já monta `checkout_url` com `?src=<slug>` de atribuição
> (ver `appendSellerRef`) — o `product.checkout_url` deve usar a MESMA URL
> carimbada, para não perder a atribuição de venda no card.

---

## 5. Garantias de segurança do diff
- **Zero regressão nos caminhos atuais:** sem `opts.product`, os dois branches caem direto no `deliverViaWhatsAppCloud`/`deliverViaInstagram` originais (path idêntico).
- **Mídia tem precedência:** card só é tentado quando `!resolvedMedia` (mandar imagem/áudio continua sendo mídia, nunca card).
- **Fallback total:** catálogo ausente, `retailer_id`/`checkout_url` ausente, ou Graph recusando → texto+link. **Sempre responde.**
- **Persistência/broadcast inalterados:** o card é só o transporte; a bolha, o `content` persistido e o realtime seguem o mesmo fluxo.
- **Idempotência preservada:** `wamid`/`ig_mid` continuam sendo a chave anti-duplicação; card entregue com sucesso NÃO reenvia como texto.

---

## 6. O que fica de fora deste diff (decisão de execução)
- **Multi-produto (`product_list`)** no WhatsApp — 1 card por plano é mais clicável; product_list fica para depois se o dono quiser um "cardápio de planos" numa mensagem só.
- **Botão de resposta do IG que abre catálogo** — IG não tem product message; o generic template é o teto do que o IG DM oferece via API.
- **A decisão de QUANDO mandar card** (heurística do sales-brain / clique do agente) — é do orquestrador, não deste arquivo.
