## PARECER

O redesign é conceitualmente correto e resolve a colisão crítica entre `R2/soft_exit` e `rmkt_t2`; porém, o board é um bom desenho de negócio, não ainda uma máquina de estados executável. Há uma contradição material entre “soft pause → REMARKETING” e a Lei1 recente de que soft-fechada fica inativa, com zero cold. O contrato pode ser aprovado somente após separar estados comerciais, supressões e temporizadores, preservando `hard_stop` exclusivamente para opt-out explícito.

## APONTAMENTOS

- **Soft exit ≠ Remarketing touch 2:** correto e deve virar lei imutável do glossário. `soft_exit` é uma ação/transição de encerramento; `rmkt_t2` é um envio da cadência. Não devem compartilhar nomes, métricas, flags ou handlers.

- **Contradição principal:** a invariante “Soft pause → soft exit → REMARKETING” viola a regra recente do founder se REMARKETING habilitar disparos proativos. O fluxo correto deve ser:
  `soft_pause → soft_exit_sent → proactive_blocked`.
  Somente uma resposta posterior com interesse pode gerar `reactivate → inbound_resume → service`.

- **Remarketing após soft pause:** deve ser expressamente proibido. Se “REMARKETING” for apenas uma classificação administrativa, renomear para não sugerir elegibilidade de envio. Caso represente cadência automática, remover essa transição.

- **Reativação:** os módulos 04–06 expressam a intenção correta, mas a fronteira entre eles precisa ser formalizada por eventos. `reactivate` deve nascer exclusivamente de inbound válido e nunca limpar automaticamente um `hard_stop`, criar novo first contact ou reenfileirar cold.

- **Soft pause e hard stop:** não são apenas etapas lineares; são políticas de elegibilidade. O dispatcher deve verificar `proactive_blocked`, `hard_stop`, Voice gate e Emergency stop no momento efetivo de cada envio, não apenas quando o job é agendado.

- **Silêncio após o terceiro touch não é hard opt-out:** o board conflita esgotamento de cadência com recusa explícita. Criar um estado como `cadence_exhausted` ou `closed_no_response`, com outbound bloqueado, mas sem registrar consentimento negativo inexistente.

- **“Sem interesse” também não implica hard stop:** deve resultar em `closed_lost`/`not_interested`, conforme política de retenção. `hard_stop` deve ser reservado a pedido explícito de não contato ou fundamento equivalente claramente definido.

- **Ruído:** falta contrato para classificação, confiança mínima, fallback humano, início/reinício da janela de 24h, múltiplas mensagens automáticas e resposta real tardia. Ruído não pode rearmar cadência indefinidamente.

- **Estados temporais ausentes:** representar explicitamente espera pós-primeiro contato, espera pós-ruído, espera de 24h após cada touch e intervalo de seis dias. Jobs precisam de idempotência, cancelamento por resposta/opt-out e validação de elegibilidade no disparo.

- **Fechamento incompleto:** separar `service_active`, `interest_confirmed`, `closing`, `payment_link_sent`, `payment_pending`, `paid/subscribed` e `onboarding`. Prever link expirado, pagamento falho/cancelado e confirmação idempotente por webhook.

- **Goodbye ack:** deve ser recepção passiva, sem disparo adicional nem reativação automática. Só conteúdo inbound semanticamente válido pode acionar `reactivate`.

- **Maturidade M0–M4 por módulo:** melhoria correta. Cohort e maturidade, porém, são dimensões diferentes; manter identificador estável da coorte e tamanho/configuração separados, em vez de codificar apenas S/M/L.

- **Voice gate e Emergency stop:** devem permanecer controles independentes, com precedência documentada e comportamento fail-closed. Maturidade M2 não pode contornar Voice OFF.

- **Cutover C1→C2→C3:** há risco de drift entre aliases, flags antigas/novas, dashboards e estados persistidos. Definir um nome canônico, adaptadores somente nas bordas, precedência de flags, telemetria de uso legado, testes de equivalência, rollback e critério objetivo para remover aliases. Evitar dual-write sem reconciliação.

- **Agentes na seleção/triagem:** a revisão de segurança acrescenta como requisito least privilege, trilha de auditoria e validação determinística antes de alterar elegibilidade, consentimento ou realizar envios. Saída de Cursor/Codex/Claude deve ser tratada como recomendação não confiável, nunca como autorização autônoma para contato ou supressão permanente.

- **Contrato mínimo antes de docs/código:** publicar enumeração de estados, eventos, tabela completa de transições, precedência das supressões, semântica dos timers, cancelamentos, invariantes e estados terminais. O diagrama sozinho não é especificação suficiente.

## CONCLUSÃO

Status: APROVADO COM RESSALVAS

Próximo passo recomendado: corrigir primeiro o contrato para remover `soft_pause → remarketing`, separar `hard_stop` de `cadence_exhausted/closed_lost` e aprovar uma tabela de estados/eventos/transições com timers e precedência dos gates; somente depois executar C1, mantendo C2 e C3 bloqueados até testes de equivalência e rollback estarem definidos.