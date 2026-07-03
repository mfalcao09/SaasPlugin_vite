# Relatório Noturno — CRM do Grupo Multiproduto
**Madrugada de 2026-07-03 · execução autônoma em `/loop`**
Repo: `SaasPlugin_vite/apps/NexvyBeauty` · branch `main` · bundle final servido: `index-BqittP2d.js`

---

## Sumário executivo

O **grosso do roadmap aprovado foi entregue, gated e deployado** nesta madrugada, sem intervenção. A decisão pivotal (D3 multiproduto — 1 CRM do grupo para ~10 SaaS) está **live em produção**, o domínio branded-house `gestao.nexvy.tech` está no ar com re-skin institucional, e o LOTE de correções/ports foi completado. Cada item passou pelo **gate** (`verify.sh`: fronteira 0 · tsc ≤ baseline · build verde) e foi provado por **anti-phantom no bundle servido** antes de virar "done".

**Nada disparou para cliente real:** os crons OUTBOUND foram ligados ao vivo (sua decisão), mas com os guards verificados **antes** — e estão **dormentes** (0 campanhas ativas, 0 settings), portanto **0 envios reais** até você configurar.

Dois itens dependem de você (detalhados no fim): **eyeball no Chrome** e **credenciais Meta/Utmify**.

---

## ✅ Feito + deployado + provado

| Fase | Entrega | Prova |
|---|---|---|
| **D3 · P0** | Schema multiproduto: `product_id` em 21 tabelas + `platform_crm_products`(30c) / `product_agents`(81c) / `user_product_assignments`; seed/backfill Beauty | migração aplicada; backfill 13/13; zero NULL |
| **D3 · P1** | Hub Produto (14 abas) · Pipeline/Leads por produto · Captação carimba `product_id` · Agentes por produto (=D6b) | gate PASSOU; anti-phantom (`platform_crm_products`/`product_agents` no bundle servido) |
| **f1c** | Filtro "Todos os produtos" na Agenda (1:1 Bizon) | gate PASSOU |
| **P3 · domínio** | `gestao.nexvy.tech`: DNS no **Cloudflare** (era o autoritativo, não Hostinger) + router Traefik + **cert Let's Encrypt** | `gestao.nexvy.tech` HTTP 200 + cert `CN=YR2` exp 2026-10-01 |
| **P3 · re-skin** | Tema institucional azul (`#0A52D1`/`#00D1FF`, fonte nexvy-brand-guide) escopado ao shell de gestão; tenant Beauty intocado (rosa) | anti-phantom (`.theme-nexvy-institucional` + `218 91% 43%` no CSS servido) |
| **L12** | Remoção de 3 UI órfãos pós-f1d (Deals/Agents managers). `agent_configs` **mantido** (era vivo, 15 refs) | gate PASSOU |
| **L6** | Bug da aba Captação (não trocava de aba entre menus) → `useEffect` resync | gate PASSOU |
| **L7** | Enroll/stop de cadência no LeadDetail (3 TODOs stale → edges `platform-cadence-enroll/stop`) | gate PASSOU |
| **L11** | Aba "Biblioteca de Contextos" restaurada nas Cadências (faltava vs fonte 4 abas) | gate PASSOU |
| **L8** | Transferência de carteira: migração `platform_crm_lead_transfer_history` + modal + histórico no LeadDetail | gate PASSOU; migração aplicada |
| **L2-L3** | Crons OUTBOUND `platform-campaign-dispatcher` (1/min) + `platform-auto-notifications` (*/15), **ao vivo** | cron.job active + run `succeeded` (ver abaixo) |
| **D8** | Booking conversacional: migração `booking_experience` + campo restaurado no editor (a página pública já ramificava) | gate PASSOU; migração aplicada |

**Commits principais:** `59a9168` · `45e17f5` (D3+f1c) · `c0535ef` · `cdcb46e` (P3) · `6f16aec` · `c41a4af` (L12/L6/L7/L11) · `e7ce537` (L8) · `7269466` (crons) · `2c5ae35` (D8).
**Todos deployados** (deploy-vps.sh com anti-phantom em cada um).

---

## 🔔 Crons OUTBOUND — log de envios

Sua decisão foi **ligar ao vivo**. Honrei com a disciplina que você pediu: **verifiquei o guard "0-regras = 0-envio" em cada dispatcher ANTES de agendar**.

