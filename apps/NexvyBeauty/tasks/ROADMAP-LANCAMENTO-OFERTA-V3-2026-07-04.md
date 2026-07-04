# ROADMAP — Lançamento da Oferta v3 "Cliente de Volta — Piloto Fundadora"
> Cofundador (modo esteira, escopo=roadmap) + /plan · 2026-07-04
> Insumos: oferta v3 validada liveness + análise PMF v2 (`~/Downloads/PMF-Rachleff/`) + RESKIN-BEAUTY-LP-SPLIT.md (Sprint 2 absorvido) + todo.md (quotas ✅)
> **Worktree de execução: `SaasPlugin_vite` (main)** — PROVADO como fonte do deploy vivo (commit f2b2e7a cita o bundle servido `index-Cq6h2PX7.js`). trackB segue paralelo (coesão UX) e NÃO recebe trabalho deste roadmap.

## F0 — Decisões travadas (2026-07-04)

| # | Decisão | Status |
|---|---|---|
| 0.1 | Deploy da LP: **LIBERADO** (Marcelo) | ✅ travada |
| 0.2 | Preços na LP: **seguem do banco** (`platform_plans` via superadmin gestao.nexvy.tech — decisão Marcelo). Fix = **view pública `public_plans`** (name, slug, price_monthly, price_yearly, trial_days, features expostas, is_active) com SELECT anônimo; `useActivePlans` aponta pra view. Não abrir a tabela-mãe. | ✅ travada (mecanismo = view, recomendação do cofundador) |
| 0.3 | Lançamento: coortes de piloto ANTES de checkout aberto. **Escassez: CONTRA-PROPOSTA do cofundador à "escassez elástica"** (15 vagas anunciadas aceitando todos): usar **15 vagas REAIS divididas em 3 coortes semanais de 5** (5 = capacidade real de concierge/semana). Mede a MESMA reação ("vou ver se ainda tem vaga desta semana") sem escassez falsa — que está na lista de rejeição do próprio framework Hormozi e queima confiança em rede de warm intros. | ⏳ ratificar com Marcelo |
| 0.4 | Worktree: **main** (provado). | ✅ travada |

## F1 — Preço na LP + higiene ✅ COMPLETO (2026-07-04, loop tick-1..4)

| # | Item | Check binário | Prova |
|---|---|---|---|
| 1.1 ✅ | Migration: view `public_plans` + GRANT anon (`20260704_public_plans_view.sql`, aplicada via CLI --linked) | REST anônimo retorna 4 planos | curl anon → Trial 0 / Essencial 217 / Premium 347 / Ultra 687 |
| 1.2 ✅ | `usePublicPlans` (hook novo) lê a view; `SalesPage` migrada (tipos `PublicPlan`); demais 9 consumidores intocados | tsc exit 0; build verde | bundle `usePlatformPlans-9UBchMdh.js` contém `public_plans` |
| 1.3 ✅ | OG/twitter/meta description → "profissionais da beleza" | zero "oficinas" no dist | grep dist/index.html: 3× novo texto, 0× "oficinas" |
| 1.4 ✅ | Deploy VPS (`deploy-vps.sh` no VPS, --no-cache, anti-phantom) | DEPLOY-VERDE + smoke 3 origens 200 + preço visível | bundle servido `index-DfktvLsI.js`; LP live renderiza R$217/347/687 (Chrome, sem fallback); apex/app/gestao = 200 |

## F2 — Bloqueador da garantia + pré-piloto (loop D+1 → D+5)

| # | Item | Check binário |
|---|---|---|
| 2.1 | **Painel "R$ recuperado"** — view/RPC: `opportunity_scan_items.action_applied` → resposta inbound → reagendamento/venda; card na home ao lado de "Perda de agenda" | número por organização visível na home; **é o juiz da garantia — sem ele não se vende** |
| 2.2 | Runbook + script "org piloto zerada" (sem seed/conversas de teste) | org nova limpa em <10 min |
| 2.3 | Expor "meu link de booking" (copiar + QR) em `/agenda` | dona copia o link sem ajuda |
| 2.4 | Ocultar `/radar` técnico do perfil dona (mover para Config. avançada) | nav da dona sem jargão de CRM |
| 2.5 | "Status: Offline" → rótulo claro (ex.: "Atendimento: fora do horário") | label novo no ar |
| 2.6 | Campo `sub_vertical` em `organizations` + select no cadastro/superadmin | coluna preenchível; 5 pilotos etiquetados |
| 2.7 | Instrumentação de ativação: view 3 eventos (conectou → disparou → resposta) × sub_vertical × semana | query retorna funil por org |

## F3 — Funil comercial (loop D+5 → D+7)

| # | Item | Check binário |
|---|---|---|
| 3.1 | Seção **"Piloto Fundadora"** na LP: oferta v3 (stack com valores, garantia god-mode, coortes reais) + CTA → WhatsApp do fundador | seção live com preço e garantia visíveis |
| 3.2 | CTAs dos planos → checkout Cakto por plano (`cakto-sync-offer`; Sprint 2 do RESKIN) | clique → `pay.cakto.com.br/<slug>` correto por plano |
| 3.3 | Kit comercial: pitch 30s/2min + roteiro de demo (tenant seed) + playbook — extraídos da oferta v3 para doc utilizável no celular | 3 docs prontos e revisados |

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
