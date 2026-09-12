# PRD-06 — Brain comercial e verdade determinística

## Objetivo

Conduzir a lead da abertura ao pagamento com contexto correto e sem permitir
que o modelo invente fatos comerciais.

## Jornada

`abertura → diagnóstico → valor → demonstração → objeções → checkout → pagamento → onboarding`

## Pré-condições do turno

- Lead e owner resolvidos.
- Ficha canônica carregada e versionada.
- Histórico e estado coerentes.
- Estratégia ativa válida.
- Reservation disponível quando houver envio.

## Controles de código

- Preço e checkout devem pertencer ao conjunto atual carregado do banco.
- Input opaco recebe clarificação determinística.
- No máximo duas bolhas, sem fragmento truncado.
- Não reapresentar, repetir promessa ou usar nome genérico.
- Auto-reply não dispara conversa comercial.
- Fatos só são extraídos de mensagens da lead ou fontes identificadas.
- Decisão de compra envia o checkout correto; não transfere à Duda/Bia.

## Casos de aceitação

Pix/adiantamento, cancelamento, “é robô?”, preço, humano, áudio, silêncio,
auto-reply, histórico longo, objeção, decisão e pagamento.

## Check binário

PASS se a rubrica comercial e os testes adversariais estiverem verdes; houver
zero preço/link falso; cada resposta usar a ficha; os fatos persistidos forem
relidos no turno seguinte; e nenhum caso produzir texto truncado ou repetição.

## Rollback

Voltar à versão estável da estratégia, manter release state `OFF` e preservar
ledger/ficha para diagnóstico.
