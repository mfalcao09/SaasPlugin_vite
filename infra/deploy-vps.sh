#!/usr/bin/env bash
# Deploy idempotente de 1 app Vite no padrao Traefik FILE PROVIDER.
#
# CANONICO: VPS Hostinger + Traefik. Nao e pipeline Vercel.
#   NexvyBeauty: ver infra/DEPLOY-NEXVYBEAUTY.md §0 (ban Vercel CLI/MCP/dashboard).
#
# Uso: ./infra/deploy-vps.sh APP_DIR CONTAINER DOMAIN
#   ex: ./infra/deploy-vps.sh NexvyBeauty   nexvy-beauty         beauty.exemplo.com.br
#       ./infra/deploy-vps.sh NexvyOficinas nexvy-oficinas-vite  nexvyoficinas.com.br
#
# O que faz:
#   1. builda a imagem do app (Dockerfile.app + ARG APP_DIR) -- com --no-cache por padrao
#   2. (re)sobe o container na rede externa traefik-public (sem ports publicados)
#   3. renderiza infra/traefik/<APP_DIR>.yml.template -> dynamic/<CONTAINER>.yml
#   4. GATE anti-phantom: so retorna 0 quando o bundle NOVO esta provadamente servindo
#
# Saida: "DEPLOY-VERDE: ..." + exit 0  |  "GATE FALHOU ..." + exit 1
#
# Lições aplicadas (memoria Marcelo):
#   feedback_docker_phantom_deploy_no_cache -> --no-cache + prova de hash do bundle servido
#   feedback_nexvyoficinas_deploy_topologia -> template hardcoda app.; --no-cache obrigatorio
set -euo pipefail
exec 9>/run/lock/saasplugin-vite-deploy.lock
flock -n 9 || { echo "GATE FAILED: another Vite deploy is already running." >&2; exit 1; }

APP_DIR="${1:?APP_DIR obrigatorio (ex: NexvyBeauty)}"
CONTAINER="${2:?CONTAINER obrigatorio (ex: nexvy-beauty)}"
DOMAIN="${3:?DOMAIN obrigatorio (ex: beauty.exemplo.com.br)}"

REPO=/opt/stacks/saasplugin-vite
TRAEFIK_DYNAMIC=/opt/stacks/traefik/dynamic
MANIFEST_DIR=/var/lib/saasplugin-vite/deployments

TPL="$REPO/infra/traefik/${APP_DIR}.yml.template"
OUT="$TRAEFIK_DYNAMIC/${CONTAINER}.yml"

# ── parametros do gate (ajuste se sua imagem diferir) ────────────────────────
BUILD_NO_CACHE="${BUILD_NO_CACHE:-1}"                  # 1 = --no-cache (default; lição phantom-deploy)
READY_TIMEOUT="${READY_TIMEOUT:-90}"                   # s — inclui 1a emissao de cert Let's Encrypt
# ⚠ padrao do entry bundle Vite. Precisa casar com o nome REAL do entry: se nao
# casar, a ausencia de hash esperado ou servido faz o gate falhar fechado.
# multi-page (rollupOptions.input) o entry virou `main-<hash>.js` e `index-*`
# parou de casar; todo DEPLOY-VERDE do beauty ficou verde de "respondeu".
# Como conferir apos mexer no build:
#   grep -oE '(index|main)-[A-Za-z0-9_-]+\.js' dist/index.html   # nao pode ser vazio
BUNDLE_RE="${BUNDLE_RE:-(index|main)-[A-Za-z0-9_-]+\.js}"
# ⚠ caminhos tentados p/ ler o index.html DA IMAGEM nova (path-agnostic, best-effort):
IMAGE_INDEX_PATHS="${IMAGE_INDEX_PATHS:-/usr/share/nginx/html/index.html /app/dist/index.html /usr/share/nginx/html/index.htm}"

if [ ! -f "$TPL" ]; then
  echo "ERRO: template nao encontrado: $TPL" >&2
  exit 1
