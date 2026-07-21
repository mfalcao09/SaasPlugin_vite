# AUDITORIA GO-ADS — NexvyBeauty (síntese pré-anúncio)

> **Data:** 2026-07-19 · **Escopo:** funil completo clique→LP→WhatsApp/checkout→provisionamento→acesso, 6 dimensões auditadas em origin/main (204e679) + verificação adversarial com queries read-only no banco live (project `fzhlbwhdejumkyqosuvq`).
> **Pareado:** `AUDITORIA-GO-ADS-2026-07-19.html` (mesmo conteúdo, visual).

---

## 1 · Veredito go/no-go (ligar anúncio em 2h)

**NO-GO no estado atual. Vira GO dentro da janela de 2h com 1 flip + 1 prova.**

O único bloqueador real é o gate de e-mail em dry-run — **confirmado live nesta auditoria**: resposta do cron `process-email-queue` às 2026-07-19 18:27 UTC = `{"processed":0,"dry_run":true}`, e `email_send_log` tem **zero** `sent` na história do projeto. Com esse gate OFF, quem comprar hoje paga, é provisionada com senha aleatória, e **não existe nenhum caminho para a primeira senha** — nem o welcome, nem o "Esqueci minha senha" (mesma fila, mesmo dispatcher). O WhatsApp de boas-vindas manda a cliente olhar um e-mail que nunca chega.

**Critério binário de GO** (§8.3): `SELECT status FROM email_send_log ORDER BY created_at DESC LIMIT 1` retorna `sent` de um disparo real feito hoje, **e** o link do e-mail abre o form em `/reset-password`. Bateu isso → liga o anúncio. Todo o resto da esteira (webhook→Duda→checkout→provisionamento) está funcional e sem flag desligando o caminho inbound.

---

## 2 · Bloqueadores CONFIRMADOS (verificação adversarial, prova live)

Os dois achados `bloqueia_venda` das dimensões *Checkout→Acesso* e *Infra+Flags* são **o mesmo defeito raiz** visto de dois ângulos — consolidados aqui como 1 bloqueador:

### B1 — Gate de e-mail em DRY-RUN mata o único caminho de acesso pós-compra

- **Estado live provado:** `net._http_response` id 191627 (2026-07-19 18:27 UTC): `{"processed":0,"dry_run":true}` · cron `process-email-queue` jobid 23 ativo `* * * * *` · `email_send_log` com apenas 2 linhas na vida: 1 `pending` (E2E 07-08) e o mesmo message_id em `dlq` "TTL exceeded (60 minutes)" (07-16). **Zero `sent` jamais.**
- **Cadeia do defeito (código, origin/main):**
  - `process-email-queue/index.ts:149-151` — `dryRun = EMAIL_DRY_RUN==='true' || !sendEnabled || !resendApiKey`; default OFF. Em dry-run **loga e DELETA a mensagem da fila** (`:352-363`) — o e-mail se perde de vez.
  - `cakto-plan-provisioning.ts:364` — senha inicial = `randomPassword()`; `:414-441` — welcome com recovery link **só enfileira** (`send-transactional-email` → `enqueue_email`).
  - "Esqueci minha senha" **não escapa**: `Login.tsx:134` → `resetPasswordForEmail` → `auth-email-hook/index.ts:255-268` enfileira em `auth_emails` → **mesmo dispatcher, mesmo gate**.
  - WhatsApp de boas-vindas (`cakto-plan-provisioning.ts:484-486`): "Enviamos ao seu e-mail o link para definir a senha" — sem link no WhatsApp.
- **Doc corrobora:** `tasks/PLANO-MESTRE-GO-LIVE-2026-07-11.md:15` — "[Marcelo] EMAIL_SEND_ENABLED=true ... senão a credencial não chega ao cliente"; item ⑤ ainda em "O QUE FALTA". `tasks/RESEND-GO-LIVE-OPS-2026-07-15.md` — flag é "o switch de go-live"; **passo 1 = DNS verde na Resend ANTES do flip** (senão Resend 403 → DLQ do mesmo jeito).
- **Destravar:** `supabase secrets set EMAIL_SEND_ENABLED=true --project-ref fzhlbwhdejumkyqosuvq` — zero mudança de código. Pré-condição: domínio verificado na Resend (SPF/DKIM). Prova: 1 disparo real com `status='sent'` + link abrindo `/reset-password`.