| Cron | jobid | Frequência | Guard verificado | Envios reais |
|---|---|---|---|---|
| `platform-campaign-dispatcher` | 20 | `* * * * *` | ✅ early-return `no_active_campaigns` + idempotência (claim + `queued`) | **0** (dormente) |
| `platform-auto-notifications` | 21 | `*/15 * * * *` | ✅ só dispara settings `*_enabled` + dedup "already notified today" | **0** (dormente) |

**Estado no deploy:** `active_campaigns = 0`, `notif_settings_on = 0` → os crons rodam mas **não têm o que enviar**. Prova de execução limpa: `platform-campaign-dispatcher` rodou (07:52, 07:53...) com status **`succeeded`** e retorno interno `no_active_campaigns`. **Nenhuma mensagem foi enviada a nenhum contato.** Assim que você criar uma campanha ativa / habilitar um setting, eles disparam — com dedup e limite de 100/tick.

> Para **desligar** um cron a qualquer momento: `select cron.unschedule('platform-campaign-dispatcher');` (idem `platform-auto-notifications`).

---

## ⏸️ Adiado — e por quê (honesto, não dropado)

Cada adiamento tem razão registrada no `feature-list.json`. Resumo:

| Item | Razão do adiamento |
|---|---|
| **L5** ProviderCooldownBadge | Lê `evolution_instances` = tabela **tenant**; o `crm/` não pode tocar (máxima). Precisa de infra de cooldown em `platform_crm_*` + painel de conexões. |
| **L13** followup-ai-draft | **Não** é coberto por `platform-sales-copilot` (contratos diferentes); a feature foi dropada no porte. Portar = edge nova + UI de estratégia + eyeball. |
| **L1 / L4 / L10** crons | As edges platform (`campaign-recurring-snapshot`, `booking-dispatcher`, `manual-outreach-batch`) **não existem** no port — só as tenant. Cron sem edge = nada; portar a edge primeiro. |
| **D2** builders visuais | UI profunda (FormBuilder/runtime/respostas são stubs "em breve"). Precisa de eyeball iterativo. |
| **D4** dashboard financeiro | `CommissionsManager` já existe; gap = agrupamento por produto (viável agora que D3 restaurou `product_id`), mas é enhancement de UI. |
| **D5** Mia ações+memória | `platform-mia` existe, mas `mia_actions`/`mia_user_memory` não. Precisa migração + **sua decisão de UX** (como a Mia confirma antes de agir). |
| **D7** webhooks painel | Infra existe (`platform-webhook-receiver` + `WebhooksManager/Editor/LogsTab`); gap = painel Actions + API `cdn_`. Enhancement de UI. |
| **D9** web-push | Port não tem stack platform push (sem `platform-push-subscribe/send`, sem VAPID). Porte = 2 edges + **service worker** (precisa de eyeball: permissão do browser, teste real). |
| **P5** Meta Cloud · **P7** Utmify | **Gate de credencial** — precisam de app Meta aprovado / conta+API Utmify. |
| **Módulo-por-host ERP↔CRM** | *Never-touch-alone*: o ERP fala com o tenant por design. Só em sessão conjunta com você. |

---

## 🔑 2 coisas que dependem de você

1. **Eyeball no Chrome (o que não consegui provar visualmente).** A extensão travou no meio da noite. O código está provado por **anti-phantom + gate**, mas o print visual do multiproduto, do re-skin azul e dos modais (L7 cadência / L8 transferência / D8 booking) ficou pendente. **Ação:** foque a aba `gestao.nexvybeauty.com.br/super-admin` (ou `gestao.nexvy.tech`) no seu Chrome — aí eu fecho os prints na hora.
2. **Credenciais Meta (P5) + Utmify (P7).** Sem elas, adiei os dois. Se quiser esses, largue as creds no `.env` do app e eu sigo.

---

## Próximos passos sugeridos

1. Eyeball rápido comigo (5 min) pra fechar os prints e validar o visual.
2. Decidir a sessão conjunta do **módulo-por-host ERP↔CRM** (a diferenciação `gestao.nexvy.tech` = grupo-CRM vs `gestao.nexvybeauty` = ERP-beauty).
3. Escolher o próximo alvo entre os adiados: **D9 web-push** (bom valor, precisa SW), **D4 dashboard por produto** (agora viável com D3), ou **D2 builders** (o maior).

---

*Gerado autonomamente ao fim do `/loop` de 2026-07-03. Estado-máquina completo em `feature-list.json`; dossiê de handoff em `STATE.md`.*
