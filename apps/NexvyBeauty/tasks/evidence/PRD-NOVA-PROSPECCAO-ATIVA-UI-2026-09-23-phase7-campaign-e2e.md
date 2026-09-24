# Evidência — campanha e targets

Data: 2026-09-23

Fixture controlado criado e limpo automaticamente:

```text
importação Prospectagram → preselection → campaign-create → campaign-prepare
stage=preselected
targets=1
repeat_idempotent=verified
cleanup=passed
```

O segundo `nova-campaign-prepare` não criou target duplicado. O lead foi
removido apenas no cleanup do fixture; em operação normal ele continua na Base
e a campanha é somente uma relação operacional.