fi

# Mandatory container provenance contract.
if ! git -C "$REPO" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "GATE FAILED: repository has no verifiable commit." >&2
  exit 1
fi
GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"
IMAGE_TAG="${CONTAINER}:${GIT_SHA}"
DOCKERFILE="$REPO/infra/Dockerfile.app"

UNPINNED_BASES="$(grep -nE '^FROM[[:space:]].+(@sha256:[0-9a-f]{64})?$' "$DOCKERFILE" | grep -v '@sha256:' || true)"
if [ -n "$UNPINNED_BASES" ]; then
  echo "GATE FAILED: every FROM must be pinned by digest in $DOCKERFILE" >&2
  echo "$UNPINNED_BASES" >&2
  exit 1
fi

for f in "$REPO"/docker-compose*.yml "$REPO"/docker-compose*.yaml "$REPO"/compose*.yml "$REPO"/compose*.yaml; do
  [ -f "$f" ] || continue
  if ! EFFECTIVE="$(docker compose -f "$f" config --no-interpolate 2>/dev/null)"; then
    echo "GATE FAILED: docker compose could not render $f" >&2
    exit 1
  fi
  PROHIBITED="$(printf '%s\n' "$EFFECTIVE" | grep -nE '^[[:space:]]*(privileged:[[:space:]]*true|network_mode:[[:space:]]*host|pid:[[:space:]]*host|[^#]*[/]var/run/docker[.]sock)' || true)"
  if [ -n "$PROHIBITED" ]; then
    echo "GATE FAILED: prohibited effective configuration in $f" >&2
    echo "$PROHIBITED" >&2
    exit 1
  fi

  # cap_add e permitido somente para o conjunto minimo exigido pelo Nginx.
  # Qualquer capability fora da allowlist falha o gate.
  CAP_LINES="$(printf '%s\n' "$EFFECTIVE" | awk '
    /^[[:space:]]*cap_add:[[:space:]]*$/ {
      match($0, /^[[:space:]]*/); cap_indent=RLENGTH; inside=1; next
    }
    inside && /^[[:space:]]*-[[:space:]]*/ { print; next }
    inside && $0 !~ /^[[:space:]]*$/ {
      match($0, /^[[:space:]]*/);
      if (RLENGTH <= cap_indent) inside=0
    }
  ')"
  BAD_CAPS="$(printf '%s\n' "$CAP_LINES" |
    sed -E 's/^[[:space:]]*-[[:space:]]*//; s/[[:space:]]+$//' |
    tr '[:lower:]' '[:upper:]' |
    grep -Ev '^(NET_BIND_SERVICE|CHOWN|SETUID|SETGID)$' || true)"
  if [ -n "$BAD_CAPS" ]; then
    echo "GATE FAILED: cap_add fora da allowlist em $f" >&2
    echo "$BAD_CAPS" >&2
    exit 1
  fi
done

# ── 0a. gate: working tree limpa (este script builda do DISCO, nao de um SHA) ─
# Escape: ALLOW_DIRTY_DEPLOY=1 (emergencia apenas; documente o motivo no log).
if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ] && [ -d "$REPO/.git" ]; then
  if ! git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "AVISO: $REPO nao parece um worktree git; seguindo sem gate de sujeira." >&2
  else
    DIRTY="$(git -C "$REPO" status --porcelain 2>/dev/null || true)"
    if [ -n "$DIRTY" ]; then
      echo "GATE FALHOU: working tree sujo em $REPO — deploy abortado." >&2
      echo "  Este script empacota o que estiver no disco. Rode: git status" >&2
      echo "  Escape consciente: ALLOW_DIRTY_DEPLOY=1 $0 $*" >&2
      echo "$DIRTY" | head -40 >&2
      exit 1
    fi
  fi
fi

DOMAIN_URL="https://$DOMAIN/"

