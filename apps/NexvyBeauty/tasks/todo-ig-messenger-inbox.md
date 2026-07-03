# TODO — Instagram Direct + Messenger na Inbox (NexvyBeauty)

> Fonte de verdade do build. Gerado 2026-06-24 após recon verificado (código + schema real).
> Plano-base: `docs/plano-ig-messenger-inbox-2026-06-24.md`.
> Premissas confirmadas com Marcelo: (1) reusar app NEXVY · (2) Vault · (3) IG+Messenger no código, IG prioridade.

## Sequência REAL (corrigida — o vídeo do embed gateia o App Review)

```
Bloco 3 (storage/Vault) → Bloco 2 (embed funcionando + GRAVA VÍDEO) → [Marcelo submete App Review]
                                                                       ↓ Meta revisa (dias–semanas)
                                                   Bloco 4 (inbound) → 5 (outbound) → 6 (UI) em paralelo
```

## Bloqueios operacionais conhecidos
- [ ] **Supabase MCP NÃO conectado nesta sessão** → não dá pra `apply_migration`/`deploy_edge_function` pelo caminho canônico. Código é escrito; deploy fica pendente de reconectar MCP ou usar CLI (`supabase db push` / `supabase functions deploy`).
- [ ] **App Review (externo)** é o gargalo de produção. Sem ele só admin/dev/tester do app NEXVY recebe/envia.

## Correções do plano descobertas no recon (drift)
- `evolution-webhook` inbound real ≈ linhas 1041-1088 (cria conversa, `channel:"whatsapp"` HARDCODED) + insert msg ≈ 1965-1986 — NÃO 964-1027 (essas são outbound).
- `webchat_conversations` tem `visitor_id text NOT NULL` (chave de identidade genérica) → usar p/ PSID/IGSID. Tem `channel text` genérico (não enum).
- Vault NÃO é usado em lugar nenhum; `get_vault_secret_by_key` NÃO existe → criar do zero (Bloco 3).
- Migrations vivem em `supabase/migrations_salao/` (naming `YYYYMMDD_*.sql`).
- RLS por org: helper `get_user_organization(auth.uid())`; platform: `is_super_admin(auth.uid())`.

---

## Bloco 3 — Storage seguro + Vault  [código autorável sem MCP]
- [x] Migration `20260624_meta_messaging_integrations.sql`: tabela 1-linha-por-Página + RLS + RPCs Vault.
- [ ] **Critério binário:** token recuperável SÓ via `get_vault_secret_by_key` (service_role); nenhum plaintext na tabela. (verificar pós-deploy)
- [ ] Aplicar migration (MCP/CLI) — PENDENTE bloqueio MCP.
- [ ] Regenerar `src/integrations/supabase/types.ts` com a tabela nova.

## Bloco 2 — OAuth por tenant (Facebook Login for Business) + EMBED
- [ ] EF `meta-oauth-connect`: troca code→long-lived token, descobre Página + `instagram_business_account_id`, grava via `set_meta_secret` + linha em `meta_messaging_integrations`, subscreve `/subscribed_apps`.
- [ ] UI do embed no admin (botão "Conectar Instagram/Facebook" → FB Login for Business).
- [ ] **Critério binário:** conectar Página de teste grava token no Vault + `ig_id` + `page_id`; embed roda fim-a-fim (gravável em vídeo).
- [ ] **Marcelo grava o vídeo do embed e submete App Review** (Bloco 1).

## Bloco 1 — App Review (Meta, EXTERNO — Marcelo)
- [ ] Adicionar produtos Instagram + Messenger no app NEXVY.
- [ ] Permissões: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `business_management` (+ Human Agent feature p/ janela 7d no IG).
- [ ] **Critério binário:** Advanced Access concedido.

## Bloco 4 — Webhook inbound (`meta-messaging-webhook`)
- [ ] GET valida `hub.verify_token` == `META_WEBHOOK_VERIFY_TOKEN` (env global).
- [ ] POST: valida `X-Hub-Signature-256` (HMAC com `META_APP_SECRET`); processa `object=instagram|page`, `entry[].messaging[]`; upsert `webchat_conversations` (channel, `visitor_id`=PSID/IGSID) + insert `webchat_messages` (inbound). Espelhar evolution-webhook ~1041-1088/1965-1986.
- [ ] `verify_jwt = false` (Meta não manda JWT).
- [ ] **Critério binário:** DM de tester vira conversa na Inbox.

## Bloco 5 — Outbound (`meta-messaging-send`)
- [ ] POST `graph.facebook.com/v23.0/{PAGE_ID|IG_ID}/messages` com token do Vault.
- [ ] **Enforcement 24h:** `now - last_message_at > 24h` → bloqueia texto livre, exige tag (Messenger message tag / IG human_agent 7d).
- [ ] **Critério binário:** responder pela Inbox chega no IG/Messenger; fora de 24h bloqueia/exige tag.

## Bloco 6 — UI
- [ ] `integrationsCatalog.ts`: trocar `instagram-leads` comingSoon por card configurável "Instagram Direct + Messenger".
- [ ] `ChannelBadge.tsx`: adicionar `messenger` (instagram já existe).
- [ ] `AttendancePanel.tsx`: reativar filtros instagram/messenger (estavam escondidos: linhas ~14-20).
- [ ] **Critério binário:** card no catálogo + badges corretos + filtros reativados; deploy frontend anti-phantom (infra/deploy-vps.sh).

## Review
_(preencher ao concluir)_
