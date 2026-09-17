# PRD-10 / F1 — Classificador puro

## Objetivo

Implementar o juiz de texto determinístico (sem LLM, sem I/O) compartilhado por webhook e cold.

## Entregáveis

1. `supabase/functions/_shared/cold-outreach/reopen-intent.ts`
2. `reopen-intent.test.ts` cobrindo corpus-v1 + metamórficos
3. Export estável: `classifyReopenIntent(input) → { class, reason_code, classifier_version, farewell_window_active }`
4. Precedência: `opt_out_again` → `reopen_intent` → `farewell_ack` (48h) → `ambiguous`
5. `CLASSIFIER_VERSION` constante semver-doc (ex. `reopen-intent@1.0.0`)

## Loop engineering (autônomo)

### Protocolo do agente
1. Implementar módulo + testes a partir do corpus F0.
2. `deno test supabase/functions/_shared/cold-outreach/reopen-intent.test.ts`
3. Rodar relatório de corpus: 100% hard+farewell crítico; 0 falso reopen crítico.
4. Gravar `F1-result.json` com contagens.
5. Não ligar no webhook ainda.

### Check binário
PASS se:
1. `deno test` exit 0;
2. script de corpus: `hard_recall=1.0`, `farewell_critical_recall=1.0`, `false_reopen_critical=0`;
3. metamórfico: farewell+“quero ver”→reopen; farewell+“pare”→opt_out_again.

### Evidência
`F1-result.json`: `{ status, deno_exit, corpus_report, classifier_version }`

### Rollback
Não exportar do webhook; módulo pode permanecer não referenciado.

### Stop / escalate
Teste vermelho após 2 iterações → ESCALATE (não avançar F2).