# ── 0. snapshot anti-phantom: hash do bundle SERVIDO hoje (antes do deploy) ───
BEFORE_HASH="$(curl -s -m 8 "$DOMAIN_URL" 2>/dev/null | grep -oE "$BUNDLE_RE" | head -1 || true)"
if [ -z "$BEFORE_HASH" ]; then
  echo "GATE FAILED: nao foi possivel provar o hash do bundle atualmente servido." >&2
  echo "  -> Deploy abortado antes do build; rollback verificavel exige BEFORE_HASH." >&2
  exit 1
fi

# ── 1. build (--no-cache por padrao) ─────────────────────────────────────────
NC=(); [ "$BUILD_NO_CACHE" = "1" ] && NC=(--no-cache)
docker build \
  "${NC[@]}" \
  --pull \
  -f "$REPO/infra/Dockerfile.app" \
  --build-arg APP_DIR="$APP_DIR" \
  --label "org.opencontainers.image.revision=$GIT_SHA" \
  --label "org.opencontainers.image.source=$(git -C "$REPO" remote get-url origin 2>/dev/null || echo unknown)" \
  -t "$IMAGE_TAG" \
  "$REPO"

IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
IMAGE_DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE_TAG" 2>/dev/null || true)"
mkdir -p "$MANIFEST_DIR"
umask 077
MANIFEST_TMP="$(mktemp "$MANIFEST_DIR/.manifest.XXXXXX")"
cleanup_manifest() { rm -f "$MANIFEST_TMP"; }
trap cleanup_manifest EXIT
cat > "$MANIFEST_TMP" <<EOF
APP_DIR=$APP_DIR
CONTAINER=$CONTAINER
DOMAIN=$DOMAIN
GIT_SHA=$GIT_SHA
IMAGE_TAG=$IMAGE_TAG
IMAGE_ID=$IMAGE_ID
IMAGE_DIGEST=$IMAGE_DIGEST
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

# hash ESPERADO = o que a imagem recem-buildada contem (lido aqui, antes de subir)
EXPECTED_HASH=""
for p in $IMAGE_INDEX_PATHS; do
  EXPECTED_HASH="$(docker run --rm --entrypoint sh "$IMAGE_TAG" -lc "cat '$p' 2>/dev/null" 2>/dev/null \
    | grep -oE "$BUNDLE_RE" | head -1 || true)"
  [ -n "$EXPECTED_HASH" ] && break
done

# ── 2. (re)run na rede traefik-public (idempotente) ──────────────────────────
run_hardened() {
  local image="$1"
  docker run -d \
    --name "$CONTAINER" \
    --network traefik-public \
    --restart unless-stopped \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m \
    --tmpfs /var/run:rw,noexec,nosuid,size=1m \
    --cap-drop=ALL \
    --cap-add=NET_BIND_SERVICE \
    --cap-add=CHOWN \
    --cap-add=SETUID \
    --cap-add=SETGID \
    --security-opt no-new-privileges:true \
    --pids-limit 100 \
    --memory 256m \
    --cpus 1 \
    "$image"
}
OLD_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
NEW_ATTEMPT=0
rollback() {
  local rc="$?"
  local rollback_ok=1
  rm -f "$MANIFEST_TMP"
  trap - EXIT
  if [ "$rc" -ne 0 ] && [ "$NEW_ATTEMPT" = "1" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    if [ -n "$OLD_IMAGE" ]; then
      echo "ROLLBACK: restoring previous image" >&2
      if ! run_hardened "$OLD_IMAGE" >/dev/null 2>&1; then
        rollback_ok=0
      else
        rt=0; restored=0; rhc=000
        while [ "$rt" -lt 30 ]; do
          rhc="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$DOMAIN_URL" 2>/dev/null || echo 000)"
          [ "$rhc" = "200" ] && { restored=1; break; }
          sleep 2; rt=$((rt+2))
        done
        if [ "$restored" != 1 ]; then
          echo "ROLLBACK FAILED: previous image did not return HTTP 200 (HTTP $rhc)" >&2
          rollback_ok=0
        elif [ -z "$BEFORE_HASH" ]; then
          echo "ROLLBACK FAILED: pre-deploy bundle hash was unavailable; restoration not provable" >&2
          rollback_ok=0
        else
          RESTORED_HASH="$(curl -s -m 8 "$DOMAIN_URL" 2>/dev/null | grep -oE "$BUNDLE_RE" | head -1 || true)"
          if [ -z "$RESTORED_HASH" ] || [ "$RESTORED_HASH" != "$BEFORE_HASH" ]; then
            echo "ROLLBACK FAILED: restored bundle hash does not match pre-deploy hash" >&2
            echo "  expected=$BEFORE_HASH served=$RESTORED_HASH" >&2
            rollback_ok=0
          fi
        fi
      fi
    else
      echo "ROLLBACK: no previous image recorded; candidate removed, service remains stopped" >&2
    fi
    [ "$rollback_ok" = "1" ] || echo "ROLLBACK FAILED: restoration was not proven" >&2
  fi
  exit "$rc"
}
trap rollback EXIT
NEW_ATTEMPT=1
docker rm -f "$CONTAINER" 2>/dev/null || true
run_hardened "$IMAGE_TAG"

