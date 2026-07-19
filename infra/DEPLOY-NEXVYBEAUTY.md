# Deploy NexvyBeauty — Runbook Canônico

> **Fonte única de verdade do deploy do NexvyBeauty no VPS `vps-hostinger` (145.223.29.96).**
> Última reconciliação: **2026-07-11** (git do VPS regularizado — ver §6).
> Última correção: **2026-07-19** (domínio fantasma removido do runbook — ver §2.1).
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
./infra/deploy-vps.sh NexvyBeauty nexvy-beauty app.nexvybeauty.com.br
```

O script só retorna `0` quando **prova** que o bundle novo está servindo (gate anti-phantom). Qualquer coisa diferente de `DEPLOY-VERDE:` = deploy não concluído.

> ⚠️ **O 3º argumento é o ALVO DO GATE, não a lista de domínios.** Use `app.nexvybeauty.com.br` (validado 2026-07-19). **Não** use `gestao.nexvybeauty.com.br` — esse subdomínio **não existe** (ver §2.1).

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
| Domínios servidos | `nexvybeauty.com.br` (+ `www`) → apex/LP · `app.nexvybeauty.com.br` → SaaS (login, hub, super-admin) |
| CRM do grupo | `gestao.nexvy.tech` → **mesmo container**, mas roteado por arquivo Traefik **separado**: `/opt/stacks/traefik/dynamic/nexvy-gestao-grupo.yml` |
| Alvo do gate (3º arg) | `app.nexvybeauty.com.br` |

**Ponto crítico de entendimento:** o `deploy-vps.sh` **builda do WORKING TREE** de `/opt/stacks/saasplugin-vite` — **não** de um checkout limpo, **não** faz `git pull` sozinho. Ele empacota o que estiver no disco. Por isso o `git pull --ff-only` **antes** de rodar o script é o que garante que o build reflete o commit certo. Se o working tree estiver sujo/divergente, você builda a sujeira.

**Segundo ponto crítico:** os hosts do NexvyBeauty são **hardcodados no template** (`app.` + apex/www). O argumento `DOMAIN` do script **não** cria rota nenhuma — ele só monta a URL que o gate vai testar (`https://$DOMAIN/`).

### 2.1 ⚠️ Armadilha: `gestao.nexvybeauty.com.br` NÃO EXISTE

Esse subdomínio foi **removido do Traefik em 2026-07-11** (era fantasma). O `gestao` canônico é `gestao.nexvy.tech` (CRM do grupo), em arquivo dinâmico próprio. O próprio `infra/traefik/NexvyBeauty.yml.template` avisa: *"NAO recriar gestao.nexvybeauty.com.br aqui"*.

**Por que isso queima tempo:** o 3º argumento é a URL do gate. Se você apontar para um domínio que o Traefik não serve, o deploy **funciona** (container healthy, apex e `app.` em 200) mas o gate testa um host que não resolve e cospe:

```
GATE FALHOU: https://gestao.nexvybeauty.com.br/ nao respondeu 200 em 90s (HTTP 000000)
```

`HTTP 000` = o curl nem conectou (não é 404/502 da aplicação). Aconteceu em **2026-07-19**: parecia deploy quebrado, não estava — e quase induziu rollback desnecessário. Rodar de novo com `app.nexvybeauty.com.br` terminou **verde**, com o bundle novo servindo.

---

## 3. O que o `deploy-vps.sh` faz (e o gate anti-phantom)

```
./infra/deploy-vps.sh APP_DIR CONTAINER DOMAIN
```

1. Snapshot do hash do bundle servido HOJE (`BEFORE_HASH`).
2. `docker build --no-cache` (default) da imagem, do working tree.
3. Lê o hash do bundle **da imagem recém-buildada** (`EXPECTED_HASH`).
4. Recria o container em `traefik-public`; renderiza o template Traefik.
5. **Gate anti-phantom:** faz poll até `HTTP 200` **em `https://DOMAIN/`** (até 90s, inclui emissão de cert), depois exige `SERVED_HASH == EXPECTED_HASH`. Se servir bundle velho → `GATE FALHOU (PHANTOM)` + exit 1. Se o `DOMAIN` não for servido pelo Traefik → `GATE FALHOU: ... (HTTP 000000)` + exit 1, **mesmo com o deploy OK** (§2.1).

Saída de sucesso: `DEPLOY-VERDE: NexvyBeauty servindo provado em https://app.nexvybeauty.com.br/`.

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
6. **O alvo do gate tem que ser um domínio que o Traefik realmente serve** — conferir em `/opt/stacks/traefik/dynamic/` antes. Domínio errado = `GATE FALHOU ... (HTTP 000000)` com o deploy intacto (§2.1). Antes de fazer rollback por gate vermelho, confirme se o container está healthy e se os domínios reais respondem 200.

---

## 8. Rollback de deploy

```bash
ssh vps-hostinger
cd /opt/stacks/saasplugin-vite
git log --oneline -5                 # achar o SHA bom anterior
git checkout <SHA_ANTERIOR>          # ou: git reset --hard <SHA>
./infra/deploy-vps.sh NexvyBeauty nexvy-beauty app.nexvybeauty.com.br
```

Logs / diagnóstico: `docker logs -f nexvy-beauty --tail=100` · `curl -I https://app.nexvybeauty.com.br/` · `curl -I https://nexvybeauty.com.br/` · `curl -I https://gestao.nexvy.tech/`.
