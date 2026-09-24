# Evidência — Fase 6 · Enriquecimento controlado

Data: 2026-09-23  
Projeto remoto: `fzhlbwhdejumkyqosuvq`

Foi criado um fixture sintético isolado com lead, perfil, telefone e extração.
Como o perfil já possuía telefone, ele era inelegível para enriquecimento. Isso
permitiu testar o caminho de erro sem iniciar o Apify e sem consumir saldo.

Resultado:

```text
leads-operation: HTTP 409
mensagem: nenhum perfil elegível para enriquecimento
leads-operation-history: status=failed
cleanup: 0 registros restantes
```

Isso comprova a criação/fechamento de erro e a persistência do histórico. Ainda
não comprova o caminho `running → succeeded` do provedor externo. Por decisão
de produto, esse aceite fica deliberadamente diferido: exige crédito externo
do Apify e alteração assíncrona por webhook, e não faz parte do caminho crítico
deste loop.

## Diagnóstico do provedor

Uma chamada direta, com um único handle sintético e limpeza imediata do job,
confirmou que o bloqueio está fora do código da Edge Function:

```text
HTTP 200 do wrapper
error: Apify profile run start failed (403)
type: platform-feature-disabled
message: Too many outstanding invoices
run_id: null
```

Logo, o caminho `queued → failed` está comprovado e o bloqueio está fora da
Edge Function. `running → succeeded` será verificável em um gate operacional
posterior, depois que houver crédito no Apify.
