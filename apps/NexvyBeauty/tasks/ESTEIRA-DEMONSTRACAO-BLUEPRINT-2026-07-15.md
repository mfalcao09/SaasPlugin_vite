# BLUEPRINT — Esteira de Demonstração NexvyBeauty · **v2**

> **Versão:** **v2** (2026-07-15) — ajustes cravados pós-aprovação do Marcelo ("está bem top"). Mudanças pontuais marcadas com **[v2]** no corpo.
> **Data original:** 2026-07-15 · **Autor:** sessão ARQUITETO (síntese de 6 investigações read-only de 2026-07-14/15)
> **Escopo:** blueprint de arquitetura — NADA foi implementado. Fontes: código local `apps/NexvyBeauty` + banco live `fzhlbwhdejumkyqosuvq` + versão deployada do `cakto-webhook`.
> **Pareado com:** `ESTEIRA-DEMONSTRACAO-BLUEPRINT-2026-07-15.html` (mesmo conteúdo, visual dark) · **Roadmap de execução:** `ESTEIRA-ROADMAP-EXECUCAO-AUTONOMA-2026-07-15.md`.

---

## v2 — o que mudou vs v1 (4 ajustes cravados)

> Marcelo aprovou o v1 com 4 ajustes. Este v2 os incorpora; cada ponto tocado no corpo leva a etiqueta **[v2]**.

