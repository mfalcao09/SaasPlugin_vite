# PLANO DE EXECUÇÃO EM LOOP — NexvyPayments (app embutido no monorepo SaasPlugin / ecossistema NexvyTech)

> 2026-07-06 · slug `nexvypayments` (era `gestao-cobrancas`) · REASSENTADO do repo standalone Vendus Cobranças para o monorepo.
> Consumidores: **executor do loop de implementação** (lê por caminho absoluto) + Marcelo.
> **Contexto histórico completo (leia PRIMEIRO):** `apps/NexvyPayments/docs/CONTEXTO-SESSOES.md` — aponta os transcritos JSONL das 2 sessões que geraram este plano (`b58002ed…` esteira + `61748ace…` repivô), com a linha do tempo das decisões. A nova sessão parte com todo o contexto por ali.
> Fonte de verdade da implementação: `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md` (spec auditável, §3.2 tabela mestre + §5.1 matriz de conformidade).
> Este documento NÃO inicia o loop — é o contrato de lançamento e a auditoria de loop-readiness.
>
> **Virada de reassentamento (D1′ — TRAVADA, não reabrir):** NexvyPayments **forka do NexvyBeauty** (`apps/NexvyBeauty`, que **É o Vendus** — provado byte-a-byte em `.vendus-src-reference/`), não do CRM Vendus clonado. Base = Beauty V3 + 12 meses de mods-Marcelo. Estratégia = **HARD FORK GERENCIADO** (upstream Vendus V6+ vira patch seletivo, não merge cego). O **núcleo de cobrança permanece 100% greenfield** (pagador/fatura/boleto/PIX/NFS-e/conciliação — nunca existiu no ecossistema). O que muda vs o plano Vendus original: a BASE (Beauty, não Vendus-repo), o LAR (monorepo, não standalone), a esteira de migrations (`migrations_cobranca/` espelhando `migrations_salao/`) e o PASSO 0 (criar o app pela receita §4 do mapa). Os 24 entregáveis e seus critérios permanecem.

---

## 0. Registro de skills (Passo 0-estudo — modo ESTUDO)

> Nota: há DOIS "passo 0" distintos. Este é o **Passo 0-estudo** (registro de skills, sem tocar código). O **PASSO 0-app** (criar `apps/NexvyPayments/` pela receita do mapa §4) é a **primeira iteração do loop executor** e está descrito na §2.0 abaixo — não se confundem.

| Skill | Status | Requisitos de autonomia extraídos |
|---|---|---|
| `loop` | ⚠️ lançou sem payload (conteúdo não carregou na sessão) | — (coberta por J.md + vendorizados) |
| `everything-claude-code:autonomous-loops` | ✅ carregada | Anti-padrões canônicos: (1) nunca loop sem exit condition (max-runs / max-cost / max-duration / completion signal); (2) ponte de contexto entre iterações via arquivo de estado (`SHARED_TASK_NOTES` → aqui `EXECUCAO-STATE-NEXVYPAYMENTS.md`); (3) nunca re-tentar a mesma falha sem injetar o contexto do erro na tentativa seguinte; (4) revisor nunca é o autor (contexto separado) |
| `everything-claude-code:santa-loop` | ✅ carregada | Convergência adversarial: dual-review independente com veredito estruturado PASS/FAIL; **máx 3 rounds de correção**; commits a cada round NAUGHTY (fixes preservados); push/merge só após NICE; escalation com lista de issues remanescentes se estourar 3 rounds |
| `~/.claude/hooks/types/J.md` (Tipo J) | ✅ lido | Condição de parada declarada **verbatim ANTES** de iniciar (sucesso/falha/timeout/max-iterations); log por tick em arquivo auditável; gate/estado sem mudança não se polla indefinidamente; **sem condição declarada → NÃO iniciar loop** |
| Vendorizados (fallback do briefing) | ✅ aplicados | Condição de parada explícita e verbatim · estado retomável · log por iteração · máx 3 rounds de correção por item · **gate humano não se polla** (parar e listar exatamente o que o humano faz) |

**Conformidade ao modo ESTUDO:** nenhum loop iniciado, nenhum `ScheduleWakeup`/`Monitor` armado, nada do plano executado nesta sessão.

**Nota de auditoria documental:** o spec afirma "Total: 25 entregáveis", mas a enumeração soma **24** (A0–A6: 7 · B1–B5: 5 · C1–C3: 3 · D1–D5: 5 · E1–E4: 4). O loop opera sobre os **24 IDs enumerados**; a contagem "25" é erro aritmético do spec (não há entregável faltante — correção documental menor, sem impacto).

---

## 1. Auditoria de loop-readiness por entregável

**Convenção de classe** (dominante para FECHAR o entregável; gates listados à parte):

- **AUTO** — o loop desenvolve, testa e certifica sozinho (TA local / INSP / VEXT read-only). Deploy do artefato entra no lote MODO-B da fase, mas a *conformidade* é provável localmente.
- **AUTO-COM-TETO** — igual a AUTO, mas o smoke real consome API paga/custosa → registra `custo_acumulado_usd` no STATE antes de cada chamada; teto conjunto **US$10/sessão**.
- **MODO-B (leve)** — toca o ambiente compartilhado do produto (Supabase **NOVO** do NexvyPayments: migrations, deploy de edge functions, secrets, curl contra deployado). Aplicado **em lotes com runbook + verificação read-only depois**; **gate humano para o PRIMEIRO deploy/lote de cada fase**; lotes subsequentes da mesma fase seguem sem novo gate se o runbook não mudou.
- **HITL** — depende de ação/decisão humana ou de mundo real externo. O loop **para**, grava em `fila_humano` a ação exata, e usa **proxy** para progresso parcial — **proxy NUNCA vira CONFORME/certificado**.

