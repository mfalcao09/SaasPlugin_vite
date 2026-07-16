# ESTADO — Enriquecimento de leads (pool Apify) · 2026-07-13 noite

> Doc de handoff pra retomar SEM perder nada caso a sessão reinicie (troca de MCP/conta premium).
> Escrito pela sessão controladora `d981edd3`.

## O pool de enriquecimento (handles SEM dados, precisam de telefone via Apify)

**Arquivo:** `<scratchpad>/pool-bruto-enriquecimento.json` — **3045 handles** únicos (sem @, lowercase).
Origem consolidada:
- **2 JSONs do Gemini** (o Marcelo mandou DOIS — não confundir):
  - `~/Downloads/gemini-code-1783922432570.json` (mais cedo, 1375 handles únicos)
  - `~/Downloads/gemini-code-1783982138837.json` (de agora, 1430 handles únicos)
  - union = 2735 (salvo em `gemini-union-handles.json`)
- **Prospectagram sem telefone**: 311 handles (`prospectagram-sem-telefone.json`) — os que o DOM não trouxe telefone.

⚠️ A tentativa anterior de enriquecer (subagente adc34339) BATEU O LIMITE MENSAL da conta MCP antiga → **0 perfis, 0 inseridos, nada perdido**. Os handles-fonte estão todos salvos.

## O que JÁ está no banco (NÃO re-enriquecer)

- Extração `video-gemini-10min` (id `70e89922-96ce-4d54-ad26-f68fa8cc0494`): 651 leads (JSON de mais cedo, enriquecidos quando o MCP funcionava).
- Prospectagram COM telefone (759): inseridos pelo subagente a708bff5 nesta sessão (conferir a extração criada; `keywords=['prospectagram']`).
- product_id: `806b5975-e268-402e-a65c-9e9503271041`. Coluna do handle: `handle` (com @). Telefone: `telefone`.

## TAREFA de retomada (quando o Apify premium estiver ativo)

1. **Dedup** o pool (3045) vs a base: `SELECT lower(replace(handle,'@','')) FROM platform_crm_extracted_leads WHERE product_id='806b5975-...'` → remover os já presentes. Salvar `pool-enriquecimento-final.json`.
2. **Enriquecer** via Apify (conta premium): `apify/instagram-profile-scraper` (id `dSCLg0C3YEZ83HzYX`), input `{usernames:[...]}`, em lotes de ~250. Via MCP `call-actor` (se o MCP pegou a premium) OU via edge `leads-import-handles` (usa APIFY_TOKEN do sistema).
3. **Inserir SÓ os que voltarem COM telefone** (ordem do Marcelo). Classificar via `_shared/lead-geo.ts::classifyLeadSegment`. Formato = espelhar a extração 651. Criar nova extração (`keywords=['video-gemini']` ou `['prospectagram-enriquecido']`).

## Estado das outras frentes (nesta sessão)

- ✅ **Onboarding Fase A NO AR** — PR #60 merjado + deploy-verde (bundle `index-COjBdePS.js`). Migration+RPCs, edge apply-onboarding, wizard/hook portados, rotas `/bem-vindo` + `/implantacao/:token` + `/admin/implantacao`, tela pós-checkout c/ LGPD. Próximo = adaptar 7 steps ao salão + QR Evolution + rastreio de fase (task #5, discutir com Marcelo).
- ✅ **Goldens** — gate 97,67% (11/12; 1 fail = refinamento fast-follow do cenário 50-clientes).
- 🔄 **Salvy** — sessão paralela do Marcelo habilitando o número (11)95213-9912 na Meta WABA (task_bd13dbb8).