---

## 3 · Plano das 2h (ordenado, mínima mudança)

| # | Janela | Ação | Check binário |
|---|--------|------|---------------|
| 1 | 0–10min | Painel Resend: domínio `nexvybeauty.com.br` **verificado** (SPF/DKIM verde). Runbook `RESEND-GO-LIVE-OPS` passo 1 — sem isso o flip vira 403→DLQ | Status "Verified" no painel |
| 2 | 10–15min | `supabase secrets list` (confirmar `RESEND_API_KEY`) → `supabase secrets set EMAIL_SEND_ENABLED=true --project-ref fzhlbwhdejumkyqosuvq` | Flag listada como setada |
| 3 | 15–25min | Disparo real de teste via `send-transactional-email` (welcome p/ e-mail próprio); aguardar cron 60s | `email_send_log` → `status='sent'` E o link do e-mail abre o form em `/reset-password` |
| 4 | 25–45min | Sanity live — 5 queries (prontas na §7): planos (checkout_url + is_public + 450/720/1190), `cakto_credentials.webhook_secret` não-nulo, conexão Meta ativa = 5511955021205, Duda+Bia `is_active AND active_in_whatsapp`, `cron.job` ativos | Todas retornam o esperado |
| 5 | 45–70min | Smoke E2E do funil: celular → "oi" no 5511955021205 → Duda responde em ~30s; CTA da LP abre wa.me; abrir checkout de 1 plano (não pagar) | Resposta da Duda chega; checkout carrega com preço certo |
| 6 | 70–90min | *(Opcional, decisão Marcelo — 2 edits de front + deploy-vps.sh)* fixar 1 variante de headline (2 linhas) + CTA pós-planos (1 linha). Se não aprovar, liga sem tocar código | Deploy no ar OU pulado conscientemente |
| 7 | 90–120min | Ligar campanha. **Preferir formato CTWA direto** (ativa modo inbound espelhando anúncio + atribuição ctwa_clid — zero código). Briefar humano de plantão: Duda promete o Raio-X mas **não tem mecanismo de entrega** (ver D1 abaixo) | Campanha ativa + plantão ciente |

Passos 1–3 são o gate. 4–5 são verificação (nenhum item ali é bloqueador conhecido — é confirmação de estado de banco que a auditoria read-only não enxergou). 6 é melhoria opcional. 7 é o go.

---

## 4 · Degrada mas NÃO bloqueia (ranqueado por impacto na conversão)