> **Mudança de reassentamento nesta tabela:** A1 deixa de ser "undeploy de função no Supabase compartilhado do Vendus" e vira "não plantar a função-fantasma no Supabase NOVO" (greenfield — nada a desfazer, só garantir ausência). Todas as âncoras de migration migram de `supabase/migrations/` (repo Vendus, coordenadas mortas) para `apps/NexvyPayments/supabase/migrations_cobranca/` (novo, multi-tenant, `organization_id`). LGPD-consents e automação são "já resolvidos no Beauty" — herdados via fork, não recriados.

| ID | Classe | Critério verificável por máquina? | Proxy (quando HITL/gate) | Ação corretiva se não-pronto |
|---|---|---|---|---|
| **A0** | **MODO-B** ⚠️ gate arquitetural | SIM — curl de dentro da EF deployada (Supabase NOVO): 200 + `access_token` sandbox C6 | — (é gate binário, não HITL de espera) | **Falhou 3× → loop PARA** e lista a decisão para Marcelo: micro-serviço C6 fora do edge (colide com P4) vs abandonar trilho C6 edge-native. Nunca decidir sozinho. Requer G-C6-SANDBOX liberado antes. mTLS/certificado do banco **sem análogo no Beauty** (o mais perto é OAuth client_id/secret Cakto) — é greenfield puro |
| **A1** | **AUTO** | SIM — greenfield: `ls` = função-fantasma inexistente em `apps/NexvyPayments/supabase/functions/`; grep no `src/` = 0 hits residuais do salão; CI/build verde | — | Como o app nasce por fork limpo do Beauty (§2.0), A1 é **higiene de fork**: remover restos do domínio salão que não pertençam a cobrança. Delete no repo é AUTO |
| **A2** | **AUTO** | SIM — suite TA: 403 cross-org / 401 sem JWT / org-do-token | — | Nenhuma — Deno test puro |
| **A3** | **AUTO** (execução) + G-SEC-REV (certificação) | SIM (execução) — query SQL read-only versionada + doc gerado; NÃO (certificação: revisor humano assina) | Proxy: doc `rls-audit-2026-07.md` completo com lista de policies permissivas = "pronto para revisão" | Queries são read-only → seguras sem gate; auditar as policies do baseline herdado + as novas de `migrations_cobranca/`. Se acesso SQL indisponível, usar Supabase CLI/psql com credencial de leitura (registrar premissa) |
| **A4** | **MODO-B** | SIM — TA local do round-trip `v1:` (unit puro reusa molde `_shared/meta-crypto.ts`, herdado byte-idêntico do Beauty); asserção pós-lote: `SELECT` como anon/authenticated = 0 linhas | — | Migration entra no lote da Fase A (`migrations_cobranca/`); teste de RLS do cofre roda como verificação read-only pós-lote |
| **A5** | **MODO-B** | SIM — TA local em `supabase start` (INSERT cross-org rejeitado); pós-lote: `\d invoices` com 9 colunas novas + CHECK `substituida` + UNIQUE triplo em `billing_credentials` + `billing_agreements` existe | — | Se `supabase start` indisponível no Mac (Docker off), degradar TA→verificação pós-lote apenas (registrar premissa quebrada no STATE) |
| **A6** | **MODO-B** + possível ação humana | SIM — matriz curl versionada: webhooks sem JWT ≠ 401; funções de dinheiro sem JWT = 401 | Proxy: doc `verify-jwt-matrix.md` com matriz esperada preenchida, curls pendentes | `verify_jwt=false` vive em `apps/NexvyPayments/supabase/config.toml` (`[functions.<webhook>]`) — **versionado no monorepo**, diferente do dashboard Lovable do repo antigo. Se o loop não conseguir setar por config/CLI, gravar em `fila_humano` o toggle exato por função |
| **B1** | **MODO-B** (pré-gate G-C6-SANDBOX) | SIM — TA dos parsers com fixtures (portadas de `c6.py`); curl sandbox: Bolepix → `nosso_numero`+linha+QR; consulta idempotente | Proxy: porta Deno completa + parser 100% verde em fixtures = "pronto para smoke sandbox" | Sem credenciais sandbox → desenvolver até o proxy, gravar `fila_humano: obter credenciais sandbox C6`, seguir para próximo elegível. Sandbox C6 é grátis (sem teto) |
| **B2** | **MODO-B** | SIM — TA das RPCs enqueue/read_batch/move_to_dlq (local via `supabase start`); pós-lote: `SELECT pgmq.metrics('billing_outbox')` | — | Migration no lote da Fase B (`migrations_cobranca/`) |
| **B3** | **AUTO** | SIM — TA: 2× mesma competência → 0 duplicatas; vencimento sábado → segunda (usa `business_hours`/`holidays` seedados no banco local) | — | Se seeds de `business_hours`/`holidays` inexistentes no baseline local, criar fixture de seed no teste (premissa registrada) |
| **B4** | **MODO-B** | SIM — TA: fixture paga → `paga`+1 evento; replay → idempotente; GET não confirma → rejeita (GET mockado no TA; real depende do mTLS A0) | Proxy: TA completo com GET mockado | CURL real do fluxo E2E só após A0 CONFORME + deploy do lote B |
| **B5** | **HITL** (G-C6-PROD) | NÃO — boleto real de produção + tarifa negociada ≤R$1,20 são mundo real | Proxy: runbook de emissão prod escrito + credencial-placeholder no cofre validada estruturalmente (formato, não valor) | Parar e listar: (1) abrir/usar conta PJ case #1 no C6; (2) negociar tarifa ≤R$1,20 documentada; (3) inserir credencial prod no cofre |
| **C1** | **AUTO-COM-TETO** (pré-gates G-A1, G-NOTAAS-resid) | SIM — TA: split 101→2 chamadas; "nunca reenvia sem consultar `referencia`" (mock); curl homolog: lote → 202 `{batchId}` | Proxy: função + TA verdes com NotaAS mockada = "pronto para homolog" | **1ª ação da Fase C: VERIFICAR se homologação NotaAS consome créditos** (painel/doc). Se sim: cada lote de teste debita `custo_acumulado_usd`. Sem cert A1 (G-A1) → parar no proxy e gravar `fila_humano: upload do .pfx+senha do case #1` |
| **C2** | **AUTO** | SIM — TA: HMAC inválido → 401; `deliveryId` repetido → 1×; `documents_ready` partial→complete tolerado | — | Nenhuma — HMAC timing-safe testável puro (reusa molde `meta-crypto.ts` herdado) |
| **C3** | **MODO-B** | SIM — TA local: DELETE de nota emitida → exceção do guard; cancelamento gera evento com trilha | — | Trigger/guard SQL entra no lote de migrations da Fase C (`migrations_cobranca/`) |
| **D1** | **AUTO** | SIM — TA: `billing_events(emitida)` → enrollment com `invoice_id`; render da 1ª msg contém valor+vencimento | — | Motor `cadence-*` + executor de `step_runs` é **herdado do Beauty** (reuso); trocar trigger de filtro-CRM → `due_date`/vencimento. Não assumir comportamento do `cadence-*` legado sem ler o contrato herdado |
| **D2** | **AUTO** | SIM — TA com clock fixo TZ America/Sao_Paulo: D-3/D0/D+7 nas datas certas | — | Nenhuma |
| **D3** | **AUTO** | SIM — TA: payer 2 faturas, paga 1 → steps da paga cancelados, da outra intactos | — | Nenhuma |
| **D4** | **HITL** (G-META-TPL) | PARCIALMENTE — aprovação Meta é externa; TA do opt-in-guard e do log com `template_id` são máquina | Proxy: 4 templates redigidos + submetidos + `optin-guard` no caminho com TA verde | Canal Meta+Evolution **herdado 100% byte-idêntico do Beauty**. Submeter templates CEDO (Fase A/B, per spec §3.3); envio real de teste pós-aprovação debita teto (~US$0,008/msg). Parar e listar: aguardar status "approved" no painel Meta (humano confirma — o loop NÃO polla a Meta) |
| **D5** | **AUTO** | SIM — TA: 2ª via → nova invoice + original `substituida`; renegociar → 1 agreement + N parcelas; desconto>alçada → handoff + 0 faturas; input >8k/injeção → bloqueado+logado | — | Agente IA + `orchestrator.ts` (intenção `financeiro` já nativa) **herdados ~80% do Beauty**; adicionar tools `consultar_fatura`/`emitir_2via`/`renegociar` ao `registry.ts` (sem tocar orchestrator). Shield §11.3 é regex/limite — não requer LLM real no TA |
| **E1** | **AUTO** | SIM — TA: baixa manual grava `{origem:'manual'}`; payer sem WhatsApp → msg na fila pgmq de e-mail | — | Painel (front) muda `src/` do app — fica no branch, não dispara build até merge a main |
| **E2** | **AUTO** | SIM — TA: CRUD payers → linhas em `platform_audit_logs`; erasure anonimiza contato MANTENDO fatura/nota | — | Base LGPD-consents **herdada pronta do Beauty** (`migrations_salao/20260619_lgpd_consents.sql` → replicada no baseline do fork) |
| **E3** | **HITL** (G-INFRA) | NÃO para fechar — custo/fatura MEDIDO exige produção rodando (Marco 3); construção do painel/contadores é máquina | Proxy: instrumentação deployada + contadores ativos + doc do gatilho VPS com fórmula (nº a preencher com medição) | Parar e listar: Marcelo valida medição real após 1º ciclo mensal do case #1 |
| **E4** | **HITL** (G-PILOTO) | NÃO — onboarding real do cowork + compromisso pago são mundo real | Proxy: ensaio de onboarding em org de teste com diff de migrations = vazio (prova técnica de horizontalidade — multi-tenant `organization_id` herdado) | Parar e listar: (1) contrato de piloto pago/carta assinada case #1; (2) onboarding real do cowork |

