#!/usr/bin/env python3
"""F0 binary verify — Path A contract artifacts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

NEXVY = Path(__file__).resolve().parents[4]
EVID = NEXVY / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
CAMILA = NEXVY / "tasks/camila-autonomy"
PATH_A_DOCS = [
    EVID / "glossary-v1.json",
    EVID / "corpus-v1.json",
    EVID / "baseline-emergency.json",
    EVID / "checks-b1-b7.md",
    CAMILA / "RULE-OPT-OUT-REMARKETING.md",
    CAMILA / "LEARNING-CASE-JOICE-OPT-OUT.md",
    CAMILA / "PRD-10-PATH-A-REOPEN-MASTER.md",
    CAMILA / "evidence/PRD-09/PHASES-PATH-A-OPTION-B.md",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    missing = [str(p) for p in PATH_A_DOCS if not p.exists()]
    if missing:
        fail(f"missing files: {missing}")

    glossary = json.loads((EVID / "glossary-v1.json").read_text())
    pol = glossary.get("policy") or {}
    if pol.get("q2_farewell_window_hours") != 48:
        fail("Q2 != 48")
    if pol.get("q4_r2_timing") != "after_reopen_canary":
        fail("Q4 not after_reopen_canary")
    if pol.get("option") != "B":
        fail("option != B")
    if not pol.get("reopen_liberates_soft_cold"):
        fail("reopen_liberates_soft_cold missing")

    corpus = json.loads((EVID / "corpus-v1.json").read_text())
    cases = corpus.get("cases") or []
    by_id = {c["id"]: c for c in cases}
    for cid, exp in [
        ("joice-pode-deixar", "farewell_ack"),
        ("joice-obrigada", "farewell_ack"),
        ("reopen-mudei", "reopen_intent"),
        ("opt-pare", "opt_out_again"),
    ]:
        if cid not in by_id or by_id[cid].get("expected") != exp:
            fail(f"corpus case {cid}")

    checks = (EVID / "checks-b1-b7.md").read_text().lower()
    if "revogad" not in checks:
        fail("B3 must require soft revoked")
    if "queued" not in checks:
        fail("B3 must mention queue not queued")

    rule = (CAMILA / "RULE-OPT-OUT-REMARKETING.md").read_text()
    if "Path A" not in rule or "48h" not in rule:
        fail("RULE missing Path A / 48h")
    soft_neg = ("Não é" in rule or "não é" in rule.lower()
                 or "**Não** é" in rule or "nao e" in rule.lower()
                 or "Camila muda para sempre" in rule and ("**Não**" in rule or "não" in rule.lower()))
    if not soft_neg:
        fail("RULE must negate forever-mute for soft")

    learning = (CAMILA / "LEARNING-CASE-JOICE-OPT-OUT.md").read_text()
    if "Path A" not in learning:
        fail("LEARNING missing Path A section")

    out = {
        "status": "pass",
        "files": [str(p.relative_to(NEXVY)) for p in PATH_A_DOCS],
        "corpus_counts": len(cases),
        "policy": pol,
    }
    (EVID / "F0-result.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print("F0_PASS", json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
