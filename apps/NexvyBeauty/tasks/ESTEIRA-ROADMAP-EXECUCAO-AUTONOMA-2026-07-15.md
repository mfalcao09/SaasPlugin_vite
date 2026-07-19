# ROADMAP DE EXECUÇÃO AUTÔNOMA — Esteira de Demonstração NexvyBeauty

> **Versão:** v1 (2026-07-15) · **Autor:** sessão ARQUITETO
> **Para:** `/loop` oneshot — execução SEM intervenção humana no meio (F0→F4). Marcelo revisa no FINAL.
> **Fonte de verdade de arquitetura:** `ESTEIRA-DEMONSTRACAO-BLUEPRINT-2026-07-15.md` (**v2**). Este roadmap é o plano de EXECUÇÃO; o blueprint é o PORQUÊ.
> **Pareado com:** `ESTEIRA-ROADMAP-EXECUCAO-AUTONOMA-2026-07-15.html`.

---

## 0. Como o loop lê este documento (contrato)

1. **Ordem é linear e obrigatória:** F0 → F1 → F2 → F3 → F4. Não pular fase. Cada fase só começa quando o **CHECK BINÁRIO** da anterior passa.
2. **Cada passo tem um check pass/fail** (comando shell ou query SQL). Se o check falha, o loop **conserta e reexecuta** — não avança.
3. **Cada passo marcado `🔴 PRODUÇÃO-REAL`** toca o mundo real (aplica migration no banco live / faz deploy de edge / cria cron / mexe no Evolution VPS). Todo o resto é **código** (arquivo no repo, validado por `deno check`/`tsc`, sem tocar produção).
4. **Antes de qualquer coisa**, ler a Seção 1 (pré-requisitos) e a Seção 10 (**BLOQUEADORES**). Se um bloqueador não estiver resolvido pelo Marcelo, o loop **executa tudo o que não depende dele** e deixa o passo dependente explicitamente `⏸️ PARADO (bloqueador Bx)` no relatório final — **não chuta**.
5. **PR cirúrgico por fase**, a partir de `origin/main`. Um branch por fase (`feat/esteira-f0`, `feat/esteira-f1`, …). Nunca commitar direto na `main`.

---

## 1. PRÉ-REQUISITOS

### 1.1 PRÉ-REQUISITO 0 — P10 já mergeado (dependência satisfeita)

O `_shared/onboarding-handoff.ts` (handoff Duda→CS no mesmo thread) **JÁ FOI mergeado e deployado**:
- PR **#66**, commit `main` **4aa1b06** (`feat(handoff): liga Duda→Lia no mesmo thread pós-compra + fix P0 do matching de telefone`).
- Arquivo presente: `apps/NexvyBeauty/supabase/functions/_shared/onboarding-handoff.ts` (136 linhas).
- Deployado com flag **`ONBOARDING_HANDOFF_ENABLED=OFF`** (default) → deploy-safe, não muda produção.

**A esteira DEPENDE dessa mecânica** para dois pontos:
- **Conversão** (F2): o gate `org_created || promoted` chama o handoff.
- **Follow-up dos não-fechados** (transversal, coberto em F2): a **Duda** retoma no MESMO thread reusando `handoffConversationToOnboarding` + `provisioned_organization_id`. **NÃO se cria agente novo.**

Check binário do pré-requisito:
```bash
test -f apps/NexvyBeauty/supabase/functions/_shared/onboarding-handoff.ts && echo OK
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite log --oneline main | grep -q 4aa1b06 && echo "P10 na main"
```

### 1.2 Ambiente

| Fato | Valor | Consequência pro loop |
|------|-------|----------------------|
| Projeto Supabase live | `fzhlbwhdejumkyqosuvq` | alvo dos deploys/migrations `🔴 PRODUÇÃO-REAL` |
| Migrations ficam em | `apps/NexvyBeauty/supabase/migrations_salao/` | novas migrations aqui, prefixo `20260715_` |
| Edge functions ficam em | `apps/NexvyBeauty/supabase/functions/` | uma pasta por EF, `index.ts` dentro |
| Config de EF pública | `apps/NexvyBeauty/supabase/config.toml` | bloco `[functions.<nome>]` + `verify_jwt = false` |
| Runtime das edges | Deno | validar com `deno check --node-modules-dir=none` — **NUNCA npm** |
| Disco livre | **~2,3 GB (99% cheio)** | ver 2.1 (regra de disco) |