1. **[v2] Tela 1 (Empresa) volta a ser COMPLETA, não reduzida.** A tela precisa **identificar a empresa corretamente**. Revertida a decisão do v1 (Seção 4) que enxugava o step. O campo **ticket médio** continua obrigatório (insumo da fórmula do dinheiro).
2. **[v2] LGPD endurecida (Seção 5):** termos **robustos**; **retenção de 72h nos DADOS** (não na UI), **independente** de pedido de exclusão, com **TTL/wipe automático via pg_cron** ao fim das 72h; registro de **IP + geolocalização aproximada por IP** (server-side, sem pedir permissão) + timestamp + user-agent + texto/versão do termo, como prova do consentimento; botão **"Excluir meus dados"** (sem "agora") — exclusão **agendada** pro fim das 72h; **análise contínua**: enquanto a conexão do WhatsApp seguir ativa, seguimos analisando nas 72h, **inclusive mensagens novas** — explícito no consentimento; base legal = **consentimento explícito prévio** (a lead declara ter base legítima para compartilhar os contatos das clientes dela — ela Controladora, NexvyBeauty Operador). Copy sempre **"seus últimos meses"**, nunca "180 dias".
3. **[v2] Follow-up dos não-fechados nas 72h:** a **Duda (SDR)** retoma no **MESMO thread** de WhatsApp, com a conta do dinheiro que a lead viu na demo — **reusa o funil + a mecânica do handoff (P10)**. NÃO se cria agente novo.
4. **[v2] Pré-requisito 0 RESOLVIDO:** o `onboarding-handoff.ts` (handoff Duda→CS no mesmo thread) foi **mergeado no P10 (PR #66, `main` 4aa1b06) e deployado com flag OFF**. Deixa de ser bug bloqueante da Fase 0 — vira **dependência satisfeita** que a esteira reusa.

---

## TL;DR — as verdades desconfortáveis primeiro

1. **~65% da esteira já existe em código.** O caminho crítico não é construir — é **ligar 4 fios** (pipeline F6 de histórico está 100% escrito na ponta receptora e 0% conectado) e **apagar direito** (wipe LGPD é 0% e o `delete-organization` atual **vaza 33 tabelas** e **trava em 7 FKs**).
2. **[v2] Pré-requisito 0 já resolvido.** O `_shared/onboarding-handoff.ts` (import de `cakto-plan-provisioning.ts:8`) foi recriado e mergeado no **P10 (PR #66, `main` 4aa1b06)**, deployado com `ONBOARDING_HANDOFF_ENABLED=OFF` (deploy-safe, não muda produção). A esteira **reusa** essa mecânica para o follow-up da Duda no mesmo thread. Deixou de ser bloqueante.
3. **"180 dias" não é promessa garantível.** A profundidade do histórico é decidida pelo WhatsApp ("most recent", relatos de semanas a ~1 ano). Copy ratificada: **"seus últimos meses"**. Gate G0a/G0b de medição real (`PLANO-EXECUCAO-ONBOARDING-DECOLAGEM-2026-07-09.md:41-56`) é pré-lançamento.
4. **O R$ do Radar atual é fictício para WhatsApp-only** (`deal_value` = 0 em lead de salão). A fórmula da esteira (`sumidos × ticket`) corrige isso — e o mesmo conserto serve para o pós-venda.

---

## 1. VISÃO + FLUXO E2E

**A esteira em uma frase:** a lead conecta o WhatsApp real dela numa org provisória, nosso pipeline transforma o histórico em carteira de clientes, mostramos **em reais** quanto ela está perdendo com clientes sumidos — e ou ela compra (a org demo vira a org paga, sem retrabalho) ou apagamos tudo em 72h com prova.

### Fluxo numerado

| # | Passo | Mecanismo |
|---|-------|-----------|
| 0 | Lead entra (Duda / quiz / formulário) | `capture-lead` (já existe) → `sales_leads` + `lgpd_consents` scope `lead_capture` |
| 1 | Recebe link do wizard demo | **EF nova `demo-start`** (verify_jwt=false): cria org `plan_status='demo'` + `cakto_customer_email` + `demo_expires_at=+72h` + `onboarding_submissions mode='demo'` com token; devolve `/implantacao/:token` |
| 2 | Onboarding demo | `ImplantacaoWizard` refatorado (render por id): `empresa` (**[v2] COMPLETA** — identifica a empresa corretamente, inclui **ticket médio**) → `whatsapp_qr` → `relatorio_dinheiro` → `planos`. SEM agentes/setores/equipes (só pós-venda). Autosave anônimo já existe (`save_onboarding_draft_public`) |
| 3 | QR de instância REAL | **EF nova `demo-evolution`** (verify_jwt=false, auth token+session sha256): cria instância com `syncFullHistory:true`, conecta, serve QR e status — a lead anônima não consegue chamar o `evolution-proxy` (exige JWT admin) |
| 4 | Varredura do WhatsApp | Evolution emite `MESSAGES_SET/CHATS_SET/CONTACTS_SET` → `evolution-webhook` **encaminha (fio novo)** → `evolution-history-sync` (pronta, órfã) → RPC `upsert_clientes_whatsapp` → `public.clientes` com `ultima_interacao_wa`. Só nome+telefone+timestamp; corpo de mensagem NUNCA persiste no Postgres |
| 5 | Relatório do dinheiro | SQL determinístico: sumidos = `ultima_interacao_wa BETWEEN now()-180d AND now()-45d`; R$ = `sumidos × ticket`. Render: `MoneyHeadline` + `OpportunityCard` (modo seed+CTA já embutido). Entrega no WhatsApp dela via `evolution-send` (texto+link) pela instância recém-conectada |
| 6 | Tela de planos | `usePublicPlans` + CTA `checkout_url + '?src=demo-wizard'` (atribuição sai de graça pelo pipeline `nxv_track`/`extractSellerRef`) |
| 7 | **FECHOU** | `cakto-webhook` → `provisionPlatformPlan` casa a org demo por `cakto_customer_email` (Camada 1, zero diff) ou fallback email/fone (Camada 2, ~15 linhas) → `UPDATE plan_status='active'` **é a promoção in-place** → mesma org, mesma instância, mesma carteira, mesmo payload. Seeds+welcome+handoff em `org_created \|\| promoted`; `demo_expires_at=NULL` |
| 8 | **NÃO FECHOU** | Durante as 72h, **[v2] a Duda (SDR) retoma no MESMO thread** com a conta do dinheiro da demo (reusa o handoff P10 — `provisioned_organization_id` vinculado já no `demo-start`; NÃO é agente novo). Enquanto a conexão seguir ativa, **[v2] seguimos analisando o WhatsApp nas 72h (inclusive msgs novas)**. **EF nova `demo-reaper`** (pg_cron horário, `x-cron-secret`): T-24h aviso no WhatsApp; T-0 chama **EF nova `wipe-demo-org`** (8 passos, servidor Evolution primeiro) + confirmação de eliminação pra lead |

### Diagrama

```
LEAD (anonima)                       NEXVY (Supabase Edge + Evolution VPS)
--------------                       -------------------------------------
[0] Duda/quiz/form ---> capture-lead ---> sales_leads + lgpd_consents('lead_capture')
                             |
                             v
[1] link do wizard <--- demo-start (verify_jwt=false, rate-limit IP/fone)
    /implantacao/:token      |-- organizations {plan_status:'demo', cakto_customer_email,
                             |                  demo_expires_at: now()+72h}
                             '-- onboarding_submissions {mode:'demo', token_hash, expires_at}
       |
       v
[2] Wizard demo (render por id) -- [v2] empresa COMPLETA:
    empresa(completa+ticket) -> whatsapp_qr -> relatorio_dinheiro -> planos
       | autosave anon      | consent scope           ^
       | (RPCs publicas     | 'demo_whatsapp_scan'    | SQL: sumidos x ticket
       |  ja existentes)    v                         | (clientes.ultima_interacao_wa)
       |             demo-evolution (auth token+session)
       |              |-- connect {syncFullHistory:true} --> Evolution VPS
       |              |-- status (QR/conexao, server-side)
       |              '-- report / send_report / request_deletion [v2]
       v                            |
[3] lead escaneia o QR -------------'
    Evolution emite MESSAGES_SET / CHATS_SET / CONTACTS_SET
       |
       v
    evolution-webhook --forward fire-and-forget--> evolution-history-sync
                                                        |
                                                        v
                                    RPC upsert_clientes_whatsapp -> public.clientes
                                    (nome + fone + ultima_interacao_wa; nunca corpo de msg)
       |
       v
[4] relatorio no wizard + evolution-send (texto+link) no WhatsApp dela
       |
       |----- FECHOU -----> [5] checkout Cakto (?src=demo-wizard)
       |                        |
       |                        v
       |             cakto-webhook -> provisionPlatformPlan
       |             match por cakto_customer_email (ou email/fone da org demo)
       |             UPDATE plan_status:'active'  == PROMOCAO IN-PLACE
       |             ensureAdminUser (MESMA org) + seeds/welcome/handoff (gate 569)
       |             demo_expires_at = NULL
       |
       '--- NAO FECHOU ---> [6] [v2] Duda (SDR) retoma no MESMO thread (handoff P10)
                                com a conta do dinheiro; analise segue nas 72h
                                (msgs novas incluidas) se a conexao ficar ativa
                            [7] demo-reaper (pg_cron horario, x-cron-secret)
                                T-24h: aviso WhatsApp ("sua demo expira amanha")
                                T-0:   wipe-demo-org (Evolution server -> storage ->
                                       33 orfas -> 7 bloqueadoras -> CASCADE org)
                                Retem: lgpd_consents + platform_audit_logs (prova)
```

---

## 2. ARQUITETURA — o que REUSA vs o que CRIA

### 2.0 Decisões do arquiteto (conflitos entre as investigações, resolvidos)

| # | Conflito | Decisão | Por quê |
|---|----------|---------|---------|
| D1 | Marcador demo: `status='demo'` (Inv.5) vs `plan_status='demo'` (Inv.6) | **`plan_status='demo'`** + coluna nova `demo_expires_at` | A promoção via UPDATE existente (`cakto-plan-provisioning.ts:219-231`) já seta `plan_status='active'` — **a flag morre sozinha na conversão, zero código**. Mexer no domínio de `organizations.status` tem raio de explosão desconhecido em RLS/listagens. Guard do wipe: `plan_status='demo'` |
| D2 | Rota nova `/implantacao-demo/:token` vs reusar `/implantacao/:token` | **Reusar `/implantacao/:token`**, wizard discrimina por `mode='demo'` da submission | Menos rota, menos superfície pública; `validate_onboarding_token` só precisa devolver o `mode` (1 linha se não devolver hoje) |
| D3 | Carteira da demo em `clientes` do tenant vs staging separado | **`clientes` direto** (design atual do F6) | É o que garante o "converte sem retrabalho" do passo 7. Custo: o wipe tem que ser perfeito → **[v2] F3 (LGPD) é gate de conformidade técnica, não fase opcional** |
| D4 | Auth user na demo: sem (Inv.5) vs com (Inv.6) | **SEM auth user/profile pré-venda** | O fluxo público token+RPC definer já opera sem tocar RLS. O auth user nasce na conversão via `ensureAdminUser` (já existe), que aponta o profile pra org casada = a org demo promovida. Menos superfície, LGPD mais limpa |
| D5 | Seeds na promoção: pular (Inv.6) vs rodar (Inv.5) | **Rodar: gate 569 vira `org_created \|\| promoted`** para seeds+welcome+handoff | A org demo NUNCA recebeu seeds (`demo-start` não semeia de propósito — agenda de scan diário numa demo é indesejável). Sem isso a org convertida nasce sem catálogo, sem Radar, sem welcome. O wizard demo não tem step de serviços, então não há colisão |
| D6 | Instância Evolution: criar no `demo-start` vs lazy no clique "Conectar" | **Lazy** (no `demo-evolution` action `connect`) | Instância = 100-300MB RAM no VPS; não desperdiçar com quem abandona na tela 1 |
| D7 | Envio do relatório: instância dela vs número Salvy | **Instância dela** (server-side, 1 msg, "mensagem pra si mesma") | Zero setup extra; risco de ban ~zero para 1 mensagem. Salvy fica de fallback |
| D8 | Cálculo do dinheiro: SQL vs LLM | **SQL determinístico** para o censo; LLM (padrão `classifyConversation`) só para top-N mensagens personalizadas, e só pós-venda | Passar o histórico inteiro pelo Gemini custa caro e não escala; a régua "diasSemVoltar > X" já é provada em `clientActions.ts:139-156` |

### 2.1 O que REUSA (com arquivo:linha)

| Peça | Onde | Estado |
|------|------|--------|
| Intake do histórico (F6) | `supabase/functions/evolution-history-sync/index.ts` (255 linhas, `deno check` limpo) + `migrations_salao/20260714_f6_carteira_whatsapp.sql` | **Untracked, não deployado, migration não aplicada** — código pronto, ~90% |
| Fluxo público por token | `onboarding_submissions` (migration `20260713_onboarding_submissions.sql`) + RPCs `validate_onboarding_token`/`save_onboarding_draft_public`/`submit_onboarding_public` + `useImplantacao.ts:80-199` + rota pública `App.tsx:266` | Live e provado; falta só `mode='demo'` no CHECK |
| Wizard | `ImplantacaoWizard.tsx:26-34` (7 steps; render por índice `step === N`) | Refactor mecânico render-por-id (7 trocas) + prop `steps` |
| Ciclo Evolution (criar/QR/conectar) | `evolution-proxy/index.ts`: `create_instance_self` :419-591, `connect_instance` :697-848; webhook `CONNECTION_UPDATE`/`QRCODE_UPDATED` em `evolution-webhook/index.ts:942-975` | Funciona hoje, mas **exige JWT admin** — a EF `demo-evolution` reusa os mesmos fetches server-side |
| Render do dinheiro | `src/cockpit/home/MoneyHeadline.tsx` (agnóstico de fonte), `OpportunityCard.tsx:30` (**modo demo já embutido**: `seed+onSeedCta` troca disparo por CTA de conversão), `format.ts`, `BucketCards`, `HomeStates` | Reuso as-is |
| Régua "sumiu há N dias" | `src/cockpit/clientActions.ts:139-156` (sobre agendamentos) | Transpor para `ultima_interacao_wa` = cópia direta |
| Envio WhatsApp | `evolution-send/index.ts`: texto :169-175, documento :176-193, link+preview :230-237; instância default da org :106-114 | Pronto; padrão de invocação provado em `sendReactivation.ts:36-38` |
| Tela de planos (dados) | view `public_plans` (SELECT anon) + `usePublicPlans()` em `usePlatformPlans.ts:111-123` | Falta `list_price_monthly` no Pick (:99-109) para o "de R$383 por R$275" |
| Atribuição de venda | saída `platform-sales-brain/index.ts:203-232` (`appendSellerRef`), volta `_shared/cakto-client.ts:298-320` + `cakto-webhook/index.ts:62-77` | `?src=demo-wizard` no CTA e a atribuição sai de graça |
| Conversão | `_shared/cakto-plan-provisioning.ts`: lookup por `cakto_customer_email` :159-163, UPDATE de ativação :219-231, `ensureAdminUser` :282-377, gate seeds :569 | Camada 1 = zero diff no provisioning |
| Consent forense | `capture-lead/index.ts:105-148` + `lgpd_consents` (`20260619_lgpd_consents.sql`) + `CONSENT_TEXT`/versões em `legalContent.ts:11-13` | Replicar com scope novo `demo_whatsapp_scan` |
| Padrão EF pública sem JWT | `config.toml`: `apply-onboarding` :65-66, `platform-form-submit` :29-30; auth token+session sha256 em `apply-onboarding/index.ts:59-75` | Molde das EFs novas |
| Padrão cron | job 18 `salon-automation-daily` (header `x-cron-secret` de `app_cron_secrets`) | Molde do `demo-reaper` |
| Delete de instância no servidor | `evolution-proxy/index.ts:1059-1094` (`delete_instance`), `logout_instance` :1201-1263 | Reusar no wipe — mas trocando o best-effort silencioso por deleção **verificada** |

### 2.2 O que CRIA

| Item | Tipo | Tamanho estimado |
|------|------|------------------|
| `demo-start` | EF nova (verify_jwt=false; rate-limit IP/fone + honeypot; cria org demo + submission; gera token 32B+sha256 reproduzindo `create_onboarding_link` sem o gate super_admin) | ~150 linhas |
| `demo-evolution` | EF nova (verify_jwt=false; auth token+session; actions `connect` / `status` / `report` / `send_report` / **[v2] `request_deletion`** — grava `deletion_requested_at` e agenda o wipe pro TTL, **não** apaga na hora) | ~250 linhas |
| `wipe-demo-org` | EF nova (service_role; 8 passos da tabela LGPD; deleção verificada no Evolution; audit com contagens) | ~250 linhas |
| `demo-reaper` | EF nova (x-cron-secret; T-24h aviso, T-0 wipe) + job pg_cron horário | ~80 linhas + 1 cron |
| Fiação F6 | Patches: `syncFullHistory:true` nos 2 creates (`evolution-proxy/index.ts:328-334, 505-511`), 3 eventos em `WEBHOOK_EVENTS` (:123-130), forward fire-and-forget no `evolution-webhook` | ~30 linhas somadas |
| ~~Recriar `_shared/onboarding-handoff.ts`~~ **[v2] JÁ FEITO no P10** | Writer do vínculo conversa↔org — mergeado (PR #66, `main` 4aa1b06), flag `ONBOARDING_HANDOFF_ENABLED` OFF. Dependência satisfeita; a esteira só liga a flag e reusa | 0 (feito) |
| Patch conversão | Camada 2 no provisioning (match email/fone de org `plan_status='demo'`) + gate 569 `\|\| promoted` + `demo_expires_at=NULL` | ~20 linhas |
| Wizard: refactor + 3 telas novas | render-por-id + prop `steps`; steps `whatsapp_qr`, `relatorio_dinheiro`, `planos`; campo ticket médio no `empresa` | ~400 linhas front |
| Adapter cliente→`OpportunityCardData` | espelho de `toOpportunityCard` (`types.ts:16-45`) | ~15 linhas |
| SQL sumidos + fórmula R$ | dentro do `demo-evolution` action `report` | ~30 linhas |
| Migrations | ALTER CHECK `mode` (+`'demo'`); `organizations.demo_expires_at` + índice parcial; aplicar `20260714_f6_carteira_whatsapp.sql` | 2 migrations novas + 1 existente |
| Copy LGPD | Tela QR (checklist art. 9º/39), bump `PRIVACY_VERSION` com cláusula da demo, RIPD curto | texto |

### 2.3 Quanto já existe

| Frente | % pronto | O que falta |
|--------|----------|-------------|
| F6 — histórico vira carteira | **90%** | 4 fios + aplicar migration + deploy |
| Wizard público por token | **85%** | mode demo, refactor render-por-id, 3 telas |
| Evolution QR para anônimo | **70%** | EF `demo-evolution` (reusa fetches existentes) |
| Motor do dinheiro | **50%** | SQL sumidos + fórmula + adapter (render 100% pronto) |
| Entrega no WhatsApp | **90%** | template do resumo + trigger |
| Conversão demo→pago | **85%** | Camada 1 (zero diff) + Camada 2 + gate 569 |
| LGPD wipe + TTL | **10%** | `wipe-demo-org` + `demo-reaper` + consent scope + copy **[v2] + IP/geo por IP + análise contínua 72h + botão "Excluir meus dados" (agendado)** |
| **TOTAL ponderado** | **~65%** | **caminho crítico = fiação F6 + wipe LGPD** |

---

## 3. MODELO DE DADOS

**Decisão central: NENHUMA tabela nova.** `onboarding_submissions` já é a "demo_session" (token, sessão single-use, expires_at, payload, revogação, access_count). Criar `demo_sessions` seria duplicar infra provada.

### Mudanças em tabelas existentes

| Tabela | Mudança | Detalhe |
|--------|---------|---------|
| `onboarding_submissions` | ALTER CHECK de `mode`: `('link','first_access','demo')` | Opcional: status `'converted'`/`'purged'` — ou manter os 4 atuais e usar `mode` como discriminador (recomendado: adicionar os 2 status, dá trilha de auditoria de graça) |
| `organizations` | Coluna nova `demo_expires_at timestamptz NULL` + índice parcial `WHERE plan_status='demo'` **[v2] + `deletion_requested_at timestamptz NULL`** | TTL = criação + **72h**. Reaper: `WHERE plan_status='demo' AND demo_expires_at < now()`. Promoção seta `demo_expires_at=NULL`. **[v2]** `deletion_requested_at` = quando a lead clicou "Excluir meus dados" (só auditoria; **não** antecipa o wipe) |
| `organizations` (valores) | `plan_status='demo'` como marcador; `cakto_customer_email=<email da lead>` na criação; `slug=NULL` de propósito (página pública `/s/<slug>` dá 404 — desejável na demo); `enabled_modules=[]` | Camada 1 da conversão: o lookup existente (:159-163) acha a org sem 1 diff no provisioning |
| `clientes` | Aplicar `20260714_f6_carteira_whatsapp.sql` (**hoje NÃO aplicada** — verificado no banco live) | `telefone_normalizado` (gerada, stored), `ultima_interacao_wa`, índice não-unique `(org, tel_norm)`, RPC `upsert_clientes_whatsapp` (advisory lock por org, nunca sobrescreve nome curado, INSERT com `tags=['whatsapp']` = marcador de origem pro wipe) |
| `lgpd_consents` | Scope novo `'demo_whatsapp_scan'` (coluna `scope` já é livre) | Gravado no clique "Conectar WhatsApp", com texto verbatim + versões + **[v2] `ip` + `user_agent` + geolocalização aproximada por IP (`geo_city`/`geo_region`, server-side, sem pedir permissão) + `timestamp`** — mesmo mecanismo do `capture-lead` + resolução de geo por IP. Se as colunas de geo não existirem, ALTER aditivo (nunca destrutivo) |

### O que NÃO nasce na demo (de propósito)

- **Sem** auth user, profiles, user_roles (D4).
- **Sem** seeds B5/B6/B7 (`servico_catalogo`, `salon_automation_rules`, `opportunity_scan_schedules`) — scan de demo é único, disparado pelo wizard, nunca agendado.
- **Sem** slug público.

---

## 4. AS TELAS do wizard demo

Sequência exata (prop `steps` do wizard refatorado): `['empresa', 'whatsapp_qr', 'relatorio_dinheiro', 'planos']`.

### Tela 1 — `empresa` (**[v2] COMPLETA**)
**[v2] Revertida a redução do v1.** A tela precisa **identificar a empresa corretamente** — mantém o step 0 atual (`ImplantacaoWizard.tsx:126+`) **completo** (nome do espaço, WhatsApp da dona, segmento/sub-vertical + os demais campos de identificação do step), **não enxugado**. **1 campo novo obrigatório: ticket médio** ("quanto custa, em média, um atendimento seu?") com default por sub-vertical se ela pular — o step "Negócios" atual (:191-233) **não tem campo de preço**, e esse campo é o insumo da fórmula do dinheiro. Autosave anônimo já funciona. (O que fica FORA da demo continua sendo só agentes/setores/equipes — **nunca** a identificação da empresa.)

### Tela 2 — `whatsapp_qr` (nova)
- **Bloco LGPD antes do QR** (checklist completo na Seção 5): quem somos, finalidade única, o que coletamos (e o que NÃO), **[v2] retenção de 72h nos DADOS — independente de pedido de exclusão, com wipe automático ao fim do prazo**, **[v2] análise contínua enquanto a conexão seguir ativa (inclui msgs novas)**, checkbox de **consentimento explícito** + declaração da Controladora → grava `lgpd_consents` scope `demo_whatsapp_scan` **[v2] com IP + geolocalização aproximada por IP + timestamp + user-agent + texto/versão do termo**. **QR só aparece após o aceite.**
- QR + status: `demo-evolution` actions `connect`/`status` (polling server-side — o polling atual do front direto na tabela `evolution_instances` morre no RLS pra anon: `GuidedOnboarding.tsx:535-567`).
- **Não** renderizar QR via `api.qrserver.com` (vazamento do pairing code a terceiro — bug existente em `GuidedOnboarding.tsx:649`); exigir base64.
- Estado pós-conexão: "Conectado! Estamos analisando suas conversas — isso leva alguns minutos" (chunks chegam async; usar `HomeStates` de loading). Avançar habilita quando o `report` retornar contagem estável (ex.: sem crescimento por 60s) ou timeout com o que tiver.

### Tela 3 — `relatorio_dinheiro` (nova) — o AHA
- **`MoneyHeadline`**: `total` = `nº sumidos × ticket`, `count` = nº sumidos, subtitle honesto: *"clientes que falaram com você nos últimos meses e sumiram"* (nunca "180 dias").
- Cards `OpportunityCard` com `seed=true + onSeedCta` (o botão vira **"Quero recuperar esses clientes"** → avança pra `planos`): nome + telefone reais + "Sumiu há N dias". Adapter: `{name: nome, phone: telefone_normalizado, dealValue: ticket, reason: 'Sumiu há N dias'}`.
- **Integridade:** aqui NUNCA usar `seedOpportunities.ts` (exemplos fake). Se a varredura vier rasa (< 5 sumidos), mensagem honesta ("seu histórico sincronizado foi curto — na plataforma o Radar trabalha com sua base completa") — mentir no AHA mata a venda no pós.
- Em paralelo (server-side): `send_report` dispara `evolution-send` (texto-resumo + link pro wizard) no WhatsApp dela.
- Rodapé: botão **[v2] "Excluir meus dados"** (sem "agora") — **agenda a exclusão pro fim das 72h**, não imediata (art. 18 registrado; o wipe efetivo é o TTL via `demo-reaper`). Grava `deletion_requested_at` para trilha de auditoria.

### Tela 4 — `planos` (nova)
- `usePublicPlans()` — Essencial 275 (de 383), Premium 427 (de 599), Ultra 693 (de 849); adicionar `list_price_monthly` ao Pick (`usePlatformPlans.ts:99-109`).
- Âncora de valor: "você está perdendo R$ X/mês — o plano custa R$ Y" (o relatório vira o argumento).
- CTA: `window.location.href = plan.checkout_url + '?src=demo-wizard'` (padrão `SalesPage.tsx:385-394`).
- Aviso de retenção visível: "não contratou? tudo é apagado em 72h, com confirmação".

**Cuidado transversal:** a demo **NUNCA** chama `apply-onboarding` antes da venda — ele seta `onboarding_locked=true` (`apply-onboarding/index.ts:133-134, 291-294`) e mataria a reabertura do wizard.

---

## 5. LGPD

### 5.1 Papéis e base legal

| Questão | Resposta |
|---------|----------|
| Papéis | **Lead = Controladora, NexvyBeauty = Operadora** — enquadramento já declarado verbatim no produto (`OnboardingWelcome.tsx:113-125`, Política §9). Na demo pré-contratual, o aceite da tela do QR é o **instrumento**: instrução documentada da controladora à operadora (art. 39). Sem ele, a Nexvy escorrega pra posição de controladora (exposição direta art. 42) |
| **[v2] Base legal do acesso (lead → NexvyBeauty)** | **Consentimento explícito prévio** da lead (art. 7º I) — ela autoriza, de forma inequívoca e informada, o NexvyBeauty (Operador) a acessar e analisar o WhatsApp dela nas condições dos 72h. É o que o texto do checkbox (5.2) formaliza |
| Base legal da lead sobre os clientes dela | **Legítimo interesse da própria lead** (art. 7º IX c/c art. 10) — recuperação da própria carteira; **[v2] a lead declara ter base legítima para compartilhar os contatos das clientes dela**. LIA fecha porque: minimização ✓ (só nome+fone+timestamp), expectativa ✓ (cliente espera contato do próprio salão), salvaguardas ✓ (TTL 72h + wipe + **nenhum contato com terceiros durante a demo** — relatório vai só pra controladora) |
| Base legal da Nexvy | Nenhuma própria necessária — opera sob instrução. Tudo além da instrução (treinar modelo, enriquecer `platform_crm_extracted_leads`, marketing próprio) = **desvio de finalidade, proibido por construção** |
| Art. 11 (sensíveis) | Conversa de salão carrega dado de saúde/estética incidental → regra dura: **metadados só, nunca corpo de mensagem no nosso banco** (o F6 já é assim). O resíduo inevitável é a instância Evolution — por isso ela é efêmera e o passo 1 do wipe é o servidor. **[v2] "Efêmera" = vive no máximo 72h enquanto a conexão fica ativa (para a análise contínua); morta no wipe do T-0** |

### 5.2 Texto do consentimento (**[v2] robusto, canônico** — checkbox, tela do QR)

**[v2] Texto cravado pelo Marcelo (usar VERBATIM):**

> *"Ao conectar seu WhatsApp, você autoriza o NexvyBeauty a: (1) acessar seu histórico de conversas dos últimos meses para identificar clientes que não retornaram e estimar o valor recuperável; (2) manter esse acesso por até 72 horas enquanto sua conexão permanecer ativa, analisando inclusive novas mensagens do período; (3) reter os dados importados por até 72 horas mesmo que você solicite a exclusão antes — a remoção é agendada para o fim desse prazo, não imediata; (4) registrar seu IP e localização aproximada como prova deste consentimento. Você declara ter base legítima para compartilhar os dados de contato das suas clientes, atuando o NexvyBeauty como operador. A retenção de 72h é condição informada e aceita deste consentimento."*

Identificação do Operador exibida na tela (fora do checkbox): **Nexvy Tecnologia e Comunicação LTDA-ME, CNPJ 64.930.755/0001-78**, DPO `dpo@nexvy.tech`.

Gravado em `lgpd_consents` com scope `demo_whatsapp_scan`, `consent_text` **verbatim** (o texto acima), `terms_version`/`privacy_version`, **[v2] `ip`, `user_agent` e geolocalização aproximada por IP (`geo_city`/`geo_region`, resolvida server-side sem pedir permissão) + `timestamp`** — prova de validade do consentimento (mecanismo do `capture-lead/index.ts:105-148` + resolução de geo por IP no servidor; custo ~zero).

**Checklist da tela (art. 9º/39):** (1) quem — Nexvy CNPJ + papel de Operadora; (2) finalidade específica e única; (3) minimização explícita + "conteúdo não é armazenado"; (4) o que NÃO fazemos; (5) **[v2] retenção 72h nos dados (independente de exclusão) + análise contínua enquanto a conexão ficar ativa** + migração pros Termos se contratar; (6) checkbox acima; (7) **[v2] botão "Excluir meus dados" (sem "agora" — exclusão agendada pro fim das 72h)** + DPO `dpo@nexvy.tech`; (8) **bump de `PRIVACY_VERSION`** — a política vigente (2026-06-19) não descreve o scan de demo; consent apontando pra política que não cobre o tratamento é consent furado.

### 5.3 Retenção e TTL

- **[v2] TTL: 72h nos DADOS, não na UI** (`organizations.demo_expires_at = criação + 72h`). O prazo vale **independente de pedido de exclusão**: mesmo que a lead clique "Excluir meus dados", os dados persistem até o fim das 72h e só então são apagados. Cron pg_cron **horário** → `demo-reaper` (auth `x-cron-secret`, padrão do job 18 live) faz o **wipe automático** ao vencer o TTL.
- **[v2] Botão "Excluir meus dados"** (sem "agora"): registra `deletion_requested_at` (trilha de auditoria) e **agenda** a remoção pro fim das 72h — nunca imediata.
- **[v2] Análise contínua nas 72h:** enquanto a conexão do WhatsApp seguir **ativa** (a lead não desconectar no app), seguimos analisando o WhatsApp dela nas 72h, **inclusive mensagens novas do período** — condição explícita no consentimento. A instância vive até o TTL (não é morta logo após o 1º scan); o wipe no T-0 a elimina.
- **T-24h:** WhatsApp/e-mail "sua demo expira amanhã — seus dados serão apagados" (transparência + argumento de venda).
- **T-0:** `wipe-demo-org` por org vencida; confirmação de eliminação pra lead (fecha o ciclo art. 18).
- Idempotente: o wipe termina removendo a org → re-execução é no-op.
- **RIPD curto** (art. 38) da esteira — volume de terceiros por demo é de centenas/milhares.

### 5.4 Wipe — tabela por tabela (`wipe-demo-org`)

Guard-rail duro no topo: **`WHERE plan_status='demo'`** — jamais wipar org paga. `delete-organization` atual **não serve**: vaza 33 tabelas sem FK e trava em 7 FKs `NO ACTION` (verificado no banco live).

| # | Alvo | Ação |
|---|------|------|
| 1 | **Servidor Evolution** | Por instância da org: `logout` + `DELETE /instance/delete/{name}` — e **verificar** via `GET /instance/fetchInstances` (o padrão atual engole erro com `.catch(() => null)` — `evolution-proxy/index.ts:1074-1079`; wipe best-effort é furo LGPD: a sessão Baileys da lead ficaria viva no VPS) |
| 2 | **storage.objects** | `chat-media` prefixo `whatsapp-inbound/{org}/` + `onboarding-uploads`, `company-logos`, `avatars` por prefixo |
| 3 | **33 órfãs sem FK** | `DELETE WHERE organization_id=$1` — prioridade LGPD: `opportunity_scan_items` (**contém o relatório: nome+fone de terceiros em `lead_snapshot`**), `opportunity_scans`, `agendamentos`, `profissionais`, `reactivation_log`, `lead_semantic_memory` + as demais da lista da Investigação 5 |
| 4 | **7 bloqueadoras NO ACTION** | `product_knowledge_sources`, `product_onboarding_state`, `scheduled_messages`, `webhooks`, `ai_response_feedback`, `sankhya_mappings`, `sankhya_sync_logs` — delete ANTES da org |
| 5 | **Filhas sem organization_id** | `processed_messages`, `conversation_processing_locks`, `sent_responses` — chavear por conversation/instance ids coletados antes |
| 6 | **auth.users** | Loop `deleteUser` (defensivo — demo não tem membros por D4) |
| 7 | **`DELETE FROM organizations`** | CASCADE em ~90 tabelas (inclui `clientes` — a carteira F6 —, `webchat_conversations`, `evolution_instances`, `onboarding_submissions`, …) |
| 8 | **RETER (não wipar)** | `lgpd_consents` (prova de conformidade, RLS super_admin-only), `sales_leads`/`platform_crm_*` (dados PRÓPRIOS da lead, base `lead_capture`; FK org→conversa é `SET NULL`), `platform_audit_logs` com o registro do wipe (contagens por tabela, sem dados de terceiros) — prova de eliminação art. 16/18 |

Forma: **edge function** (precisa chamar Evolution API + Storage API), não função SQL pura.

---

## 6. CONVERSÃO — demo vira venda sem retrabalho

### 6.1 O mecanismo (2 camadas)

**Camada 1 — zero diff no provisioning.** `demo-start` grava `cakto_customer_email = <email da lead>` na criação da org demo. O lookup existente (`cakto-plan-provisioning.ts:159-163`) acha a org, e o fluxo inteiro — ativação (:219-231), billing (:233-258), `ensureAdminUser` mantendo a MESMA org — promove sem tocar uma linha. **O UPDATE de ativação JÁ É a promoção**: sobrescreve `plan_status='demo'` → `'active'` de graça.

**Camada 2 — fallback (~15 linhas), após a linha 163.** Lead pode pagar na Cakto com outro e-mail:

```ts
if (!existingOrg) {
  const phone = normalizePhoneBR(order.customer_phone); // já importado (linha 7)
  const { data: demoOrg } = await admin
    .from('organizations').select('id, slug')
    .eq('plan_status', 'demo')
    .or(`email.eq.${email}${phone ? `,phone.eq.${phone}` : ''}`)
    .maybeSingle();
  if (demoOrg) {
    existingOrg = demoOrg; promoted = true;
    await admin.from('organizations')
      .update({ cakto_customer_email: email }).eq('id', demoOrg.id);
  }
}
```

**Mais 3 ajustes obrigatórios:**
1. **Gate :569:** `if (planRes.org_created || promoted)` para **seeds + welcome + handoff** (D5 — a org demo nunca foi semeada; sem isso a convertida nasce sem catálogo, sem Radar, sem welcome).
2. **Cancelar TTL:** `demo_expires_at = NULL` no UPDATE de promoção (senão o reaper apaga uma org paga — o guard `plan_status='demo'` já protege, mas cinto e suspensório).
3. **[v2] Pré-requisito 0 — RESOLVIDO (P10):** o `_shared/onboarding-handoff.ts` foi recriado e mergeado (**PR #66, `main` 4aa1b06**), deployado com `ONBOARDING_HANDOFF_ENABLED` OFF. O webhook de venda já não quebra. A esteira **liga a flag** e reusa o handoff (writer do vínculo conversa↔org; consumer em `platform-sales-brain/index.ts:652-741`) tanto na conversão quanto no **follow-up da Duda (6.4)**.

### 6.2 O que se preserva na promoção

| Ativo | Como sobrevive |
|-------|----------------|
| Instância WhatsApp conectada | `evolution_instances` pertence à org — org é a mesma |
| Carteira de clientes (F6) | `clientes` da org — mesma org |
| Preenchimentos do wizard | `onboarding_submissions.payload` — pós-venda, `apply-onboarding` (token+session) aplica; `GuidedOnboarding` logado cobre equipe/agentes |
| Vínculo conversa Duda↔org | `platform_crm_conversations.provisioned_organization_id` (coluna live) — gravado já no INÍCIO da demo: a Duda vira guia do wizard, entrega o relatório e continua a implantação pós-pagamento sem troca de canal |
| Atribuição da venda | `?src=demo-wizard` → `extractSellerRef` → `resolve_affiliate_ref` |

### 6.3 "Liberar as telas restantes"

O único gate de telas é o wizard-overlay do `CockpitShell.tsx:48-54` (flags por usuário `profiles.guided_onboarding_*`) — **não há trava por rota**. Pós-promoção: `enabled_modules` setado pelo provisioning (:228) + o `GuidedOnboarding` V3 (:74-90) já deixa equipe/agentes/CRM **fora do caminho crítico**. Ou seja: "liberar telas" = efeito colateral natural da promoção, zero código novo.

### 6.4 [v2] Follow-up dos não-fechados (Duda no mesmo thread, via P10)

A lead que rodou a demo e **não comprou** não é abandonada nem recebe agente novo. Durante as 72h:

- O `demo-start` já grava `provisioned_organization_id` = org demo na conversa de venda da Duda (a **mesma coluna** que o handoff P10 usa) — a Duda **é a guia do wizard desde o início**, então o thread de WhatsApp já existe.
- A Duda **retoma no MESMO thread** com a **conta do dinheiro que a lead viu na demo** (o `report`: nº de sumidos × ticket = R$ X/mês), reusando **o funil de vendas + a mecânica de handoff do P10** (`handoffConversationToOnboarding` / `provisioned_organization_id`). **Nenhum agente novo.**
- Enquanto a conexão seguir ativa, a análise continua nas 72h (msgs novas incluídas), então a conta pode ser **atualizada** no follow-up.
- No T-0, se ainda não fechou, o `wipe-demo-org` apaga tudo de terceiros (a conversa de venda própria da lead — base `lead_capture` — é retida).

Dependência: **P10 já mergeado/deployado (flag OFF)** — a esteira liga a flag e reusa. Sem reimplementar handoff.

---

## 7. RISCOS honestos + mitigações

| # | Risco | Avaliação | Mitigação |
|---|-------|-----------|-----------|
| R1 | **Ban do número da lead** (Baileys = cliente não-oficial, violação de ToS por definição) | Conectar e SÓ LER = baixo risco (mesmo fluxo do WhatsApp Web; bans por mero pareamento são raros em conta orgânica). O vetor REAL é o **disparo em massa pós-venda** de instância recém-pareada | Demo: read-only + 1 msg de relatório (~zero risco). Pós-venda: rampa/warm-up 24-48h + jitter + circuit-breaker (especificados no PLANO-EXECUCAO Onda 1 item 5, **não construídos**). Nunca prometer imunidade |
| R2 | **Profundidade do histórico não garantida** (WhatsApp decide; `isLatest` buggy; celular primário offline = histórico não vem) | O AHA pode vir raso e matar a venda | Copy "seus últimos meses" (nunca 180d); **gate G0a/G0b de medição real ANTES do lançamento** (ground-truth N≥50); estado honesto na tela 3 pra varredura rasa; UX "leva alguns minutos" pro async |
| R3 | **Capacidade do VPS** ([Provável] 100-300MB RAM/instância Baileys; servidor ÚNICO compartilhado com o CRM da plataforma — demo em massa degrada a operação de vendas) | Teto é RAM, não dinheiro (custo marginal = centavos) | Pool de N slots + fila + TTL 72h (a instância morre no wipe); monitorar RAM; avaliar VPS dedicado pra demo antes de tráfego pago |
| R4 | **Abuso do endpoint público** (`demo-start` sem auth = vetor de spam/flood de instâncias) | Real — cada chamada cria org + potencialmente instância | Rate-limit por IP/telefone + honeypot (padrão `platform-form-submit`); instância lazy (D6); token 72h single-session (já nativo do `onboarding_submissions`); NUNCA expor RPC anon direta |
| R5 | **Wipe incompleto = passivo LGPD** (instância Evolution órfã com o espelho do WhatsApp dela; 33 órfãs; `opportunity_scan_items` com nome+fone de terceiros; storage) | O maior risco técnico-jurídico da esteira | `wipe-demo-org` com deleção VERIFICADA no servidor (re-fetch `fetchInstances`), 8 passos, audit com contagens; **[v2] F3 é gate de conformidade técnica** |
| R6 | ~~Import quebrado `onboarding-handoff.ts`~~ **[v2] RESOLVIDO** | Era bloqueante; **P10 (PR #66, `main` 4aa1b06)** recriou o arquivo e deployou com flag OFF | Nenhuma — dependência satisfeita; a esteira só liga a flag |
| R7 | **Timeout do webhook** (syncFullHistory emite dezenas de chunks grandes) | Médio | Forward fire-and-forget no `evolution-webhook`; RPC já protege com advisory lock + batch 500 |
| R8 | **`evolution-webhook` sem autenticação de origem** (basta URL + nome da instância pra injetar mensagens falsas; `config.toml` nem o declara — divergência com o deploy) | Pré-existente, a esteira amplia a exposição | F4: HMAC/secret no webhook; curto prazo: cross-check `apikey` vs `instance_token` (o history-sync já faz — `index.ts:152-157`) |
| R9 | **Vazamento do pairing code** (QR via `api.qrserver.com` quando não vem base64) | Pré-existente (`GuidedOnboarding.tsx:649`) | Tela demo exige base64; corrigir os 3 pontos existentes em F4 |
| R10 | **R$ 0 na Home de Valor real** (Radar usa `deal_value` cru; salão recém-conectado = 0) | Já é bug do pós-venda | A fórmula `sumidos × ticket` da esteira é o conserto — portar pro pós-venda em F4 |
| R11 | Comparação de bearer não timing-safe no history-sync (`index.ts:117`) + `instanceRef` interpolado cru no `.or()` PostgREST (:134) | Menor | F4 hardening |

---

## 8. FASES DE CONSTRUÇÃO (check binário por fase)

> Regra §8.3: cada passo tem check passou/falhou. Estimativas assumem 1 executor com verificação em ambiente real.
>
> **[v2] Execução autônoma:** o produto NÃO está lançado e **não há leads reais** até o Marcelo revisar. Logo o `/loop` constrói **F0→F4 sem checkpoint humano no meio**; o go-live público **deixa de ser gate bloqueante** e vira **item final de revisão do Marcelo**. F3 (LGPD) continua sendo gate de **conformidade técnica** (o wipe tem que funcionar antes de qualquer dado real entrar), mas não trava o loop — é verificado por smoke com número de teste. Roadmap operacional detalhado: `ESTEIRA-ROADMAP-EXECUCAO-AUTONOMA-2026-07-15.md`.

### F0 — Fundação e fiação (~1 dia) — pré-requisito de TUDO

| Passo | Check binário |
|-------|---------------|
| **[v2] `_shared/onboarding-handoff.ts` — JÁ FEITO (P10, PR #66).** Só validar presença + ligar `ONBOARDING_HANDOFF_ENABLED` quando a esteira precisar do follow-up | `test -f supabase/functions/_shared/onboarding-handoff.ts` = existe; `deno check --node-modules-dir=none` limpo em `cakto-webhook` |
| Aplicar `20260714_f6_carteira_whatsapp.sql` | `SELECT proname FROM pg_proc WHERE proname='upsert_clientes_whatsapp'` = 1 row; colunas `telefone_normalizado`/`ultima_interacao_wa` existem |
| Deploy `evolution-history-sync` | Aparece no `list_edge_functions` do project |
| `syncFullHistory:true` nos 2 creates + 3 eventos `*_SET` no `WEBHOOK_EVENTS` + forward fire-and-forget no `evolution-webhook` | **Parear um número de teste → `clientes` da org ganha rows com `tags=['whatsapp']` e `ultima_interacao_wa` não-nula** (o check que valida a esteira inteira) |

### F1 — MVP do AHA (~3-4 dias)

| Passo | Check binário |
|-------|---------------|
| Migration: `mode='demo'` no CHECK + `organizations.demo_expires_at` | ALTERs aplicados; INSERT de teste com `mode='demo'` passa |
| EF `demo-start` (org demo + submission + token; rate-limit) | `curl` anônimo → 200 com URL; 2º curl mesmo fone em <1min → 429 |
| Refactor wizard render-por-id + prop `steps` | Wizard pós-venda (7 steps) inalterado — smoke test do fluxo atual passa |
| Telas `empresa`(+ticket) / `whatsapp_qr` / `relatorio_dinheiro` + EF `demo-evolution` (connect/status/report) | QR renderiza; conexão reflete em <10s |
| SQL sumidos + fórmula + adapter | `report` de org de teste retorna count e total coerentes com o SQL manual |
| **Check da fase (o AHA)** | **Sessão anônima E2E real: link → aceite → QR → escaneia → tela mostra R$ > 0 com nomes e telefones reais dela** |

### F2 — Entrega + conversão (~2 dias)

| Passo | Check binário |
|-------|---------------|
| `send_report` via `evolution-send` (texto-resumo + link) | Mensagem chega no WhatsApp da lead de teste |
| Tela `planos` (+`list_price_monthly` no Pick) + `?src=demo-wizard` | CTA abre checkout Cakto com o param |
| Patch conversão: Camada 1 (no `demo-start`) + Camada 2 + gate 569 + `demo_expires_at=NULL` | **Compra de teste na Cakto → a MESMA org (UUID igual) fica `plan_status='active'`, `count(clientes)` antes == depois, seeds rodaram, e-mail de acesso recebido** |

### F3 — LGPD (~3 dias) — **[v2] GATE DE CONFORMIDADE TÉCNICA, não fase opcional** (o wipe tem que funcionar antes de qualquer dado real; não é gate de lançamento porque o loop não lança)

| Passo | Check binário |
|-------|---------------|
| **[v2]** Consent scope `demo_whatsapp_scan` + copy robusta da tela QR (texto 5.2 verbatim, "seus últimos meses") + **IP + geo por IP + UA + versão do termo** gravados + botão **"Excluir meus dados"** (agendado, sem "agora") + cláusula de **análise contínua** | Row em `lgpd_consents` com `ip`/`geo_city`/`geo_region`/`user_agent`/versões após o aceite; clique no botão grava `deletion_requested_at` **sem** apagar antes do TTL |
| `wipe-demo-org` (8 passos, deleção verificada) | Org demo de teste: pós-wipe, org ausente; **`GET /instance/fetchInstances` sem a instância**; storage sem o prefixo; `platform_audit_logs` com contagens; `lgpd_consents` retido |
| `demo-reaper` + pg_cron horário + aviso T-24h + confirmação pós-wipe | Org com `demo_expires_at` no passado desaparece em ≤1h sem intervenção; `SELECT * FROM cron.job` mostra o job ativo |
| Bump `PRIVACY_VERSION` com cláusula da demo + RIPD curto | Política publicada em versão nova; consent aponta pra versão que cobre o tratamento |

### F4 — Hardening e escala (~2-3 dias)

| Passo | Check binário |
|-------|---------------|
| Medição G0a/G0b (profundidade real do histórico, N≥50 + números velhos) | Relatório com distribuição de profundidade; copy ajustada por evidência |
| Pool/fila de instâncias demo + monitor de RAM do VPS | Alerta dispara em teste de carga |
| HMAC no `evolution-webhook`; QR base64-only nos 3 pontos; timing-safe no history-sync | Testes de injeção falham com 401 |
| Portar `sumidos × ticket` pra Home de Valor pós-venda (mata o R$ 0) | Salão real recém-conectado mostra R$ > 0 |

### O MVP mais curto que entrega o AHA

**F0 + F1:** a lead vê "R$ X sumindo do seu caixa" com nomes e telefones reais — o **1º marco verificável** ("R$ na tela dela"). Dá pra rodar demo assistida/interna já nesse ponto.
**[v2]** Como o loop roda autônomo e **sem tráfego real** até a revisão do Marcelo, **F3 (LGPD) é construída na sequência do loop** — não é gate de lançamento (não há lançamento no loop); é gate de **conformidade técnica**, verificado por smoke (wipe com número de teste). Público só depois da **revisão final do Marcelo**.

**Sequência do loop: F0→F4, linear.** O roadmap autônomo (`ESTEIRA-ROADMAP-EXECUCAO-AUTONOMA-2026-07-15.md`) fixa ordem, entregáveis exatos e checks binários por fase.

---

## Apêndice — pendências conectadas

- `tasks/INVENTARIO-PENDENCIAS-GO-LIVE-2026-07-14.md` P8 ("Esteira de demonstração" 🔴) é ESTE blueprint — atualizar o inventário quando F1 fechar.
- CART (agente gestão de carteira, ~60%) consome a mesma `clientes.ultima_interacao_wa` — o F6 ligado destrava os dois.
- Localização do servidor Evolution segue pergunta aberta (`DESENHO-ONBOARDING §9`) — relevante pra R3.
- **[v2] P10 (PR #66, `main` 4aa1b06)** — handoff Duda→CS no mesmo thread, flag `ONBOARDING_HANDOFF_ENABLED` OFF: dependência satisfeita que a esteira reusa (conversão + follow-up dos não-fechados).
- **[v2] Roadmap de execução autônoma:** `tasks/ESTEIRA-ROADMAP-EXECUCAO-AUTONOMA-2026-07-15.md` (+.html) — F0→F4 pra `/loop` oneshot, checks binários, sem checkpoint humano.
