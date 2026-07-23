#!/usr/bin/env bash
# ============================================================================
# GATE do card C0.9 — ingestão do CNJ (atos.cnj.jus.br/api/atos)
#
# Critério: atos com origem_extracao='api', confiança 1.0, situação espelhada
# da fonte, e relações normativas SÓ quando a ementa nomeia o ato referenciado.
#
# Roda OFFLINE, contra fixtures/cnj/*.json. Não chama a API e não escreve nada.
#
#   ./scripts/test-ingest-cnj.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$HERE/fixtures/cnj"

[ -d "$FIXTURES" ] || { echo "ERRO: fixtures ausentes em fixtures/cnj/"; exit 2; }
ls "$FIXTURES"/*.json >/dev/null 2>&1 || { echo "ERRO: nenhum .json em fixtures/cnj/"; exit 2; }

echo "=== GATE C0.9 — ingestão CNJ (offline, sobre fixtures) ==="

RES=$(cd "$HERE" && node --input-type=module -e '
  import { readdir, readFile } from "node:fs/promises";
  import { resolverParser } from "./src/services/ingest/registry.mjs";
  const p = await resolverParser("cnj-atos");
  const dir = "fixtures/cnj";
  const arqs = (await readdir(dir)).filter((f) => f.endsWith(".json"));

  const atos = [], relacoes = [], avisos = [];
  for (const f of arqs) {
    const json = JSON.parse(await readFile(dir + "/" + f, "utf8"));
    const r = p.extrairDeJson(json);
    atos.push(...r.atos); relacoes.push(...r.relacoes); avisos.push(...r.avisos);
  }

  const SIT = new Set(["Vigente", "Alterado", "Revogado", "Exaurido"]);
  const TIPOS_REL = new Set(["altera","revoga","revoga_parcialmente","regulamenta","suspende","repristina","cria"]);
  const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

  const linhas = [
    [arqs.length > 0, "G1: fixtures carregadas (" + arqs.length + " arquivo[s])"],
    [atos.length > 0, "G2: atos extraidos (" + atos.length + ")"],
    [atos.every((a) => a.origem_extracao === "api"), "G3: origem_extracao = api em todos (sem IA)"],
    [atos.every((a) => a.confianca_extracao === 1.0), "G4: confianca = 1.0 em todos"],
    [atos.every((a) => a.id_fonte && a.url_fonte), "G5: todo ato tem id_fonte e url_fonte (reingestao idempotente)"],
    [atos.every((a) => ISO.test(a.data_publicacao ?? "")), "G6: data_publicacao em ISO AAAA-MM-DD"],
    [atos.every((a) => !a.situacao_fonte || SIT.has(a.situacao_fonte)), "G7: situacao_fonte so com valores da fonte"],
    [new Set(atos.map((a) => a.situacao_fonte)).size >= 3,
      "G8: cobertura de situacoes (" + [...new Set(atos.map((a) => a.situacao_fonte))].join("/") + ")"],
    [relacoes.length > 0, "G9: relacoes normativas extraidas (" + relacoes.length + ")"],
    [relacoes.every((r) => r.proposta_por === "fonte"), "G10: toda relacao com proposta_por = fonte (nao e palpite de IA)"],
    [relacoes.every((r) => TIPOS_REL.has(r.tipo)), "G11: tipo de relacao dentro do dominio do schema"],
    [relacoes.every((r) => r.evidencia && r.evidencia.length > 10), "G12: toda relacao carrega evidencia verbatim"],
    [relacoes.every((r) => r.ato_origem_id_fonte !== r.norma_destino_id_fonte), "G13: nenhuma relacao aponta para si mesma"],
    [avisos.some((a) => a.includes("CITA")), "G14: citacoes descartadas, nao viraram relacao falsa"],
    [p.referenciaEhAlvo("Portaria n. 158, de 22 de outubro de 2019", "Altera a Portaria Presidencia no 158/2019"),
      "G15: casamento aceita o alvo correto"],
    [!p.referenciaEhAlvo("Recomendacao n. 38, de 3 de novembro de 2011", "Altera a Portaria Presidencia no 158/2019"),
      "G16: casamento REJEITA ato apenas citado"],
    [!p.referenciaEhAlvo("Portaria n. 158, de 4 de junho de 2021", "Altera a Portaria Presidencia no 158/2019"),
      "G17: casamento distingue mesmo numero em anos diferentes"],
    [p.tipoDaRelacao("Institui o comite tal") === null, "G18: verbo sem relacao normativa nao inventa tipo"],
  ];

  let falhas = 0;
  for (const [ok, txt] of linhas) {
    console.log((ok ? "PASS   | " : "FAIL   | ") + txt);
    if (!ok) falhas++;
  }
  console.log("TOTAL|" + linhas.length + "|" + falhas);
' 2>&1)

echo "$RES" | grep -E '^(PASS|FAIL)'
LINHA=$(echo "$RES" | grep '^TOTAL|')
TOTAL=$(echo "$LINHA" | cut -d'|' -f2)
FALHAS=$(echo "$LINHA" | cut -d'|' -f3)

echo "----------------------------------------"
if [ -z "$TOTAL" ]; then
  echo "GATE C0.9: ERRO — o extrator nao rodou"
  echo "$RES" | tail -6
  exit 2
fi
if [ "${FALHAS:-1}" -gt 0 ]; then
  echo "GATE C0.9: REPROVA — $FALHAS de $TOTAL"
  exit 1
fi
echo "GATE C0.9: PASSA — $TOTAL/$TOTAL"
exit 0