---

## 2. REGRAS OPERACIONAIS DO LOOP

### 2.1 Disco (crítico — só ~2,3 GB livres)
- **Preflight de cada fase:** `df -h . | tail -1`. Se `Avail < 1.0Gi`, limpar antes de continuar.
- **Limpeza segura (nesta ordem, até liberar espaço):**
  ```bash
  # 1) caches de build do monorepo — inspecionar e remover node_modules de apps NÃO tocados
  find /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite -maxdepth 4 -name node_modules -type d -prune -exec du -sh {} \;
  # 2) transcripts/logs antigos do Claude (NUNCA a sessão atual)
  du -sh ~/.claude/projects/*/ 2>/dev/null | sort -h | tail
  ```
- **Edges NÃO precisam de node_modules** (Deno + `--node-modules-dir=none`). Preferir validar edge por `deno check` a rodar build do front.
- **Front (typecheck):** usar o `node_modules` já instalado do app se existir; **não** rodar `npm install` novo sem antes garantir disco. Se faltar disco, o typecheck do front vira passo `⏸️` e o loop registra "front validado por leitura/tsc parcial".
- **Este roadmap e o blueprint são docs** — não geram peso. Nenhum passo do loop deve baixar dependências novas sem passar pelo preflight de disco.

### 2.2 Validação de edges (sempre, nunca npm)
```bash
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/<edge>/index.ts
```
Falhou o `deno check` → conserta e reexecuta. É o gate de "código de edge pronto".

### 2.3 Git / PR
- Branch por fase a partir de `origin/main`: `git checkout -b feat/esteira-fN origin/main`.
- Commit atômico e cirúrgico; mensagem termina com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Não** fazer `push --force` na `main`. **Não** commitar `.env`/secrets.
- PR por fase, corpo termina com o rodapé `🤖 Generated with Claude Code`.

### 2.4 Marcação PRODUÇÃO-REAL
Todo passo `🔴 PRODUÇÃO-REAL` (aplicar migration / deploy de edge / criar cron / tocar Evolution) roda **depois** de o código estar validado e **é registrado no relatório final** com timestamp. Migrations são **sempre aditivas** (`ADD COLUMN`, `CREATE FUNCTION`, novo `CHECK`) — **nunca** destrutivas.

---

## 3. ORDEM LINEAR + MARCOS

```
F0  Fundação/fiação F6 .......... destrava a carteira (clientes ganham ultima_interacao_wa)
F1  MVP do AHA ................... 🏁 MARCO 1 = "R$ na tela dela" (1º verificável)
F2  Entrega + conversão + Duda ... demo vira venda in-place; follow-up no mesmo thread
F3  LGPD (wipe + TTL + consent) ... gate de conformidade técnica (wipe verificado)
F4  Hardening + escala ........... G0 medição, pool/RAM, HMAC, portar fórmula pós-venda
```

**MVP mínimo (1º marco verificável) = F0 + F1:** a lead (número de teste) conecta o WhatsApp e a tela mostra **R$ > 0 com nomes e telefones reais**. Tudo antes disso é fiação; esse é o "R$ na tela dela".

---

## 4. FASE F0 — Fundação e fiação do F6

**OBJETIVO:** o histórico do WhatsApp vira carteira em `public.clientes`. É o fio que alimenta o motor do dinheiro. Sem F0, não há AHA.

**DEPENDÊNCIAS:** Pré-requisito 0 (P10, satisfeito). Nenhuma outra fase antes.

### Entregáveis exatos

