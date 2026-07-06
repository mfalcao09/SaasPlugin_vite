# RELATÓRIO DE CHECKPOINT — Loop NexvyPayments · Iterações 2–4 (2026-07-06)

> Sessão `a690757a` · branch `feat/nexvypayments-bootstrap` · commits `22170d1` → `ea09417` → `b12ceb1`
> Pareado com `relatorio-loop-iteracoes-2-4.html`. Antecessor: `relatorio-loop-iteracao-1.md`.

## Placar (25 entregáveis + PASSO-0-APP)

| Status | N | IDs |
|---|---|---|
| **CONFORME** | 2 | **PASSO-0-APP**, **A1** |
| EM_ANDAMENTO | 1 | A2 (subagente Opus — helper `require-caller-org` + TA) |
| BLOQUEADO_GATE | 1 | A0 (P1 + G-C6-SANDBOX) |
| PENDENTE | 22 | A3–A7, B1–B5, C1–C3, D1–D5, E1–E4 |

## Iteração 2 — PASSO-0-APP → CONFORME

Gates do P0 liberados por Marcelo (mensagem ~06:34 BRT). Execução:

1. **DNS**: 4 registros A criados **via API Cloudflare** (token de `~/.config/cloudflare/.env`): `@`,`app`,`gestao`,`www` → `145.223.29.96`, DNS-only. Verificado no NS autoritativo.
2. **Fork (0.1)**: rsync Beauty→Payments no worktree isolado. **Bug meu detectado e corrigido**: `--exclude=tasks` exclui por basename em qualquer nível — dropou `src/components/tasks|docs` e `src/docs`; recopiados.
3. **Rebrand (0.2)**: package.json, index.html, manifest.json, `brand.ts` (navy Lux `#213156`), `publicUrl.ts` APEX, `modules.ts` (módulo `cobranca`). 5 entradas no CORE-DELTA + 2 não-edições auditadas (main.tsx, usePlatformBranding).
4. **Cascade Fase A** (Supabase `nbvaglqmcyoogolhzyzm`): script abortou por **falso negativo** (parser de contagem poluído pelo banner do CLI); ground-truth via MCP: **161 tabelas**. Passos restantes executados manualmente com verificação no banco: GRANTs (164 objetos c/ SELECT anon), seeds (4 planos·7 help·1 release·3 form), storage (**12 buckets**), realtime (6 tabelas), **10 cron jobs**.
5. **Cascade Fase B**: rodada 1 morreu no bloco órfão `tmp-eval-agents` do config.toml (151 deployadas); removido o bloco → rodada 2 **exit 0, 164 edges ACTIVE, zero erros**. `config.toml` preservou os 4 blocos de webhooks públicos sem JWT (desvio consciente do script — insumo do A6). Snapshot pré-cascade `22170d1` preserva as 116 versões Beauty sobrepostas pelo core Oficinas (+49 Beauty-only intactas).
6. **Critérios binários**: `npm run build` **exit 0** (16s) · app rastreado no git · dry-run do `make deploy-payments` expande `NexvyPayments nexvy-payments nexvypayments.com.br`.

## Iteração 3 — A0 → BLOQUEADO_GATE

PoC mTLS exige EF `c6-mtls-poc` **deployada** + credenciais sandbox C6. Bloqueios: (a) **P1** — gate humano do 1º deploy da Fase A, não liberado; (b) **G-C6-SANDBOX** — `C6_CLIENT_ID/SECRET` e cert/key mTLS do sandbox **não encontrados** no env local (erp-educacional `.env.local` sem `C6_*`) nem no VPS. Ver fila_humano.

## Iteração 4 — A1 → CONFORME

`ls apps/NexvyPayments/supabase/functions/admin-provision-users` → *No such file or directory* · `grep -rn admin-provision-users src/` = **0 hits** · build verde. Matriz §5.1 atualizada. Certificação do revisor → G-SEC-REV (P3, fim da Fase A).

## fila_humano (ação exata + critério de liberação)

1. **[A0]** (a) Liberar o 1º deploy da Fase A (EF descartável `c6-mtls-poc` no projeto novo); (b) entregar credenciais **sandbox** C6 — `C6_CLIENT_ID`, `C6_CLIENT_SECRET`, cert+key mTLS (.pfx/.pem) — via `supabase secrets set` (server-side; nunca repo/front). **Libera:** secrets listados no CLI + ok explícito.
2. **[Branch]** Decidir merge `feat/nexvypayments-planning` → `main` (e o destino do `feat/nexvypayments-bootstrap` ao fim da fase). **Libera:** merge ou instrução.
3. **[Fase D — depois]** AI_API_KEY/RESEND/SUPER_ADMIN_EMAIL + Auth Site URL + branding + 1º super admin (pós 1º deploy VPS).

## Custo

US$ 0,00 (nenhuma chamada paga; sandbox C6 nem foi tocado ainda).

## Próxima ação

A2 fecha via subagente Opus (aferição `deno test` local). Com A0 bloqueado, seguem elegíveis A3 (auditoria RLS, read-only) e A7 (isolamento — INSP+CI). Para destravar o trilho bancário inteiro: **item 1 da fila_humano**.
