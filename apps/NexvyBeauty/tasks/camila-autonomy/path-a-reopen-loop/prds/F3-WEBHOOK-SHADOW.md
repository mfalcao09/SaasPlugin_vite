# PRD-10 / F3 — Webhook SHADOW

## Objetivo

Ligar a ordem runtime (classificar antes de mutar) em modo shadow: grava decisão, **não** aplica reopen enforce e **não** envia.

## Entregáveis

1. Resolver conversa canônica sem mutação de status no path protegido.
2. Persistir decisão canônica (`inbound_message_id`, `classifier_version`, class, reason).
3. `REOPEN_INTENT_V1_MODE=shadow` (allowlist interna / config de teste).
4. Cold engine consome a mesma decisão (sem segundo classificador divergente).
5. Fail-closed se classificar/transicionar falhar em closed protegido.
6. Replay B1–B7 sintético sem provider.
7. Relatório de divergência shadow vs contenção emergencial.

## Loop engineering (autônomo)

### Protocolo do agente
1. Implementar wiring webhook + cold para decisão única.
2. Deploy **apenas** se o fluxo do repo permitir edge shadow sem enforce (senão: testes de integração locais + evidência).
3. Rodar replay `verify_f3_shadow.py`.
4. Assert `path_a_sends == 0` no período.
5. Gravar `F3-result.json` + `F3-divergence.json`.

### Check binário
PASS se:
1. B1–B7 replay exit 0;
2. `path_a_sends=0`;
3. divergências críticas farewell/hard = 0 inexplicadas;
4. emergência ainda impede reopen enforce fora de shadow.

### Evidência
`F3-result.json`, logs de decisão shadow (redigidos).

### Rollback
`REOPEN_INTENT_V1_MODE=off` imediato.

### Stop / escalate
Qualquer send atribuível ao Path A → kill + ESCALATE.