| # | Achado | Dimensão | Menor destravamento |
|---|--------|----------|---------------------|
| D1 | **Raio-X prometido sem mecanismo de entrega**: prompt inbound manda a Duda "disparar a isca", mas `demo-start` tem **zero callers** no repo inteiro e o brain nunca o chama. Lead quente recebe promessa que a IA não cumpre — vira vácuo | Inbound | Sem deploy: instruir na persona (banco) "raio-x = link da demo pública OU [ESCALAR_HUMANO]"; ou 1 frase em `buildInboundAdContext` + redeploy do brain. **Pra hoje: humano de plantão** |
| D2 | **A/B de headline aleatório a cada mount** (9 combinações, cookie `nx_lp_var` sobrescrito e não-lido, sem variante nos eventos do Pixel) — Meta otimiza contra página que muda de promessa e ninguém mede qual converteu | LP | Fixar 1 variante: trocar os 2 `Math.floor(Math.random()*…)` por índice constante — 2 linhas (LP:257-276) |
| D3 | **keepFirstQuestion trunca no `?` da URL de checkout**: todo link carrega `?src=` (atribuição); resposta de fechamento com link + pergunta de cortesia é cortada NO MEIO da URL — mensagem decisiva da venda mutilada | Duda | Mascarar URLs antes de contar/cortar `?` — ~4 linhas em função pura (brain:386-391) + redeploy |
| D4 | **LP termina sem CTA depois dos Planos**: ChamadaPosPlanos sem botão (comentário promete 3), FAQ e footer sem CTA — tráfego frio que rola até o fim precisa voltar pra agir | LP | 1 `<a>` em ChamadaPosPlanos → `WHATSAPP_URL` com `fbqTrack("Lead",{content_name:"pos_planos"})` |
| D5 | **Zero few-shot no prompt da Duda** (D1 do plano NINA, "a maior lacuna" segundo o próprio doc): só proibições em prosa, nenhum par ✅/❌; gemini-2.5-flash aprende por exemplo — risco de soar formulário nas primeiras leads pagas | Duda | Colar 4-5 exemplos rotulados no fim do systemPrompt (casos já escritos nos goldens); validar com os 14 goldens |
| D6 | **Atribuição LP→WhatsApp se perde**: CTA usa wa.me estático sem UTM/click-id; webhook só captura atribuição com bloco `referral` (CTWA direto). Lead via LP chega como orgânico | Pixel/Atribuição | Zero código: rodar a campanha como **CTWA direto**. Pela LP, aceitar medição só no Pixel (Lead) — suficiente pro D1 de campanha |
| D7 | **ensureAdminUser ignora `res.ok`** do send-transactional-email: welcome que falha (404/500/suprimido) morre em silêncio — o alerta Telegram de provisionamento nunca dispara | Checkout→Acesso | 3 linhas (`if (!res.ok) errors.push(...)`) + redeploy cakto-webhook |
| D8 | **Link de senha morto sem mensagem**: retry de webhook regenera recovery token (invalida o link enviado; reenvio dropado por Idempotency-Key 24h) e `ResetPassword.tsx` não trata hash de erro — spinner infinito "Validando link…" | Checkout→Acesso | ~10 linhas no front: ler `window.location.hash`, se `error_code` → "Link expirado" + botão pro fluxo Esqueci minha senha |
| D9 | **CAPI duplamente inerte**: `CAPI_ENABLED` OFF **e** nenhum cron chama `platform-capi-send` — zero evento server-side pra Meta. Pixel browser segura o topo (Lead) | Pixel/CAPI | Quando quiser: 4 secrets + 1 `cron.schedule` (5min) — zero código. Não é pré-requisito do anúncio |
| D10 | **Purchase nunca chega à Meta por nenhum caminho**: sem `fbq Purchase` (checkout off-domain na Cakto), e o CAPI Purchase depende de `sale_completed` que o cakto-webhook não emite | Pixel/CAPI | Zero código: mover lead pra etapa "ganho" no CRM quando vender (trigger emite) OU configurar o pixel 1024632956928840 no painel da Cakto |
| D11 | **auth-email-hook e handle-email-suppression sem bloco no config.toml**: próximo redeploy religa verify_jwt no gateway → 401 antes da função → e-mails de auth e supressão morrem em silêncio (a mesma classe de bug já blindada nos outros webhooks) | Infra | 2 blocos de 2 linhas no config.toml (`verify_jwt = false`) |
| D12 | **Primeira resposta da Duda em ~27-35s**: debounce de 25s aplica também à 1ª mensagem — teto da janela de atenção pós-clique | Duda | Zero código: `AI_BRAIN_DEBOUNCE_MS=10000` nos secrets |

Observações menores (não ranqueadas, catalogadas nas dimensões): links mortos `#careers`/`#about` no footer; modal Cofounder ramo "Não" sem atalho pra #planos; claim "50 vagas" sem fonte (TODO P7 — decisão do dono); `.float-wa` estilizado mas não renderizado; viewport bloqueia zoom; form Cofounder lê tracking da querystring em vez do cookie `nxv_track`; fbc/fbp gravados sem consumidor CAPI website; UTMs do checkout só em `raw_payload`; welcome re-enviado em renovação mensal (dedupe só 24h); seed B5 insere em view `servico_catalogo` não versionada (warn-only; wizard cobre); cakto-webhook fail-open se `webhook_secret` NULL; URL pode ser partida entre bolhas no split; numeração de regra "8." duplicada no prompt; welcome da main sem o card Cofounder (WIP em branch, não commitado).

---

## 5 · Duda delta — implementado vs ficou-no-plano (dimensão agentes)

**Veredito franco da dimensão:** a Duda de hoje **segura uma lead paga** — o esqueleto operacional é acima da média do mercado. Derrapagem real: o bug de truncamento (D3) e a dependência 100% de campos do banco (persona/objeções/KB) que a auditoria read-only não enxergou, rodando em gemini-2.5-flash **sem um único exemplo no prompt**.

### Implementado (origin/main 9493904, deno check limpo)

