# Plano — Instagram Direct + Messenger na Inbox (NexvyBeauty)

> **Objetivo:** trazer DM do Instagram + Messenger pro MESMO Inbox unificado do NexvyBeauty
> (`webchat_conversations` / `webchat_messages`, coluna `channel`), reusando toda a infra de
> inbox/handoff/IA que o WhatsApp (Evolution) já usa. Para **execução em sessão paralela**.
> Gerado 2026-06-24 a partir de recon (código + jornada Meta nos backups).

---

## 1. Ponto de partida (o que JÁ existe — não refazer)

- **Já somos Meta Tech Provider** sob o app **"NEXVY"**. **Business Verification APROVADA (2026-04-19)** → reaproveita, NÃO refaz. App Review de messaging do WhatsApp submetido. Marketing API habilitada. Embedded Signup configurado. Fonte: `~/.claude/projects/-Users-marcelosilva-Projects-GitHub-ecossistema-monorepo/memory/project_nexvy_whatsapp_sandbox.md` (linhas 58-99).
- **Tudo isso é escopado pra WhatsApp** — NÃO inclui IG/Messenger messaging ainda.
- **WhatsApp do produto roda via Evolution** (não via Meta Cloud API). Logo IG/Messenger será a **1ª mensageria sobre a Graph API** no produto.
- **Building block pronto:** a Inbox usa modelo unificado por canal. `webchat_conversations` tem coluna `channel` + identidade de contato; `webchat_messages` tem `direction`/`sender_type`/`content`. O Evolution grava `channel='whatsapp'`. **Adicionar `channel='instagram'`/`'messenger'` reusa inbox, handoff, IA e orquestrador de graça.**
- **Única integração Meta no código hoje:** `facebook-leads-webhook` (captura de LEADS via Lead Ads, Graph v18.0) — NÃO é mensageria.
- **Dívida de segurança a corrigir:** `facebook_lead_integrations` guarda `page_access_token` em **plaintext** (viola Seção 11). A tabela nova de messaging usa **Vault**.

---

## 2. Premissas a confirmar com Marcelo ANTES de codar (§8.1)

1. **Reusar o app "NEXVY"** existente (recomendado — Business Verification já aprovada, só adicionar produtos IG+Messenger) **vs** app novo.
2. **Token via Supabase Vault** desde já (recomendado, Seção 11) **vs** plaintext como no Lead Ads.
3. **Escopo v1:** Instagram Direct **+** Messenger juntos, **ou** Instagram primeiro? (Salão de beleza vive de Instagram — IG pode ter prioridade.)

---

## 3. Os 6 blocos (cada um com critério binário — §8.3)

| # | Bloco | Quem | Critério de pronto (binário) |
|---|---|---|---|
| **1** | **App Review** (Meta, EXTERNO) — submeter produtos Instagram + Messenger no app NEXVY + permissões: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `business_management`. Business Verification reaproveitada. | Marcelo (inicia) + Meta (aprova, dias–semanas) | Advanced access concedido para essas permissões no app NEXVY |
| **2** | **OAuth por tenant** (Facebook Login for Business) — fluxo no admin que devolve Page access token de longa duração + `instagram_business_account` ligado à Página + `page_id`. | código | Conectar uma Página de teste grava token (no Vault) + `ig_id` + `page_id` |
| **3** | **Storage seguro** — nova tabela `meta_messaging_integrations` (org_id, page_id, page_name, instagram_business_account_id, channel, `token_vault_key`, `app_secret_vault_key`, subscribed_fields, is_active). Token via Supabase Vault (NUNCA plaintext). | código | Token recuperado só via RPC `get_vault_secret_by_key`; nenhum plaintext na tabela |
| **4** | **Webhook inbound** (EF nova `meta-messaging-webhook`) — GET valida `hub.verify_token`; POST recebe `object=instagram\|page`, `entry[].messaging[]`; valida `X-Hub-Signature-256` com app_secret; upsert `webchat_conversations` (channel, visitor_id=PSID/IGSID) + insert `webchat_messages` (direction=inbound). Espelhar `evolution-webhook/index.ts:964-1027`. | código | DM de teste (conta admin/tester) vira conversa na Inbox |
| **5** | **Outbound** (EF nova `meta-messaging-send`) — POST `graph.facebook.com/v23.0/{PAGE_ID|IG_ID}/messages` com Page token do Vault. **Enforcement da janela 24h:** `now - last_message_at > 24h` → bloqueia texto livre, exige message tag (Messenger) / human_agent tag (IG, 7d). Subscrever campos via POST `/{PAGE_ID}/subscribed_apps`. Espelhar `evolution-send/index.ts:161-205`. | código | Responder pela Inbox chega no IG/Messenger; fora de 24h bloqueia/exige tag |
| **6** | **UI** — trocar `instagram-leads` (comingSoon) por card "Instagram Direct + Messenger" configurável; `ChannelBadge` ganhar `messenger` (instagram já existe); reativar os filtros IG/FB no `AttendancePanel` (foram escondidos em 2026-06-24 até o backend existir). | código | Card no catálogo + badges corretos + filtros de canal reativados |

---

## 4. Sequência recomendada

- **Paralelismo:** o **Bloco 1 (App Review)** roda em background (Meta leva dias–semanas) **enquanto** o código (3→2→4→5) é construído e testado com **contas admin/tester** (a Meta permite testar messaging sem review aprovado, desde que o destinatário seja admin/dev/tester do app). Quando o review passa, vira público pra todos os salões.
- **Ordem de código:** **3** (storage/Vault) → **2** (OAuth) → **4** (inbound) → **5** (outbound) → **6** (UI).

---

## 5. Código-âncora (espelhar, não reinventar)

- **Inbound:** `supabase/functions/evolution-webhook/index.ts:964-1027` (upsert conversa + msg por canal).
- **Outbound:** `supabase/functions/evolution-send/index.ts:161-205` (envio por canal/instância).
- **OAuth/token + verify:** `supabase/functions/facebook-leads-webhook/index.ts:22-49` (verify_token + Graph) — mas trocar plaintext por Vault.
- **Modelo de dados:** `src/integrations/supabase/types.ts` → `webchat_conversations:11434`, `webchat_messages:11681`, `facebook_lead_integrations:4457` (referência do que NÃO repetir — plaintext).
- **Catálogo/UI:** `src/config/integrationsCatalog.ts:294-324`; `src/components/seller/inbox/ChannelBadge.tsx:10-13`; `src/components/admin/webchat/AttendancePanel.tsx` (CHANNELS).

## 6. Fontes da jornada Meta (para o OAuth/App Review)

- `~/.claude/projects/-Users-marcelosilva-Projects-GitHub-ecossistema-monorepo/memory/project_nexvy_whatsapp_sandbox.md` (business verification, embedded signup, permissões, IDs — redigidos).
- JSONL da jornada em `-Users-marcelosilva-Projects-GitHub-ecossistema-monorepo` (1c6f7cfb…, e5035d3b…, ed95e4c6…).

---

## 7. Riscos / gates

- **App Review é o gargalo** (externo, dias–semanas). Sem ele, só admins/testers recebem/enviam. O código deve estar pronto e testado com testers antes do review passar.
- **Janela de 24h da Meta** — sem enforcement, mensagens fora da janela falham silenciosamente. Bloco 5 trata isso.
- **Segurança (Seção 11):** token de Página é segredo — Vault server-side, nunca no frontend; webhook valida `X-Hub-Signature-256`.
