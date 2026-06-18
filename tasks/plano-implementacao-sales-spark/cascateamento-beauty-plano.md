# Plano de Trabalho — Cascateamento NexvyOficinas → NexvyBeauty (oneshot)

> **Data:** 2026-06-18
> **Pivô:** lançamento da operação começa pelo **NexvyBeauty**.
> **Objetivo verificável:** `https://nexvybeauty.com.br` no ar com o **core sales-spark** (CRM, Atendimento/WhatsApp, IA, Funil, Agendamento, Captura) **operante**, com **identidade Beauty** (rosa, sem roadster/estrada/oficina) e **super admin logando** — tudo numa sessão única prolongada.
> **Fonte:** NexvyOficinas (provado em produção, `app.nexvyoficinas.com.br`).
> **Base:** spec `cascateamento-spec.md` (06-09) + análise multi-agente do delta (06-18, este plano corrige a spec onde ela ficou defasada).

---

## 1. Achados da análise que MUDAM o cascateamento padrão

A spec de 06-09 assumia "replicação mecânica via `cascade-core.sh`". A análise revelou **3 correções obrigatórias**:

| # | Achado | Impacto | Correção no plano |
|---|---|---|---|
| **C1** | **Paridade de schema quebrada.** Baseline congelado (06-09 08:25, 161 tabelas) é anterior a um big-bang estrutural + migrations_erp. Fonte viva tem **167 tabelas**. O `cascade-core.sh` aplica o baseline mas copia `src`+`edges` atuais → **build verde, runtime quebrado**. | Beauty subiria chamando tabelas inexistentes (veiculos, ordens_servico, etc.) | **Recapturar o schema vivo do Oficinas via `pg_dump --schema-only`** (167 tabelas) em vez do baseline. Paridade perfeita por construção. |
| **C2** | **Skin "estrada/roadster" (06-12) é temática de oficina** e é copiada 1:1 pelo cascade. Mas `WheelLoader`/`RoadProgress` são os **únicos loaders/progress globais** (usados por TODAS as rotas, não só oficina). | Deletar a seco quebra build/loading de toda a app | **Re-skin preservando API**: trocar o SVG interno por neutro (spinner/barra em `--primary`), mantendo props e call-sites. `RoadFooter` (decorativo) removido; `RoadsterCar` deletado. |
| **C3** | **Vertical de oficina** (módulo `erp_oficina`, `pages/oficina/*`: Veículos/Ordens de Serviço) não serve salão. **NÃO quebra o core** (módulos genéricos isolados). | Salão não tem "veículos" | **Estratégia A (recomendada):** ocultar o módulo `erp_oficina` no hub do Beauty (dormente, reativável). Vertical de salão = incremento posterior. |

**Engine de branding (boa notícia):** o Oficinas tem `usePlatformBranding` — engine de white-label de **runtime** maduro. **1 UPDATE SQL** em `platform_settings` (nome, cor, logo, favicon, título) cobre ~80% do rebrand (hub, sidebar, header, título, favicon). O gap (Login.tsx com `BRAND` estático + fallbacks `index.css`/`index.html`/`manifest.json`) fecha com patch pequeno de código.

---

## 2. Estratégia (recomendada: A — core puro primeiro)

| Estratégia | Entrega | Esforço | Recomendação |
|---|---|---|---|
| **A — Core puro + branding Beauty** ⭐ | Beauty operante com CRM/IA/inbox/funil/agendamento/captura + visual Beauty. Módulo de oficina **oculto**. | ~1 sessão | **SIM** — pivota rápido, alinha com a spec |
| **B — Core + vertical salão** | Acima + ERP de salão (agenda/serviços/profissionais/comandas) construído agora | +1-2 sprints | depois, por demanda |

**DECISÃO (2026-06-18, Marcelo): Estratégia B** — core + vertical salão agora. Cor `#EC4899`. Super-admin + Evolution espelhados do Oficinas. Login = wordmark + fundo neutro rosa.

> **Fonte do vertical salão:** o Beauty já tinha modelo de salão no banco (`agendamentos`, `profissionais`, `pacotes`, `clientes`, `metas`, `pacotes_clientes`). O dump 0.1 preserva esse modelo → usado como base do vertical, integrado ao core sales-spark (não modelar do zero).

