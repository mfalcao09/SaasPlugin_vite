# STATE — CRM do Grupo Multiproduto (dossiê de handoff)

> **Mecanismo:** este é o **dossiê de handoff** (artefato *Lifecycle* do harness). Qualquer sessão nova/paralela lê ISTO + `feature-list.json` + `PLANO-MESTRE.md` e retoma sem eu explicar nada. Atualizar ao fim de cada onda.
> **Última atualização:** 2026-07-03.

## Onde estamos (cursor)
- **P0 (schema) ✅** e **P1/F1a (Hub 14 abas) ✅** — build VERDE, gate passou. F1a foi **recuperado de um agente-zumbi** (travou num Bash após gravar 25 arquivos; recriei os 2 imports órfãos `ChatTab`+`CatalogSync` como stubs lean com TODO). tsc baseline = 23.
- **Próximo:** disparar em paralelo **F1b** (kanban/leads por produto) + **F1c** (captação por produto) + **F1c-filtros** + **F1d** (agentes por produto = D6b). Deps do F1a satisfeitas (hooks compartilhados prontos: `usePlatformCrmProducts`, `PlatformCrmProductSelector`).

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
