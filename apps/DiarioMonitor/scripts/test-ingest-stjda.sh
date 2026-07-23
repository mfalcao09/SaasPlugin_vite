#!/usr/bin/env bash
# ============================================================================
# GATE do card C0.10 — ingestão do DJe-STJ via Dados Abertos (PRD v2.1 §5)
#
# Critério: documentos com origem_extracao='api', confiança 1.0, metadados
# estruturados da fonte e pseudonimização registrada.
#
# Roda OFFLINE, contra fixtures/stjda/*.metadados.json. Não chama o CKAN.
#
#   ./scripts/test-ingest-stjda.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$HERE/fixtures/stjda"

[ -d "$FIXTURES" ] || { echo "ERRO: fixtures ausentes em fixtures/stjda/"; exit 2; }
ls "$FIXTURES"/*.metadados.json >/dev/null 2>&1 || { echo "ERRO: nenhum metadados em fixtures/stjda/"; exit 2; }

echo "=== GATE C0.10 — ingestão DJe-STJ Dados Abertos (offline) ==="

RES=$(cd "$HERE" && node --input-type=module -e '
  import { readdir, readFile } from "node:fs/promises";
  import { resolverParser } from "./src/services/ingest/registry.mjs";
  const p = await resolverParser("stj-dados-abertos");
  const dir = "fixtures/stjda";
  const arqs = (await readdir(dir)).filter((f) => f.endsWith(".metadados.json"));

  const docs = [], avisos = [];
  for (const f of arqs) {
    const meta = JSON.parse(await readFile(dir + "/" + f, "utf8"));
    const r = p.extrairDeMetadados(meta);
    docs.push(...r.documentos); avisos.push(...r.avisos);
  }

  const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const l = [
    [arqs.length > 0, "G1: fixtures carregadas (" + arqs.length + " dia[s])"],
    [docs.length > 0, "G2: documentos extraidos (" + docs.length + ")"],
    [docs.every((d) => d.origem_extracao === "api"), "G3: origem_extracao = api em todos"],
    [docs.every((d) => d.confianca_extracao === 1.0), "G4: confianca = 1.0 em todos"],
    [docs.every((d) => d.id_fonte), "G5: todo doc tem id_fonte (SeqDocumento)"],
    [docs.every((d) => ISO.test(d.data_publicacao ?? "")), "G6: data_publicacao em ISO AAAA-MM-DD"],
    [docs.every((d) => d.tipo), "G7: todo doc tem tipo (DECISAO/ACORDAO)"],
    [docs.every((d) => d.pseudonimizado_na_origem === true), "G8: pseudonimizacao na origem registrada (LGPD)"],
    [avisos.length === 0, "G9: zero avisos de parsing"],
    [new Set(docs.map((d) => d.id_fonte)).size === docs.length, "G10: SeqDocumento unico por documento"],
    [docs.some((d) => d.orgao_emissor && d.orgao_emissor !== "STJ"), "G11: relator (NM_MINISTRO) preservado"],
  ];

  let f = 0;
  for (const [ok, t] of l) { console.log((ok ? "PASS   | " : "FAIL   | ") + t); if (!ok) f++; }
  console.log("TOTAL|" + l.length + "|" + f);
' 2>&1)

echo "$RES" | grep -E '^(PASS|FAIL)'
LINHA=$(echo "$RES" | grep '^TOTAL|')
TOTAL=$(echo "$LINHA" | cut -d'|' -f2)
FALHAS=$(echo "$LINHA" | cut -d'|' -f3)

echo "----------------------------------------"
if [ -z "$TOTAL" ]; then
  echo "GATE C0.10: ERRO — o extrator nao rodou"
  echo "$RES" | tail -6
  exit 2
fi
if [ "${FALHAS:-1}" -gt 0 ]; then
  echo "GATE C0.10: REPROVA — $FALHAS de $TOTAL"
  exit 1
fi
echo "GATE C0.10: PASSA — $TOTAL/$TOTAL"
exit 0
