# EXECUCAO-STATE-NEXVYPAYMENTS

## meta
spec: apps/NexvyPayments/docs/specs/nexvypayments-spec-auditavel.md
plano: apps/NexvyPayments/tasks/nexvypayments-plano-execucao-loop.md
repo: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite   # MONOREPO
worktree_executor: /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite.claude-worktrees/nexvypayments-bootstrap   # sessão paralela ocupa o working tree principal — executor NUNCA usa o working tree principal
branch_atual: feat/nexvypayments-bootstrap   # de feat/nexvypayments-planning@6650382; main NÃO contém os docs (premissa 3)
supabase_ref: nbvaglqmcyoogolhzyzm   # projeto "NexvyPayments", ACTIVE_HEALTHY, us-west-2 (criado por Marcelo 2026-07-06 09:22Z)
dominio: nexvypayments.com.br   # zona CF cd6629d4…; 4 registros A → 145.223.29.96 DNS-only (criados via API nesta sessão)
iniciado_em: 2026-07-06T09:29:24Z | ultima_atualizacao: 2026-07-06T10:35:00Z

## contadores
iteracao: 5 / 40
custo_acumulado_usd: 0.00 / 10.00
custo_por_categoria: {notaas_homolog: 0.00, meta_msgs: 0.00, llm_teste: 0.00}

## entregavel_atual
id: A3 | tentativa: 1/3 | status: EM_ANDAMENTO (auditoria RLS read-only via MCP + doc)

## entregaveis                              # PASSO-0-APP + 25 IDs (matriz §5.1 do spec — inclui A7)
# id | classe | status | evidencia (citável) | commit
PASSO-0-APP | BOOTSTRAP | CONFORME | npm run build exit 0; make -n deploy-payments → "NexvyPayments nexvy-payments nexvypayments.com.br"; app rastreado; banco: 161 tabelas+GRANTs+seeds+12 buckets+realtime 6+10 crons (verificação MCP); 164 edges ACTIVE; DNS 4 hosts→145.223.29.96 | 22170d1+ea09417
A0 | MODO-B (gate arquitetural) | BLOQUEADO_GATE | P1 (gate humano 1º deploy Fase A) + G-C6-SANDBOX: C6_CLIENT_ID/SECRET + cert/key mTLS sandbox NÃO encontrados (env local erp-educacional sem C6_*; VPS idem) | —
A1 | AUTO | CONFORME | ls admin-provision-users → No such file or directory; grep src/ = 0 hits; build verde. Cert. revisor → G-SEC-REV (P3) | ea09417
A2 | AUTO | CONFORME | require-caller-org.ts + __tests__/: deno test 11/11 (aferição re-rodada pelo revisor; autor=Opus); org real via profiles.organization_id (webchat-inbox:93); nota: === da service key → timing-safe no consumo | (commit desta iteração) |
A3 | AUTO + G-SEC-REV | PENDENTE | — | —
A4 | MODO-B | PENDENTE | — | —
A5 | MODO-B | PENDENTE | — | —
A6 | MODO-B | PENDENTE | — (insumo pronto: config.toml preservou 4 blocos verify-jwt-false de webhooks) | —
A7 | AUTO (INSP+CI) | PENDENTE | — | —
B1 | MODO-B (pré-gate G-C6-SANDBOX) | PENDENTE | — | —
B2 | MODO-B | PENDENTE | — | —
B3 | AUTO | PENDENTE | — | —
B4 | MODO-B | PENDENTE | — | —
B5 | HITL (G-C6-PROD) | PENDENTE | — | —
C1 | AUTO-COM-TETO | PENDENTE | — | —
C2 | AUTO | PENDENTE | — | —
C3 | MODO-B | PENDENTE | — | —
D1 | AUTO | PENDENTE | — | —
D2 | AUTO | PENDENTE | — | —
D3 | AUTO | PENDENTE | — | —
D4 | HITL (G-META-TPL) | PENDENTE | — | —
D5 | AUTO | PENDENTE | — | —
E1 | AUTO | PENDENTE | — | —
E2 | AUTO | PENDENTE | — | —
E3 | HITL (G-INFRA) | PENDENTE | — | —
E4 | HITL (G-PILOTO) | PENDENTE | — | —
# status ∈ {PENDENTE, EM_ANDAMENTO, PROXY_PRONTO, CONFORME, FALHOU_1, FALHOU_2, FALHOU_3_PARADO, BLOQUEADO_GATE}

## gates
G-SEC-REV: aberto | G-C6-SANDBOX: aberto (creds+cert mTLS sandbox ausentes) | G-C6-PROD: aberto | G-NOTAAS-resid: aberto
G-QUOTA: aberto | G-A1: aberto | G-META-TPL: aberto | G-PILOTO: aberto | G-INFRA: aberto
gate_deploy_fase: {BOOTSTRAP: LIBERADO (msg Marcelo 06/07 ~06:34 BRT: "Supabase já existe, domínio já existe. Você pode acessar pelas ferramentas... credenciais no env"), A: pendente (P1 — bloqueia deploy da EF c6-mtls-poc do A0), B: pendente, C: pendente, D: pendente, E: pendente}

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

## fila_humano
1. [A0 / P1+G-C6-SANDBOX] (a) Liberar o gate humano do 1º deploy da Fase A (EF descartável `c6-mtls-poc` no projeto nbvaglqmcyoogolhzyzm); (b) fornecer credenciais SANDBOX C6: C6_CLIENT_ID, C6_CLIENT_SECRET, C6_BASE_URL (https://baas-api-sandbox.c6bank.info) e CERTIFICADO mTLS (cert+key/.pfx do sandbox) — não encontrados no env local nem no VPS. Entrega server-side: `supabase secrets set` (nunca repo/front). Critério de liberação: secrets listados via CLI + ok explícito do deploy.
2. [Governança de branch] Decidir merge feat/nexvypayments-planning → main (e/ou feat/nexvypayments-bootstrap → main ao fim da fase) — gate humano. Critério: merge feito OU instrução explícita.
3. [Fase D/0.5.11-12 — quando chegar] Secrets de plataforma (AI_API_KEY, RESEND_API_KEY, SUPER_ADMIN_EMAIL) + Auth Site URL + branding platform_settings + 1º super admin — pós 1º deploy VPS.

## log_iteracoes
# n | ISO-ts | entregavel | resultado | evidencia_curta | custo_delta_usd
1 | 2026-07-06T09:36:36Z | PASSO-0-APP | BLOQUEADO_GATE (cond. d) | DNS zona sem A-records; Supabase sem projeto | 0.00
2 | 2026-07-06T10:17:54Z | PASSO-0-APP | CONFORME | Gates liberados por Marcelo; DNS criado via CF API (4×A DNS-only); rsync+rebrand+integração (22170d1); Fase A verificada no banco (161 tab/GRANTs/seeds/12 buckets/realtime/10 crons); Fase B 164 edges ACTIVE (2 rodadas; bloco órfão removido); build 16s verde; fix rsync-exclude-tasks | 0.00
3 | 2026-07-06T10:17:54Z | A0 | BLOQUEADO_GATE | P1 não liberado + creds/cert C6 sandbox ausentes (env local e VPS auditados por nome) | 0.00
4 | 2026-07-06T10:17:54Z | A1 | CONFORME | ls → not found; grep src = 0; build verde; matriz §5.1 atualizada | 0.00
5 | 2026-07-06T10:35:00Z | A2 | CONFORME | Opus construiu (149k tokens, 24 tools); revisor re-rodou deno test = 11/11; 2 arquivos aditivos + deno.lock (std/assert) | 0.00
