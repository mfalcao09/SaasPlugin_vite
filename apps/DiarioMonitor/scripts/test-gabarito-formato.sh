#!/usr/bin/env bash
# ============================================================================
# GATE do card C1.1a — pré-anotação do gabarito (PRD v2.1 §9)
#
# Critério binário: "20 .expected.json gerados em fixtures/, marcados
# validado: false".
#
# Valida FORMATO e SANIDADE — não julga se a anotação está semanticamente
# correta: isso é o C1.1b (Marcelo + AGDM). O gate garante que o humano receba
# material íntegro para validar.
#
#   ./scripts/test-gabarito-formato.sh
# Saída: 0 se passa, 1 se reprova.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$HERE/fixtures/edicoes"
MINIMO=20

echo "=== GATE C1.1a — formato do gabarito ==="

PDFS=$(find "$FIX" -name '*.pdf' | wc -l | tr -d ' ')
JSONS=$(find "$FIX" -name '*.expected.json' | wc -l | tr -d ' ')

if [ "$JSONS" -ge "$MINIMO" ]; then
  echo "PASS   | G1: $JSONS gabarito(s) — mínimo $MINIMO"
else
  echo "FAIL   | G1: apenas $JSONS gabarito(s), mínimo $MINIMO"; exit 1
fi

if [ "$JSONS" -eq "$PDFS" ]; then
  echo "PASS   | G2: 1 gabarito por fixture ($PDFS PDFs)"
else
  echo "FAIL   | G2: $PDFS PDFs mas $JSONS gabaritos — falta anotar"; exit 1
fi

python3 - "$FIX" <<'PY'
import json, sys, pathlib, re
fix = pathlib.Path(sys.argv[1])
falhas = []
nao_validados = 0
total_atos = total_rel = 0
fontes = set()

for p in sorted(fix.glob('*.expected.json')):
    try:
        d = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        falhas.append(f"{p.name}: JSON invalido ({e})"); continue

    for campo in ('$schema','fonte','edicao','data_publicacao','validado','atos','arquivo'):
        if campo not in d:
            falhas.append(f"{p.name}: falta o campo '{campo}'")

    if d.get('validado') is not False:
        falhas.append(f"{p.name}: validado deveria ser false, veio {d.get('validado')!r}")
    else:
        nao_validados += 1

    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(d.get('data_publicacao',''))):
        falhas.append(f"{p.name}: data_publicacao fora do ISO AAAA-MM-DD")

    if not (fix / d.get('arquivo','')).exists():
        falhas.append(f"{p.name}: aponta para fixture inexistente '{d.get('arquivo')}'")

    fontes.add(d.get('fonte'))
    atos = d.get('atos', [])
    total_atos += len(atos)
    total_rel += len(d.get('relacoes_sugeridas', []))

    if d.get('total_atos') != len(atos):
        falhas.append(f"{p.name}: total_atos={d.get('total_atos')} mas ha {len(atos)} atos")

    ano_edicao = int(str(d.get('data_publicacao','0000'))[:4])
    for a in atos:
        for campo in ('tipo','numero','ano'):
            if a.get(campo) in (None, ''):
                falhas.append(f"{p.name}: ato sem '{campo}' — heuristica nao deve emitir ato incompleto")
        # Sanidade: ato PUBLICADO nesta edicao nao pode ser de ano anterior.
        # Ano antigo = citacao no corpo, que pertence a relacoes_sugeridas.
        if isinstance(a.get('ano'), int) and a['ano'] < ano_edicao:
            falhas.append(f"{p.name}: ato {a.get('tipo')} {a.get('numero')}/{a['ano']} "
                          f"anterior a edicao ({ano_edicao}) — provavel citacao classificada como ato")
        if a.get('data_ato') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(a['data_ato'])):
            falhas.append(f"{p.name}: data_ato fora do ISO em {a.get('numero')}")

def ok(pred, msg_ok, msg_fail):
    print(f"PASS   | {msg_ok}" if pred else f"FAIL   | {msg_fail}")

ok(not any('validado'   in f for f in falhas), f"G3: {nao_validados} gabarito(s) com validado:false", "G3: gabarito com validado != false")
ok(not any('falta o campo' in f for f in falhas), "G4: schema completo em todos", "G4: campo obrigatorio ausente")
ok(not any('ISO'        in f for f in falhas), "G5: datas em ISO AAAA-MM-DD", "G5: data fora do padrao ISO")
ok(not any('inexistente' in f for f in falhas), "G6: todo gabarito aponta para fixture existente", "G6: gabarito orfao")
ok(not any("sem '"      in f for f in falhas), "G7: nenhum ato incompleto (tipo/numero/ano)", "G7: ato com campo obrigatorio vazio")
ok(not any('provavel citacao' in f for f in falhas), "G8: nenhuma citacao classificada como ato publicado", "G8: citacao de norma antiga virou ato")

print("----------------------------------------")
print(f"cobertura: {len(fontes)} fonte(s) [{', '.join(sorted(x for x in fontes if x))}] · "
      f"{total_atos} atos · {total_rel} relacoes sugeridas")

if falhas:
    print(f"\nGATE C1.1a: REPROVA — {len(falhas)} problema(s):")
    for f in falhas[:12]:
        print(f"  · {f}")
    sys.exit(1)
sys.exit(0)
PY
RC=$?

echo "----------------------------------------"
if [ "$RC" -ne 0 ]; then echo "GATE C1.1a: REPROVA"; exit 1; fi
echo "GATE C1.1a: PASSA — 8/8"
exit 0
