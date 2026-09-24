# Evidência — reprocessamento e triagem operacional

Data: 2026-09-23

Fixture controlado criado e limpo automaticamente.

```text
phase4_5_reprocess_triage=passed
profiles=2
cards=1
removed=2
restored=2
cleanup=passed
```

O cenário prova que o reprocessamento passa pela Edge Function, preserva a
identidade compartilhada e mantém dois perfis/handles em um único card. A
triagem humana em lote alterou os dois perfis do card para `remocao_confirmada`
e a restauração retornou ambos à classificação anterior, sem apagar o card da
Base.
