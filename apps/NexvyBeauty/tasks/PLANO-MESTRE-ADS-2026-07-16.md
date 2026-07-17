# PLANO-MESTRE — ADS NexvyBeauty · 2026-07-16

> Consolidação única das **3 camadas** do subsistema de ADS, seu estado real e o roadmap. Companheiro operacional: `CHECKLIST-ATIVACAO-ADS-2026-07-16.md` (code-pronto vs. OPS). Estratégia inbound: `ADS-INBOUND-INSTAGRAM-ESTRATEGIA-2026-07-15.md`. Build inbound: `ADS-INBOUND-BUILD-2026-07-16.md`.
> **Base:** `origin/main @ 573819c`. **Escopo desta sessão:** 1+2+3 build-only, gated, fast-follow. **Controladora:** GO-LIVE session.

---

## Mapa: "ADS" são 3 camadas (compartilham só o prefixo `ads_`/Meta)

| Camada | Função | Tabelas | Edges | Front |
|---|---|---|---|---|
| **A1 — Gestão: conexão+sync** | conectar conta Meta (OAuth Login-for-Business) → sincronizar campanhas/métricas | `ads_platform_connections`, `ads_accounts`, `ads_campaigns`, `ads_adsets`, `ads_ads`, `ads_metrics` | `ads-oauth-start/callback`, `ads-sync` | card de conexão ✅ · **console de campanhas 🔨** |
| **A2 — Gestão: otimização (agente)** | agente lê métricas → recomenda → HITL aprova → aplica na Graph | `ads_recommendations`, `ads_mutations_log` | **`ads-optimize` 🔨**, **`ads-apply-recommendation` 🔨** | **console de recomendações 🔨** |
| **B — Atribuição inbound (CTWA+CAPI)** | clique-p/-WhatsApp → atribui ao anúncio → Duda espelha → devolve conversões | `ads_attribution`, `ads_capi_events` | `platform-meta-whatsapp-webhook`(G1), `platform-sales-brain`(G3), `platform-capi-send`(G4) ✅ | **console de atribuição 🔨** |

*(Adjacente, fora de escopo: camada C prospecção/extração — funcional; `facebook-leads-webhook` legado tenant-layer.)*

---

## Estado real (verificado no código)

- **A1:** conexão + sync **funcionam**, mas os dados sincronizados **morriam no banco** (nenhuma tela lia). Sync só manual. Depende de App Review Meta p/ dados reais.
- **A2:** era **só schema órfão** — zero produtor/consumidor. Esta sessão constrói o motor + UI.
- **B:** pipeline G1+G3+G4 **construído/deployado/testado**, porém **gated OFF, sem número, sem UI**. Funil CAPI de 6 eventos só tinha produtor p/ 2 (`LeadSubmitted`, `QualifiedLead`).

---

## O que esta sessão entrega (1+2+3, build-only, gated)

1. **A2 backend** — `_shared/ads-optimize-rules.ts` (regras puras testáveis) + edge `ads-optimize` (gera recomendações) + edge `ads-apply-recommendation` (aplica aprovada → Graph → `ads_mutations_log`, **gated `ADS_MUTATIONS_ENABLED=false` → dry-run**).
2. **Front "Anúncios"** (super-admin, 3 abas): **Atribuição** (B, prioridade) · **Campanhas** (A1) · **Recomendações** (A2-UI). Empty states pré-dados. Padrões da casa (`as never`, sem regen de types).
3. **Wire #4 `demo_completed`** (funil 2/6 → 3/6) — coordenado com a controladora (toca `demo-*`). #5/#6 (cakto) só documentados.

**Fora de escopo (deliberado):** ponte cakto→journey (#5/#6), regen de `types.ts`, qualquer OPS/Meta (número, App Review, secrets, cron, audiências) — ver CHECKLIST.

---

## Roadmap (dependências reais)

```
[OPS Marcelo]                          [Código — esta sessão]
número Salvy+WABA+Página ──┐
                           ├─► B capta leads ──► console Atribuição enche
secrets CAPI + cron ───────┘                        │
                                                     ▼
App Review Meta + secrets ADS ─► ads-sync real ─► console Campanhas enche
                                                     │
                                                     ▼
                              ads-optimize gera recs ─► console Recomendações
                                                     │  (revisão HITL)
                              flip ADS_MUTATIONS_ENABLED (HITL duro) ─► agente aplica sozinho
```

**Ordem de valor:** B (receita, mais perto) > A1 (visibilidade de gasto) > A2 (automação, mais especulativa e dependente de dados reais).

---

## Gates HITL (100% sob a controladora + Marcelo)
deploy prod · migration no live · merge · **chamada real à Graph/Meta** · flip de flag (`CAPI_ENABLED`, `ADS_MUTATIONS_ENABLED`) · tocar `demo-*`.

## Entrega
PRs stacked (docs · A2-back · Front) padrão #78-81. Nada mergeado/deployado sem comando da controladora.
