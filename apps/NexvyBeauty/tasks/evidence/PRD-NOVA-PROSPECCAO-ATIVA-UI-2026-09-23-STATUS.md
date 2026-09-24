# Checkpoint do loop — Nova Prospecção Ativa

Atualizado em 2026-09-23 — loop concluído no escopo aprovado; aceite externo
do Apify diferido por decisão explícita de produto.

Alvo remoto canônico confirmado: projeto Supabase `fzhlbwhdejumkyqosuvq`
(NexvyBeauty, usado pelo `.env` da aplicação). Deployments temporários feitos
por engano no projeto `kozjhaenymvvxckylofn` (NexvyProspecta) foram removidos;
nenhuma função da nova prospecção permanece naquele projeto.

| Fase | Status | Evidência |
|---|---|---|
| 0 Contratos e proteção | done | contratos existentes, testes de identidade/triagem e preservação das rotas legadas |
| 1 Migration mínima | done | `20260923_prospeccao_operational_layer.sql`, teste estrutural, aplicação idempotente, preflight e regressão transacional do Harness |
| 2 Edge Functions | done | `leads-operation` e `leads-operational-snapshot` compiladas, deployadas e smoke 401 |
| 3 Casca da nova UI | done | grupo `Nova Prospecção Ativa` com 5 entradas no registry; `npm run build` verde |
| 4 Ingestão + triagem | done | preview antes da confirmação, chamada canônica, erro por linha, histórico e reprocessamento; fixtures E2E passaram com 2 perfis → 1 card/2 handles |
| 5 Base de Leads | done | snapshot, cards, múltiplos handles, seleção individual/lote, triagem humana em lote, remoção/restauração, pré-seleção, detalhe expansível, filtros e histórico operacional por card; fixture E2E de remoção/restauração passou |
| 6 Enriquecimento | done + deferred_external | operação inicia `leads-import-handles` via backend, webhook fecha operação, histórico permite cancelar/reexecutar; `queued → failed` e limpeza comprovados; `running → succeeded` fica como aceite operacional futuro por falta de crédito Apify (`403 platform-feature-disabled: Too many outstanding invoices`) |
| 7 Campanhas & disparos | done | prepare valida `derived_stage`, supressão e deduplicação; criação grava `product_id`; controle server-side `active → paused`; histórico visual via `nova-campaign-summary`; E2E controlado e cleanup aprovados |
| 8 Dashboard | done | inventário, telefone, triagem, supressão, operações, campanhas e estágios reconciliados com queries canônicas; leitura paginada otimizada por índices aditivos |
| 9 Aceitação e rollout | done | matriz final, evidências, build, smoke, E2Es e pendência externa explicitamente encaminhada |

## Métricas verificadas até este checkpoint

- migration reaplicada sem erro;
- 0 duplicidades por `(product_id, phone)` no preflight;
- 36.668 cards no snapshot após migration;
- 0 operações sintéticas ativas;
- estágios Harness preservados: `db=36.647`, `remarketing_pool=14`, `service=1`, `do_not_contact=6`;
- teste controlado do Harness revertido: 0 linha residual;
- novas Edge Functions sem autenticação: 401;
- `nova-campaign-prepare` sem autenticação: 401;
- `nova-campaign-create` sem autenticação: 401;
- build Vite: verde;
- `deno check` das novas EFs: verde;
- teste estrutural da migration: 4/4 verde (inclui constraint de origens Prospectagram).
- teste determinístico de identidade/triagem: 5/5 verde;
- snapshot remoto NexvyBeauty: 36.668 cards; `db=36.647`, `remarketing_pool=14`, `service=1`, `do_not_contact=6`, operações ativas=0;
- snapshot remoto confirmou cards com `profile_count > 1`, com handles distintos e o mesmo telefone agrupados no mesmo card;
- tentativa inicial via chave JWT legada: 401, sem write; runner corrigido para JWT temporário de super_admin e E2Es concluídos.
- E2E de importação corrigido e aprovado: 2 perfis → 1 card/2 handles, cleanup aprovado;
- E2E de campanha aprovado: `preselected` → rascunho → 1 target, repetição sem duplicata, cleanup aprovado;
- migration aditiva de origens aplicada: `prospectagram` passou a ser aceito sem remover `instagram`.
- resolver corrigido: novos cards importados entram em `derived_stage=db`, evitando `stage=null` e habilitando a pré-seleção canônica.
- build Vite final após a correção: verde (`2m25s`, warnings de chunks já existentes).
- reprocessamento + triagem em lote: 2 perfis → 1 card, remoção/restauração 2/2, cleanup aprovado;
- `nova-campaign-control` compilada, deployada e escrita exclusivamente server-side;
- build Vite após reprocessamento, triagem e controle de campanha: verde (`2m07s`, warnings de chunks já existentes).
- onze Edge Functions operacionais publicadas no projeto `fzhl...`; smoke sem autenticação: 11/11 retornaram 401;
- migrations canônica, operacional e de origens aplicadas no projeto `fzhl...`; consulta de sanidade: 36.668 cards e 0 operações ativas;
- preview/confirmar da ingestão e resultado por linha adicionados à nova UI; build subsequente verde.
- fixture controlado no projeto `fzhl...` confirmou `prepare=200`, `eligible=1`, `inserted=1`, transições `campaign → active → paused` e cleanup aprovado.
- leitura paginada do snapshot otimizada: aproximadamente `0,55s` para 5 cards após os índices; métricas reconciliadas em `...performance.md`.
- `leads-operation-history` compilada, deployada e smoke sem autenticação retornou `401`; a UI consulta o histórico sob demanda no card expandido.
- contrato do histórico corrigido para expor `type` além de `operation_type`, habilitando retry na UI; build e redeploy verdes.
- Fase 6 controlada: fixture inelegível retornou `409`, operação foi registrada como `failed`, histórico confirmou o status e a limpeza deixou `0` registros sintéticos; o caminho real do provedor permanece explicitamente aberto em `...phase6-enrichment-control.md`.
- Diagnóstico real do provedor: wrapper respondeu `HTTP 200` com `run_id=null` porque o Apify recusou o início com `403 platform-feature-disabled`; job sintético removido, sem resíduo.
- Decisão de escopo: não regularizar crédito/faturamento do Apify neste loop; o aceite real `running → succeeded → webhook` foi encaminhado como gate operacional futuro, sem reabrir as fases entregues.

## Encaminhamento pós-loop

Após liberação de crédito do Apify, executar somente o fixture real de
enriquecimento, confirmar `running → succeeded → webhook`, conferir atualização
do perfil e limpar o fixture. Essa verificação não reabre o contrato, a
migration, a UI ou as demais fases sem evidência de regressão.
