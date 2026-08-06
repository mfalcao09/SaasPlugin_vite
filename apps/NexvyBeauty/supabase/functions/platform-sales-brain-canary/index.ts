/**
 * CANARY do platform-sales-brain — alvo do eval, NUNCA de lead real.
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────────
 * O harness do eval invoca o cérebro por HTTP, e só existia UMA instância dele: a
 * de produção. Isso criava um paradoxo — medir uma mudança exigia colocá-la no ar
 * antes de medir. Este canary quebra o paradoxo: o PR-B roda aqui, o eval aponta
 * pra cá, e `platform-sales-brain` segue intocado atendendo lead de verdade.
 *
 * ── POR QUE É UM IMPORT, E NÃO UMA CÓPIA ───────────────────────────────────────
 * Cópia de arquivo cria DRIFT: em duas semanas o canary estaria medindo um código
 * que produção não roda mais, e o placar viraria ficção — exatamente o "verde oco"
 * que a Controladora achou nos goldens da Bia (cenário não-executado passando 4/4).
 * Importando, canary e produção são o MESMO bytecode. Divergir é impossível.
 *
 * O brain chama `Deno.serve()` no topo do módulo, então este import já registra o
 * handler. Não há nada a exportar nem a envolver.
 *
 * ── O QUE GARANTE QUE ELE NÃO TOCA LEAD REAL ───────────────────────────────────
 * 1. NINGUÉM aponta pra cá: nenhum webhook, nenhum cron, nenhum hand-back. A única
 *    entrada é uma chamada HTTP explícita do harness.
 * 2. O hand-back é AUTO-REFERENTE (platform-sales-brain/index.ts, `selfFn`): ele
 *    descobre o próprio nome pela URL da requisição. Se fosse o nome hardcoded, o
 *    2º salto de todo teste cairia no brain de PRODUÇÃO e mediria a função errada.
 * 3. O eval usa conversas efêmeras (prefixo `wa:eval-`) e telefone que não entrega.
 *
 * ⚠️ ELE NÃO É "ISOLADO" — correção da Controladora GO-LIVE, aceita:
 * o canary é isolado de ENTREGA e de ROTEAMENTO, **não de BANCO**. Ele escreve nas
 * tabelas REAIS de produção (platform_crm_conversations, platform_crm_messages),
 * nas linhas que o próprio eval cria. Se o PR-B tiver bug de escrita, ele grava
 * `conversation_state` errado em linha real — hoje contido porque a coluna ainda não
 * tem consumidor em produção, mas a contenção é circunstancial, não estrutural.
 * Chamar isto de "ambiente isolado" seria o tipo de garantia que tem a FORMA da
 * garantia sem a garantia.
 *
 * ── QUANDO APAGAR ──────────────────────────────────────────────────────────────
 * Assim que o PR-B for promovido pra produção com placar na mão. Canary que fica
 * vivo depois da decisão vira superfície esquecida — e superfície esquecida é onde
 * mora a próxima vulnerabilidade.
 */
import '../platform-sales-brain/index.ts';
