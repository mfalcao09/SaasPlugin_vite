# Plano V1 — Cockpit + Home de Valor (NexvyBeauty)
**Data:** 2026-06-23 · **Status:** pré-execução (aguardando GO pra Fase 0+1) · **Branch:** main
**Consolida:** ROADMAP-CONSOLIDADO §V1 + VITRINE-QUE-VENDE §4/§8 + MAPEAMENTO-IA §2 + 4 decisões do dono (2026-06-23).

> **PREMISSA GLOBAL (inegociável):** NADA QUEBRADO + TUDO OPERANTE. E2E real (não build verde). grep-before-delete. Deploy provado anti-phantom (string nova no bundle servido).

---

## 0. Decisões do dono (cravadas nesta sessão)
1. **Radar:** cache-first + refresh (não live-on-mount). Lê último scan na hora; auto-refresh background se velho; botão "Atualizar agora"; garantir cron diário. Motivo: live = assíncrono + 1 LLM/conversa (~US$2 + min/abertura) → quebra o <30s.
2. **Cockpit:** shell único — **embute** os 7 itens (ela nunca vê a nav do Admin).
3. **Meus Clientes** → `/salao/clientes` (lista real de clientes do salão).
4. **Meu Faturamento** → `/salao/financeiro` (caixa do salão).

## Os 7 itens do Cockpit (label leigo → componente canônico → fonte)
| # | Item | Conteúdo embutido | Origem (reuso) |
|---|---|---|---|
| 1 | **Início / Meu Dia** | `HomeDeValor` (NOVO) | Radar: `useOpportunityScans`/`useScanItems` (cache) |
| 2 | **Conversas** | `InboxManager` | `components/admin/InboxManager.tsx` |
| 3 | **Meus Clientes** | `SalaoClientesBody` | `pages/salao/Clientes.tsx` (extrair corpo) |
| 4 | **Atrair Clientes** | hub de captação | `components/admin/capture/*` (1 landing) |
| 5 | **Minha IA** | `AgentsManager` | `components/admin/agents/AgentsManager.tsx` |
| 6 | **Minha Agenda** | `SalaoAgendaBody` | `pages/salao/Agenda.tsx` (extrair corpo) |
| 7 | **Meu Faturamento** | `SalaoFinanceiroBody` | `pages/salao/Financeiro.tsx` (extrair corpo) |
| + | **Gestão & Ajustes** (1 item) | link → `/admin` | Admin intacto |

Super-admin: fora do Cockpit (só `/super-admin`, gate carregado).

---

## Fase 0 — Contrato (serial, eu)
- [ ] Tipos compartilhados: `CockpitNavItem`, `OpportunityCardData` (nome, telefone, classificação, deal_value, followup_message), assinatura `useReactivation(item) -> {disparar, disparando, status}`.
- [ ] Schema da nav do Cockpit (7 + 1 Admin), com `visibility` por role.
- **Check:** tipos compilam isolados.

## Fase 1 — Build paralelo (3 subagentes, file-owned)
**WS1 — CockpitShell + nav + swap + gates** (dono: estrutura)
- [ ] `CockpitShell.tsx` = `UnifiedShell` com `nav` custom (7+1) + `<Outlet/>`.
- [ ] Rotas aninhadas sob CockpitShell: `/` (Início), `/conversas`, `/clientes`, `/atrair`, `/minha-ia`, `/agenda`, `/faturamento`. `/salao/*`, `/admin`, `/crm` **intactos**.
- [ ] Swap `App.tsx:204-206`: `/` (app.*, admin não-super) -> CockpitShell.
- [ ] **Carregar os 2 gates** que hoje vivem no ModuleHub: `useGuidedOnboarding`+`<GuidedOnboarding>` e `useSuperAdminFirstAccess`->`/super-admin`. (landmine no1)
- **Check:** 1o acesso ainda dispara onboarding; super-admin ainda é redirecionado.

**WS2 — HomeDeValor** (dono: tela do AHA)
- [ ] `HomeDeValor.tsx`: lê `useOpportunityScans()[0]` + `useScanItems(scanId)` (cache-first).
- [ ] Card "R$ X recuperável esta semana" (recomputa HOT/WARM do client) + 3 cards HOT/WARM/COLD.
- [ ] Top-3 cards com `followup_message` + botão `[Disparar reativação]` (usa WS3) + `[Disparar pra todos]`.
- [ ] Empty/stale: skeleton + "atualizar agora"; sem scan -> dispara 1 em background + selo "analisando".
- **Check:** valor exibido == soma `deal_value` dos itens (1 caso real conferido).

**WS3 — Reativação (envio real)** (dono: ação)
- [ ] `useReactivation`: `evolution-send` ({type:'text', to:`55`+phone, payload:{text:followup_message}, organization_id}) + marca `opportunity_scan_items.action_applied` + log (`webchat_messages` outbound) + toast.
- [ ] Dialog de confirmação antes do envio em massa (throttle sequencial verbatim).
- [ ] Trata instância não-`connected` (CTA "conectar WhatsApp").
- **Check:** disparo unitário -> mensagem chega em zap de teste real.

## Fase 2 — Gate serial (eu) — PARA AQUI PRA APROVAÇÃO ANTES DO DEPLOY
- [ ] Merge + revejo CADA diff (anti-Frankenstein, grep-before-delete).
- [ ] `npm run build` verde.
- [ ] `code-reviewer` adversarial no diff integrado.
- [ ] **[confirmar com dono]** Deploy anti-phantom: `ssh vps-hostinger` -> `cd /opt/stacks/saasplugin-vite` -> `git pull` -> `docker build --no-cache -f infra/Dockerfile.app --build-arg APP_DIR=NexvyBeauty -t nexvy-beauty:latest .` -> restart `nexvy-beauty` -> `curl 200` + grep string nova no bundle servido.
- [ ] E2E real: logo 1o acesso -> 7 itens (sem Admin misturado) -> dinheiro <30s -> disparo reativação-teste -> chega no zap.

---

## DoD (binário)
- [ ] 1o acesso vê 7 itens em linguagem de salão, Admin colapsado em 1, super-admin fora.
- [ ] Dinheiro na frente em <30s (cache-first).
- [ ] Reativação-teste chega num zap real.
- [ ] `npm run build` verde.
- [ ] Deploy provado (string nova no bundle servido + rota 200).

## NÃO fazer no V1 (não perder do plano)
V2 Conversas+Minha IA promovidos de verdade · V3 onboarding in-shell · V4 empty-states+seed · V5 demo. P6 DEFERIDO: amputar backend do funil de reunião + DROP 9 tabelas (3 landmines).
