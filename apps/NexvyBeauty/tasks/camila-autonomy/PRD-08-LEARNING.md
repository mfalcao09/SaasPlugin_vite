# PRD-08 — Learning Controller e auto-promoção

## Objetivo

Aprender com várias leads e promover automaticamente estratégias melhores sem
permitir que o sistema altere sua própria constituição.

## Espaço aprendível

- Estratégia comercial.
- Ordem dos beats.
- Tom e forma.
- Cadência dentro dos limites do kernel.

Preço, link, identidade, opt-out, canal, hard caps, métricas, histórico e
kill-switch não são aprendíveis.

## Arquitetura

- Estratégias imutáveis e versionadas.
- Experimentos e assignment estável.
- Holdout permanente.
- Exposição ligada ao Action Ledger e contada após entrega.
- Pagamento atribuído pelos journey/payment events.
- Promoções e rollbacks em transação.
- Learning Controller sem permissão para editar kernel, pagamentos ou eventos.

## Pipeline

`candidate → replay → red-team → shadow → canary → evaluate → promote/rollback`

## Métrica

North star: paid conversion por intention-to-treat. Toda lead admitida permanece
no denominador.

Piso inicial: 100 entregas e 5 pagamentos por variante, 14 dias completos.
Promoção requer probabilidade bayesiana mínima de 95% de ganho e nenhum
guardrail eliminatório.

## Segurança

- Uma violação de preço, identidade, consentimento, canal, ficha ou limite
  desativa a candidata.
- Dados ausentes impedem promoção.
- LLM-as-judge é diagnóstico, nunca autoridade.
- O avaliador e a RPC de promoção são independentes do gerador.

## Check binário

PASS se reward hacking e alteração do kernel forem rejeitados; holdout,
attribution e intention-to-treat permanecerem íntegros; e promoção/rollback
forem idempotentes sob concorrência.

## Rollback

Ativar transacionalmente a última versão estável e congelar novos experimentos.