**Veredito de loop-readiness: 11 AUTO · 1 AUTO-COM-TETO · 8 MODO-B · 4 HITL** (24 entregáveis). O pipeline É executável em loop autônomo com as correções da §3 — nenhum entregável ficou sem critério de máquina OU proxy declarado.

---

## 2. Mapa de execução

### 2.0 PASSO 0-app — criar `apps/NexvyPayments/` (primeira iteração do loop)

> **É a iteração 1 do executor. Precede A0.** Segue a receita §4 do mapa de reassentamento. Critério verificável: `npm run build` do app novo passa + `git status` mostra o app rastreado + os 5 arquivos de integração ao monorepo criados/editados. Enquanto isto não estiver CONFORME, **nenhum entregável A/B/C/D/E começa**.

**Pré-requisitos (HITL — gravar em `fila_humano` se ausentes):**
- Projeto Supabase NOVO criado no dashboard → `SUPABASE_REF` (não é o `bwjtesqybhthahmwkbvo` do Beauty; é um projeto dedicado ao Payments).
- DNS Cloudflare `nexvypayments.com.br → 145.223.29.96` (IP VPS) nos 3 hosts (app./gestao./apex + www).

**Receita (ordem):**
```
0.1  cp/rsync do Beauty → Payments (fonte do src, §1 do mapa: cp -r + limpeza, NÃO cascade Fase C):
     rsync -a --exclude=docs --exclude=tasks --exclude=node_modules --exclude=dist \
           --exclude=.vendus-src-reference \
           /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/ \
           /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/
     # (docs/ e tasks/ do Payments já existem com os artefatos reassentados — NÃO sobrescrever)

0.2  REBRAND (arquivos-âncora, mapa §2/§5):
     - package.json           → "name":"nexvy-payments"
     - index.html             → <title>/theme-color/manifest da marca Payments
     - src/config/brand.ts    → BRAND_CONFIG key "nexvypayments" + getActiveBrand()
     - src/lib/publicUrl.ts   → APEX_BASE = "nexvypayments.com.br"
     - src/main.tsx           → classe institucional gestao.* (Nexvy Lux navy+dourado) [DELTA no core → registrar]
     - src/hooks/usePlatformBranding.ts → cor-default de #c54b60 → cor Payments [se editar core → registrar]
     - src/config/modules.ts  → módulos de cobrança (troca erp_salao)

0.3  LIMPEZA de fork (higiene — parte do A1): remover páginas/módulos exclusivos do domínio salão
     que não pertencem a cobrança; manter plataforma (auth, planos, super-admin, IA, WhatsApp,
     CRM-da-plataforma módulo `vendas`).

0.4  CASCADE Fases A+B contra o Supabase NOVO (schema + edges), NUNCA Fase C:
     ./infra/cascade-core.sh NexvyPayments <SUPABASE_REF> nexvy-payments nexvypayments.com.br
     # Fase A: extensions, reset schema public (DROPA public — greenfield ok, guard cascade-core.sh:45-51),
     #         baseline ~161 tabelas, GRANTs, seeds, storage/realtime, crons.
     # Fase B: copia+deploy edge functions (plataforma: auth/planos/super-admin/IA/WhatsApp).
     # ⛔ NÃO rodar Fase C: ela copia src de Oficinas e SOBRESCREVERIA o src que veio do Beauty (0.1).
     #    Interromper o script após Fase B, ou usar o app com src do Beauty e só aplicar A+B.
     #    (Contradição documentada no mapa §4 "VERIFICAR": fonte do src = Beauty; cascade dá só a plataforma.)

0.5  INTEGRAÇÃO ao monorepo (3 criar + 2 editar, mapa §4):
     CRIAR  apps/NexvyPayments/.env.production  (VITE_SUPABASE_URL + anon key do projeto NOVO;
            .gitignore força-inclui !apps/**/.env.production — versionado)
     CRIAR  infra/traefik/NexvyPayments.yml.template  (copiar NexvyBeauty.yml.template e
            HARDCODAR nexvypayments.com.br nos 3 pares de router — bug conhecido: passar DOMAIN
            gera gestao.app.x)
     EDITAR docker-compose.yml  (serviço nexvy-payments: build.args.APP_DIR=NexvyPayments,
            container_name nexvy-payments, networks:[traefik-public], env_file:.env; sem ports/labels)
     EDITAR Makefile  (DOMAIN_PAYMENTS=nexvypayments.com.br; alvo deploy-payments: pull →
            ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyPayments nexvy-payments $(DOMAIN_PAYMENTS)";
            incluir deploy-payments em .PHONY e opcionalmente em deploy-all)

0.6  VERIFICAR (critério binário do PASSO 0-app):
     - cd apps/NexvyPayments && npm ci && npm run build   → exit 0
     - grep -r "salao\|erp_salao" apps/NexvyPayments/src   → só ocorrências intencionais/neutras
     - git -C <monorepo> status                            → app rastreado, 5 arquivos de integração presentes
     - make -n deploy-payments                             → alvo existe e expande com nexvy-payments + domínio
```

