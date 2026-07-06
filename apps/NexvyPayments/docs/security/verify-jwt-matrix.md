# A6 — Matriz de verify_jwt (webhooks públicos × funções protegidas)

> 2026-07-06 · Supabase `nbvaglqmcyoogolhzyzm` · curl externo SEM header `Authorization`.
> Base: `https://nbvaglqmcyoogolhzyzm.supabase.co/functions/v1/<fn>`

## Princípio
- **Webhooks de terceiros** (não mandam JWT Supabase) → `verify_jwt=false` no `config.toml` + validação própria (HMAC NotaAS / GET de confirmação C6). Sem JWT NÃO deve dar 401 do gateway.
- **Funções de dinheiro** (chamadas pelo app autenticado) → `verify_jwt=true` (default). Sem JWT DEVE dar 401.

## Resultado (curl real, sem Authorization)

| Edge function | Classe | verify_jwt | HTTP sem JWT | Veredito |
|---|---|---|---|---|
| `notaas-webhook` | webhook público | false | **404** (resposta da função, não do gateway) | ✅ ≠ 401 (gateway passou) |
| `billing-baixa-manual` | dinheiro | true | **401** | ✅ bloqueado sem JWT |
| `invoice-batch-generate` | dinheiro | true | **401** | ✅ bloqueado sem JWT |

O `notaas-webhook` retornar **404** (e não 401) prova que o gateway JWT foi desativado (`verify_jwt=false`): a requisição chegou à função, que respondeu pela sua própria lógica de roteamento/validação. As funções de dinheiro dão 401 do gateway, como esperado.

## Ressalva (herança do padrão)
As EFs ainda não construídas — `c6-webhook` (2º webhook público, gate C6), `c6-billing`, `notaas-emit` (funções de dinheiro, gates C6/NotaAS) — **herdam o mesmo padrão** (bloco `[functions.<nome>] verify_jwt=false` só para webhooks). Serão adicionadas a esta matriz quando criadas. O mecanismo está provado.
