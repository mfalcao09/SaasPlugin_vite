# ROADMAP — Lançamento da Oferta v3 "Cliente de Volta — Piloto Fundadora"
> Cofundador (modo esteira, escopo=roadmap) + /plan · 2026-07-04
> Insumos: oferta v3 validada liveness + análise PMF v2 (`~/Downloads/PMF-Rachleff/`) + RESKIN-BEAUTY-LP-SPLIT.md (Sprint 2 absorvido) + todo.md (quotas ✅)
> **Worktree de execução: `SaasPlugin_vite` (main)** — PROVADO como fonte do deploy vivo (commit f2b2e7a cita o bundle servido `index-Cq6h2PX7.js`). trackB segue paralelo (coesão UX) e NÃO recebe trabalho deste roadmap.

## F0 — Decisões travadas (2026-07-04)

| # | Decisão | Status |
|---|---|---|
| 0.1 | Deploy da LP: **LIBERADO** (Marcelo) | ✅ travada |
| 0.2 | Preços na LP: **seguem do banco** (`platform_plans` via superadmin gestao.nexvy.tech — decisão Marcelo). Fix = **view pública `public_plans`** (name, slug, price_monthly, price_yearly, trial_days, features expostas, is_active) com SELECT anônimo; `useActivePlans` aponta pra view. Não abrir a tabela-mãe. | ✅ travada (mecanismo = view, recomendação do cofundador) |
| 0.3 | **Escassez — RATIFICADA (2026-07-04): estrutura 30/30/1.** Histórico: proposta original do Marcelo era "escassez elástica" (anunciar 15 vagas, aceitar todos em segredo) — **recusada pelo cofundador** (publicidade enganosa, CDC art. 37/67 + queima warm intros + contamina o teste de desespero + garantia insustentável em volume). Estrutura final acordada: **30 vagas de FUNDADORA em 30 dias, teto de 1 onboarding/dia (capacidade real de concierge), vaga do dia não acumula; garantia individual de 30d a partir do setup de cada piloto; após as 30 (ou dia 30), produto segue aberto SEM condições de fundadora — aceita todo mundo, escassez 100% verdadeira.** Bônus estrutural: piloto do dia 1 completa a garantia quando a campanha fecha → prova social madura na virada pro GTM público. | ✅ travada |
| 0.4 | Worktree: **main** (provado). | ✅ travada |

## F1 — Preço na LP + higiene ✅ COMPLETO (2026-07-04, loop tick-1..4)

| # | Item | Check binário | Prova |
|---|---|---|---|
| 1.1 ✅ | Migration: view `public_plans` + GRANT anon (`20260704_public_plans_view.sql`, aplicada via CLI --linked) | REST anônimo retorna 4 planos | curl anon → Trial 0 / Essencial 217 / Premium 347 / Ultra 687 |
| 1.2 ✅ | `usePublicPlans` (hook novo) lê a view; `SalesPage` migrada (tipos `PublicPlan`); demais 9 consumidores intocados | tsc exit 0; build verde | bundle `usePlatformPlans-9UBchMdh.js` contém `public_plans` |
| 1.3 ✅ | OG/twitter/meta description → "profissionais da beleza" | zero "oficinas" no dist | grep dist/index.html: 3× novo texto, 0× "oficinas" |
| 1.4 ✅ | Deploy VPS (`deploy-vps.sh` no VPS, --no-cache, anti-phantom) | DEPLOY-VERDE + smoke 3 origens 200 + preço visível | bundle servido `index-DfktvLsI.js`; LP live renderiza R$217/347/687 (Chrome, sem fallback); apex/app/gestao = 200 |

## F2 — Bloqueador da garantia + pré-piloto ✅ COMPLETO (2026-07-04, ticks 5-9)