**Fonte do deploy (mapa §4, verificado no `Makefile`):** o alvo real é `deploy-vps.sh <AppDir> <container-kebab> <dominio>` — para Payments: `deploy-vps.sh NexvyPayments nexvy-payments nexvypayments.com.br`, com gate anti-phantom (`--no-cache`, compara hash `index-*.js` servido).

### 2.1 Ordem topológica com paradas previstas

Ordem (espelho do spec §3.3), com os pontos onde o loop **prevê parar**. **PASSO 0-app precede tudo.**

```
PASSO 0-app ─────────────────── ⛔ P0: pré-reqs (Supabase NOVO ref + DNS) ausentes → fila_humano;
 │                               1º deploy/lote MODO-B da Fase A depende do app existir e buildar
 │
A0 ──────────────────────────── ⛔ P1: gate humano do 1º deploy da Fase A (MODO-B)
 │                              ⛔ P2: A0 falhou 3× → PARADA ARQUITETURAL (decisão Marcelo)
 └─► A1 → A2 → A3 → A4 → A5 → A6
                │               ⛔ P3: fim da Fase A → G-SEC-REV (revisão por escrito)
                └─► B2 → B3 ─┬─► B1 → B4
                             │  ⛔ P4: G-C6-SANDBOX se credenciais ausentes (B1 fica no proxy)
                             │  ⛔ P5: gate humano do 1º deploy da Fase B
                             └─► C1 → C2 → C3
                                ⛔ P6: G-A1 (cert .pfx) + G-NOTAAS-resid se pendentes (C1 no proxy)
                                ⛔ P7: gate humano do 1º lote da Fase C
        ══ MARCO 1 ══ homologação E2E (boleto sandbox + NFS-e homolog na MESMA fatura)
                             B5 ⛔ P8: G-C6-PROD + toggle "Ativar Produção" + G-QUOTA → HITL total
        ══ MARCO 2 ══ 1ª fatura PROD case #1
                             D1 → D2 → D3 → D4 → D5
                                ⛔ P9: G-META-TPL (D4 no proxy até "approved")
                             E1 → E2 → E3
                                ⛔ P10: G-INFRA (E3 no proxy até medição real)
        ══ MARCO 3 ══ 1º ciclo mensal ≥95% sem humano
                             E4 ⛔ P11: G-PILOTO → fim do escopo autônomo
        ══ MARCO 4 ══ cowork onboarded sem código novo
```