| # | Entregável | Caminho | Tipo |
|---|------------|---------|------|
| E0.1 | Validar presença do handoff + `ONBOARDING_HANDOFF_ENABLED` documentado | `apps/NexvyBeauty/supabase/functions/_shared/onboarding-handoff.ts` (já existe) | verificação |
| E0.2 | Aplicar migration F6 (carteira WhatsApp) | `apps/NexvyBeauty/supabase/migrations_salao/20260714_f6_carteira_whatsapp.sql` (já escrita, NÃO aplicada) | 🔴 PRODUÇÃO-REAL |
| E0.3 | Deploy da edge de intake | `apps/NexvyBeauty/supabase/functions/evolution-history-sync/index.ts` (já escrita, órfã) | 🔴 PRODUÇÃO-REAL |
| E0.4 | Patch `syncFullHistory:true` nos 2 creates | `apps/NexvyBeauty/supabase/functions/evolution-proxy/index.ts` (:328-334, :505-511) | código |
| E0.5 | Patch 3 eventos `MESSAGES_SET/CHATS_SET/CONTACTS_SET` no `WEBHOOK_EVENTS` | `apps/NexvyBeauty/supabase/functions/evolution-proxy/index.ts` (:123-130) | código |
| E0.6 | Forward fire-and-forget → `evolution-history-sync` | `apps/NexvyBeauty/supabase/functions/evolution-webhook/index.ts` | código |
| E0.7 | Deploy de `evolution-proxy` + `evolution-webhook` patchados | (mesmos arquivos) | 🔴 PRODUÇÃO-REAL |

### Passos
1. `git checkout -b feat/esteira-f0 origin/main`.
2. E0.1: rodar o check do Pré-requisito 0. Se falhar, PARAR e reportar (não deveria falhar — P10 na main).
3. E0.4/E0.5/E0.6: aplicar os patches (código). `deno check --node-modules-dir=none` em cada edge tocada.
4. E0.2 `🔴`: aplicar `20260714_f6_carteira_whatsapp.sql` no projeto live.
5. E0.3/E0.7 `🔴`: deploy das 3 edges (`evolution-history-sync`, `evolution-proxy`, `evolution-webhook`).
6. Abrir PR `feat/esteira-f0`.

### CHECK BINÁRIO de conclusão (F0)
```sql
-- RPC e colunas existem (E0.2)
SELECT count(*) FROM pg_proc WHERE proname='upsert_clientes_whatsapp';           -- = 1
SELECT count(*) FROM information_schema.columns
  WHERE table_name='clientes' AND column_name IN ('telefone_normalizado','ultima_interacao_wa'); -- = 2
```
```bash
# edges no ar (E0.3/E0.7)
supabase functions list | grep -E 'evolution-history-sync|evolution-proxy|evolution-webhook'
```
**Check-mestre da fase (valida a esteira inteira do intake) 🔴:** parear UM número de teste →
```sql
SELECT count(*) FROM clientes
  WHERE organization_id = '<org_teste>' AND tags @> ARRAY['whatsapp'] AND ultima_interacao_wa IS NOT NULL; -- > 0
```
> **Nota de autonomia:** o pareamento do número de teste exige um humano escaneando o QR (Baileys = WhatsApp real). O loop deixa este check-mestre como **passo verificável por humano** (ver Seção 9 e Bloqueador B4). Os checks SQL/`functions list` acima o loop executa sozinho.

---

## 5. FASE F1 — MVP do AHA ("R$ na tela dela") 🏁 MARCO 1

**OBJETIVO:** sessão anônima → wizard demo → QR real → varredura → **tela mostra R$ = sumidos × ticket com nomes/telefones reais**. É o 1º marco verificável do produto.

**DEPENDÊNCIAS:** F0 concluída (carteira alimentada).

### Entregáveis exatos