# ── 3. render do template Traefik (substitui DOMAIN_* e __CONTAINER__) ───────
mkdir -p "$TRAEFIK_DYNAMIC"
sed "s|DOMAIN_[A-Z]*|$DOMAIN|g; s|__CONTAINER__|$CONTAINER|g" "$TPL" > "$OUT"
echo "deployed $APP_DIR -> $CONTAINER -> $DOMAIN_URL (traefik hot-reload via $OUT)"

# ── 4. GATE DE VERIFICACAO (anti-phantom: so termina quando o bundle NOVO serve) ─
# 4a. readiness: poll ate 200 (espera Traefik rotear + cert emitir)
t=0; served=0; hc=000
while [ "$t" -lt "$READY_TIMEOUT" ]; do
  hc="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$DOMAIN_URL" 2>/dev/null || echo 000)"
  [ "$hc" = "200" ] && { served=1; break; }
  sleep 3; t=$((t+3))
done
if [ "$served" != 1 ]; then
  echo "GATE FALHOU: $DOMAIN_URL nao respondeu 200 em ${READY_TIMEOUT}s (HTTP $hc)" >&2
  echo "  -> container subiu? 'docker logs $CONTAINER'. Router no dynamic/$CONTAINER.yml? cert emitido?" >&2
  exit 1
fi

# 4b. prova anti-phantom: bundle servido == bundle recem-buildado?
SERVED_HASH="$(curl -s -m 8 "$DOMAIN_URL" 2>/dev/null | grep -oE "$BUNDLE_RE" | head -1 || true)"
if [ -z "$EXPECTED_HASH" ]; then
  echo "GATE FALHOU (ANTI-PHANTOM): nao foi possivel extrair o hash esperado da imagem nova." >&2
  echo "  -> Corrija IMAGE_INDEX_PATHS/BUNDLE_RE; sucesso parcial nao e aceito." >&2
  exit 1
fi
if [ -z "$SERVED_HASH" ]; then
  echo "GATE FALHOU (ANTI-PHANTOM): nao foi possivel extrair o hash servido." >&2
  exit 1
fi
if [ "$SERVED_HASH" = "$EXPECTED_HASH" ]; then
  echo "  OK anti-phantom: serve o bundle NOVO ($SERVED_HASH)"
else
  echo "GATE FALHOU (PHANTOM): serve '$SERVED_HASH' mas a imagem nova tem '$EXPECTED_HASH'" >&2
  echo "  -> Traefik servindo container velho, ou build cacheado servindo codigo antigo." >&2
  exit 1
fi
mv -f "$MANIFEST_TMP" "$MANIFEST_DIR/$CONTAINER-$GIT_SHA.env"
trap - EXIT
echo "DEPLOY-VERDE: $APP_DIR servindo provado em $DOMAIN_URL"