| # | Item | Prova |
|---|---|---|
| 2.1 ✅ | Painel "R$ recuperado": tabela `reactivation_log` (org DEFAULT server-side, RLS org) + view `recovered_agendamentos` (security_invoker=on; atribuição por cliente_id OU telefone, janela 30d, status concluído) + `sendReactivation` alimenta o log + **card "Recuperado (30 dias)" na home** ao lado de "Perda de agenda" | migrations aplicadas em prod (smoke: view responde); card LIVE verificado no Chrome. Nota: disparos do ai-growth não eram registrados em lugar NENHUM — a trilha nasceu aqui |
| 2.2 ✅ | Runbook org piloto zerada | `tasks/RUNBOOK-ORG-PILOTO.md` (passos <10min + SQL de verificação + regras) |
| 2.3 ✅ | "Meu link" (copiar + QR) na `/agenda` | componente `MeuLinkBooking` LIVE — dialog abre com `nexvybeauty.com.br/s/<slug>` real + QR (verificado no Chrome) |
| 2.4 ✅ | `/radar` técnico fora da vista da dona | movido para Config. avançada (`visibility: admin`, label "Radar de conversas (avançado)"); topo da nav sem o item (verificado live) |
| 2.5 ✅ | Rótulo de presença | offline → "Fora do expediente / Não recebe conversas novas" (zinc, sem alarme); sr-only "Atendimento:"; "Status: Offline" morto no live |
| 2.6 ✅ | `sub_vertical` em organizations | coluna criada em prod (migration `20260704_pilot_funnel.sql`); preenchimento via runbook (SQL 1-linha); select de UI = melhoria futura não-bloqueante |
| 2.7 ✅ | Funil de ativação | view `pilot_activation_funnel` (org × sub_vertical × semana: conectado/disparos/retornos/valor) aplicada e respondendo. **Nota honesta:** evento 3 = RETORNO real (recovered) em vez de "resposta" (webchat sem org direto) — mais forte que o pedido |

## F3 — Funil comercial ✅ COMPLETO (2026-07-04, ticks 10-12)

| # | Item | Prova |
|---|---|---|
| 3.1 ✅ | Seção "Piloto Fundadora" na LP (`#piloto`): promessa multi-vertical, 4 bullets do stack, garantia 100% com painel como juiz, escassez REAL (15 vagas, 5/semana), CTA → LeadCaptureModal | LIVE verificado: piloto ✓ garantia ✓ vagas ✓ CTA ✓ |
| 3.2 ✅ | CTAs planos → Cakto | `checkout_url` mensal+anual populados nos 3 planos públicos (query em prod); `goToCheckout` da LP navega direto; view pública agora entrega as URLs ao anônimo |
| 3.3 ✅ | Kit comercial | `tasks/KIT-COMERCIAL-PILOTO.md` (pitch 30s/2min, demo 6 passos, playbook, ordem lash→nails) |

**⚠️ Registro de verdade (preço):** durante a execução o plano Pro mudou de R$347 → **R$387** na fonte (banco). A LP está certa por design (fonte única = `public_plans`); kit comercial atualizado para 387; docs históricos da oferta v2/v3 em Downloads mantêm 347 como snapshot da época.

## F4 — Pilotos (HUMANO — Marcelo vende; loop só monitora; semana 1 → 12)

| # | Item | Check binário |
|---|---|---|
| 4.1 | Warm intros coorte 1 (5 vagas): começar **lash** e **nails** | 5 conversas de venda com P1-P6 anotadas verbatim |
| 4.2 | ≥3 pagamentos reais na coorte 1 | comprovantes; se <3, iterar no who (não em features) |
| 4.3 | Coortes 2-3 (semanas 2-3) até 15 pilotos | 15 orgs etiquetadas por sub_vertical |
| 4.4 | Medição semanal: funil de ativação + R$ recuperado ÷ mensalidade por sub-vertical | dashboard preenchido toda sexta |
| 4.5 | Semana 12 — veredito da métrica-mãe: ≥60% disparando 1×/semana E razão ≥1,0 | sub-vertical campeã declarada → HXC → GTM público focado |

## Riscos
1. **View pública expor demais** → só colunas de vitrine; nunca checkout_url interno/ids sensíveis.
2. **Deploy apex derrubar app.*** → deploy com `--no-cache` + smoke nas 3 origens (apex, app, gestao) antes de encerrar.
3. **Painel R$ sem dados retroativos** → aceitar começar do zero (pilotos novos geram o dado); não inventar histórico.
4. **Cakto dessincronizado** → conferir `checkout_url` por plano no superadmin antes do 3.2.
5. **Escassez elástica (se Marcelo insistir)** → registrar como "Desafio do cofundador": viola a lista de rejeição do framework; alternativa honesta proposta em 0.3.

## Execução
- **Loop:** F1 → F2 → F3 nesta ordem, item a item, cada check provado antes do próximo; deploy autorizado (decisão 0.1); commits no main com mensagens `feat(beauty/lancamento-v3): ...`.
- **Fora do loop:** F4 (vendas humanas) e ratificação 0.3.
- **STATE:** este arquivo é o estado vivo — loop marca checks ✅ com data/prova a cada item concluído.
