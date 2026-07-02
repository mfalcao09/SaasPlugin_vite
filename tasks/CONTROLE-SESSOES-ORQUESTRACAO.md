# 🧭 Controle de Sessões de Orquestração — SaasPlugin_vite

> **Propósito:** ponteiro único de continuidade. Quando uma sessão orquestradora morre (session-limit, crash), quem retoma abre ESTE arquivo primeiro e sabe em 30s: qual iniciativa está viva, qual `sessionId` é a **fonte-verdade agora**, o que está DONE vs pendente, e como reconstruir o contexto sem reler 300 MB de JSONL.
>
> **Regra de ouro anti-drift:** só existe **UMA** sessão "AUTORIDADE" por iniciativa por vez. Ao assumir o trabalho, atualize `🔴 AUTORIDADE ATUAL` (§3) com o seu `sessionId`. Ao morrer/encerrar, deixe o Checkpoint (§4) atualizado.
>
> **Não é relatório de entrega** (é memória operacional) → `.md` sozinho, sem par `.html`.
> **Última atualização:** 2026-07-02 (sessão `81daecc0`) — linhagem confirmada por forense.

---

## 0. Como retomar (protocolo em 4 passos)

1. **Ler este arquivo** + a ficha viva `~/.claude/projects/-Users-marcelosilva-Projects-GitHub-SaasPlugin-vite/memory/project_saasplugin_vite_state.md` (seção "Frente viva").
2. **Conferir o working-tree** (verdade final): `git log --oneline -10` + `git status`.
3. **Reconstruir contexto profundo (se preciso)**: minerar o JSONL da AUTORIDADE ATUAL com `jq`/`grep`/`tail` cirúrgicos — **NUNCA `cat`** (arquivos chegam a 300 MB+). Ver §3 os paths.
4. **Assumir autoridade**: atualizar `🔴 AUTORIDADE ATUAL` (§3) com seu `sessionId` + timestamp, e seguir do Checkpoint (§4).

---

## 1. Iniciativa VIVA — Porte 1:1 do **CRM Vendus** → super-admin NexvyBeauty (módulo Vendas)

**Objetivo:** portar o CRM Vendus (repo `mfalcao09/novo-remix-vendus-v4`, doravante `crm-src`) para dentro do super-admin do NexvyBeauty como módulo **Vendas**, sobre tabelas `platform_crm_*`, 100% desacoplado do tenant. Host: `gestao.nexvybeauty.com.br` apenas.

**⚠️ CBA ≠ Vendus (não confundir):** os docs `tasks/PLANO-PORT-CBA-to-NEXVYBEAUTY-2026-06-23.md` e `AUDITORIA-CBA-*` tratam de **OUTRA iniciativa** — porte do salão **Cloud Beauty AI** (TanStack/Tailwind v4, schema PT `salao_id`). NÃO são o checklist deste porte. Prova: `apps/NexvyBeauty/supabase/functions/platform-mia/index.ts` declara *"Porte 1:1 da Mia do CRM Vendus"*. Os critérios de DONE válidos aqui são os 6 de §1.1 (da memória), não as "ondas 0–6" do CBA.