| # | Entregável | Caminho | Tipo |
|---|------------|---------|------|
| E1.1 | Migration: `mode='demo'` no CHECK de `onboarding_submissions` + `organizations.demo_expires_at timestamptz NULL` + índice parcial `WHERE plan_status='demo'` | `apps/NexvyBeauty/supabase/migrations_salao/20260715_demo_mode_e_ttl.sql` (novo) | 🔴 PRODUÇÃO-REAL |
| E1.2 | EF `demo-start` (verify_jwt=false; rate-limit IP/fone + honeypot; cria org demo + submission; token 32B+sha256; grava `cakto_customer_email` + `provisioned_organization_id` na conversa da Duda) | `apps/NexvyBeauty/supabase/functions/demo-start/index.ts` (novo, ~150 linhas) | 🔴 deploy PRODUÇÃO-REAL |
| E1.3 | EF `demo-evolution` (verify_jwt=false; auth token+session; actions `connect`/`status`/`report`/`send_report`/`request_deletion`) | `apps/NexvyBeauty/supabase/functions/demo-evolution/index.ts` (novo, ~250 linhas) | 🔴 deploy PRODUÇÃO-REAL |
| E1.4 | Registrar as 2 EFs públicas no config | `apps/NexvyBeauty/supabase/config.toml` (blocos `[functions.demo-start]`/`[functions.demo-evolution]` com `verify_jwt=false`) | código |
| E1.5 | Refactor wizard render-por-id + prop `steps` | `apps/NexvyBeauty/src/components/onboarding/implantacao/ImplantacaoWizard.tsx` | código |
| E1.6 | Tela 1 `empresa` **COMPLETA** + campo ticket médio (revertida a redução do v1) | mesmo `ImplantacaoWizard.tsx` (step empresa) | código |
| E1.7 | Tela 2 `whatsapp_qr` (bloco LGPD antes do QR — copy F3; QR base64; polling server-side via `demo-evolution`) | `apps/NexvyBeauty/src/components/onboarding/implantacao/steps/WhatsappQrStep.tsx` (novo) | código |
| E1.8 | Tela 3 `relatorio_dinheiro` (MoneyHeadline + OpportunityCard seed+CTA; adapter) | `apps/NexvyBeauty/src/components/onboarding/implantacao/steps/RelatorioDinheiroStep.tsx` (novo) | código |
| E1.9 | Adapter cliente→`OpportunityCardData` | `apps/NexvyBeauty/src/cockpit/home/` (espelho de `toOpportunityCard` em `types.ts:16-45`) | código |
| E1.10 | SQL sumidos + fórmula R$ (dentro do action `report`) | dentro de `demo-evolution/index.ts` | código |

### Passos
1. `git checkout -b feat/esteira-f1 origin/main` (após F0 mergeada).
2. Escrever E1.2/E1.3/E1.10 (edges). `deno check --node-modules-dir=none` em cada.
3. Escrever E1.4 (config.toml).
4. Escrever E1.5–E1.9 (front). Typecheck (ver regra de disco 2.1).
5. E1.1 `🔴`: aplicar migration `20260715_demo_mode_e_ttl.sql`.
6. E1.2/E1.3 `🔴`: deploy de `demo-start` e `demo-evolution`.
7. PR `feat/esteira-f1`.

### CHECK BINÁRIO de conclusão (F1)
```bash
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/demo-start/index.ts
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/demo-evolution/index.ts
```
```sql
-- E1.1 aplicada
SELECT count(*) FROM information_schema.columns
  WHERE table_name='organizations' AND column_name='demo_expires_at'; -- = 1
-- INSERT de teste com mode='demo' passa (não viola o CHECK)
```
```bash
# demo-start responde e o rate-limit funciona (SB_URL/anon key do projeto)
curl -s -X POST "$SB_URL/functions/v1/demo-start" -d '{"nome":"teste","whatsapp":"<fone_teste>"}' | grep -q implantacao          # 200 com URL
curl -s -X POST "$SB_URL/functions/v1/demo-start" -d '{"nome":"teste","whatsapp":"<fone_teste>"}' -o /dev/null -w '%{http_code}'  # 429 no 2º em <1min
```
**🏁 CHECK-MARCO 1 (o AHA) 🔴 — human-in-the-loop:** sessão anônima E2E: `link → aceite LGPD → QR → escaneia → tela mostra R$ > 0 com nomes/telefones reais`. **O QR exige humano** (Bloqueador B4). O loop verifica sozinho tudo até o QR (demo-start dá URL; demo-evolution `connect` devolve QR base64; `report` sobre carteira **semeada de teste** devolve `count`/`total` corretos):
```sql
-- validação autônoma do motor do dinheiro SEM QR: semear clientes de teste e conferir o report
-- (inserir N rows em clientes com ultima_interacao_wa entre now()-180d e now()-45d, ticket X)
-- report(org_teste) deve retornar count=N e total=N*X
```

---

## 6. FASE F2 — Entrega + conversão in-place + follow-up da Duda

**OBJETIVO:** (a) o relatório chega no WhatsApp da lead; (b) a compra promove a MESMA org demo → paga, sem retrabalho; (c) quem não fecha recebe follow-up da **Duda no MESMO thread** com a conta do dinheiro (reusa P10).

