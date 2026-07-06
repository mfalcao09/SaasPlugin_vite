# Relatório — Deep-dive monorepo ecossistema (C6 / billing / NFS-e) — 2026-07-06

> Produzido por agente Explore (very thorough) sobre /Users/marcelosilva/Projects/GitHub/ecossistema-monorepo.
> Consumidor: esteira de produto gestao-cobrancas (Etapas 1-3).

## A) Capacidades REAIS do C6 adapter (apps/erp-educacional)

| Operação | Status | Referência | Produção? |
|---|---|---|---|
| Bolepix v2 (boleto+PIX híbrido) | ✅ Testado | c6.py:282–363 | Smoke 19/19 ✓ (sandbox) |
| Emissão POST /v2/bank_slips/ | ✅ Completo | c6.py:288–323 | 1 retry 422 idempotente |
| Cancelamento PUT /v2/bank_slips/{id}/cancel | ✅ | c6.py:408–419 | Idempotente (204/404) |
| Consulta GET /v2/bank_slips/{id} | ✅ | c6.py:392–402 | Status + PDF base64 |
| Boleto /v1 (subsidiário) | ✅ | c6.py:516–674 | Fallback Bolepix |
| Alteração PUT + CIP backoff | ✅ | c6.py:587–674 | Retry em 400 "CIP" |
| PIX avulso cob/cobv | ✅ | c6.py:758–833 | Spec Bacen oficial |
| POST /v2/pix/cob (imediata) | ✅ | c6.py:779–782 | txid gerado C6 |
| PUT /v2/pix/cobv/{txid} (com vencimento) | ✅ | c6.py:784–791 | txid nosso (30 chars) |
| Webhook BANK_SLIP/BANK_SLIP_PIX | ✅ parser | c6.py:917–1069 | payload STRING JSON duplo-escape |
| Auth OAuth2 mTLS | ✅ | c6.py:168–205 | token TTL 5min, refresh margin 60s |

- NENHUMA operação chamada em produção ainda (ERP em sandbox). Smoke 19/19 offline com payloads provados.
- Front TS relacionado: apps/erp-educacional/src/lib/financeiro/c6-adapter.ts, boleto-html.ts, WizardCadastroContaBancaria.tsx, rota testar-conexao. Spec: docs/c6bank-api-spec.md.
- GAP CRÍTICO: webhook C6 sem assinatura documentada → validação híbrida (HMAC se vier + GET de confirmação).

## B) packages/billing — veredito
Motor de cobrança **Inter** (Node/TS), legado, **0 importações ativas** no monorepo. NÃO reutilizável direto; útil como referência de idempotency pattern (cache com expiração). Arquivo: packages/billing/src/inter-client.ts.

## C) NFS-e — veredito DEFINITIVO
**NÃO EXISTE** emissor fiscal no monorepo (grep nfse|nfs-e|nota.fiscal|focus|plugnotas|enotas|tecnospeed|prefeitura|abrasf|rps|dps → zero em src; só menção a PyNFe como opção futura em .md de research). Diploma digital XML ≠ NFS-e. Obs: mensalidades FIC (ERP-Educacional) TAMBÉM precisarão de NFS-e (Cassilândia-MS) — integração fiscal construída para o produto de cobranças pode ser reutilizada lá.

## D) Modelo financeiro ERP reaproveitável (Supabase ifdnjieklngcfodmtied, schema financeiro.*)
| Tabela | Colunas-chave | Conceito |
|---|---|---|
| financeiro.bancos | codigo_febraban, regex_agencia, algo_dv_conta | catálogo top-50 FEBRABAN (seed pronto: 20260504_g1_1b_seed_bancos_top50.sql) |
| financeiro.contas_bancarias | provedor, credenciais_env_prefix, regua_modo, multa_pct, juros_pct | config por conta, multibank (20260630_credenciais_bancarias_ui.sql) |
| cobrancas | aluno_id, valor, mes_ref, vencimento, status, txid_pix | ciclo de vida mensal (gerado→enviado→pago/vencido) |
| financeiro_pendencias | cpf_hash, origem, valor_aberto, status | inadimplência consolidada (20260701_010000_financeiro_pendencias.sql) |

## E) Env vars C6 (sandbox; prod = mesmos nomes)
C6_CLIENT_ID, C6_CLIENT_SECRET, C6_BASE_URL (https://baas-api-sandbox.c6bank.info), C6_BILLING_SCHEME=21, C6_PIX_KEY (EVP cadastrada), C6_CERT_PATH, C6_KEY_PATH (mTLS).

## F) Portabilidade → Deno (Supabase Edge Functions)
- Lógica de montagem de payload (c6.py:217–515) é PURA → copiar direto (~60% reuse).
- HTTP: trocar requests por fetch nativo Deno; mTLS suportado; token cache Map/Deno.kv.
- Webhook parser (917–1069) puro → 100% reuso.
- Esforço estimado: 2–3h para o núcleo. Bloqueadores: 0. Recomendação: supabase/functions/c6-billing/ TypeScript puro.