- **Preço fonte-única**: `public_plans` + filtro `is_public` (Teste R$10 não vaza) + de-para "de R$X por R$Y — lançamento" + bloco REGRA DE PREÇO INVIOLÁVEL (brain:238-273, 1057-1066)
- **Score QCR-V determinístico em TS** (não recalculado pelo LLM), injetado como fato imperativo com rota de oferta; BANT derivado e persistido no lead (554-620, 322-343, 1405-1432)
- **Handoffs wired ponta a ponta**: [PASSAR_BIA] com pin + dossiê + transição calorosa + alerta se Bia não existe; pin órfão curado no banco + alarme; sem-persona grita em vez de calar (951-987, 1187-1222)
- **Anti-desconto em dupla camada**: regras 1-6 + `sanitizeReply` pós-geração (361-379, 1114-1119)
- **Forma humanizada**: ≤3 bolhas ≤300 chars com pausa proporcional, 1 pergunta só, debounce 25s, anti-re-entrega Meta 10min, dedup 5s
- **Modo inbound CTWA**: abre espelhando o anúncio, proíbe abertura genérica (661-670, 1028-1040)
- **Eval harness existe**: 14 goldens em `tmp-eval-agents/goldens.ts` (desde PR #65) — não executados nesta auditoria (exigiria LLM real)

### Ficou 100% no plano (`tasks/NINA-EXTRACAO-DUDA-EQUIPIA-2026-07-19.md` §4 — trilha DUDA, 0 de 7)

| Item | Estado | Evidência |
|------|--------|-----------|
| D1 few-shot (✅/❌ no prompt) | **NÃO** | única ocorrência de "exemplo" no arquivo é a regra de preço (brain:262) |
| D2 scaffold cognitivo (ANALISAR→REVISAR) | **NÃO** | grep `PROCESSO INTERNO\|ANALISAR\|REVISAR` = 0 hits |
| D3 tags XML na estrutura do prompt | **NÃO** | segue delimitador `═══` |
| D4 anti-alucinação na description da tool | **NÃO** | `gerar_link_pagamento.ts:7-8` sem "nunca invente URL" — e o brain nem usa tools (chamada sem tools, 1158-1162) |
| D5 filtro de planos | **parcial** | só o `is_public` que já existia do PR #65 |
| D6 gate de confiança | **NÃO** | — |
| D7 temperature/max_tokens por fase | **NÃO** | chamada principal sem ambos (1158-1162); a extração de fatos tem (457-458) |

**Coerente com o próprio doc**: a Fase 0 exige decisão contratual do Marcelo antes de qualquer extração — não é falha de execução. **Mas D1+D2 são baratos, sem dependência contratual** (o conteúdo é nosso; só o padrão vem da Nina) e são o maior ganho de qualidade disponível pré-anúncio. Se couber 1 melhoria: D1 (validando com os 14 goldens).

---

## 6 · O que está comprovadamente funcionando (resumo por dimensão)

- **LP**: nav 6 âncoras íntegras; CTAs Raio-X → wa.me com evento Lead; PlanoCta nunca vira link morto (fallback WhatsApp + Contact); preços 100% de `public_plans` (SELECT anon, GRANT reaplicado pós-DROP); modal Cofounder posta de verdade na edge; mobile sem scroll horizontal; fallback de animação (conteúdo nunca invisível).
- **Pixel/atribuição**: pixel com guard de host (nunca em app./gestao.) e fail-safe sem env; públicos de remarketing se formam hoje (PageView/Lead/Contact/InitiateCheckout); cookie `nxv_track` sólido (fbclid→fbc, _fbp, 30d 1st-party); checkout Cakto leva tracking inteiro; captura CTWA direta completa, race-safe e non-fatal.
- **Checkout→Acesso**: webhook com alarme Telegram em TODAS as falhas ruidosas; idempotência estrutural (billing por cakto_id, seeds gated, upsert orders); org nasce utilizável (slug único, plano ativo); underpay provisiona MESMO ASSIM e alerta — quem pagou nunca fica sem acesso por divergência de preço; `/reset-password` público em qualquer host; wizard grava serviços direto em `products tipo='servico'` com dedupe.
- **Inbound**: HMAC timing-safe + 200-sempre pro Meta; idempotência dupla por wamid; brain fire-and-forget (<5s pro Meta); roteamento de persona à prova de casca (golden suite 10/10 verde rodada nesta auditoria); resposta sai pelo mesmo número que recebeu (fix de hoje confirmado); maquininha da Duda com links reais do banco.
- **Infra**: config.toml blindado (26 functions verify_jwt=false, working tree == origin/main); cron do dispatcher versionado e ativo; Service Worker network-only + reload em chunk stale (deploy não derruba usuários); auth fail-closed nas bordas; BRAIN_INTERNAL_SECRET setada desde 07-13; onboarding pós-venda dispara sozinho e o step WhatsApp é pulável.

---

## 7 · NÃO VERIFICADO — agregado, com queries prontas

A auditoria foi read-only sobre código + queries pontuais no live. O que segue **não foi provado** e tem a query/checagem pronta deixada pelos leitores. Itens ①–⑤ entram no passo 4 do plano das 2h.

### ① E-mail saindo de verdade (decide o GO — pós-flip)

```sql
SELECT status, count(*) AS n, max(created_at) AS ultimo
FROM email_send_log GROUP BY status ORDER BY ultimo DESC;

SELECT created_at, status, recipient_email, error_message
FROM email_send_log WHERE template_name='welcome-admin-access'
ORDER BY created_at DESC LIMIT 20;
```

*Estado já provado nesta auditoria: dry-run ON às 18:27 UTC de hoje; zero `sent` na história. Pós-flip, esta query é a prova do GO.*

### ② Planos: mapeamento Cakto + preços Ladder A + checkout_url (e vazamento do E2E R$10)

```sql
SELECT slug, name, price_monthly, list_price_monthly, is_active, is_public,
       checkout_url, cakto_offer_slug, cakto_product_id
FROM platform_plans ORDER BY display_order;
-- conferir: starter/pro/premium is_active AND is_public, checkout_url não-nulo,
-- último segmento do checkout_url == cakto_offer_slug (é assim que o webhook resolve o plano),
-- preços 450/720/1190. Plano "Teste E2E R$10" vaza SÓ se is_active AND is_public.

SELECT slug, name, is_public, price_monthly, list_price_monthly, checkout_url, checkout_url_yearly
FROM public.public_plans WHERE slug IN ('starter','pro','premium') ORDER BY display_order;
```

### ③ Credencial do webhook Cakto (fail-open se NULL)

```sql
SELECT scope, organization_id,
       (webhook_secret IS NOT NULL AND webhook_secret <> '') AS tem_secret, updated_at
FROM cakto_credentials WHERE scope='platform';
-- sem linha → webhook 404 e NENHUMA venda provisiona; NULL → aceita qualquer payload
```

### ④ WhatsApp: conexão ativa = número da LP + agentes ativos

```sql
SELECT id, display_name, phone_number_id, status, product_id
FROM platform_crm_whatsapp_meta_connections WHERE status='active';
-- conferir na Meta se o phone_number_id corresponde ao 5511955021205 hardcoded na LP

SELECT id, phone_number, display_name, status
FROM public.platform_whatsapp_connections WHERE phone_number ILIKE '%955021205%';

SELECT id, name, agent_type, is_active, active_in_whatsapp, product_id
FROM platform_crm_product_agents WHERE is_active AND active_in_whatsapp;
-- sem SDR ativa o brain CALA (alarma, mas a lead fica sem resposta); conferir closer (Bia) p/ [PASSAR_BIA]
```

### ⑤ Conteúdo real da persona/produto (70% do prompt efetivo vem do banco)

```sql
SELECT id, name, agent_type, is_active, active_in_whatsapp,
       length(additional_prompt) AS add_prompt_len, length(tone_style) AS tone_len,
       qualification_schema IS NOT NULL AS tem_qualif, prohibited_phrases
FROM platform_crm_product_agents
WHERE product_id IN (SELECT id FROM platform_crm_products WHERE name ILIKE '%beauty%');

SELECT name, length(knowledge_base) AS kb, length(objections) AS objecoes,
       length(pitch_2min) AS pitch, length(icp) AS icp,
       plans IS NOT NULL AS tem_plans, pricing IS NOT NULL AS tem_pricing
FROM platform_crm_products WHERE name ILIKE '%beauty%';
-- grep por 'raio'/'demo'/URL no retorno: verifica se D1 (Raio-X) já está mitigado por dado
```

### ⑥ Form do Cofounder existe e está ativo (criado fora de migration)

```sql
SELECT f.id, f.slug, f.status, b.block_type, b.label, b.order_index
FROM platform_crm_forms f
LEFT JOIN platform_crm_form_blocks b ON b.form_id=f.id
WHERE f.slug='interesse-cofounder' ORDER BY b.order_index;
```

### ⑦ Crons ativos + CAPI sem consumidor

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
SELECT jobname, schedule, command FROM cron.job WHERE command ILIKE '%capi%';  -- esperado: vazio
SELECT status, count(*) FROM public.ads_capi_events GROUP BY 1;
```

### ⑧ Schema ads aplicado no live

```sql
SELECT to_regclass('public.ads_attribution') AS attr,
       to_regclass('public.ads_capi_events') AS capi,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='ads_capi_pending') AS fn;
