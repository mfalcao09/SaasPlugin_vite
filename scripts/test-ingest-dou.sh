#!/usr/bin/env bash
# ============================================================================
# GATE do card C0.7 — ingestão do DOU via INLABS (PRD v2.1 §9)
#
# Critério binário: atos com origem_extracao='xml', confiança 1.0 e ZERO
# campos críticos nulos — porque `artType` vem do publicador (§5.4), não de IA.
#
# Roda OFFLINE, contra as fixtures versionadas. NÃO faz login, NÃO baixa nada,
# NÃO precisa de credencial (trava nº 1). Só o parser sai à rede, e apenas
# quando invocado explicitamente para criar fixture nova.
#
#   ./scripts/test-ingest-dou.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$HERE/fixtures/dou"
TMP="${TMP:-/tmp/dou-gate-$$}"

[ -d "$FIXTURES" ] || { echo "ERRO: fixtures ausentes em fixtures/dou/"; exit 2; }
ls "$FIXTURES"/*.zip >/dev/null 2>&1 || { echo "ERRO: nenhum .zip em fixtures/dou/"; exit 2; }

encerrar() {
  find "$TMP" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TMP" 2>/dev/null || true
}
trap encerrar EXIT
mkdir -p "$TMP"

echo "=== GATE C0.7 — ingestão DOU (offline, sobre fixtures) ==="

FALHAS=0
TOTAL=0
marcar() { # marcar <0|1> <texto>
  TOTAL=$((TOTAL + 1))
  if [ "$1" = "1" ]; then
    printf "PASS   | %s\n" "$2"
  else
    printf "FAIL   | %s\n" "$2"
    FALHAS=$((FALHAS + 1))
  fi
}

for Z in "$FIXTURES"/*.zip; do
  NOME=$(basename "$Z" .zip)
  D="$TMP/$NOME"
  mkdir -p "$D"
  unzip -qo "$Z" -d "$D" 2>/dev/null

  N_XML=$(find "$D" -name '*.xml' | wc -l | tr -d ' ')
  marcar "$([ "$N_XML" -gt 0 ] && echo 1 || echo 0)" \
         "G1 [$NOME]: ZIP contem XMLs (encontrados: $N_XML)"
  [ "$N_XML" -eq 0 ] && continue

  RES=$(cd "$HERE" && D="$D" node --input-type=module -e "
    import { readdir, readFile } from 'node:fs/promises';
    import { resolverParser } from './src/services/ingest/registry.mjs';
    const p = await resolverParser('dou-inlabs');
    const dir = process.env.D;
    const arqs = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.xml'));
    const xmls = await Promise.all(arqs.map((f) => readFile(dir + '/' + f, 'utf8')));
    const { atos, avisos } = await p.extrair({ secao: 'DO1' }, xmls);
    const nulos  = atos.filter((a) => !a.tipo || !a.data_publicacao).length;
    const conf   = atos.every((a) => a.confianca_extracao === 1.0) ? 1 : 0;
    const origem = atos.every((a) => a.origem_extracao === 'xml') ? 1 : 0;
    const iso    = atos.every((a) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(a.data_publicacao ?? '')) ? 1 : 0;
    const tipos  = new Set(atos.map((a) => a.tipo)).size;
    console.log([xmls.length, atos.length, nulos, conf, origem, iso, avisos.length, tipos].join('|'));
  " 2>/dev/null)

  IFS='|' read -r nXml nAtos nulos conf origem iso nAvisos nTipos <<< "$RES"

  marcar "$([ -n "${nAtos:-}" ] && [ "${nAtos:-0}" -gt 0 ] && echo 1 || echo 0)" \
         "G2 [$NOME]: atos extraidos (${nAtos:-0} de ${nXml:-?} XMLs)"
  marcar "$([ "${nXml:-x}" = "${nAtos:-y}" ] && echo 1 || echo 0)" \
         "G3 [$NOME]: 1 ato por XML, sem perda silenciosa"
  marcar "$([ "${nulos:-1}" = "0" ] && echo 1 || echo 0)" \
         "G4 [$NOME]: ZERO campos criticos nulos (tipo/data) — violacoes: ${nulos:-?}"
  marcar "${conf:-0}" "G5 [$NOME]: confianca_extracao = 1.0 em todos"
  marcar "${origem:-0}" "G6 [$NOME]: origem_extracao = 'xml' em todos (sem IA)"
  marcar "${iso:-0}" "G7 [$NOME]: data_publicacao em ISO AAAA-MM-DD"
  marcar "$([ "${nAvisos:-1}" = "0" ] && echo 1 || echo 0)" \
         "G8 [$NOME]: zero avisos de parsing"
  marcar "$([ -n "${nTipos:-}" ] && [ "${nTipos:-0}" -ge 5 ] && echo 1 || echo 0)" \
         "G9 [$NOME]: tipos vindos do artType (distintos: ${nTipos:-0})"
done

echo "----------------------------------------"
if [ "$FALHAS" -gt 0 ]; then
  echo "GATE C0.7: REPROVA — $FALHAS de $TOTAL"
  exit 1
fi
echo "GATE C0.7: PASSA — $TOTAL/$TOTAL"
exit 0
