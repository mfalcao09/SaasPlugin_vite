# EXECUCAO-STATE-NEXVYPAYMENTS

## meta
spec: apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md
plano: apps/NexvyPayments/tasks/nexvypayments-plano-execucao-loop.md
repo: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite   # MONOREPO
worktree_executor: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite.claude-worktrees/nexvypayments-bootstrap   # sessão paralela ocupa o working tree principal — executor NUNCA usa o working tree principal
branch_atual: feat/nexvypayments-bootstrap   # de feat/nexvypayments-planning@6650382; main NÃO contém os docs (premissa 3)
supabase_ref: nbvaglqmcyoogolhzyzm   # projeto "NexvyPayments", ACTIVE_HEALTHY, us-west-2 (criado por Marcelo 2026-07-06 09:22Z)
dominio: nexvypayments.com.br   # zona CF cd6629d4…; 4 registros A → 145.223.29.96 DNS-only (criados via API nesta sessão)
iniciado_em: 2026-07-06T09:29:24Z | ultima_atualizacao: 2026-07-06T10:50:00Z

## contadores
iteracao: 12 / 40
custo_acumulado_usd: 0.00 / 10.00
custo_por_categoria: {notaas_homolog: 0.00, meta_msgs: 0.00, llm_teste: 0.00}

## entregavel_atual
id: UI módulo Cobranças (nova frente, fora do spec 25) + C1 NotaAS (aguarda creds Marcelo) | status: 17/25 CONFORME (+A6 pós-deploy). 6 EFs ACTIVE. Frentes paralelas: UI (herda gestao/Nexvy Lux — mapa em construção), C1 (aguarda key NotaAS+A1), C6 (A0/B1/B4/B5 aguarda creds). Restantes gate: D4 Meta, E3 infra, E4 piloto; A3 aguarda G-SEC-REV

