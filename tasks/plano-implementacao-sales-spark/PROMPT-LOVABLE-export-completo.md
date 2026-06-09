# Prompt para colar no Lovable — Export completo para migração 100%

> **Como usar:** copie TODO o bloco abaixo (entre as linhas `═══`) e cole no chat do Lovable do projeto sales-spark. Ele vai gerar os artefatos. Me devolve os arquivos/output que ele produzir.

> **Por que isto:** já temos o schema DDL (161 tabelas), todo o código (UI + 81 edge functions) e as extensions. Falta a "configuração viva" que não está no código nem num dump de schema: seeds, storage policies, secrets, cron, webhooks, auth. O Lovable conhece tudo isso.

═══════════════════════════════════════════════════════════════════

Estou migrando este projeto inteiro para outra infraestrutura Supabase (vários projetos Supabase separados, multi-tenant). Já tenho em mãos: o dump completo do schema DDL (todas as tabelas, policies, funções, triggers, enums), todo o código-fonte (frontend React + as edge functions) e a lista de extensions do Postgres.

Preciso que você **exporte e documente TUDO que NÃO está no código nem num dump de schema**, para eu reproduzir o ambiente exatamente. Gere os artefatos abaixo. Priorize precisão e dados reais atuais — é para reproduzir o ambiente 100%, não para exemplo.

**1. SEEDS (crítico) —** gere um arquivo `seeds.sql` com `INSERT` de TODAS as tabelas de configuração/conteúdo necessárias para o sistema funcionar do zero. No mínimo: `platform_plans`, `platform_settings`, `help_categories`, `help_articles`, `form_templates`, `platform_releases`, `email_templates` (defaults), e QUALQUER outra tabela de template/seed/default/catálogo que o app assume existir no primeiro boot. Quero os dados reais atuais como INSERT statements idempotentes.

**2. STORAGE —** para CADA bucket (squad-icons, cadence-media, avatars, platform-assets, materials, product-documents, catalog-media, help-media, chat-media, company-logos, funnel-assets, form-media), documente em SQL: se é público/privado, o file size limit, os allowed MIME types, e TODAS as RLS policies de `storage.objects` que se aplicam a ele. Gere como `storage-setup.sql` (criação de buckets + policies) pronto para rodar.

**3. EDGE FUNCTIONS — config —** para cada uma das edge functions, liste numa tabela: nome | verify_jwt (true/false) | secrets/env vars que consome | é cron? (sim/schedule) | é chamada por webhook de DB? Inclua o conteúdo do `supabase/config.toml` se houver configs específicas.

**4. SECRETS —** liste TODOS os secrets / variáveis de ambiente configurados no projeto — **apenas os NOMES, nunca os valores**. Para cada um, indique a que serve (ex: OPENAI_API_KEY → LLM; RESEND_API_KEY → email; CAKTO_* → pagamento). Inclua os de integrações: OpenAI, Anthropic, Gemini, ElevenLabs, Firecrawl, Resend, Cakto, Hotmart, Doppus, Sankhya, Google OAuth, Facebook, BotConversa, e quaisquer outros.

**5. CRON / AGENDADOS —** liste todas as funções agendadas e seus schedules (cron expressions). Diga o mecanismo usado: pg_cron, Supabase scheduled functions, ou cron do Lovable. Para cada job: nome | schedule | função/edge que dispara.

**6. DATABASE WEBHOOKS —** liste todos os database webhooks / triggers que chamam edge functions (via pg_net ou http). Para cada: tabela | evento (insert/update/delete) | edge function ou URL alvo | condição.

**7. AUTH —** documente: providers de autenticação habilitados (email, Google OAuth, etc) com suas configs; redirect URLs / Site URL; configuração de SMTP/email (provider, remetente); e todos os templates de email de auth customizados (signup, reset password, invite, magic link, change email) — com o HTML/texto real de cada.

**8. REALTIME —** liste quais tabelas têm Realtime habilitado (estão na publication `supabase_realtime`).

**9. RPC / FUNÇÕES chamadas pelo frontend —** liste as funções que o frontend chama via `supabase.rpc(...)`, para eu garantir que todas existem no schema.

**10. SETUP INICIAL / BOOTSTRAP —** documente o fluxo de primeiro acesso: como o primeiro super admin é criado, quais configurações são obrigatórias no setup inicial, e qualquer dependência de ordem (o que precisa existir antes do quê) para o sistema subir funcional num ambiente novo e vazio.

**Formato de saída:** gere arquivos separados quando fizer sentido (`seeds.sql`, `storage-setup.sql`, `auth-config.md`, `edge-functions-config.md`, `secrets-list.md`, `cron-webhooks.md`, `bootstrap.md`), ou um único documento markdown grande bem dividido em seções. O que for mais fácil para você produzir com precisão.

═══════════════════════════════════════════════════════════════════

---

## O que JÁ temos (não precisa pedir ao Lovable — evita redundância)

| Item | Status | Fonte |
|---|---|---|
| Schema DDL (161 tabelas, 415 policies, 66 funções, 98 triggers, 11 enums) | ✅ | `baseline/sales-spark-baseline-schema.sql` |
| UI completa (490 components, 121 hooks, 22 pages) | ✅ | repo `sales-spark-ai-47/src/` |
| 81 edge functions (código) | ✅ | repo `sales-spark-ai-47/supabase/functions/` |
| Extensions (10) | ✅ | `plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, pg_cron, pg_net, pg_trgm, pgmq, vector` |
| Buckets (nomes + público/privado) | ✅ | 12 buckets — ver item 2 acima |
| Secrets que as edges leem de env (parcial) | ✅ | OPENAI, ELEVENLABS, FIRECRAWL, RESEND, BOTCONVERSA, ISICHAT, LOVABLE, SUPER_ADMIN_EMAIL |

## O que o prompt do Lovable destrava (o que falta)

1. 🔴 Seeds (dados de config) — sem isso o sistema sobe vazio
2. 🔴 Storage policies (RLS dos 12 buckets) — sem isso uploads quebram
3. 🟡 Edge config (verify_jwt por função) + secrets completos
4. 🟡 Cron jobs + schedules (a query SQL veio vazia — Lovable sabe)
5. 🟡 Database webhooks (pg_net triggers → edges)
6. 🟢 Auth config (Google OAuth, redirect URLs, email templates)
7. 🟢 Realtime publication (query SQL veio vazia)
8. 🟢 RPC do frontend + fluxo de bootstrap

Com esses + o que já temos, a cobertura para reprodução 100% fica completa.