```

### ⑨ Cakto ecoa trackingParameters no webhook

```sql
SELECT raw_payload->'trackingParameters'
FROM public.cakto_orders ORDER BY created_at DESC LIMIT 5;
```

### ⑩ View servico_catalogo insertable com tipo correto (seed B5)

```sql
SELECT pg_get_viewdef('public.servico_catalogo'::regclass, true);
SELECT tgname FROM pg_trigger WHERE tgrelid='public.servico_catalogo'::regclass;
-- spot-check da última org provisionada:
SELECT tipo, count(*) FROM products WHERE organization_id='<org_id>' GROUP BY tipo;
```

### ⑪ Migrations aplicadas + RPCs assumidas

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 40;
-- candidatas possivelmente NÃO aplicadas (nenhuma bloqueia o funil de ads):
-- cold_outreach_engine/cron, agent_type_backfill, nina_*, seed_platform_email_templates,
-- 20260718_seed_cofounder (UNTRACKED — certamente não aplicada, aguarda aprovação do SQL)

SELECT proname FROM pg_proc WHERE proname IN
  ('get_or_create_first_access_onboarding','validate_onboarding_token',
   'get_or_create_meta_master_key','enqueue_email','delete_email',
   'get_auth_user_id_by_email');
```

### ⑫ Checagens ops (fora de SQL)