## entregaveis                              # PASSO-0-APP + 25 IDs (matriz §5.1 do spec — inclui A7)
# id | classe | status | evidencia (citável) | commit
PASSO-0-APP | BOOTSTRAP | CONFORME | npm run build exit 0; make -n deploy-payments → "NexvyPayments nexvy-payments nexvypayments.com.br"; app rastreado; banco: 161 tabelas+GRANTs+seeds+12 buckets+realtime 6+10 crons (verificação MCP); 164 edges ACTIVE; DNS 4 hosts→145.223.29.96 | 22170d1+ea09417
A0 | MODO-B (gate arquitetural) | BLOQUEADO_GATE | P1 (gate humano 1º deploy Fase A) + G-C6-SANDBOX: C6_CLIENT_ID/SECRET + cert/key mTLS sandbox NÃO encontrados (env local erp-educacional sem C6_*; VPS idem) | —
A1 | AUTO | CONFORME | ls admin-provision-users → No such file or directory; grep src/ = 0 hits; build verde. Cert. revisor → G-SEC-REV (P3) | ea09417
A2 | AUTO | CONFORME | require-caller-org.ts + __tests__/: deno test 11/11 (aferição re-rodada pelo revisor; autor=Opus); org real via profiles.organization_id (webchat-inbox:93); nota: === da service key → timing-safe no consumo | (commit desta iteração) |
A3 | AUTO + G-SEC-REV | PROXY_PRONTO | docs/security/rls-audit-2026-07.md+.html: 112/112 org-tables RLS ON, 0 sem RLS, 0 deny-all, 415 policies, 20 permissivas classificadas, 🚩1 flag (help_article_feedback) p/ revisor | (commit desta iteração)
A4 | MODO-B | CONFORME | migration aplicada no banco (nbvaglqmcyoogolhzyzm via db query); billing-crypto.ts (wrapper de meta-crypto); deno test 8/8; SET ROLE anon SELECT=0; REVOKE anon/authenticated → has_priv=false (defesa em profundidade); rls_on=true | (commit desta iteração)
A5 | MODO-B | CONFORME | billing_model.sql aplicada (nbvaglqmcyoogolhzyzm); 7 tab RLS ON; invoices 8 cols correção; CHECK substituida; 7/7 org-scoped; INSERT cross-org → 42501 RLS violation; isolamento 0 ALTER/DROP core (REFERENCES só organizations/leads) | (commit desta iteração)
A6 | MODO-B | CONFORME | 6 EFs deployadas (ACTIVE) no nbvaglqmcyoogolhzyzm; curl: notaas-webhook 404≠401 (público), billing-baixa-manual/invoice-batch 401 (protegido); doc verify-jwt-matrix.md | (commit iter 12)
A7 | AUTO (INSP+CI) | CONFORME | grep cobrança fora da esteira = 0; CORE-DELTA 7 entradas; 0 mutação de core em migrations_cobranca (esteira criada c/ README); invariante contínuo re-aferido por fase | (commit desta iteração)
B1 | MODO-B (pré-gate G-C6-SANDBOX) | PENDENTE | — | —
B2 | MODO-B | CONFORME | billing_outbox.sql aplicada (pgmq + RPCs enqueue/read_batch/move_to_dlq + DLQ); aferido enqueue→read→dlq na_dlq=1; GRANT só service_role | (commit iter 10)
B3 | AUTO | CONFORME | invoice-batch-generate idempotente (23505 skip) + billing_next_business_day/billing_holidays; deno 12/12; banco: sáb 05-09→seg 05-11 | (commit iter 11)
B4 | MODO-B | PENDENTE | — | —
B5 | HITL (G-C6-PROD) | PENDENTE | — | —
C1 | AUTO-COM-TETO | PENDENTE | — | —
C2 | AUTO | CONFORME | notaas-webhook + notaas-webhook-verify (HMAC timing-safe) deno test 14/14; ledger notaas_webhook_deliveries (RLS ON, UNIQUE org+delivery); config.toml verify_jwt=false | (commit iter 10)
C3 | MODO-B | CONFORME | fiscal_imutabilidade.sql aplicada (trigger + invoice_cancelar); DELETE de nota emitida bloqueado; cancelar → status=cancelada + billing_events(cancelada)=1 | (commit iter 10)
D1 | AUTO | CONFORME | billing-cadence-enroll + billing_cadence_enrollments (invoice_id, RLS ON); msg cita fatura/valor/venc; deno verde | (commit iter 11)
D2 | AUTO | CONFORME | computeScheduledAtByDueDate (D-3/D0/D+7 por vencimento, TZ -03:00, sem new Date()); deno clock-fixo verde | (commit iter 11)
D3 | AUTO | CONFORME | billing-cadence-stop keyed por invoice_id (não lead); payer 2 faturas paga 1 → outra CONTINUA; deno verde | (commit iter 11)
D4 | HITL (G-META-TPL) | PENDENTE | — | —
D5 | AUTO | CONFORME | 4 tools + prompt-guard + registry aditivo; deno test 22/22 (2ª via→substituida; renegociar→agreement+parcelas; desconto>alçada→handoff; injeção→bloqueado); alçada 20% hardcoded (nota) | (commit iter 10)
E1 | AUTO | CONFORME | billing-baixa + billing-baixa-manual (RPC invoice_baixa_manual respeita C3) + billing-notify (fallback e-mail pgmq); banco: billing_events(paga,manual)=1; deno 11/11 | (commit iter 11)
E2 | AUTO | CONFORME | lgpd_payers.sql aplicada (trigger audit + payer_erasure + lgpd_legal_basis); erasure → nome=[removido], invoice intacta, audit_logs=2; BUG corrigido (entity_id uuid≠text, 42804) | (commit iter 10)
E3 | HITL (G-INFRA) | PENDENTE | — | —
E4 | HITL (G-PILOTO) | PENDENTE | — | —
# status ∈ {PENDENTE, EM_ANDAMENTO, PROXY_PRONTO, CONFORME, FALHOU_1, FALHOU_2, FALHOU_3_PARADO, BLOQUEADO_GATE}

## gates
G-SEC-REV: aberto | G-C6-SANDBOX: aberto (creds+cert mTLS sandbox ausentes) | G-C6-PROD: aberto | G-NOTAAS-resid: aberto
G-QUOTA: aberto | G-A1: aberto | G-META-TPL: aberto | G-PILOTO: aberto | G-INFRA: aberto
gate_deploy_fase: {BOOTSTRAP: LIBERADO (msg Marcelo 06/07 ~06:34 BRT), A: migrations aditivas CONFIRMADAS por Marcelo (msg 06/07 tarde: "Ok para migration supabase, estava autorizado") — A4/A5/B2/C2/C3/E2 aplicadas no nbvaglqmcyoogolhzyzm; deploy de EDGE FUNCTIONS (A0 c6-mtls-poc + webhooks) segue MODO-B/não-testado; A0/B1 BLOQUEADOS por creds C6 sandbox (Marcelo providenciando 06/07), B: migrations liberadas, C: migrations liberadas, D: migrations liberadas, E: migrations liberadas — deploy de EF em cada fase ainda é gate}

