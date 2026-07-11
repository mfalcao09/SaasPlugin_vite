# Deploy NexvyBeauty — Runbook Canônico

> **Fonte única de verdade do deploy do NexvyBeauty no VPS `vps-hostinger` (145.223.29.96).**
> Última reconciliação: **2026-07-11** (git do VPS regularizado — ver §6).
> Par `.md` + `.html` (Seção 4 CLAUDE.md). Editar os dois em sincronia.

---

## 1. TL;DR — o fluxo determinístico

```bash
# 1. no Mac: commite e PUSHE tudo que vai pra produção
git add -A && git commit -m "..." && git push origin main

# 2. no VPS: puxe main e rode o deploy
ssh vps-hostinger
cd /opt/stacks/saasplugin-vite
git pull --ff-only origin main
./infra/deploy-vps.sh NexvyBeauty nexvy-beauty gestao.nexvybeauty.com.br
```

O script só retorna `0` quando **prova** que o bundle novo está servindo (gate anti-phantom). Qualquer coisa diferente de `DEPLOY-VERDE:` = deploy não concluído.

> **Regra de ouro (a lição de 2026-07-11):** o que vai pra produção **passa pelo git** (commit + push + pull no VPS). **Nunca** sincronizar arquivo-a-arquivo via `scp` sobre um working tree — isso quebra o determinismo e foi exatamente o que precisou ser desfeito (§6).

---

## 2. Topologia real

| Item | Valor |
|---|---|
| Container | `nexvy-beauty` (porta interna 80/tcp, healthcheck ativo) |
| Stack / repo no VPS | `/opt/stacks/saasplugin-vite` (repo git completo) |
| Branch de produção | `main` |
| Remote | `origin` → `github.com/mfalcao09/SaasPlugin_vite` |
| Script de deploy | `infra/deploy-vps.sh` |
| Dockerfile | `infra/Dockerfile.app` (multi-app via `--build-arg APP_DIR`) |
| Rede | `traefik-public` (externa) |
| Traefik | **file provider** — template `infra/traefik/NexvyBeauty.yml.template` → renderizado em `/opt/stacks/traefik/dynamic/nexvy-beauty.yml` |
| Domínios | `gestao.nexvybeauty.com.br` (cockpit) · `app.nexvybeauty.com.br` · `nexvybeauty.com.br` |

**Ponto crítico de entendimento:** o `deploy-vps.sh` **builda do WORKING TREE** de `/opt/stacks/saasplugin-vite` — **não** de um checkout limpo, **não** faz `git pull` sozinho. Ele empacota o que estiver no disco. Por isso o `git pull --ff-only` **antes** de rodar o script é o que garante que o build reflete o commit certo. Se o working tree estiver sujo/divergente, você builda a sujeira.

---

## 3. O que o `deploy-vps.sh` faz (e o gate anti-phantom)

```
./infra/deploy-vps.sh APP_DIR CONTAINER DOMAIN
```

1. Snapshot do hash do bundle servido HOJE (`BEFORE_HASH`).
2. `docker build --no-cache` (default) da imagem, do working tree.
3. Lê o hash do bundle **da imagem recém-buildada** (`EXPECTED_HASH`).
4. Recria o container em `traefik-public`; renderiza o template Traefik.
5. **Gate anti-phantom:** faz poll até `HTTP 200` (até 90s, inclui emissão de cert), depois exige `SERVED_HASH == EXPECTED_HASH`. Se servir bundle velho → `GATE FALHOU (PHANTOM)` + exit 1.

Saída de sucesso: `DEPLOY-VERDE: NexvyBeauty servindo provado em https://gestao.nexvybeauty.com.br/`.

Variáveis úteis: `BUILD_NO_CACHE=0` (pula --no-cache, mais rápido/arriscado), `READY_TIMEOUT`, `BUNDLE_RE`.

---

## 4. `.env` e variáveis (Vite = build-time)