**Execução em 2 blocos nesta sessão:**
- **Bloco 1 — Fundação:** Fases 0, A, B, C.1-C.2-C.4, D, E parcial → Beauty **core** operante, visual rosa, sem oficina.
- **Bloco 2 — Vertical salão:** schema salão (do dump) + telas (Profissionais, Serviços, Agenda, Comandas, Financeiro) integradas + módulo `erp_salao` no hub + onboarding salão → redeploy.

---

## 3. Fases de execução (com critério binário de DONE)

### Fase 0 — Salvaguardas (pré-flight)
- [ ] `0.1` Dump de segurança do Beauty atual (schema+dados, 145 linhas demo) → `tmp/beauty-pre-reset-YYYYMMDD.sql`. **Verifica:** arquivo existe, > 0 bytes.
- [ ] `0.2` Recapturar schema vivo do Oficinas: `pg_dump --schema-only` de `gpxmkximudukbljrvtxj` → `tmp/oficinas-live-schema.sql`. **Verifica:** contém 167 `CREATE TABLE`.
- [ ] `0.3` Branch de trabalho no monorepo (não mexer em `main` direto). **Verifica:** `git branch` mostra `cascade/beauty`.

### Fase A — Banco Beauty (`fzhlbwhdejumkyqosuvq`)
- [ ] `A.1` Extensions (uuid-ossp, pg_net, pgmq, pg_cron, vector+pg_trgm em `public`). **Verifica:** `SELECT extname` lista as 5.
- [ ] `A.2` Reset `public` (greenfield já confirmado: 145 linhas demo). **Verifica:** 0 tabelas pós-drop.
- [ ] `A.3` Aplicar **schema vivo do Oficinas** (0.2), não o baseline. **Verifica:** **167 tabelas** no Beauty.
- [ ] `A.4` GRANTs (anon/authenticated/service_role) — sem isso o app dá "permission denied" apesar da RLS. **Verifica:** `has_table_privilege('authenticated','clientes','SELECT')` = true.
- [ ] `A.5` Seeds (planos, categorias, forms, releases) + storage buckets + realtime (6 tabelas). **Verifica:** `platform_plans` > 0; bucket `inbox-media` existe.
- [ ] `A.6` Cron (10 jobs, parametrizado com ref+anon do Beauty). **Verifica:** `SELECT count(*) FROM cron.job` ≥ 10.

### Fase B — Edge Functions
- [ ] `B.1` Copiar 115 functions Oficinas→Beauty + `config.toml` com ref Beauty. **Verifica:** `ls supabase/functions | wc -l` = 115.
- [ ] `B.2` `supabase functions deploy --project-ref fzhlbwhdejumkyqosuvq`. **Verifica:** deploy sem erro; `supabase functions list` ≥ 110.

### Fase C — Frontend (copiar + neutralizar skin + rebrand)
- [ ] `C.1` `rm -rf apps/NexvyBeauty/src && cp -r apps/NexvyOficinas/src` + configs + package.json. **Verifica:** `src/` copiado.
- [ ] `C.2` **Neutralizar skin** (re-skin preservando API):
  - `WheelLoader.tsx` → spinner neutro (arco `--primary`), mantém `{size,label,className}`.
  - `RoadProgress.tsx` → barra simples (trilho + fill `--primary`), mantém `{value,className}`.
  - `RoadFooter` → removido do `ModuleHub` (decorativo).
  - `RoadsterCar.tsx` → deletado (após remover refs).
  - **Verifica:** `grep -ri "roadster\|estrada\|RoadFooter" src/` = 0 hits relevantes.
