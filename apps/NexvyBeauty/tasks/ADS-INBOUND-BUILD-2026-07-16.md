# ADS INBOUND — Build Concluído (Caminho B) · 2026-07-16

> **Sessão:** autônoma (oneshot+loop). **Base:** `origin/main @ c02d80c` (com #68 roteador por agent_type). **Worktree isolado.** **Blueprint:** `ADS-INBOUND-INSTAGRAM-ESTRATEGIA-2026-07-15.md`.

---

## Resposta desconfortável primeiro

**O código do Caminho B está 100% pronto, deployado e provado por smoke — mas ele não gera 1 lead sozinho.** O que falta é **100% ops seu** (nenhuma linha de código): provisionar o número novo, ligar a Página do anúncio, subir criativo e ligar os secrets do CAPI. O build fechou o *loop de sinal* que estava faltando (G1+G3+G4); a máquina agora otimiza por dona-que-compra em vez de curioso-que-manda-oi — assim que você plugar o número.

---

## O que foi construído (4 PRs stacked)

| PR | Fase | Gap | Conteúdo |
|---|---|---|---|
| [#78](https://github.com/mfalcao09/SaasPlugin_vite/pull/78) | 1 — Schema | — | commit do `ads_schema.sql` (8 tabelas, já no live) + `ads_attribution` + `ads_capi_events` + enum `demo_completed` |
| [#79](https://github.com/mfalcao09/SaasPlugin_vite/pull/79) | 2 — G1 | Captura CTWA | `_shared/ctwa-attribution.ts` (parse puro) + captura no `platform-meta-whatsapp-webhook` (lead + atribuição + jornada) |
| [#80](https://github.com/mfalcao09/SaasPlugin_vite/pull/80) | 3 — G3 | Duda inbound | MODO INBOUND no `platform-sales-brain` (espelha o anúncio, sem 2º SDR) |
| [#81](https://github.com/mfalcao09/SaasPlugin_vite/pull/81) | 4 — G4 | CAPI + funil | `_shared/capi-payload.ts` + edge `platform-capi-send` (desacoplado, gated OFF) + `ads_capi_pending()` |

**Fluxo E2E entregue:** `Anúncio CTWA → webhook (G1: grava ctwa_clid/ad_id) → Duda MODO INBOUND (G3: abre espelhando) → qualifica → jornada (funil 6 eventos) → platform-capi-send (G4: devolve conversões ao Meta)`.

---

## Aplicado no LIVE (`fzhlbwhdejumkyqosuvq`)

**Migrations (MCP `apply_migration`):**
- `ads_attribution` (18 cols, RLS super_admin) + `ads_capi_events` (21 cols, RLS) — verificadas.
- enum `demo_completed` adicionado.
- CHECK de `event_name` corrigido para os valores reais da CAPI.
- função `ads_capi_pending()` — join desacoplado journey↔atribuição.

**Edges deployados (`supabase functions deploy`):**
- `platform-meta-whatsapp-webhook` (G1) — **no-op para tráfego orgânico** (só ativa com `referral`).
- `platform-sales-brain` (G3) — **prompt byte-idêntico** para lead não-CTWA (`inboundActive=false`).
- `platform-capi-send` (G4) — **novo, GATED OFF** (dry_run sem `CAPI_ENABLED`).

---

## Prova (Definição de Pronto)

- ✅ `deno check --node-modules-dir=none`: **EXIT 0** (5 arquivos).
- ✅ `deno test`: **16/16** (5 CTWA parse + 5 CAPI payload + 6 roteamento #68 sem regressão).
- ✅ **Smoke E2E por dados semeados** (schema + funções + triggers reais, cleanup no fim → prod pristino):

| Check | Resultado |
|---|---|
| lead.source | `ctwa` |
| lead.utm_campaign | `120210000000012345` (ad_id) |
| lead.metadata.referral.ctwa_clid | `SMOKECLID_777` (o que a Duda lê) |
| ads_attribution | 1 linha |
| jornada meta_ctwa_received | 1 (evento #2) |
| jornada temperature_changed→warm | 1 (evento #3, trigger) |
| `ads_capi_pending()` | **2 eventos** com ctwa_clid resolvido → LeadSubmitted + QualifiedLead |

---

## Correções que o "verificar > confiar no doc" pegou

1. **Gate do #68:** a sessão começou com #68 ainda OPEN (não mergeado). Parei e coordenei; construí só depois do merge (`c02d80c`). Evitou montar a Duda sem o roteamento e reintroduzir a roleta.
2. **`source_ref` não existia:** o blueprint afirmava que `platform_crm_leads.source_ref jsonb` estava pronto — **é falso**. Atribuição rica foi para `metadata.referral` + `ads_attribution` (o brain já lê `metadata`, zero migration extra).
3. **event_name da CAPI:** o chute inicial (`Lead/Qualified/Schedule`) estava **errado** — a doc Meta manda `LeadSubmitted/QualifiedLead/ViewContent/InitiateCheckout/Purchase`, e `user_data` exige o `whatsapp_business_account_id`. Corrigido antes de qualquer envio.
4. **Esteira/Cakto fora da base:** os edges `demo-*` (PRs #70-74) não estão na main, e o `cakto-webhook` é tenant-layer. Por isso o CAPI é **desacoplado** (consome jornada) — os eventos #4/#5/#6 acendem quando seus produtores existirem, sem eu tocar cakto/esteira.

---

## ⏳ Pendências de OPS do Marcelo (nenhum código)

- [ ] **Número novo limpo** (Salvy) → registrar na WABA `1023556786945354` + Cloud API (PIN) → rodar wizard `platform-meta-whatsapp-connect` (nova conexão → herda todo o funil).
- [ ] **Decidir a Página do Facebook** ligada ao número (gotcha CTWA: o clique abre o número da Página do anúncio).
- [ ] **Ligar o CAPI:** setar secrets `CAPI_ENABLED=true` + `META_CAPI_TOKEN` + `META_CAPI_DATASET_ID` + `META_CAPI_WABA_ID` (token com `whatsapp_business_management` + `whatsapp_business_manage_events`).
- [ ] **Cron do `platform-capi-send`** (dispatcher periódico) — quando ligar o CAPI. Invocar via service-role/x-brain-secret.
- [ ] **Audiências** no Ads Manager: `CA_ExclusaoLeads` (1.919 tel.) + `CA_Semente_ICP` (1.497 puros) + campanha CTWA (criativos C1/C2/C3).
- [ ] **App Review Meta** (`ads_read`/`ads_management`) — Caminho C, paralelo (leva semanas; não bloqueia captar leads).

---

*Documento pareado: `.md` (fonte) + `.html` (visual dark self-contained). Build por sessão autônoma — Fact-Forcing Gate + verificação de estado real no banco vivo antes de cada escrita.*