## core_deltas                              # espelho do docs/CORE-DELTA.md
src/config/brand.ts | identidade Payments (ponto de cascade) | 22170d1
src/lib/publicUrl.ts | APEX_BASE → nexvypayments.com.br | 22170d1
src/config/modules.ts | módulo cobranca substitui card erp_salao (union mantém legado até A1-limpeza) | 22170d1
package.json + index.html + public/manifest.json | identidade npm/PWA | 22170d1
docker-compose.yml + Makefile (raiz) | serviço nexvy-payments + alvo deploy-payments (aditivos) | 22170d1
# NÃO-edições auditadas: src/main.tsx (host-aware Lux já genérico); usePlatformBranding.ts (check #c54b60 fica até re-skin Fase D)

## premissas_assumidas
1. "Entendido?" = disparo imediato da iteração 1.
2. Universo = 25 entregáveis da matriz §5.1 (inclui A7); erratas aplicadas (spec:132, plano §0/§3.11/§4).
3. Branch bootstrap criado do planning@6650382 (main sem os docs); rebase de main adiado ao merge (fila_humano #3).
4. Executor em git worktree isolado (outra sessão ativa no working tree principal — checkout cascade/beauty flagrado no reflog).
5. Registros A DNS-only espelhando Beauty; TLS via Traefik/Let's Encrypt.
6. Lovable fora da via padrão (main=verdade); Opus = braço operacional dos subagentes.
7. Base do fork = snapshot do Beauty em 6650382; trabalho posterior do cascade/beauty (vertical salão, sales-spark core) entra por diff seletivo se Marcelo pedir.
8. Região do Supabase novo = us-west-2 (criado assim por Marcelo; demais apps são sa-east-1 — latência BR maior; não reaberto).
9. Fase B: core Oficinas sobrepôs 116 functions colididas; 49 Beauty-only preservadas (listas no scratchpad + git 22170d1). Tabelas platform_crm_* NÃO estão no baseline → funções Beauty-only podem exigir migrations complementares ou remoção em limpeza futura.
10. config.toml: preservados os blocos de webhooks públicos sem JWT (desvio consciente do cascade-core.sh, que sobrescreveria) — insumo do A6.
11. Paleta estática index.css continua Beauty Rosé até re-skin de branding (Fase D/0.5.12); cor de marca Payments = navy Lux #213156 (trocável em brand.ts).
12. "Tentativa" (regra 9) = ciclo completo de aferição do entregável; incidentes de sub-passo (abort por parser do cascade; ENOENT do rsync-exclude; bloco órfão tmp-eval-agents) foram registrados e corrigidos DENTRO da tentativa 1 do PASSO-0-APP.
13. supabase/.temp versionado segue precedente do Beauty (9 arquivos); pooler-url sem senha (verificado por padrão, sem imprimir).
14. deploy-all NÃO inclui deploy-payments até Marco 0 validado.
15. docker compose config não validável no Mac (docker ausente); bloco é cópia literal do GYM — validar no 1º deploy VPS.

## fila_humano  (16/25 CONFORME — os 9 restantes são TODOS gate-dependentes; Marcelo destrava)
1. [A0/B1/B4/B5 — G-C6-SANDBOX + G-C6-PROD] credenciais C6: C6_CLIENT_ID, C6_CLIENT_SECRET, C6_BASE_URL (https://baas-api-sandbox.c6bank.info) + CERTIFICADO mTLS (cert+key/.pfx). Marcelo PROVIDENCIANDO (06/07). Entrega: `supabase secrets set` (nunca repo/front). Destrava: A0 (PoC mTLS, gate arquitetural — precede todo o trilho C6), depois B1 (c6-billing), B4 (c6-webhook), B5 (fatura prod).
2. [DEPLOY DE EDGE FUNCTIONS — gate MODO-B] autorizar o 1º deploy das ~9 EFs novas no Supabase novo (notaas-webhook, billing-cadence-*, invoice-batch-generate, billing-baixa-manual + as de C6 quando existirem). Migrations já aplicadas; falta `supabase functions deploy`. Destrava: A6 (verify-jwt matrix — curl externo prova 401/200) + teste real das EFs. Critério: ok explícito do Marcelo p/ deploy.
3. [A3 — G-SEC-REV] revisar por escrito a auditoria RLS (`docs/security/rls-audit-2026-07.md`: 112/112 RLS ON, 20 permissivas classificadas, 1 flag help_article_feedback) + o hardening da Fase A. Certifica A1/A3/A7.
4. [C1 — G-NOTAAS-resid + G-A1] key NotaAS (Org Token/project key) + certificado A1 (.pfx+senha) do CNPJ do tenant → destrava emissão de NFS-e em homologação.
5. [D4 — G-META-TPL] aprovar/submeter templates utility Meta (fatura/lembrete/atraso/2ª via) → destrava régua em produção.
6. [E3 — G-INFRA] medição de custo real/fatura + invocations/mês (precisa produção rodando).
7. [E4 — G-PILOTO] 2º tenant (cowork) + compromisso pago do case #1 (parecer PMF).
8. [Governança de branch] merge feat/nexvypayments-bootstrap → main (worktree isolado) — gate humano.

## log_iteracoes
# n | ISO-ts | entregavel | resultado | evidencia_curta | custo_delta_usd
1 | 2026-07-06T09:36:36Z | PASSO-0-APP | BLOQUEADO_GATE (cond. d) | DNS zona sem A-records; Supabase sem projeto | 0.00
2 | 2026-07-06T10:17:54Z | PASSO-0-APP | CONFORME | Gates liberados por Marcelo; DNS criado via CF API (4×A DNS-only); rsync+rebrand+integração (22170d1); Fase A verificada no banco (161 tab/GRANTs/seeds/12 buckets/realtime/10 crons); Fase B 164 edges ACTIVE (2 rodadas; bloco órfão removido); build 16s verde; fix rsync-exclude-tasks | 0.00
3 | 2026-07-06T10:17:54Z | A0 | BLOQUEADO_GATE | P1 não liberado + creds/cert C6 sandbox ausentes (env local e VPS auditados por nome) | 0.00
4 | 2026-07-06T10:17:54Z | A1 | CONFORME | ls → not found; grep src = 0; build verde; matriz §5.1 atualizada | 0.00
5 | 2026-07-06T10:35:00Z | A2 | CONFORME | Opus construiu (149k tokens, 24 tools); revisor re-rodou deno test = 11/11; 2 arquivos aditivos + deno.lock (std/assert) | 0.00
6 | 2026-07-06T10:50:00Z | A3 | PROXY_PRONTO | Q1-Q3 no banco real via MCP: 112/112 RLS ON; 20 permissivas classificadas; doc .md+.html; aguarda G-SEC-REV | 0.00
7 | 2026-07-06T10:50:00Z | A7 | CONFORME | greps de isolamento 0/0; CORE-DELTA 7 entradas; migrations_cobranca/ criada (README disciplina) | 0.00
8 | 2026-07-06T17:25:00Z | A4 | CONFORME | migration cofre aplicada (db query); deno test 8/8; REVOKE anon/auth + RLS ON → SET ROLE anon SELECT=0, has_priv anon/auth=false, svc=true | 0.00
9 | 2026-07-06T17:35:00Z | A5 | CONFORME | billing_model.sql aplicada; 7 tab RLS ON; invoices 8 cols correção + substituida; 7/7 org; INSERT cross-org → 42501 RLS violation | 0.00
10 | 2026-07-06T18:10:00Z | B2/C2/C3/D5/E2 | CONFORME (lote, 5 subagentes Opus) | B2 na_dlq=1; C2 14/14+ledger; C3 DELETE-emitida bloqueado+cancelar; D5 22/22; E2 erasure+bug entity_id corrigido. Migrations aplicadas no banco; deno tests verdes | 0.00
11 | 2026-07-06T18:45:00Z | D1/D2/D3/B3/E1 | CONFORME (lote régua, 3 subagentes Opus) | suíte deno 81/81; D régua por-fatura (enroll+stop keyed invoice_id, correção adversarial); B3 dia-útil banco sáb→seg; E1 baixa manual billing_events(paga,manual)=1. 3 migrations aplicadas | 0.00
12 | 2026-07-06T19:00:00Z | A6 + DEPLOY | CONFORME | Marcelo autorizou deploy; 6 EFs de cobrança deployadas ACTIVE no nbvaglqmcyoogolhzyzm; A6 curl verify_jwt (público 404≠401, protegido 401); doc verify-jwt-matrix.md | 0.00
