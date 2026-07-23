#!/usr/bin/env bash
# ============================================================================
# GATE do card C0.5 — contrato de parser plugável (PRD v2.1 §9)
#
# Critério binário: "Adicionar 2ª fonte NÃO edita nenhum arquivo existente
# (verificado por git diff --stat)".
#
# Simula a adição de uma fonte nova e mede o diff do repositório.
# Qualquer arquivo MODIFICADO reprova — só arquivo NOVO é aceito.
#
#   ./scripts/test-parser-contract.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
PARSERS="$HERE/src/services/ingest/parsers"
CHAVE_TESTE="fonte-ficticia-gate"
NOVO="$PARSERS/${CHAVE_TESTE}.mjs"

limpar() { find "$PARSERS" -name "${CHAVE_TESTE}.mjs" -delete 2>/dev/null || true; }
trap limpar EXIT

echo "=== GATE C0.5 — contrato de parser plugável ==="

# Pré-condição: árvore limpa, senão o diff mede sujeira alheia.
PENDENTES=$(git -C "$REPO" status --porcelain -- "$HERE" | wc -l | tr -d ' ')
if [ "$PENDENTES" -ne 0 ]; then
  echo "FAIL   | P0: árvore suja ($PENDENTES alteração(ões)) — commite antes de rodar o gate"
  git -C "$REPO" status --porcelain -- "$HERE" | head -5 | sed 's/^/         /'
  exit 1
fi
echo "PASS   | P0: árvore limpa antes do teste"

# ---- Passo 1: adicionar a fonte nova = criar UM arquivo ------------------
cat > "$NOVO" <<'JS'
// Parser fictício criado pelo gate C0.5. Removido ao final.
export const SIGLA = 'FICT';
export const PARSER_KEY = 'fonte-ficticia-gate';
export const MODO_ACESSO = 'scrape';
export async function descobrir() { return []; }
export async function baixar() { throw new Error('fictício'); }
export async function extrair() { throw new Error('fictício'); }
JS

# ---- Passo 2: o registry resolve sem edição de código? -------------------
RES=$(cd "$HERE" && node --input-type=module -e "
import { resolverParser, parsersDisponiveis, conferirCobertura } from './src/services/ingest/registry.mjs';
const p = await resolverParser('${CHAVE_TESTE}');
const disp = await parsersDisponiveis();
const cob = await conferirCobertura([
  { sigla: 'DOMS', parser_key: 'doms-pdf' },
  { sigla: 'FICT', parser_key: '${CHAVE_TESTE}' },
]);
console.log(JSON.stringify({ sigla: p.SIGLA, disponiveis: disp, cobertura: cob.ok }));
" 2>&1) || { echo "FAIL   | G1: registry não resolveu o parser novo"; echo "         $RES"; exit 1; }

echo "$RES" | grep -q '"sigla":"FICT"' \
  && echo "PASS   | G1: registry resolveu 'fonte-ficticia-gate' por convenção, sem edição" \
  || { echo "FAIL   | G1: resolução incorreta — $RES"; exit 1; }

echo "$RES" | grep -q '"cobertura":true' \
  && echo "PASS   | G2: conferirCobertura enxerga a fonte nova" \
  || { echo "FAIL   | G2: cobertura não reconheceu a fonte nova"; exit 1; }

# ---- Passo 3: O CRITÉRIO — nenhum arquivo existente foi modificado ------
QTD_MOD=$(git -C "$REPO" diff --name-only -- "$HERE" | wc -l | tr -d ' ')
NOVOS=$(git -C "$REPO" status --porcelain -- "$HERE" | grep -c '^??' || true)

if [ "$QTD_MOD" -eq 0 ]; then
  echo "PASS   | G3: 0 arquivos existentes modificados (git diff vazio)"
else
  echo "FAIL   | G3: $QTD_MOD arquivo(s) existente(s) modificado(s):"
  git -C "$REPO" diff --name-only -- "$HERE" | sed 's/^/         /'
  exit 1
fi

if [ "$NOVOS" -eq 1 ]; then
  echo "PASS   | G4: exatamente 1 arquivo novo (o parser da fonte)"
else
  echo "FAIL   | G4: esperado 1 arquivo novo, obtido $NOVOS"
  git -C "$REPO" status --porcelain -- "$HERE" | sed 's/^/         /'
  exit 1
fi

# ---- Passo 4: o contrato é exigido de verdade? --------------------------
cat > "$NOVO" <<'JS'
export const SIGLA = 'QUEBRA';
export async function descobrir() { return []; }
JS
if (cd "$HERE" && node --input-type=module -e "
import { resolverParser } from './src/services/ingest/registry.mjs';
await resolverParser('${CHAVE_TESTE}');
" >/dev/null 2>&1); then
  echo "FAIL   | G5: parser incompleto foi aceito (contrato não é exigido)"
  exit 1
fi
echo "PASS   | G5: parser sem baixar/extrair é rejeitado pelo contrato §5.1"

# ---- Passo 5: parser_key maliciosa não escapa do diretório --------------
if (cd "$HERE" && node --input-type=module -e "
import { resolverParser } from './src/services/ingest/registry.mjs';
await resolverParser('../../../etc/passwd');
" >/dev/null 2>&1); then
  echo "FAIL   | G6: path traversal aceito em parser_key"
  exit 1
fi
echo "PASS   | G6: parser_key com traversal é rejeitada"

echo "----------------------------------------"
echo "GATE C0.5: PASSA — 7/7"
exit 0
