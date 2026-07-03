# Re-skin NexvyBeauty (importando beauty-flow) + split de gestão

> Objetivo: **salão vendável, rápido.** Importar o máximo de UI/UX do projeto
> `beauty-flow-ai-73` e isolar a gestão da plataforma em subdomínio.
> Branch: `main` (worktree `SaasPlugin_vite`). Dev: `npm run dev` (porta 8080).

## Critério de sucesso (declarativo)
- Visitante anônimo no apex (`nexvybeauty.com.br`) → vê **LP premium**.
- Tenant logado (`app.*`) → usa o salão com **cara premium** (shell + gráficos).
- CRM/super-admin **fora da vista** do salão → `gestao.nexvybeauty.com.br`.

## Sprint 1 — Casca premium
- [x] **LP**: portar LP do beauty-flow → `SalesPage.tsx` (apex `/` + `/vendas`).
      CTAs → `LeadCaptureModal`; "Entrar" → `/login`; **demo removido**;
      `captureTrackingFromUrl` + `usePlatformBranding` preservados; **tema claro
      forçado** no subtree (fix dark-mode). ✅ verificado live: hero, planos,
      contraste (rgb 15,23,41), modal de compra abre.
- [ ] **Trocar social proof placeholder** (stats "+3.500 / 94%" e depoimentos
      nominais fictícios) por dados reais/honestos **antes do go-live** (risco de
      propaganda enganosa). Marcado com `⚠️` no código.
- [ ] **Shell do salão**: sidebar premium (com seletor de salão) + `PageHeader`
      consistente + grid de KPI + sistema de status-badges.
- [ ] **Dashboard salão**: gráficos `recharts` (faturamento diário, top serviços,
      top profissionais).
- [x] Re-skin **Clientes, Serviços, Profissionais** (Card+Table+Dialog+Badge,
      data-injectable, rotas `/demo/salao/*`, verificadas live). Workflow paralelo
      falhou (rate-limit 5 agentes simultâneos) → feito solo sequencial.
- [x] Re-skin **Financeiro** (3 KPI cards + lista colorida, modal) — `/demo/salao/financeiro`, verificado.
- [x] Re-skin **Agenda** (CRUD + modal + status badges + conversão lead→cliente
      preservada) — `/demo/salao/agenda`, verificado. **SALÃO RE-SKIN COMPLETO (6/6).**

## Demo — ENVELOPE (batelado, pós re-skin) ✅ COMPLETO
- [x] Demo-nav: `SalaoLayout` demo-aware (`useLocation`) → links `/demo/salao/*`,
      footer "Sair do demo". Verificado: clicar entre telas demo não cai no login.
- [x] Landing `/demo` → redirect `/demo/salao`. CTA "Ver demonstração" na LP
      (hero + CTA final + nav "Demo") → `/demo/salao`. Verificado live.

## FUNIL COMPLETO E VERIFICADO LOCAL (2026-06-22)
LP (apex/`/vendas`, com "Ver demonstração") → demo navegável (`/demo/salao/*`)
→ "Começar grátis" → LeadCaptureModal → app salão premium (6/6) → gestão isolada
(`gestao.*`).
- [x] Social proof neutralizado: stats honestos (14 dias/5 min/6 módulos/IA) +
      seção "garantias" no lugar dos depoimentos fictícios. Verificado.
- [x] **DEPLOY EM PRODUÇÃO (2026-06-22)** ✅
      - Commit `bd62142` em `main`, pushado pra `origin/main` (escopo: só o re-skin).
      - VPS: `git reset --hard origin/main` + `docker build --no-cache` (anti-phantom)
        + recria `nexvy-beauty` + render Traefik (com router `gestao.*`).
      - **Prova curl:** apex + `app.nexvybeauty.com.br` servem o bundle NOVO
        (`index-BLAj8cPe.js`), HTTP 200, container healthy.
      - **DNS `gestao.nexvybeauty.com.br` → 145.223.29.96** criado no **Cloudflare**
        (DNS-only, não Hostinger — domínio é gerido lá). Router roteia (200 -k);
        cert Let's Encrypt emitindo (auto).
      - Domínio prod confirmado: `nexvybeauty.com.br` (apex) + `app.*` + `gestao.*`.

- [x] **SSL `gestao.*` corrigido (2026-06-22)** — causa: corrida de timing (DNS
      criado após a 1ª tentativa ACME → NXDOMAIN → backoff). Fix: restart do
      Traefik forçou re-emissão (DNS já resolvia). Cert Let's Encrypt válido,
      HTTPS 200 sem `-k`. DNS é Cloudflare (não Hostinger).
- [x] **Split COMPLETADO (commit `ccc23e2`, deploy 2026-06-22)** — o hostname
      decide o `viewMode` (`useSuperAdminView`): gestao.*→'gestao', app.*→'empresa';
      `showChoiceDialog=false` (dialog some). `ModuleHub` esconde o card
      'Gestão da Plataforma' no app.*. Impersonação (OrganizationSelector) intacta.
      Verificado: bundle novo servindo, gestao cert válido, container healthy.
      Nota: rota `/super-admin` ainda acessível por URL no app.* (entry-points —
      dialog/card — removidos; trancar a rota por hostname fica como follow-up).

## Sprint 2 — Features que vendem
- [ ] **Booking público de salão** (`/agendar/<slug>` salão-nativo: serviço →
      profissional → horário → dados).
- [ ] **Pacotes pré-pagos** + venda em link público.
- [ ] Ligar CTAs de planos da LP → **checkout Cakto** (oferta por plano).

## Sprint 3 — Split + acabamento
- [ ] `gestao.nexvybeauty.com.br`: roteamento por hostname (padrão
      `isApexDomain` em `src/lib/publicUrl.ts`) + regra Traefik; mover
      super-admin/CRM (`/admin`, `/crm`) pra lá, limpando a vista do salão.
- [ ] Onboarding salão-first; comissão automática; lembrete WhatsApp (Evolution).

## Padrão de demo (decidido 2026-06-22)
Demo = **rotas `/demo/*` separadas** (estilo beauty-flow), MAS reusando os
componentes reais via prop `demo` (data-injectable): sem `demo` busca Supabase;
com `demo` usa seed (`salao/demo-seed.ts`). Bônus: as rotas `/demo/*` (sem auth)
são o **meio de verificar o re-skin do salão sem login**.

## Review
- **2026-06-22:** Sprint 1 Step 1 (LP) concluído e verificado live em `/vendas`.
  Bug corrigido: texto branco em card branco (Card lia `--card-foreground` dark)
  → tokens claros forçados na LP. Disco destravado (snapshots) antes de buildar.
- **2026-06-22:** Split da gestão (código+Traefik) — `isGestaoHostname()` +
  branch 3-vias na rota `/` + router Traefik `gestao.*` (priority 120).
  Verificado: `gestao.localhost` → super-admin guardado → login. PENDENTE infra
  (DNS `gestao.*` + deploy). Veredito do "espelhar beauty-flow": nossa gestão é
  superset; nada a portar além da skin master-theme (opcional).
- **2026-06-22:** Salão Dashboard re-skinado premium (KPI grid + 3 gráficos
  recharts + próximos com badge), data-injectable. Rota `/demo/salao` (sem auth)
  criada — verificada live com seed. GOTCHA: tokens HSL → `hsl(var(--token))` no
  recharts (não `var(--token)` cru). Barras bunched = artefato de 1º paint do
  ResponsiveContainer (reflowa sozinho).
