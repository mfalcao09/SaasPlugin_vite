# STATE — CRM do Grupo Multiproduto (dossiê de handoff)

> **Mecanismo:** este é o **dossiê de handoff** (artefato *Lifecycle* do harness). Qualquer sessão nova/paralela lê ISTO + `feature-list.json` + `PLANO-MESTRE.md` e retoma sem eu explicar nada. Atualizar ao fim de cada onda.
> **Última atualização:** 2026-07-03.

## Onde estamos (cursor)
- **P0 (schema) ✅**, **P1 COMPLETO ✅** e **P2 deploy ✅** — F1a(hub 14 abas) + F1b(kanban/leads por produto) + F1c(captação por produto, edge carimba product_id) + F1d(agentes por produto = D6b). **Gate PASSOU**. **Deploy 2026-07-03** (container `b6957f40`, gestao 200) + **anti-phantom OK**: o dist SERVIDO dentro do container contém `platform_crm_products`(2 chunks)+`platform_crm_product_agents`(1)+`platform_crm_seller_booking`(1). Multiproduto está LIVE em produção.
- **Pendência sua (f2-liveness):** o eyeball Chrome não rodou — extensão travada (viewport 0x0; navigate/JS/read_page timeout), provável prompt no side-panel. **Ação Marcelo:** focar a aba `gestao.nexvybeauty.com.br/super-admin` / limpar o prompt da extensão → eu re-tento o eyeball. O código já está provado por anti-phantom + gate; falta só o print visual.
- **`f1c-filtros` ✅ (Agenda 1:1)** — filtro "Todos os produtos" na Agenda (state+hook `productId`+`PlatformCrmProductSelector`, gate PASSOU). **Tarefas/Notificações ADIADOS** (ver follow-ups) porque não têm mapeamento 1:1: Tarefas não é view global no port, Notificações escopa audiência via `scope_filters` JSON (não filtra a lista) e a tabela não tem `product_id`.
- **Próximo = P3 = GATE EXTERNO** (domínio `gestao.nexvy.tech` + host-split + re-skin institucional). Envolve **DNS irreversível** → paro e te mostro antes de cortar. Loop autônomo termina aqui até tua decisão.
- **Follow-ups anotados:** F1d deixou scaffold antigo de agentes órfão (dead-code → L12). Lead manual (`CreatePlatformCrmLeadDialog`) sem seletor de produto → NULL até 2º SaaS. Edges `platform-form-submit`/`funnel-submit` inexistentes (só webchat carimba product hoje). **[f1c-adiados]** (a) Tarefas: port só tem tarefa dentro do Lead (`usePlatformCrmLeadTasks`); a fonte tem `TaskCenter` global com filtro por produto — portar essa view global é feature à parte (candidato a LOTE). (b) Notificações: para filtrar/escopar por produto, decidir entre adicionar coluna `product_id` a `platform_crm_admin_notifications` OU replicar o `scope_filters` "product" da fonte (`CreateNotificationDialog` l.206-242) — decisão de schema, não trivial.

## Decisões travadas (Marcelo, 2026-07-02/03) — NÃO reabrir
- **D3 = MULTIPRODUTO** (1 CRM do grupo p/ ~10 SaaS; restaurar `product_id` da fonte Bizon, que JÁ é multiproduto). Ver [[project-crm-grupo-multiproduto-decisoes]].
- Hub **14 abas completas**; **agentes-por-produto JÁ** (F1d); `product_suites` ADIADO; cérebro-IA **já na migration**.
- **Domínio = `gestao.nexvy.tech`** (branded house). ERP fica por-SaaS no `gestao.nexvybeauty` (intocado). Módulo por host.
- **Negócios** = catálogo de produtos do grupo (revertido de Planos). PlansManager fica no ERP_NAV.
- D1(b) Meta · D2(b) builders · D4(b) financeiro · D5(b) Mia-ação · D6(b)=F1d · D7(b) webhooks · D8(b) booking-conv · D9(b) push · **D10(a) ai-insights + Utmify por ÚLTIMO**.
- **LOTE L1–L13** aprovado, product-aware, após P2.

## Chaves operacionais
- Supabase project: `fzhlbwhdejumkyqosuvq` (migração via MCP `apply_migration`; types regen `supabase gen types typescript --project-id fzhlbwhdejumkyqosuvq`).
- Fonte 1:1: `apps/NexvyBeauty/.vendus-src-reference/`. Contrato produto: `tasks/d3-multiproduto/CONTRATO-DIMENSAO-PRODUTO.md`.
- Deploy: `ssh vps-hostinger 'cd /opt/stacks/saasplugin-vite && git pull --ff-only origin main && bash infra/deploy-vps.sh NexvyBeauty nexvy-beauty app.nexvybeauty.com.br'`.
- **Gate:** `bash tasks/d3-multiproduto/verify.sh` (fronteira+tsc+build). Rodar antes de marcar qualquer `done`.

## Guardrails (o gate reforça)
- `crm/` NUNCA toca tabela de tenant (products/organizations/evolution do salão). Zero `organization_id` em código.
- Release só com bundle SERVIDO (curl) + Chrome logado. Build local ≠ prova.
- Fidelidade 1:1 Bizon; muda só tabela→`platform_crm_*`, tema claro/rosa, desacoplamento.

## Lições vivas desta frente
- **Agente-zumbi:** agente pode gravar tudo e travar num Bash final sem notificar. Sinal = `.output` sem escrita por >10min. Recuperação = working-tree (`find` os arquivos) + fechar imports órfãos + gate. Sempre rodar `verify.sh` no que um agente entregou.
- **NOT NULL sem DEFAULT** numa tabela com front vivo quebra INSERT em prod (pego pelo gate na 1ª rodada) → `SET DEFAULT <produto-Beauty>`.
