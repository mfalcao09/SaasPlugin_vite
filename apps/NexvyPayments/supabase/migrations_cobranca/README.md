# migrations_cobranca/ — esteira do núcleo de cobrança (NexvyPayments)

Espelha o padrão `migrations_salao/` do Beauty: TODA tabela/função/trigger do domínio
de cobrança (payers, contracts, invoices, invoice_items, billing_*, outbox pgmq)
nasce AQUI — multi-tenant, `organization_id` obrigatório, RLS canônica (blueprint §3).

Disciplina D1'/A7 (hard fork gerenciado):
- ADITIVO: nunca ALTER/DROP em tabela do core Vendus sem entrada no docs/CORE-DELTA.md.
- Aplicação em produção: MODO-B por lote com runbook + gate humano no 1º lote da fase.
- Invariante verificado no A7: nenhuma tabela de cobrança fora desta pasta.
