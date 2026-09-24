# Auditoria corrente do loop — Nova Prospecção Ativa

Atualizado em 2026-09-23. Este documento registra a auditoria final corrente.
O aceite externo do provedor foi diferido por decisão explícita de produto e
não é confundido com sucesso técnico.

| ID | Requisito verificável | Fase | Evidência atual | Estado |
|---|---|---:|---|---|
| C-01 | Harness continua com `derived_stage` como eixo vertical | 0–1 | preflight, regressão CAS e roster remoto | done |
| C-02 | Migration operacional idempotente, sem duplicidade física | 1 | migrations aplicadas/reaplicadas, preflight | done |
| C-03 | Writes da UI passam por Edge Functions | 2–3 | auditoria `NovaProspeccaoWorkspace`, smoke 401 | done |
| C-04 | Ingestão Prospectagram com preview, confirmação e erros por linha | 4 | `leads-import-profiles`, fixture E2E | done |
| C-05 | Mesmo telefone + handles diferentes formam 1 card/N perfis | 4–5 | fixture de importação/reprocessamento | done |
| C-06 | Base permite seleção individual/lote, triagem e remoção restaurável | 5 | fixture remoção/restauração + UI nova | done |
| C-07 | Histórico de operações permite cancelamento e retry | 5–6 | `leads-operation-history`, contrato `type`, build | done |
| C-08 | Enriquecimento real completa `running → succeeded → webhook` | 6 | contrato/backend, erro, histórico, limpeza e tentativa real documentados; Apify responde 403 por faturas pendentes | deferred_external |
| C-09 | Campanha aceita somente pré-selecionados elegíveis e sem duplicata | 7 | E2E `prepare`, target único e cleanup | done |
| C-10 | Campanha tem controle `active/paused` e histórico | 7 | `nova-campaign-control`, `nova-campaign-summary` | done |
| C-11 | Dashboard é rastreável às tabelas canônicas | 8 | reconciliação 36.668 cards + performance evidence | done |
| C-12 | Build e smoke de segurança das funções novas | 2–8 | Vite verde, 11/11 sem autenticação = 401 | done |
| C-13 | Aceitação/rollout e relatório final sem pendências de implementação | 9 | relatório final; C-08 explicitamente fora do caminho crítico por decisão de produto | done |

## Gate externo diferido

O teste real controlado alcançou a Edge Function e falhou antes de criar um
run do Apify:

```text
HTTP 200 do wrapper
Apify: HTTP 403
type: platform-feature-disabled
message: Too many outstanding invoices
run_id: null
```

O fixture, a extração e a operação sintéticas foram removidos; a consulta de
resíduos retornou zero. Por decisão explícita, não haverá regularização do
Apify neste loop. Depois da liberação de crédito, deve ser repetido somente
C-08, atualizando esta matriz. Nenhum outro item deve ser reaberto sem
evidência de regressão.