**DEPENDÊNCIAS:** F1 concluída. Pré-requisito 0 (handoff) — ligar a flag.

### Entregáveis exatos

| # | Entregável | Caminho | Tipo |
|---|------------|---------|------|
| E2.1 | `send_report` via `evolution-send` (texto-resumo + link) | action em `demo-evolution/index.ts` + reuso de `apps/NexvyBeauty/supabase/functions/evolution-send/index.ts` | código |
| E2.2 | Tela 4 `planos` (+`list_price_monthly`; CTA `?src=demo-wizard`) | `apps/NexvyBeauty/src/components/onboarding/implantacao/steps/PlanosStep.tsx` (novo) | código |
| E2.3 | `list_price_monthly` no Pick de planos | `apps/NexvyBeauty/src/hooks/usePlatformPlans.ts` (:99-109) | código |
| E2.4 | Patch conversão: Camada 2 (match email/fone de org `plan_status='demo'`) + gate 569 `\|\| promoted` + `demo_expires_at=NULL` na promoção | `apps/NexvyBeauty/supabase/functions/_shared/cakto-plan-provisioning.ts` (após :163; gate :569; UPDATE :219-231) | código |
| E2.5 | Ligar o handoff da Duda (conversão + follow-up) | secret `ONBOARDING_HANDOFF_ENABLED=true` no ambiente das edges | 🔴 PRODUÇÃO-REAL (env) |
| E2.6 | Deploy `cakto-webhook`/provisioning + `demo-evolution` (send_report) | `apps/NexvyBeauty/supabase/functions/cakto-webhook/` + `demo-evolution/` | 🔴 PRODUÇÃO-REAL |

> **Follow-up dos não-fechados (transversal, sem agente novo):** o `demo-start` (E1.2) já gravou `provisioned_organization_id` = org demo na conversa de venda da Duda. Durante as 72h, a Duda retoma **no mesmo thread** com a conta `sumidos × ticket` (o `report`), reusando `handoffConversationToOnboarding`/`provisioned_organization_id` do P10. **NÃO criar EF nova de SDR nem novo agente.** O disparo do follow-up reusa o funil existente do `platform-sales-brain`.

### Passos
1. `git checkout -b feat/esteira-f2 origin/main` (após F1 mergeada).
2. E2.1–E2.4 (código). `deno check` nas edges; typecheck no front.
3. E2.5 `🔴`: setar `ONBOARDING_HANDOFF_ENABLED=true`.
4. E2.6 `🔴`: deploy.
5. PR `feat/esteira-f2`.

### CHECK BINÁRIO de conclusão (F2)
```bash
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/cakto-webhook/index.ts
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/demo-evolution/index.ts
```
- **CTA:** a Tela 4 abre o checkout Cakto com `?src=demo-wizard` (assert no href montado).
- **Conversão 🔴 — human/ambiente (Bloqueador B4):** compra de teste na Cakto → a **MESMA org (UUID igual)** fica `plan_status='active'`, `count(clientes)` antes == depois, seeds rodaram, e-mail de acesso recebido. Query autônoma (após simular o payload do webhook com uma org demo semeada):
```sql
SELECT plan_status, demo_expires_at FROM organizations WHERE id='<org_demo_teste>';  -- 'active', NULL
```
- **Follow-up:** com a flag ON e uma conversa de venda semeada com `provisioned_organization_id`, o handoff aponta `current_agent_id` pro agente CS (`ilike '%implanta%'`) sem trocar de thread (validar por `handoffConversationToOnboarding` retornando `ok:true`).

---

## 7. FASE F3 — LGPD (consent robusto + wipe verificado + TTL 72h)

**OBJETIVO:** conformidade técnica dura — consent com IP/geo/UA/versão, retenção **72h nos dados** independente de pedido de exclusão, wipe **verificado** (Evolution + storage + 33 órfãs + 7 bloqueadoras + CASCADE), TTL automático por pg_cron.

**DEPENDÊNCIAS:** F1 (org demo existe). Idealmente após F2, mas o wipe é independente. **É gate de conformidade técnica** (o wipe tem que funcionar antes de qualquer dado real) — não é gate de lançamento (o loop não lança).

### Entregáveis exatos