**Regra de escalonamento em bloqueio:** ao topar com gate não liberado, o loop (1) leva o entregável até o **proxy**, (2) grava a ação humana exata em `fila_humano`, (3) tenta o **próximo entregável elegível** na ordem topológica (que não dependa do bloqueado), e (4) só PARA quando não houver nenhum elegível — condição (d) da §2.3.

### 2.2 Schema do `EXECUCAO-STATE-NEXVYPAYMENTS.md`

Local: **`/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/tasks/EXECUCAO-STATE-NEXVYPAYMENTS.md`** (criado pelo executor na iteração 1, junto do PASSO 0-app; commitado junto com o trabalho — é a ponte de contexto entre iterações; padrão `tasks/` do protocolo global).

```markdown
# EXECUCAO-STATE-NEXVYPAYMENTS
## meta
spec: apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md
plano: apps/NexvyPayments/tasks/nexvypayments-plano-execucao-loop.md
repo: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite   # MONOREPO
branch_atual: feat/nexvypayments-<fase>     # ex.: feat/nexvypayments-a  (fase 0 = feat/nexvypayments-bootstrap)
supabase_ref: <SUPABASE_REF do projeto NOVO>   # NÃO o do Beauty
iniciado_em: <ISO8601> | ultima_atualizacao: <ISO8601>

## contadores
iteracao: 0 / 40
custo_acumulado_usd: 0.00 / 10.00          # teto conjunto NotaAS-homolog + Meta msgs + LLM de teste
custo_por_categoria: {notaas_homolog: 0.00, meta_msgs: 0.00, llm_teste: 0.00}

## entregavel_atual
id: PASSO-0-APP | tentativa: 1/3 | status: EM_ANDAMENTO

## entregaveis                              # PASSO-0-APP + 24 IDs
# id | classe | status | evidencia (citável: file:line, output curl, teste) | commit
PASSO-0-APP | BOOTSTRAP | PENDENTE | — | —
A0 | MODO-B | PENDENTE | — | —
...
E4 | HITL   | PENDENTE | — | —
# status ∈ {PENDENTE, EM_ANDAMENTO, PROXY_PRONTO, CONFORME, FALHOU_1, FALHOU_2, FALHOU_3_PARADO, BLOQUEADO_GATE}
# PROXY_PRONTO nunca conta como CONFORME.

## gates
G-SEC-REV: aberto | G-C6-SANDBOX: aberto | G-C6-PROD: aberto | G-NOTAAS-resid: aberto
G-QUOTA: aberto | G-A1: aberto | G-META-TPL: aberto | G-PILOTO: aberto | G-INFRA: aberto
gate_deploy_fase: {A: pendente, B: pendente, C: pendente, D: pendente, E: pendente}

## core_deltas                              # NOVO (regra inviolável do reassentamento)
# toda edição inevitável de arquivo do CORE Vendus (ex.: src/main.tsx p/ branding) registrada aqui
# E replicada em apps/NexvyPayments/docs/CORE-DELTA.md. Formato: arquivo:linha | motivo | commit
# ex.: src/main.tsx:13 | classe institucional gestao.* p/ marca Payments | <hash>

## premissas_assumidas                      # todo default vira linha aqui (correção 3, §3)
# ex.: "supabase start disponível localmente (Docker ON)" · "TZ America/Sao_Paulo em D2"

## fila_humano                              # ação EXATA por item; loop nunca polla estes itens
# ex.: "Criar projeto Supabase NOVO e informar SUPABASE_REF (PASSO-0-APP)"
# ex.: "Setar verify_jwt=false na função c6-webhook via config.toml (A6)"

## log_iteracoes                            # 1 linha por iteração (requisito J.md)
# n | ISO-ts | entregavel | resultado | evidencia_curta | custo_delta_usd
```

### 2.3 Condição de parada global (VERBATIM — copiar para o prompt de lançamento)