- O NexvyBeauty é SPA Vite: as `VITE_*` são **embutidas no bundle em BUILD-time**, lidas de `apps/NexvyBeauty/.env` pelo `Dockerfile.app`.
- Consequência: **mudou `.env` → precisa REBUILD** (não basta restart). O `deploy-vps.sh` rebuilda por padrão.
- Os arquivos `apps/NexvyBeauty/.env` e `.env.production` vivem **só no VPS** (gitignored). `git reset --hard` / `git clean -fd` (sem `-x`) **não os apagam** — nunca rodar `git clean -x` aqui.

---

## 5. Edge functions e migrations (Supabase — deploy à parte)

O bundle vite (frontend) **não** inclui `supabase/functions/*` nem `supabase/migrations*`. Estes são deployados separadamente ao Supabase (edge functions via `supabase functions deploy` / MCP; migrations via `apply_migration` / MCP). Reconciliar o git do VPS **não** aplica migrations nem redeploya edge functions — são pipelines independentes.

---

## 6. Reconciliação 2026-07-11 (histórico — por que este runbook existe)

**Sintoma:** o VPS estava com `HEAD` preso em `main`/`a907c13` e **~348 arquivos "sujos"** que, na verdade, eram o conteúdo do branch `feat/beauty-inbox-a1.2` (nunca mergeado), sincronizado arquivo-a-arquivo via `scp`. Funcionava, mas qualquer `git pull`/`checkout` colidiria, e o fluxo documentado não descrevia mais a realidade.

**Diagnóstico (provado, não presumido):**
- `feat/beauty-inbox-a1.2` = `main` + 8 commits **lineares** (merge-base = `origin/main`; fast-forward puro; dry-merge 0 conflitos).
- Paridade de `src/` entre o working tree do VPS e o branch = **ZERO divergência**. As 3 únicas diferenças de código eram 2 migrations SQL + 1 edge function — todas fora do bundle frontend. Ou seja: o VPS estava sempre *atrás* do branch, **nunca à frente** com código não-salvo.

**Ações:**
1. PR #5 `feat/beauty-inbox-a1.2 → main` (merge; `origin/main` = `7610ce7`, tree idêntico a `a90b84a`).
2. VPS: `git fetch && git reset --hard origin/main` (`.env*` preservados; container **não** rebuildado → prod intocada).
3. Resultado: `HEAD == origin/main`, working tree limpo (só untracked de docs/lixo), `git pull --ff-only` volta a funcionar.

**Rollback usado como rede:** SHA pré-reset salvo em `/tmp/beauty_pre_reset_head.txt` no VPS; conteúdo sempre recuperável de `origin/main`.

---

## 7. Regras anti-regressão

1. **Produção passa pelo git.** Commit + push (Mac) → `git pull --ff-only origin main` (VPS) → `deploy-vps.sh`. Zero `scp` de código.
2. **Nunca `git clean -x`** neste repo (apagaria `.env*`). `git clean -fd` só se souber que não há artefato necessário untracked.
3. **`reset --hard` no VPS só com paridade provada** — antes de resetar, confirmar que o working tree não tem código VPS-only não-recuperável (comparar contra o ref alvo incluindo untracked via `git add -AN` temporário + `git diff <ref>` + `git reset`).
4. **Branch de trabalho → main via PR (fast-forward).** Não deixar feature branch virar trunk de facto.
5. **Deploy só é "verde" com `DEPLOY-VERDE:`** — o gate anti-phantom é a prova; sem ele, o deploy não terminou.

---

## 8. Rollback de deploy

```bash
ssh vps-hostinger
cd /opt/stacks/saasplugin-vite
git log --oneline -5                 # achar o SHA bom anterior
git checkout <SHA_ANTERIOR>          # ou: git reset --hard <SHA>
./infra/deploy-vps.sh NexvyBeauty nexvy-beauty gestao.nexvybeauty.com.br
```

Logs / diagnóstico: `docker logs -f nexvy-beauty --tail=100` · `curl -I https://gestao.nexvybeauty.com.br/`.