- [ ] `C.3` **Ocultar vertical oficina** (Estratégia A): módulo `erp_oficina` removido do hub (`config/modules.ts`), rotas `/oficina/*` desregistradas. Código dorme. **Verifica:** hub não lista "ERP Oficina"; build não referencia rota órfã.
- [ ] `C.4` **Rebrand estático** (gap do runtime): `Login.tsx` BRAND → Beauty (nome, tagline, cor); `index.html` (title/theme-color/og); `index.css` (HSL `--primary`); `manifest.json` (name/theme). **Verifica:** `grep -ri "oficina\|F97316\|24 95% 53" src/ index.html public/manifest.json` = 0 hits de marca.
- [ ] `C.5` `.env`/`.env.production` Beauty (URL+ANON do ref Beauty) + `npm install && npm run build`. **Verifica:** **build verde**, `tsc` 0 erros.

### Fase D — Branding runtime + Auth + Secrets
- [ ] `D.1` `UPDATE platform_settings` no Beauty: `platform_name='NexvyBeauty'`, `primary_color=<cor>`, `logo_url`, `login_headline`. **Verifica:** `SELECT platform_name` = NexvyBeauty.
- [ ] `D.2` Secrets: espelhar `SUPER_ADMIN_EMAIL` + `EVOLUTION_*` do Oficinas (ou novos). **Verifica:** `supabase secrets list` mostra os nomes.
- [ ] `D.3` Auth: Site URL = `https://nexvybeauty.com.br` + redirects. **Verifica:** config Auth atualizada.

### Fase E — Deploy + Bootstrap + Prova
- [ ] `E.1` Commit + push branch → merge `main`. **Verifica:** push OK.
- [ ] `E.2` Deploy VPS: `ssh vps-hostinger` → `git pull` + `docker build --no-cache` + `deploy-vps.sh NexvyBeauty nexvy-beauty nexvybeauty.com.br`. **Verifica:** container Up healthy.
- [ ] `E.3` **Prova anti-phantom** (lição 06-13): `docker exec nexvy-beauty grep -rl "<string única do build>" /usr/share/nginx/html/assets/` + bundle hash mudou. **Verifica:** código novo servido.
- [ ] `E.4` Bootstrap super admin: signup com `SUPER_ADMIN_EMAIL` → promovido. **Verifica:** login + hub Beauty (rosa, sem roadster) carrega.
- [ ] `E.5` Smoke: `curl https://nexvybeauty.com.br` HTTP 200 + `/health` ok + screenshot do hub. **Verifica:** 200 + visual Beauty.

---

## 4. Critério de DONE (binário)
1. `curl -sI https://nexvybeauty.com.br` → **HTTP 200** + cert válido.
2. Banco Beauty com **167 tabelas** (paridade com Oficinas vivo).
3. Login do **super admin** funciona → hub carrega.
4. Hub mostra **módulos core** (CRM, Atendimento, Admin, Gestão), **SEM** "ERP Oficina".
5. Visual **Beauty** (cor da marca, sem roadster/estrada/laranja-oficina); loader/progresso neutros.
6. **Zero** strings "oficina/roadster/veículo" visíveis na UI core.

---

## 5. Decisões pendentes (rodada única — travam a execução)
| # | Decisão | Default proposto | Por quê |
|---|---|---|---|
| D1 | **Estratégia** A (core puro) vs B (core+vertical salão) | **A** | pivota rápido; vertical depois |
| D2 | **Cor da marca** Beauty | **#EC4899** (rosa, do catálogo interno) | propaga p/ platform_settings + fallbacks |
| D3 | **Módulo oficina** no Beauty: ocultar / remover do código / adaptar p/ salão agora | **ocultar** (dormente) | reversível, mínimo esforço |
| D4 | **Super-admin email** do Beauty | mesmo do Oficinas | bootstrap |
| D5 | **Logo/assets** Beauty (logo, fundo de login) | wordmark + fundo neutro (até ter assets) | login não fica de carro |

---

## 6. Riscos & mitigação
- **R1 — runtime quebrado por schema defasado** → mitigado por C1 (schema vivo, não baseline).
- **R2 — phantom deploy** → `--no-cache` + prova por hash/grep no container (lição 06-13).
- **R3 — perda de dados Beauty** → dump de segurança (0.1); greenfield já confirmado (145 demo).
- **R4 — login laranja/oficina** → C.4 (Login.tsx BRAND + fallbacks estáticos).
- **R5 — build-break por import órfão** → re-skin preserva APIs; `tsc` gate em C.5.