> **O loop PARA quando QUALQUER uma destas disjunções for verdadeira:**
> **(a)** todos os 24 entregáveis (+ PASSO-0-APP) estão em `CONFORME` ou em `BLOQUEADO_GATE` com proxy registrado e `fila_humano` preenchida; **OU**
> **(b)** o MESMO entregável acumulou **3 falhas** (`FALHOU_3_PARADO`); **OU**
> **(c)** `custo_acumulado_usd ≥ 10.00`; **OU**
> **(d)** o próximo entregável elegível na ordem topológica está bloqueado por gate HITL não liberado **e não existe nenhum outro entregável elegível**; **OU**
> **(e)** `iteracao = 40`; **OU**
> **(f)** A0 falhou 3× (parada arquitetural imediata — sobrepõe tudo: listar a decisão micro-serviço-fora-do-edge × P4 para Marcelo, sem escolher); **OU**
> **(g)** o PASSO-0-APP falhou 3× (app não builda / cascade A+B falhou) — parada de bootstrap: nada a jusante pode começar.

---

## 3. Correções pró-autonomia (aplicar antes/durante o loop)

1. **Fixtures gravadas 1× e reusadas:** payloads C6 (Bolepix, webhook duplo-escape, consulta) e NotaAS (batch 202, webhook nfse.issued/error/documents_ready) vivem em `apps/NexvyPayments/supabase/functions/_shared/__fixtures__/` — capturados 1× do sandbox/homolog (sanitizados: CNPJs fictícios) e reusados em todo TA. **Smoke real só em entregável marcado CURL no spec** (A0, B1, B4-E2E, C1, A6, D4). Reduz custo e flakiness.
2. **Secrets NUNCA no repo (e NUNCA no frontend — Seção 11 CLAUDE.md):** credenciais C6/NotaAS/mTLS via `supabase secrets set` (ambiente server-side) e `.env.local` gitignored (dev local). O STATE registra só presença/tamanho (`C6_CERT: presente, 2.4KB`), nunca valor — memo `feedback_segredos_nunca_imprimir_campo_arquivo_2026-06-18`. **API key de serviço interno jamais em `VITE_*`/bundle** (regra 11.1: frontend só JWT Supabase, Edge Function proxy no meio).
3. **Defaults viram premissa registrada:** qualquer decisão que o spec não fixa (alçada default de desconto do tenant, seed de `holidays`, formato do `source_ref`) é tomada com o default mais conservador **e gravada em `premissas_assumidas` no STATE** — nunca premissa silenciosa (CLAUDE.md §8.1).
4. **Banco local para TA de DDL:** `supabase start` + migrations locais (`migrations_cobranca/`) permitem provar A5/B2/B3/C3 por TA ANTES do lote MODO-B — o lote vira aplicação de algo já provado, não experimento em ambiente compartilhado. Se Docker indisponível: degradar para verificação read-only pós-lote + premissa registrada.
5. **Runbook MODO-B padronizado por lote:** (i) listar migrations/functions do lote; (ii) gate humano se for o 1º lote da fase; (iii) aplicar contra o Supabase NOVO; (iv) rodar verificação read-only (queries de asserção versionadas); (v) colar output no STATE como evidência. Rollback documentado por lote antes de aplicar.
6. **Branch e merge (MONOREPO):** trabalho em `feat/nexvypayments-<fase>` (bootstrap, a, b, c, d, e) com conventional commits; **merge a `main` SÓ com gate humano**; **NUNCA `git push --force`**. Rebase de `main` no início de cada fase. Diferente do repo Vendus, aqui NÃO há sync bidirecional Lovable — `main` do monorepo é a verdade; o app é fork gerenciado.
7. **Contabilidade de custo ANTES da chamada:** toda chamada paga/custosa registra estimativa no STATE **antes** de executar; se `custo_acumulado_usd + estimativa > 10.00` → não executa e dispara condição (c).
8. **Verificar consumo de créditos da homolog NotaAS (1ª ação da Fase C):** o briefing marca "pode consumir créditos — VERIFICAR". Se consumir: cada lote de teste debita o teto; preferir lotes mínimos (1–2 notas) até o teste de 100 do critério C1.
9. **Matriz §5.1 do spec é editada in-place:** cada entregável CONFORME atualiza `apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md` (status PENDENTE→CONFORME + evidência citável: file:line, output de curl, resultado de teste). Nunca por inferência — regra anti-alucinação do próprio spec.
10. **Gate humano não se polla:** bloqueio → proxy → `fila_humano` com ação exata → próximo elegível → parada limpa pela condição (d). Sem `sleep`/wakeup esperando humano.
11. **Trabalhar com 24 IDs (+ PASSO-0-APP de bootstrap):** a contagem "25" do spec é erro aritmético (§0); o universo do loop são os 24 enumerados, precedidos pelo PASSO-0-APP.
12. **A0 é kill-switch arquitetural:** cada falha de A0 registra o erro completo (runtime Deno, flag unstable, mensagem, mTLS handshake) para que a 3ª falha produza um dossiê de decisão utilizável por Marcelo — não apenas "falhou".
13. **[NOVA — regra inviolável do reassentamento] Delta no core Vendus SEMPRE registrado.** As mods de cobrança devem ficar **100% ISOLADAS** em arquivos/migrations próprios e aditivos (`migrations_cobranca/`, `_shared/__fixtures__/`, tools novas em `registry.ts`, páginas em `src/pages/cobranca/` e `src/cockpit/`), NUNCA editando o core Vendus. **JAMAIS editar um arquivo do core Vendus sem registrar em `apps/NexvyPayments/docs/CORE-DELTA.md`** (e na seção `core_deltas` do STATE): arquivo:linha, motivo, commit. Edições inevitáveis conhecidas: `src/main.tsx` (branding institucional), `src/config/brand.ts`, `src/lib/publicUrl.ts`, `src/config/modules.ts`, `docker-compose.yml`, `Makefile`. Toda outra edição de core exige justificativa no CORE-DELTA. Atualizações futuras do upstream Vendus = **diff seletivo, não merge cego**.