**Fonte do porte 1:1 (original Vendus):**
`/private/tmp/claude-501/-Users-marcelosilva-Projects-GitHub/986d864f-da53-43a9-b3a9-1aa520721352/scratchpad/crm-src`
*(confirmado existente 02/07 — resíduo do scratchpad da Orq#1. ⚠️ RISCO: é `/tmp`, pode ser limpo. **Ação recomendada: copiar `crm-src` para um local seguro** — ver §6.)*

**Supabase alvo:** projeto **NexvyBeauty**, ref `fzhlbwhdejumkyqosuvq` (CLI local já linkado + autenticado). Deploy de edge: `supabase functions deploy <nome> --project-ref fzhlbwhdejumkyqosuvq`. Deploy do front: `infra/deploy-vps.sh NexvyBeauty nexvy-beauty gestao.nexvybeauty.com.br`.

**Contrato de adaptação (edges `platform-*`):** `_shared/platform-crm-auth.ts` → `authenticatePlatformAgent()` (gate super_admin via `user_roles`; service-role bypass via `actorUserId` no body). Zero tabela de tenant. Exceção: **inbound webhooks** autenticam por token do próprio webhook (`platform_crm_webhooks`), não por JWT super_admin.

### 1.1 Critérios de DONE (6 binários — fixados 02/07 07:53)
1. Menu **Vendas inteiro** sem "EmBreve" de seção (stub de feature-folha por dependência externa é tolerável; seção/aba inteira stubada = ❌).
2. **Motores vivos com liveness provada** (curl 200 c/ semântica, não só deploy): cadência enroll/tick, campanhas prepare/dispatch, **webhook-receiver**, **notificações**, **distribute-lead**, Mia, Radar/Follow-Up/Painel.
3. **Captação profunda** portada.
4. ~~AffiliatesPanel desacoplado~~ → **supersedido 02/07 08:08: ERP e AffiliatesPanel NÃO mexer sozinho** (só em sessão conjunta com Marcelo).
5. **Zero toque no tenant** (`app.*` intocado).
6. **Relatório final** `.md` + `.html`.

### 1.2 Guardrails (NÃO violar — §2 explica o custo)
1. **Porte = CÓPIA, não construção.** Copiar o arquivo do original mudando SÓ: dados→`platform_crm_*`, tema (claro/rosa), e desacoplamento. "Construir inspirado" é **proibido**. Só dar por pronto após **comparação lado-a-lado** com o original.
2. **Violação de 1:1 dispara retro-auditoria** de tudo já portado (precedente: "Negócios" ~0% → redo).
3. **Corte de menu:** Plano/Empresa/Pagamentos/Integrações/Suporte ficam no **ERP** (não duplicar). Comissões/Metas **não** são itens de topo (vivem no Financeiro).
4. **"Negócios" = ProductListPage = nossos planos** (Essencial/Premium/Ultra); nunca dropa.
5. **Tema = claro/rosa da plataforma, NUNCA o dark do Remix.**
6. **Hosts:** super-admin só `gestao.*`, app só `app.*`; toda rota não-LP exige login.
7. **Anti-phantom (3 camadas):** dado (RLS-anon-0) / código (grep-imports) / UI (host) + **unregister do Service Worker do PWA** antes do eyeball.
8. **Cortes só por desacoplamento real.** Feature sem original = decisão explícita do Marcelo.
9. **Liveness POR MOTOR** obrigatória (DONE #2).
10. **Produto:** sem trial público / zero "dias grátis"; `feature_instagram/facebook/internal_chat` OFF até funcionar; preços 187/347/687, anual 10×; tarifa WhatsApp = preço Meta.
11. **🚨 Agenda do SALÃO (tenant) ≠ Booking do CRM (platform).** O booking que se porta é o estilo **Calendly de REUNIÕES de venda** (`platform_crm_booking_*`, super-admin `gestao.*`). **NUNCA** tocar/referenciar a agenda de serviços do salão do tenant (`app.*`, `migrations_salao`, tabelas de agendamento do salão). Confundir os dois = violação grave. (Marcelo, 02/07, ênfase máxima: "pelo amor de Deus".)

---

## 2. Por que isto importa (o custo de errar)

Guardrail #2 é um **detonador**: qualquer seção "construída inspirada" em vez de **copiada 1:1** invalida a fidelidade e **obriga re-auditar tudo**. Protocolo: **mapear o original → copiar → comparar lado-a-lado → só então DONE**. Pressa aqui custa horas de retrabalho.

---

## 3. Linhagem de sessões + AUTORIDADE

### 🔴 AUTORIDADE ATUAL
`81daecc0-97fb-449f-b9e5-df7cd4d21fbb` (dir `SaasPlugin_vite`) — assumiu 2026-07-02 ~06:53 BRT. **SESSÃO ENCERRADA 02/07** após concluir a onda dos 3 motores (commit `c2d4a5b` pushed). **Próxima onda = booking (NÃO iniciada — cancelada a pedido do Marcelo p/ encerrar):** retomar por `tasks/PLANO-PORTE-BOOKING-CRM.md` (4 abas + edges públicas; guardrail #11 salão≠booking). Ao retomar, quem assumir atualiza esta linha com seu sessionId.

### Tabela de linhagem (02/07/2026) — confirmada por forense (conteúdo, não mtime)

| sessionId (curto) | Papel | Pasta (cwd) | Nasceu→Morreu (BRT) | Como morreu |
|---|---|---|---|---|
| `986d864f` | **Orquestradora #1** | `-…-GitHub` (raiz) | 06-26 → **05:29** | session-limit (reset 09:10); 3 subagentes em voo |
| `7034f3dd` | **Orquestradora #2** (fez os commits) | `-…-SaasPlugin-vite` | **05:33 → 06:47** | session-limit (reset 10:30) |
| `81daecc0` | **ESTA — Autoridade viva** | `-…-SaasPlugin-vite` | 06:50 → ativa | — |

**Descartadas (eram só "toque" de filesystem, conteúdo de junho / outro assunto):** `7da14b08` (serena, 06-09), `fecc7b99` (watch-lrcap), `8e79a194` (instalar skills), 100833c0/ad086dfb/etc. (NexvyLAW/BESS de junho).

### Caminhos JSONL (fonte-verdade)
```
Orq #1:  ~/.claude/projects/-Users-marcelosilva-Projects-GitHub/986d864f-da53-43a9-b3a9-1aa520721352.jsonl   (317 MB)
Orq #2:  ~/.claude/projects/-Users-marcelosilva-Projects-GitHub-SaasPlugin-vite/7034f3dd-3479-4bd5-8f88-de22104e476f.jsonl  (15 MB)
ESTA:    ~/.claude/projects/-Users-marcelosilva-Projects-GitHub-SaasPlugin-vite/81daecc0-97fb-449f-b9e5-df7cd4d21fbb.jsonl
```

---

## 4. Checkpoint de estado (DONE vs pendente) — refinado por forense 02/07

**Base:** commit `cd72aa7` (pushed). Porte **~90%**.

### ✅ Feito e verificado
- Menu Vendas: **28 de 29 itens reais** (registry `platform-shell/registry.tsx`). Camada de dados **completa: 66 tabelas `platform_crm_*`** + `types.ts` sincronizado (não desatualizado, contrário ao que o checkpoint dizia).
- Commits `47dd906` + `cd72aa7` pushed. 13 edges `platform-*` vivas: `platform-cadence-*` (4), `platform-campaign-*` (4), `platform-mia`, `platform-sales-copilot`, `platform-webchat-*` (3).
- Front deployado no VPS (`gestao.nexvybeauty.com.br`) com prova anti-phantom.

### ⏳ Pendente para o DONE
1. ~~**3 motores server-side**~~ → ✅ **CONCLUÍDO 02/07 (sessão `81daecc0`)**. Portados 1:1: `platform-webhook-receiver` (1470l), `platform-distribute-lead` (138l), `platform-auto-notifications` (351l) — verificação adversarial Opus lado-a-lado (fidelidade 93/96/96, orgLeak/tenantLeak=false). Migration `20260702_platform_crm_distribution_engine.sql` **aplicada no DB remoto** (`platform_crm_user_status` + RPCs `platform_crm_distribute_lead`/`platform_crm_process_pending_queue` + trigger `sync_active_leads_count` + índice único em `lead_queue(lead_id)`). **Deployados** os 3 (`--project-ref fzhlbwhdejumkyqosuvq`; webhook-receiver com `verify_jwt=false`). **Liveness:** webhook-receiver = HTTP 200 real end-to-end (log gravado); distribute-lead = RPC executa limpo via `supabase db query`; auto-notifications = deployado + padrão auth idêntico a irmã certificada (curl externo pende service-secret do projeto — key nova não-recuperável via API). ⚠️ Pendências-folha: (a) `webhook-receiver` branch `transfer_sector` é bug latente (platform_crm_leads não tem `sector_id`) → neutralizar p/ skip; (b) ações send_email/notify_whatsapp/ai_agent_outreach são no-op documentados (sem backend platform_crm); (c) presença online (`platform_crm_user_status`) precisa de heartbeat no front p/ o assign disparar (hoje enfileira corretamente); (d) ✅ **commitado+pushado na main** (`c2d4a5b`, 02/07).
2. **Subsistema de booking da Agenda** — 4 abas inteiras stubadas (`AgendaEmBreve`): Reuniões, Tipos de Evento, Disponibilidade, Links da Equipe. **Schema `platform_crm_booking_*` já existe; UI+edges não.** O Vendus original TEM esse módulo (`booking-availability/dispatcher/submit/reply-ai`, `manual-booking-create`, `PublicBooking`, hooks `useBookings*`). → ✅ **APROVADO 02/07 p/ porte 1:1 agora** (Marcelo). ⚠️ Ver guardrail #11: é booking de REUNIÃO (Calendly), não agenda do salão-tenant.
3. **`Conexões`** (registry:443) → `<EmBreve/>` de seção inteira: gated Evolution×Meta — decisão do Marcelo.
4. **Eyeball sweep** de todas as seções no Chrome (Captação **lado-a-lado** vs original + unregister SW antes).
5. **Relatório final** `.md` + `.html`.

### 🗄️ Backlog além do DONE atual (achados forenses — decisão explícita antes de portar)
- `platform-push-*` (web-push: subscribe/unsubscribe/dispatch) — original tem os 3; NX não portou como `platform-*`.
- **Ciclo de ações tipadas da MIA** (`mia-prepare-action`/`mia-execute-action`) — `platform-mia` declara como **"v2" pendente** (loop sugere→aprova→executa não fechado).
- `platform-cadence-api`, `campaign-ai-insights/preview/recurring-snapshot` — auxiliares não portados.
- Omni Meta/IG (16), ERP Sankhya (4), Catálogo (5) — provavelmente fora de escopo; confirmar.

---

## 5. Convenção daqui pra frente (anti-drift)

Toda sessão de orquestração que tocar uma iniciativa viva **deve**, em cada marco:
1. Atualizar `🔴 AUTORIDADE ATUAL` (§3) ao assumir.
2. Atualizar o **Checkpoint** (§4) ao fechar cada motor/seção.
3. Adicionar/ajustar linha na tabela de linhagem (§3) ao nascer/morrer.
4. Espelhar o resumo curto na memória `project_saasplugin_vite_state.md`.

Divisão de verdade: **memória = estado profundo · este arquivo = quem manda agora + como retomar · working-tree = verdade final**.

---

## 6. Ações de higiene recomendadas
- [ ] **Copiar `crm-src` para local seguro** (fora de `/tmp`), ex.: `apps/NexvyBeauty/.vendus-src-reference/` (gitignored) — o original 1:1 vive só no scratchpad da Orq#1 e some se o `/tmp` for limpo. Sem ele, o porte 1:1 fica cego.
