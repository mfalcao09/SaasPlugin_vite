# CHECKLIST DE ATIVAÇÃO — ADS NexvyBeauty · 2026-07-16

> **Objetivo:** separar, sem ambiguidade, **o que é código (pronto/em build nesta sessão)** do **que é OPS do Marcelo (fila HITL)**. Nenhum item de código destrava valor sozinho — o gargalo de valor é OPS/Meta.
> **Base:** `origin/main @ 573819c`. **Escopo:** fast-follow (não gate de go-live). **Controladora:** GO-LIVE session.
>
> **Atualização 2026-07-16 (pós-build):** os itens 🔨 foram construídos e cortados em **PRs draft stacked** (#86 docs · #87 A2-back · #88 front), verificados (deno 13/13 · Vite build verde), gated OFF — aguardando review/merge do Marcelo. O **#4 `demo_completed` foi ⏸️ PARKED** (ver linha na Camada B — achado: não é 1 linha). **Funil CAPI permanece 2/6** — estado honesto, não débito silencioso.

---

## Resposta desconfortável primeiro

O "ADS" tem muito código pronto e **quase nada no ar**. As duas alavancas de valor (atribuição inbound B, e otimização A) estão **travadas em setup Meta/OPS que só o Marcelo faz** — não em código. Esta sessão fecha as lacunas de código restantes (agente A2 + consoles de leitura), mas **elas ficam inertes/vazias até o OPS abaixo ser executado**.

---

## Legenda
✅ pronto (mergeado) · 🔨 construído nesta sessão (PR draft, gated OFF) · ⏸️ **parked** (adiado com motivo) · 🔒 **OPS do Marcelo (HITL)** · 🤝 coordenar com controladora

---

## Camada B — Atribuição inbound (CTWA + CAPI) · PRIORIDADE

| Item | Tipo | Estado |
|---|---|---|
| Captura CTWA no webhook (G1) | ✅ | mergeado, deployado, no-op p/ orgânico |
| Duda MODO INBOUND (G3) | ✅ | mergeado, prompt byte-idêntico p/ não-CTWA |
| CAPI dispatcher `platform-capi-send` (G4) | ✅ | mergeado, **gated OFF** (dry-run) |
| Console de Atribuição (aba B: `ads_attribution`+`ads_capi_events`) | 🔨 | build desta sessão — dá visibilidade ao funil |
| Wire produtor #4 `demo_completed` (esteira) | ⏸️ **PARKED** | **Achado (2026-07-16): NÃO é 1 linha.** `demo-*` é 100% tenant-org (`organizations`), desacoplado de `platform_crm_leads` — emitir `demo_completed` exige **bridge cross-subsistema** (casar telefone→lead + resolver `product_id`), decisão de design da esteira. **Motivo do park:** ganho = 1 evento num funil CAPI gated OFF; precisa da **sessão-dona da esteira** + funil ao ar. → **PR dedicado futuro.** NÃO tocar `demo-*` agora. |
| Produtores #5 `checkout_created` / #6 `sale_completed`/`pix_paid` | 🔒 | ponte cakto→journey (toca cakto = tenant-layer). **Só documentado, NÃO construído.** |
| **Número novo limpo (Salvy)** → registrar na WABA `1023556786945354` + Cloud API (PIN) → wizard `platform-meta-whatsapp-connect` | 🔒 | sem número, o CTWA não abre conversa; herda todo o funil |
| **Decidir a Página do Facebook** ligada ao número (gotcha CTWA: o clique abre o nº da Página do anúncio) | 🔒 | |
| **Ligar o CAPI:** secrets `CAPI_ENABLED=true` + `META_CAPI_TOKEN` + `META_CAPI_DATASET_ID` + `META_CAPI_WABA_ID` (token com `whatsapp_business_management` + `whatsapp_business_manage_events`) | 🔒 | enquanto OFF, `platform-capi-send` só grava dry_run |
| **Cron do `platform-capi-send`** (dispatcher periódico, via service-role/x-brain-secret) | 🔒 | só após ligar o CAPI |
| **Audiências** no Ads Manager: `CA_ExclusaoLeads` (1.919 tel.) + `CA_Semente_ICP` (1.497) + campanha CTWA (criativos C1/C2/C3) | 🔒 | |

**Funil CAPI hoje: 2/6.** Produtores existem só p/ `LeadSubmitted`(#2) e `QualifiedLead`(#3). **#4 `demo_completed` = ⏸️ parked** (bridge cross-subsistema — ver linha acima). #5/#6 dependem da ponte cakto (OPS/decisão). **2/6 é o estado honesto, não débito silencioso.**

---

## Camada A1 — Gestão: conexão + sync + console de campanhas

| Item | Tipo | Estado |
|---|---|---|
| OAuth Login-for-Business (`ads-oauth-start/callback`) + `ads-sync` | ✅ | mergeado, funcional |
| Card de conexão Meta Ads (super-admin) | ✅ | mergeado |
| Console de Campanhas (aba A1: hierarquia + métricas spend/ctr/cpa/roas) | 🔨 | build desta sessão — hoje os dados do `ads-sync` entram no banco e **nada exibe** |
| **App Review Meta** (`ads_read`/`ads_management`) | 🔒 | sem ele o `ads-sync` não lê dados reais em prod (leva semanas; paralelo, não bloqueia captar leads) |
| Secrets `META_ADS_APP_ID/SECRET/LOGIN_CONFIG_ID` + `STATE_SIGNING_SECRET` + `ADS_OAUTH_REDIRECT_URI`/`RETURN_URL` | 🔒 | necessários p/ o OAuth conectar de fato |
| Cron do `ads-sync` (hoje só botão "Sincronizar agora") | 🔒 | opcional; flip é HITL |

---

## Camada A2 — Gestão: agente que otimiza (era só schema)

| Item | Tipo | Estado |
|---|---|---|
| `ads_recommendations` + `ads_mutations_log` (schema) | ✅ | mergeado (estava órfão) |
| Regras puras `ads-optimize-rules.ts` + edge `ads-optimize` (gera recomendações pending) | 🔨 | build desta sessão |
| Edge `ads-apply-recommendation` (aplica rec aprovada → Graph → mutations_log) | 🔨 | build desta sessão, **gated `ADS_MUTATIONS_ENABLED=false` → dry-run** |
| Console de Recomendações (aba A2-UI: aprovar/rejeitar/aplicar) | 🔨 | build desta sessão |
| **Flip `ADS_MUTATIONS_ENABLED=true`** (deixa o agente MUTAR a conta Meta real) | 🔒 | **HITL duro** — só com conta real + App Review + tua palavra |
| Cron do `ads-optimize` (rodar o agente periodicamente) | 🔒 | flip é HITL |

---

## O que fica sob comando da controladora (não faço sozinho)
deploy prod · migration no live · merge dos PRs · **qualquer chamada real à Graph/Meta** · flip de qualquer flag (`CAPI_ENABLED`, `ADS_MUTATIONS_ENABLED`) · tocar `demo-*`.

## Ordem de ativação sugerida (quando o OPS acontecer)
1. Número Salvy + WABA + Página + wizard connect → **B começa a captar** (mesmo com CAPI OFF).
2. Secrets CAPI + cron → **funil de sinal fecha** (otimiza por compra).
3. App Review + secrets ADS → **A1 console enche de dados reais**.
4. Rodar `ads-optimize` (gera recomendações) → revisar no console → (muito depois) flip `ADS_MUTATIONS_ENABLED` p/ o agente aplicar sozinho.
