## PARECER

O board v2 e o plano resolvem a contradição principal: **soft → REMARKETING não significa mais início automático de cadência**. O REMARKETING passa a ser uma gaveta de elegibilidade dormente, e os disparos `rmkt_t1/t2/t3` somente podem existir após um GO humano materializado em uma campanha.

A separação entre:

- módulo 05: elegibilidade e dormência;
- módulo 06: campanha autorizada, execução e esgotamento;

está conceitualmente correta e é indispensável. A arquitetura também separa adequadamente `soft_exit` de `rmkt_t2` e `hard_stop` de `cadence_exhausted`.

## APONTAMENTOS

1. **A correção da contradição está condicionada à implementação fail-closed.**  
   O GO não deve ser apenas flag booleana. Cada disparo precisa exigir uma campanha identificável e auditável, por exemplo:

   - `campaign_id`;
   - estado `prepared/approved/running/paused/stopped/completed`;
   - público ou snapshot autorizado;
   - autor e instante do GO;
   - associação explícita do lead à campanha.

   Sem `campaign_id` válido e campanha `running`, o resultado deve ser zero envio.

2. **`proactive_blocked` não deve ser removido globalmente pelo GO.**  
   A autorização deve ser limitada à campanha. Um GO para a campanha A não pode tornar o lead genericamente disponível para outros fluxos, campanhas ou first-contact.

3. **A ordem das fases precisa de um pequeno ajuste.**  
   A Fase 3 depende da triagem de respostas, opt-out, interesse e cancelamento hoje colocada na Fase 4. Recomendo antecipar para antes da campanha pelo menos o núcleo de `03-response-triage`:

   - classificação mínima de hard stop, interesse e demais respostas;
   - cancelamento atômico de jobs pendentes;
   - precedência de hard stop;
   - tratamento de mensagens ambíguas;
   - proteção contra corrida entre resposta e envio.

   Os demais contratos de first-contact e service-close podem continuar na Fase 4.

4. **Revalidação deve acontecer imediatamente antes de cada envio físico.**  
   Isso inclui cada uma das quatro bolhas do first-contact, não apenas o começo da janela de 180 segundos. Se houver resposta, opt-out, emergency stop ou mudança de elegibilidade entre bolhas, as restantes devem ser canceladas.

5. **Formalizar precedência e concorrência.**  
   Além da ordem dos gates, falta definir o comportamento quando eventos simultâneos ocorrem. A precedência recomendada é:

   `emergency_stop > hard_stop > resposta inbound > cancelamento/pausa da campanha > elegibilidade > envio`

   O check e a reserva do envio precisam evitar que dois workers enviem o mesmo touch.

6. **Definir exatamente os relógios da campanha.**  
   “24h + 6d” ainda admite interpretações. O contrato deve dizer:

   - de qual evento cada prazo é contado;
   - se t2 ocorre 24h ou 6 dias após t1;
   - se t3 ocorre 6 dias após t2;
   - timezone e calendário;
   - política para atraso de worker;
   - expiração máxima do touch;
   - se campanha pausada congela ou recalcula os prazos.

7. **As sub-gavetas vermelhas estão corretas, mas precisam de política de reentrada.**  
   Para outbound automático, as três podem produzir o mesmo bloqueio. Porém:

   - `hard_stop`: irrevogável automaticamente; somente procedimento autorizado pode alterar;
   - `cadence_exhausted`: não pode receber novo outbound apenas por entrar em outra campanha;
   - `closed_lost`: deve permanecer motivo comercial distinto;
   - deve ser definido se um novo inbound reabre `cadence_exhausted` ou `closed_lost`;
   - um inbound após `hard_stop` não deve apagar o hard stop implicitamente.

8. **“DNC terminal” precisa ter escopo explícito.**  
   Especificar se significa zero mensagem proativa, zero mensagem de qualquer tipo, ou se ainda permite resposta estritamente inbound/transacional. Isso evita conflito entre “terminal” e eventual contato iniciado pelo próprio lead.

9. **Goodbye ack deve ser reconhecido sem efeito colateral.**  
   Recomendo torná-lo evento terminal da conversa corrente: não reativa, não agenda, não conta como interesse e não modifica supressões.

10. **Critérios de maturidade M0–M4 ainda precisam ser definidos.**  
    O plano substitui F0–F7 por M0–M4, mas não apresenta os critérios objetivos de promoção, rollback e evidência de cada nível. Isso deve entrar na Fase 0.

11. **Os checks deveriam incluir propriedades negativas auditáveis.**  
    Além dos testes de fluxo feliz:

    - todo `rmkt_t*` possui `campaign_id` autorizado;
    - nenhum job de campanha nasce ao entrar no pool;
    - nenhum envio após opt-out ou resposta válida;
    - nenhum `cadence_exhausted` sem três tentativas efetivamente realizadas;
    - retries não duplicam bolhas ou touches;
    - emergency stop impede inclusive jobs já reservados;
    - hard stop não é limpo por reopen, inbound ou classificador.

12. **O board deve ser tratado como referência visual, não como especificação executável.**  
    `STATE-MACHINE.md` precisa resolver formalmente as ambiguidades de setas, temporizadores, guardas e reentrada. Esse documento será o contrato canônico testável.

## CONCLUSÃO

A arquitetura está coerente com a decisão do founder e corrige a ressalva central da revisão anterior. Pool e campanha estão corretamente separados, e a unificação visual de “não contatar” é compatível com motivos internos distintos.

A única inversão recomendada é trazer o núcleo de triagem, cancelamento e precedência da Fase 4 para antes da construção da campanha na Fase 3. Antes de executar a Fase 0, devem ser fechados principalmente: semântica auditável do GO, relógios, política de reentrada das sub-gavetas vermelhas, escopo de DNC, concorrência e critérios M0–M4.

Status: **APROVADO COM RESSALVAS**

Próximo passo recomendado: **executar a Fase 0 incorporando estes contratos e dividir a atual Fase 4, antecipando a triagem mínima necessária para a campanha antes da Fase 3.**