| # | Entregável | Caminho | Tipo |
|---|------------|---------|------|
| E3.1 | Migration: colunas de prova em `lgpd_consents` (`ip`, `user_agent`, `geo_city`, `geo_region` se não existirem — ALTER aditivo) + `organizations.deletion_requested_at timestamptz NULL` | `apps/NexvyBeauty/supabase/migrations_salao/20260715_lgpd_geo_e_deletion_req.sql` (novo) | 🔴 PRODUÇÃO-REAL |
| E3.2 | Consent scope `demo_whatsapp_scan` gravado no aceite, com **texto 5.2 verbatim** + IP + geo por IP + UA + versão | escrita no `demo-evolution` (aceite) + `apps/NexvyBeauty/src/data/legalContent.ts` (texto/versão) | código |
| E3.3 | Copy robusta da tela QR (checklist art. 9º/39; "seus últimos meses"; botão **"Excluir meus dados"** sem "agora"; cláusula de análise contínua) | `WhatsappQrStep.tsx` (E1.7) + `RelatorioDinheiroStep.tsx` (botão) | código |
| E3.4 | Action `request_deletion` (grava `deletion_requested_at`, **agenda** wipe pro TTL, não apaga na hora) | `demo-evolution/index.ts` | código |
| E3.5 | EF `wipe-demo-org` (service_role; guard `WHERE plan_status='demo'`; 8 passos; deleção **verificada** no Evolution via `GET /instance/fetchInstances`; audit com contagens) | `apps/NexvyBeauty/supabase/functions/wipe-demo-org/index.ts` (novo, ~250 linhas) | 🔴 deploy PRODUÇÃO-REAL |
| E3.6 | EF `demo-reaper` (auth `x-cron-secret`; T-24h aviso; T-0 chama `wipe-demo-org`) + **job pg_cron horário** | `apps/NexvyBeauty/supabase/functions/demo-reaper/index.ts` (novo) + migration de cron | 🔴 PRODUÇÃO-REAL (deploy + cron) |
| E3.7 | Bump `PRIVACY_VERSION` com cláusula da demo + RIPD curto (**DRAFT** — sign-off legal do Marcelo, Bloqueador B5) | `apps/NexvyBeauty/src/data/legalContent.ts` (`PRIVACY_VERSION`) + `tasks/RIPD-ESTEIRA-DEMO-2026-07-15.md` (draft) | código (draft) |

### Passos
1. `git checkout -b feat/esteira-f3 origin/main`.
2. E3.2/E3.3/E3.4/E3.5/E3.6/E3.7 (código). `deno check` nas edges novas.
3. E3.1 `🔴`: aplicar migration geo/deletion_requested_at.
4. E3.5 `🔴`: deploy `wipe-demo-org`.
5. E3.6 `🔴`: deploy `demo-reaper` + aplicar migration que cria o job pg_cron horário.
6. PR `feat/esteira-f3`.

### CHECK BINÁRIO de conclusão (F3)
```bash
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/wipe-demo-org/index.ts
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/demo-reaper/index.ts
```
```sql
-- consent com prova (E3.1/E3.2) após um aceite de teste
SELECT ip, user_agent, geo_city, geo_region, terms_version
  FROM lgpd_consents WHERE scope='demo_whatsapp_scan' ORDER BY created_at DESC LIMIT 1;   -- todos preenchidos
-- botão de exclusão NÃO antecipa o wipe (E3.4)
SELECT deletion_requested_at, demo_expires_at FROM organizations WHERE id='<org_demo_teste>'; -- deletion setado, org ainda existe
-- cron ativo (E3.6)
SELECT jobname FROM cron.job WHERE jobname ILIKE '%demo-reaper%';  -- 1 row
```
**Check-mestre do wipe 🔴 (autônomo — org demo SEMEADA de teste, sem QR):** criar uma org `plan_status='demo'` de teste com dados sintéticos (clientes fake, storage fake, instância fake se aplicável), rodar `wipe-demo-org`, então:
```sql
SELECT count(*) FROM organizations WHERE id='<org_demo_teste>';              -- 0 (org apagada)
SELECT count(*) FROM lgpd_consents WHERE organization_id='<org_demo_teste>'; -- retido (prova)
SELECT count(*) FROM platform_audit_logs WHERE event ILIKE '%wipe%';         -- 1 registro com contagens
```
```bash
# instância some do servidor Evolution (se houve instância de teste): GET /instance/fetchInstances NÃO lista a instância da org de teste
```

