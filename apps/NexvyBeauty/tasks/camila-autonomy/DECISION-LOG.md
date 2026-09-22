# Camila Autônoma — Decision Log

## Decisões travadas

1. Nenhum lead real antes do Master Gate integralmente verde.
2. Correção incremental sobre o sistema atual, sem rewrite V2.
3. PRD mestre e PRDs por frente em PRs empilhadas, uma por vez.
4. Safety Kernel e Action Ledger são a única autoridade de envio.
5. Paid conversion por intention-to-treat é a north star.
6. Estratégia, sequência, tom e cadência podem ser auto-promovidos dentro do
   kernel.
7. Preço/link, identidade, consentimento, canal, hard caps, métricas, histórico
   e kill-switch só mudam por PR humano.
8. Holdout, separação de autoridade e fail-closed são bloqueantes.
9. Cinco leads nunca são amostra suficiente para auto-promoção.

10. Canário invertido: **15%** recebem a estratégia nova; **85%** ficam na estável
   (Marcelo, 2026-09-13). Promoção só se a nova for mais efetiva: maior assertividade
   (confirmações tipo "acertou"/"é isso" vs correções "não é isso") **e** maior
   % de fechamento/assinatura.

## Alternativas descartadas

- Camila V2 paralela: maior tempo e duplicação.
- Estabilização e aprendizado em programas separados: adia o objetivo central.
- Aprendizado irrestrito: permite reward hacking sobre segurança.
- Métrica de reply rate: incentiva volume e insistência.
- Reutilizar `lead_semantic_memory`: tabela é organization-scoped, incompatível
  com o CRM de plataforma.

## Owners

- Product/release owner: Marcelo.
- Safety Kernel: alteração apenas por PR e aprovação humana.
- Learning Controller: geração e promoção dentro do kernel.
- Evaluador independente: veto técnico aos gates.

11. E2E path **A→B** (Marcelo 2026-09-13): Fase A sintética primeiro; Fase B número controlado só com GO explícito.