```bash
# Secrets em prod (valores reais; código só mostra defaults)
supabase secrets list --project-ref fzhlbwhdejumkyqosuvq | grep -E \
 'EMAIL_SEND_ENABLED|EMAIL_DRY_RUN|RESEND_API_KEY|CAPI_ENABLED|ONBOARDING_HANDOFF_ENABLED|TELEGRAM_ALERT|AI_API_KEY|AI_GATEWAY_URL|AI_BRAIN_DEBOUNCE_MS|BRAIN_INTERNAL_SECRET|AI_SALES_BRAIN_MODEL'
```

- **Deploy drift**: 3 pipelines manuais sem CI — conferir se as edges deployadas (cakto-webhook, send-transactional-email, process-email-queue, platform-meta-whatsapp-webhook, platform-sales-brain, platform-capi-send) acompanham origin/main (`supabase functions list` / `get_edge_function`), e se o bundle do front no VPS == origin/main com `VITE_META_PIXEL_ID` no .env de build.
- **Config hosted do Auth** (fora do repo): allowlist de Redirect URLs contém `https://app.nexvybeauty.com.br/reset-password`; OTP/recovery expiry (se 1h, agrava D8); Send Email Hook apontando pra `auth-email-hook`; secret `APP_URL`.
- **Painel Cakto**: pixel 1024632956928840 configurado no checkout (fecharia D10 sem código); URL de webhook cadastrada nas ofertas; comportamento de retry de evento `paid` (frequência real do cenário D8).
- **Painel Resend**: domínio verificado (pré-condição do passo 1 do plano).
- **Runtime real**: nenhuma renderização em browser foi exercitada (slides, chat EquipIA, modal Cofounder); goldens da Duda não executados contra LLM real; latência do debounce não medida; perfil `instagram.com/nexvytech` não navegado; LP externa do Lovable não inspecionada (se ela for o destino do anúncio, o wa.me de lá não foi auditado).

---

*Relatório gerado pela sessão de síntese go-ads · 2026-07-19 · fontes: 6 dimensões de auditoria read-only + verificação adversarial live · sem commits.*