---

## 4. PROMPT DE LANÇAMENTO (self-contained — copiar e colar para iniciar o loop)

```markdown
# LOOP DE IMPLEMENTAÇÃO — NexvyPayments (app embutido no monorepo SaasPlugin / NexvyTech)

## Papel
Você é o ENGENHEIRO EXECUTOR do loop de implementação do NexvyPayments, um app de
cobrança embutido no monorepo SaasPlugin (ecossistema NexvyTech), forkado do NexvyBeauty.
Você executa 1 entregável por iteração, afere pelo método do spec, grava evidência e
atualiza o estado. Você NÃO reabre decisões de arquitetura já travadas (D1′ fork-do-Beauty,
hard fork gerenciado, esteira migrations_cobranca/, Supabase novo).

## Objetivo
Primeiro: PASSO-0-APP (criar o app apps/NexvyPayments/ pela receita do plano §2.0).
Depois: levar os 24 entregáveis (A0–A6, B1–B5, C1–C3, D1–D5, E1–E4) de PENDENTE a CONFORME
(ou BLOQUEADO_GATE com proxy + fila_humano), na ordem topológica do plano §2.1, até
disparar a condição de parada.

## Documentos (leia nesta ordem, na iteração 1)
0. CONTEXTO DE SESSÕES (LEIA PRIMEIRO — o fio para todo o histórico: as 2 sessões que
   geraram este plano, os transcritos JSONL completos, a linha do tempo das decisões e a
   ordem de leitura). Contém as URLs dos JSONLs das sessões `b58002ed…` (esteira) e
   `61748ace…` (repivô) para consulta pontual do *porquê* de qualquer decisão:
   /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/docs/CONTEXTO-SESSOES.md
   ⚠️ Os JSONLs têm 15–21M — NUNCA dar Read no arquivo inteiro; usar grep ou subagente (ver §1 do CONTEXTO).
1. SPEC (fonte de verdade, critérios binários + matriz §5.1):
   /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md
2. ESTE PLANO (PASSO-0-APP §2.0, classes, proxies, paradas, correções §3):
   /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/tasks/nexvypayments-plano-execucao-loop.md
3. ESTADO (criar na iteração 1 se não existir, schema no plano §2.2; ler SEMPRE no
   início de cada iteração; gravar SEMPRE no fim):
   /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/tasks/EXECUCAO-STATE-NEXVYPAYMENTS.md
4. CORE-DELTA (criar se não existir; registrar TODA edição de arquivo do core Vendus):
   /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyPayments/docs/CORE-DELTA.md
Contexto adicional (só se precisar): as-is/blueprint/roadmap reassentados no mesmo
diretório do spec. Base de leitura read-only do fork: apps/NexvyBeauty/ (confirmar file:line
de motores herdados: cadence-*, orchestrator.ts, meta-crypto.ts, usePlatformBranding.ts).

## Base e estratégia de fork (TRAVADAS — não reabrir)
- NexvyPayments FORKA do NexvyBeauty (Beauty É Vendus; base = Beauty V3 + mods-Marcelo).
- HARD FORK GERENCIADO: mods de cobrança 100% ISOLADAS e aditivas (migrations_cobranca/,
  _shared/__fixtures__/, tools novas, src/pages/cobranca/, src/cockpit/). NUNCA editar o
  core Vendus sem registrar em docs/CORE-DELTA.md. Upstream futuro = diff seletivo, não merge.
- Núcleo de cobrança (pagador/fatura/boleto/PIX/NFS-e/conciliação) = greenfield puro.
- Motores herdados de graça (não reescrever): régua cadence-* (~85%), IA orchestrator.ts
  intenção `financeiro` (~80%), WhatsApp Meta+Evolution (100% byte-idêntico), multi-tenant/
  super-admin/onboarding-ao-pagar (100%), LGPD-consents + automação (já resolvidos).

## Repo e branches (MONOREPO)
- Repo: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite (monorepo NexvyTech).
- Trabalhe em feat/nexvypayments-<fase> (fase ∈ {bootstrap,a,b,c,d,e}); rebase de main
  ao abrir cada fase.
- Conventional commits (feat:/fix:/test:/docs:), 1+ commit por entregável concluído.
- Merge a main SÓ com gate humano. NUNCA git push --force. Sem sync Lovable: main = verdade.
- Supabase do produto: projeto NOVO (SUPABASE_REF no STATE; NÃO o bwjtesqybhthahmwkbvo do
  Beauty). Migrations/deploys = MODO-B: em lotes com runbook (plano §3.5), gate humano no
  1º lote de cada fase, verificação read-only após cada lote.

## PASSO 0-app (iteração 1 — precede A0; receita completa no plano §2.0)
- Pré-reqs HITL: projeto Supabase NOVO (SUPABASE_REF) + DNS nexvypayments.com.br→145.223.29.96.
  Se ausentes → gravar em fila_humano e parar bootstrap (condição g não dispara ainda: é gate,
  não falha).
- rsync -a --exclude=docs --exclude=tasks --exclude=node_modules --exclude=dist \
        --exclude=.vendus-src-reference apps/NexvyBeauty/ apps/NexvyPayments/
- Rebrand (package.json name→nexvy-payments, index.html, src/config/brand.ts,
  src/lib/publicUrl.ts APEX_BASE, src/config/modules.ts) — edições de core → CORE-DELTA.md.
- cascade-core.sh NexvyPayments <SUPABASE_REF> nexvy-payments nexvypayments.com.br
  → rodar SÓ Fases A+B (schema+edges da plataforma). NUNCA Fase C (sobrescreveria o src do
  Beauty). Interromper após Fase B.
- Integração monorepo: criar .env.production + infra/traefik/NexvyPayments.yml.template;
  editar docker-compose.yml + Makefile (deploy-payments).
- Critério CONFORME do PASSO-0-APP: npm run build exit 0 + app rastreado no git +
  make -n deploy-payments expande com "nexvy-payments nexvypayments.com.br".

## Regras invioláveis
1. 1 ENTREGÁVEL POR ITERAÇÃO (o próximo elegível na ordem topológica do plano §2.1;
   PASSO-0-APP primeiro).
2. RODAR A AFERIÇÃO DO SPEC (coluna "Critério binário" + "Aferição" da tabela §3.2)
   — o entregável só vira CONFORME com o método do spec executado e evidência citável.
3. GRAVAR EVIDÊNCIA NA MATRIZ DO SPEC: editar
   apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md §5.1, status
   PENDENTE→CONFORME + evidência (file:line / output curl / teste verde). Nunca por inferência.
4. ATUALIZAR tasks/EXECUCAO-STATE-NEXVYPAYMENTS.md ao fim de TODA iteração:
   entregável, status, evidência, commit, custo_delta, linha no log_iteracoes.
5. NUNCA deploy a main/produção sem gate humano registrado no STATE.
6. Secrets nunca no repo, nunca no frontend (Seção 11 CLAUDE.md): C6/NotaAS/mTLS via
   supabase secrets / .env.local gitignored; STATE registra só presença/tamanho.
7. Todo default assumido vira linha em premissas_assumidas (nunca premissa silenciosa).
8. Custo: antes de qualquer chamada paga (NotaAS homolog, Meta msg, LLM de teste),
   registrar estimativa; se custo_acumulado_usd + estimativa > 10.00 → não chamar, parar.
9. Falha em entregável: registrar erro completo, corrigir e re-tentar com o contexto
   do erro injetado; máximo 3 tentativas no mesmo entregável.
10. GATE HITL: nunca pollar. Levar ao proxy (coluna "Proxy" do plano §1), marcar
    BLOQUEADO_GATE, gravar em fila_humano EXATAMENTE o que o humano precisa fazer
    (ação, onde, critério de liberação), e seguir ao próximo elegível. Proxy NUNCA vira CONFORME.
11. A0: se falhar, re-tentar com diagnóstico (máx 3). Na 3ª falha, PARAR TUDO e produzir
    dossiê de decisão (erros completos + opção micro-serviço C6 fora do edge × colisão com
    P4) para Marcelo. Não escolher a arquitetura sozinho.
12. CORE-DELTA INVIOLÁVEL: JAMAIS editar um arquivo do core Vendus sem registrar em
    apps/NexvyPayments/docs/CORE-DELTA.md (arquivo:linha, motivo, commit) e na seção
    core_deltas do STATE. Mods de cobrança devem ser aditivas/isoladas por padrão.

## Condição de parada (verbatim)
O loop PARA quando QUALQUER uma destas disjunções for verdadeira:
(a) todos os 24 entregáveis (+ PASSO-0-APP) estão em CONFORME ou em BLOQUEADO_GATE com
    proxy registrado e fila_humano preenchida; OU
(b) o MESMO entregável acumulou 3 falhas (FALHOU_3_PARADO); OU
(c) custo_acumulado_usd ≥ 10.00; OU
(d) o próximo entregável elegível na ordem topológica está bloqueado por gate HITL não
    liberado e não existe nenhum outro entregável elegível; OU
(e) iteracao = 40; OU
(f) A0 falhou 3× (parada arquitetural imediata — sobrepõe tudo); OU
(g) PASSO-0-APP falhou 3× (app não builda / cascade A+B falhou — parada de bootstrap).

## Relatório final (obrigatório ao parar, por qualquer condição)
1. Condição de parada disparada (letra + evidência).
2. Placar: N CONFORME / N PROXY_PRONTO / N BLOQUEADO_GATE / N FALHOU / N PENDENTE
   (soma = 24 + PASSO-0-APP), com IDs.
3. fila_humano completa: cada ação humana pendente com passo exato e critério de liberação.
4. custo_acumulado_usd final por categoria.
5. Commits da sessão (hash + mensagem) e branch(es) prontos para revisão/merge.
6. Premissas assumidas na sessão (lista verbatim do STATE).
7. core_deltas registrados na sessão (arquivo:linha, motivo) — auditoria de fork.
8. Próxima ação recomendada (1 linha).
```

---

*Fim do plano. Próximo passo humano: revisar este plano, garantir os pré-reqs do PASSO-0-APP (Supabase novo + DNS) e disparar o PROMPT DE LANÇAMENTO (§4) numa sessão executora.*
