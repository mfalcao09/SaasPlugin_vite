#!/usr/bin/env bash
# Harness do D3 — gate de verificação por fase (rodar de qualquer cwd)
# Uso: bash tasks/d3-multiproduto/verify.sh [--fast]
# Checks locais (1-4) sempre; build (5) pulado com --fast.
# Prova de release (bundle servido/liveness) NÃO é daqui — ver gates no feature-list.json.
set -uo pipefail
APP="/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty"
DIR="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
say(){ printf '%s\n' "$*"; }

say "=== D3 verify — $(date +%F) ==="

# [1] Fronteira: crm/ não pode tocar tabela de TENANT (products/organizations do salão).
#     Exceção tolerada: .from('profiles') read-only (display) — auditada.
say "[1] fronteira tenant↔plataforma em superadmin/crm/"
BAD=$(grep -rnE "\.from\('(products|organizations|evolution_instances|booking_event_types)'\)" \
  "$APP/src/components/superadmin/crm" 2>/dev/null | grep -v '^\s*//' | grep -v '\* ')
if [ -n "$BAD" ]; then say "  ❌ tabela de tenant referenciada:"; say "$BAD"; FAIL=1; else say "  ✅ zero"; fi

# [2] organization_id não pode existir em código do crm/ (só comentário).
say "[2] organization_id em crm/ (fora de comentário)"
ORG=$(grep -rn "organization_id" "$APP/src/components/superadmin/crm" 2>/dev/null \
  | grep -vE '(^[^:]+:[0-9]+:\s*(//|\*|/\*))' )
if [ -n "$ORG" ]; then say "  ❌ encontrado:"; say "$ORG" | head -10; FAIL=1; else say "  ✅ zero"; fi

# [3] tsc do app (baseline pré-existente ~23 erros é aceito; regressão acima = falha).
say "[3] tsc --noEmit (baseline ≤ 25 erros)"
ERRS=$(cd "$APP" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS")
say "  erros TS: $ERRS"
if [ "${ERRS:-0}" -gt 25 ]; then say "  ❌ acima do baseline (23-25)"; FAIL=1; else say "  ✅ dentro do baseline"; fi

# [4] feature-list: nenhum done com verified=false.
say "[4] feature-list.json — done sem prova"
UNPROVED=$(python3 - "$DIR/feature-list.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
bad=[f["id"] for f in d["features"] if f["status"]=="done" and f.get("verified") in (False,"",None)]
print("\n".join(bad))
PY
)
if [ -n "$UNPROVED" ]; then say "  ❌ done sem verified: $UNPROVED"; FAIL=1; else say "  ✅ ok"; fi

# [5] build vite (prova cross-file local; NÃO é prova de release).
if [ "${1:-}" != "--fast" ]; then
  say "[5] npm run build"
  if (cd "$APP" && npm run build >/tmp/d3-verify-build.log 2>&1); then
    say "  ✅ EXIT=0 ($(grep -c 'built in' /tmp/d3-verify-build.log) build)"
  else
    say "  ❌ build falhou — tail /tmp/d3-verify-build.log:"; tail -15 /tmp/d3-verify-build.log; FAIL=1
  fi
else
  say "[5] build PULADO (--fast)"
fi

say "=== resultado: $([ $FAIL -eq 0 ] && echo '✅ GATE PASSOU' || echo '❌ GATE FALHOU') ==="
exit $FAIL