---

## 8. FASE F4 — Hardening e escala

**OBJETIVO:** tirar os riscos pré-existentes do caminho e preparar volume.

**DEPENDÊNCIAS:** F1–F3 concluídas.

### Entregáveis exatos

| # | Entregável | Caminho | Tipo |
|---|------------|---------|------|
| E4.1 | Pool/fila de instâncias demo + monitor de RAM do VPS (R3) | `demo-evolution/index.ts` (pool) + doc de monitor | código + config |
| E4.2 | HMAC/secret de origem no `evolution-webhook` (R8) | `apps/NexvyBeauty/supabase/functions/evolution-webhook/index.ts` | código + 🔴 deploy |
| E4.3 | QR base64-only nos 3 pontos (R9) | `apps/NexvyBeauty/src/.../GuidedOnboarding.tsx:649` + demo | código |
| E4.4 | Timing-safe no history-sync + `instanceRef` parametrizado (R11) | `apps/NexvyBeauty/supabase/functions/evolution-history-sync/index.ts` (:117, :134) | código + 🔴 deploy |
| E4.5 | Portar `sumidos × ticket` pra Home de Valor pós-venda (R10) | `apps/NexvyBeauty/src/cockpit/home/` | código |
| E4.6 | Medição G0a/G0b (profundidade real do histórico, N≥50) | doc de resultado | dados (human — Bloqueador B4) |

### CHECK BINÁRIO de conclusão (F4)
```bash
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/evolution-webhook/index.ts
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/evolution-history-sync/index.ts
```
- Teste de injeção no webhook falha com 401 (E4.2). Salão real recém-conectado mostra R$ > 0 (E4.5). G0 (E4.6) é medição com números reais → item de revisão do Marcelo.

---

## 9. CRITÉRIO DE "100% CONCLUÍDO" (definição binária)

**O critério de conclusão do loop é ENTREGAR O CÓDIGO 100% PRONTO — não é testar o QR nem fazer compra real.** O loop está **100% concluído** quando **TODAS** as condições do bloco A são verdadeiras. O bloco B (teste com QR/compra reais) **NÃO faz parte da definição de pronto do loop** — é o smoke físico posterior do Marcelo, fora do escopo do trabalho autônomo.

**A) Autônomo (o loop verifica sozinho) — ISTO é a conclusão:**
1. Todos os `deno check --node-modules-dir=none` das 4 EFs novas (`demo-start`, `demo-evolution`, `wipe-demo-org`, `demo-reaper`) + as 3 patchadas (`evolution-proxy`, `evolution-webhook`, `cakto-webhook`) passam.
2. As 3 migrations novas + a F6 estão aplicadas no projeto live (queries de coluna/RPC/cron retornam o esperado — checks de F0/F1/F3).
3. As 4 EFs novas aparecem no `supabase functions list`.
4. **Smoke com dados SEMEADOS (sem QR):** org demo de teste criada por SQL → `report` devolve `count/total` corretos → `request_deletion` grava sem apagar → `wipe-demo-org` apaga a org, retém `lgpd_consents`, escreve `platform_audit_logs` com contagens. Pass/fail por query.
5. 5 PRs (F0–F4) abertos a partir de `origin/main`, cada um com `deno check` verde.

**B) FORA DO ESCOPO DO LOOP (smoke físico posterior do Marcelo — NÃO é critério de conclusão):**
6. **Sessão demo E2E real com número de teste:** `start → QR (humano escaneia) → sync → relatório com R$ real → planos → (compra de teste OU pular) → wipe/expiração`. É o teste "verdadeiro" do produto, mas é um ato **físico** (escanear QR de WhatsApp real + compra Cakto), não trabalho de código. O loop entrega tudo 100% pronto pra esse teste acontecer; realizá-lo é do Marcelo.
7. Sign-off legal do `PRIVACY_VERSION`/RIPD (Bloqueador B5).
8. Decisão de go-live público (item final do Marcelo — **não** é gate do loop).

