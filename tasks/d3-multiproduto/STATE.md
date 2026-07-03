# STATE — CRM do Grupo Multiproduto (dossiê de handoff)

> **Mecanismo:** este é o **dossiê de handoff** (artefato *Lifecycle* do harness). Qualquer sessão nova/paralela lê ISTO + `feature-list.json` + `PLANO-MESTRE.md` e retoma sem eu explicar nada. Atualizar ao fim de cada onda.
> **Última atualização:** 2026-07-03.

## Onde estamos (cursor)
- **P0 (schema) ✅**, **P1 COMPLETO ✅** e **P2 deploy ✅** — F1a(hub 14 abas) + F1b(kanban/leads por produto) + F1c(captação por produto, edge carimba product_id) + F1d(agentes por produto = D6b). **Gate PASSOU**. **Deploy 2026-07-03** (container `b6957f40`, gestao 200) + **anti-phantom OK**: o dist SERVIDO dentro do container contém `platform_crm_products`(2 chunks)+`platform_crm_product_agents`(1)+`platform_crm_seller_booking`(1). Multiproduto está LIVE em produção.
- **Pendência sua (f2-liveness):** o eyeball Chrome não rodou — extensão travada (viewport 0x0; navigate/JS/read_page timeout), provável prompt no side-panel. **Ação Marcelo:** focar a aba `gestao.nexvybeauty.com.br/super-admin` / limpar o prompt da extensão → eu re-tento o eyeball. O código já está provado por anti-phantom + gate; falta só o print visual.
- **`f1c-filtros` ✅ (Agenda 1:1)** — filtro "Todos os produtos" na Agenda (state+hook `productId`+`PlatformCrmProductSelector`, gate PASSOU). **Tarefas/Notificações ADIADOS** (ver follow-ups) porque não têm mapeamento 1:1: Tarefas não é view global no port, Notificações escopa audiência via `scope_filters` JSON (não filtra a lista) e a tabela não tem `product_id`.
- **P3 COMPLETO ✅** (2026-07-03, autônomo). **Domínio:** o DNS de `nexvy.tech` é **autoritativo no CLOUDFLARE** (NS remy/keira), NÃO Hostinger — corrigi criando `gestao.nexvy.tech` A→`145.223.29.96` proxied=false na zona CF `ea83eda1` (token em `~/.config/cloudflare/.env`). Router Traefik `nexvy-gestao-grupo.yml`→`nexvy-beauty-svc`. **Cert LE emitido** (restart do Traefik forçou o retry pós-NXDOMAIN): `gestao.nexvy.tech` HTTP 200 + cert `CN=YR2` exp 2026-10-01, servindo o SPA. **Zero mudança de código de rota** — `isGestaoHostname` já é prefixo-baseado (cobre nexvy.tech). **Re-skin:** tema institucional azul (`.theme-nexvy-institucional`, #0A52D1/#00D1FF, fonte nexvy-brand-guide) aplicado no `<html>` via script inline quando `gestao.*`; deploy `c2c606f0` + anti-phantom OK (script no HTML + `.theme-nexvy-institucional` + `218 91% 43%` no CSS servido). Tenant `app.*` intocado (rosa). **Pendência sua:** eyeball visual do azul (mesmo bloqueio Chrome do f2-liveness).
- **P4 EM PROGRESSO (LOTE).** ✅ **L12** (3 UI órfãos removidos; agent_configs mantido, era vivo) · ✅ **L6** (aba Captação resync) · ✅ **L7** (enroll/stop de cadência no LeadDetail — 3 TODOs stale → edges `platform-cadence-enroll/stop`) · ✅ **L11** (aba "Biblioteca de Contextos" restaurada nas Cadências). **Deploy `019e8ff`** (bundle `index-DMAHy-CD.js`), gates verdes. ⏸️ **L5 ADIADO** (ProviderCooldownBadge lê `evolution_instances`=tenant → fronteira).
- **Próximo LOTE:** **L13** (checar followup-ai-draft vs `platform-sales-copilot` — só portar se faltar; investigação leve) · **L8** (transfer: migration `platform_crm_lead_transfers` via MCP + modal + histórico) · **L1–L4/L10** (edges+crons OUTBOUND: crons AO VIVO + idempotência + guard 0-regras=0-envio + LOG de cada envio). Depois **P6** (D2/D4/D5/D7/D8/D9-b). P5 Meta + P7 Utmify adiados sem creds. **NÃO tocar** módulo-por-host ERP↔CRM. Relatório noturno .md+.html ao fim.
- **Follow-ups anotados:** F1d deixou scaffold antigo de agentes órfão (dead-code → L12). Lead manual (`CreatePlatformCrmLeadDialog`) sem seletor de produto → NULL até 2º SaaS. Edges `platform-form-submit`/`funnel-submit` inexistentes (só webchat carimba product hoje). **[f1c-adiados]** (a) Tarefas: port só tem tarefa dentro do Lead (`usePlatformCrmLeadTasks`); a fonte tem `TaskCenter` global com filtro por produto — portar essa view global é feature à parte (candidato a LOTE). (b) Notificações: para filtrar/escopar por produto, decidir entre adicionar coluna `product_id` a `platform_crm_admin_notifications` OU replicar o `scope_filters` "product" da fonte (`CreateNotificationDialog` l.206-242) — decisão de schema, não trivial.

## Decisões travadas (Marcelo, 2026-07-02/03) — NÃO reabrir
- **D3 = MULTIPRODUTO** (1 CRM do grupo p/ ~10 SaaS; restaurar `product_id` da fonte Bizon, que JÁ é multiproduto). Ver [[project-crm-grupo-multiproduto-decisoes]].
- Hub **14 abas completas**; **agentes-por-produto JÁ** (F1d); `product_suites` ADIADO; cérebro-IA **já na migration**.
- **Domínio = `gestao.nexvy.tech`** (branded house). ERP fica por-SaaS no `gestao.nexvybeauty` (intocado). Módulo por host.
- **Negócios** = catálogo de produtos do grupo (revertido de Planos). PlansManager fica no ERP_NAV.
- D1(b) Meta · D2(b) builders · D4(b) financeiro · D5(b) Mia-ação · D6(b)=F1d · D7(b) webhooks · D8(b) booking-conv · D9(b) push · **D10(a) ai-insights + Utmify por ÚLTIMO**.
- **LOTE L1–L13** aprovado, product-aware, após P2.

### Decisões noturnas (Marcelo, 2026-07-03, pré-sono — para o loop rodar autônomo)
1. **Deploy noturno = AUTÔNOMO.** Cada fase que passa gate+anti-phantom vai pra prod sozinha. Prod sempre = main verificado.
2. **Crons de disparo = LIGADOS AO VIVO** (sobrepôs dry-run). Honrar com: idempotência (§6, nunca duplica) + confirmar guard "0-regras=0-envio" intacto ANTES de ligar cada cron + **logar cada envio real** no relatório noturno. Live ≠ blast: dispatcher só envia o configurado.
3. **Re-skin = APLICAR** dos tokens do `nexvy-design-export/` (é o design system DELE, não chute). Aplico e ele revisa de manhã; reversível via git. Loop NÃO trava no re-skin.
4. **Escopo re-skin = SÓ shell de gestão/plataforma** (super-admin/CRM do grupo). App do tenant (`app.nexvybeauty`) + LP do Beauty MANTÊM a marca rosa/beauty (é a marca do produto, encara o salão/cliente final). Não tocar tema do tenant.
- **Gates de credencial adiados:** P5 Meta Cloud + P7 Utmify — sem creds no `.env`, adiar ambos e terminar o resto do roadmap.
- **Nunca-sozinho reafirmado:** separação módulo-por-host ERP↔CRM (adiar); tema do tenant beauty (não tocar).

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