**Resumo:** entregar o código 100% pronto (A1–A5) **É** a conclusão do loop — sem hedge, sem "no que é possível". B6–B8 são o smoke físico posterior do Marcelo (QR/compra reais), fora do escopo do trabalho autônomo. O loop termina reportando "código 100% entregue; teste físico pendente do Marcelo" = **loop concluído**.

---

## 10. ⚠️ BLOQUEADORES — perguntar ao Marcelo ANTES/DURANTE o loop

> Ambiguidades **novas** não cobertas pelas decisões do blueprint v2 nem pelos 4 ajustes. O loop **não chuta** nenhuma: executa o que não depende delas e marca o passo dependente `⏸️ PARADO (Bx)`.

| # | Bloqueador | Por que trava | Opções | Recomendação (aguardando OK) |
|---|-----------|---------------|---------|------------------------------|
| **B1** ✅ | **RESOLVIDO (Marcelo 2026-07-15): GeoLite2 LOCAL** | — não trava mais | — | Resolver `geo_city`/`geo_region` a partir do IP com base **GeoLite2 embarcada na nossa infra**; o IP **NUNCA sai** pra API 3ª (LGPD-limpo). **NÃO** chamar ip-api/ipapi.co. |
| **B2** | **Clique em "Excluir meus dados" → desconectar a instância na hora?** | A retenção de 72h é fixa (dados ficam), mas a **análise contínua** roda enquanto a conexão está ativa. Se a lead pede exclusão, cessa a análise de novas msgs (minimização) ou segue até o TTL? As decisões não dizem | (a) desconectar a instância no ato do pedido (para novas msgs; retém o já coletado até o TTL); (b) manter conectado até o TTL | (a) por minimização — mas confirmar com o Marcelo |
| **B3** | **Alvo das migrations/deploys: branch de dev do Supabase ou projeto live `fzhlbwhdejumkyqosuvq`?** | Todo passo `🔴` toca produção. Sem leads reais, aplicar aditivo no live é baixo risco, mas é decisão de ops | (a) branch Supabase de dev primeiro, merge depois; (b) direto no live (só aditivo) | (b) direto no live **se** for garantidamente aditivo; senão (a) |
| **B4** | **Teste físico (QR + compra) — NÃO é bloqueador, é o escopo** | ⚠️ **NÃO trava o loop.** Escanear QR (Baileys=WhatsApp real) e comprar na Cakto são atos FÍSICOS, não código. Entregar o código 100% pronto pra esse teste **É** a conclusão do loop | — | **Não perguntar nada.** O loop entrega o código 100% pronto + smoke por dados semeados e para. O teste físico é do Marcelo, pós-entrega |
| **B5** | **Sign-off legal do `PRIVACY_VERSION`/RIPD** | Publicar versão de política de privacidade é ato sensível (legal). O loop **redige** o draft, mas não publica sozinho | — | Loop entrega draft; Marcelo/legal ratifica antes de qualquer tráfego real |
| **B6** | **Número/instância de teste para o smoke + Evolution** | Alguns checks-mestre (`fetchInstances`, pareamento) precisam de um número/instância de teste designado; as credenciais do Evolution VPS já estão no env do `evolution-proxy` | — | Confirmar qual número de teste usar; reusar env do `evolution-proxy` |

---

## 11. Anexo — comandos canônicos do loop

```bash
# preflight de disco (toda fase)
df -h /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite | tail -1

# validar edge (nunca npm)
deno check --node-modules-dir=none apps/NexvyBeauty/supabase/functions/<edge>/index.ts

# branch cirúrgico por fase
git -C /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite checkout -b feat/esteira-fN origin/main

# edges no ar
supabase functions list
```

---

## Apêndice — rastreabilidade

- Arquitetura/PORQUÊ: `tasks/ESTEIRA-DEMONSTRACAO-BLUEPRINT-2026-07-15.md` (**v2**) + `.html`.
- Dependência satisfeita: **P10** — `apps/NexvyBeauty/supabase/functions/_shared/onboarding-handoff.ts` (PR #66, `main` 4aa1b06, flag OFF).
- Inventário go-live: `tasks/INVENTARIO-PENDENCIAS-GO-LIVE-2026-07-14.md` P8 — atualizar quando MARCO 1 (F1) fechar.
