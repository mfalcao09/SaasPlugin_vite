# Análise — Memória, Inteligência e Sync Mac→VPS

> **Data:** 2026-07-07 · **Autor:** Claude (Fable 5) a pedido de Marcelo · **Grounding:** varredura por subagente Sonnet nos memos + logs + launchd + settings.json (fatos "verificados" têm prova direta; "declarados" vêm de memo sem re-checagem no KVM4).

---

## Resposta desconfortável primeiro

**O sync Mac→VPS que você quer JÁ EXISTE e estava funcionando hoje.** Verificado nesta data:

- `cerebro_sync.sh` (launchd `com.marcelo.cerebro-sync`): rsync incremental de `projects/*.jsonl` + `memory/*.md` + `workstreams/` → KVM4 a cada 6h. Logs OK em 05, 06 e 07/07 (1 falha de rede em 06/07, auto-recuperada na janela seguinte).
- `cerebro_push_session.sh` (hooks **Stop** e **SessionEnd**, `settings.json:72,162`): push em **tempo real** do JSONL da sessão → `POST /v1/memory/ingest` no KVM4. Log com `"persisted":true` até 18:16 de hoje.

"Salvou no PC = sync com a VPS" **está de pé** para as três fontes que importam. O cansaço não vem de o sync não existir — vem de três outras causas, mapeadas abaixo.

---

## Por que parece que nunca termina (diagnóstico)

1. **O plano é maior que a necessidade.** O ADR 8-layer (2026-05-20) empilha Notion↔Supabase sync, pgvector `ecosystem_memory`, Cognee, Supermemory, MetaMCP, Composio, Sim Studio — **7 sprints inteiros em estado `proposed`**, Edge Functions criadas e nunca deployadas, 4 decisões (D-Roadmap-1..4) paradas esperando você. Cada retomada reabre a obra inteira em vez de fechar um cômodo.
2. **Índices duplicados sem fonte-de-verdade eleita.** Dois vetoriais paralelos (vindex Mac 464MB + cérebro KVM4) e três memórias semânticas (`memory/*.md`, Notion, Supabase). O drift é estrutural: quando dois lugares guardam o mesmo, um sempre está errado.
3. **"Pronto" não é verificável — o gap é EVALS.** Seu próprio memo (walkinglabs 07-02) declara: *"Nenhum eval em produção… nem golden queries do RAG"*. Consequências reais encontradas: memo dizia "9k+ sessões" no índice quando 7.833 eram lixo `_tools/` (só 1.360 sessões reais); memos do KVM4 descrevem Hermes rodando enquanto sua memória de 07-07 registra "não deployado". **Sem eval, nada *parece* pronto mesmo quando está — e coisas quebradas parecem prontas.**

---

## Q1 — Como estruturar melhor o salvar de memória/inteligência

### O modelo mental: 4 temperaturas, 1 fonte de verdade

| Camada | O que é | Mecanismo (já existe?) |
|---|---|---|
| **Quente** (todo prompt) | CLAUDE.md global/projeto · MEMORY.md raiz (5.5KB) · protocolo v3 · regras de processo | ✅ auto-load + inject hook |
| **Morna** (roteada por contexto) | `topics/INDEX-*.md` via **memory-router** (cwd+branch+keywords) · deploy-context hook · workstreams STATE.md | ✅ desde hoje (router) — este é o padrão a replicar |
| **Fria** (sob demanda) | arquivos-tópico `memory/*.md` · `rag-memory/ask.sh` · cérebro KVM4 `/v1/memory/query` · /sistematiza (ollama) | ✅ parcial |
| **Arquivo** (nunca no contexto) | JSONL, snapshots, Notion .gz | ✅ |

**Princípio nº1 — SoT = arquivos `.md` + JSONL. Todo o resto é índice derivado e regenerável.** vindex, cérebro, Notion, Supabase nunca se consertam — se degradarem, regeneram da fonte. Isso elimina a classe inteira de problemas "qual cópia está certa".

### As 5 alavancas (em ordem de retorno)

1. **Write-path único (`mem-write`).** Hoje salvar memória é convenção (Gate 1 define filenames, mas a mão executa). Criar UM comando/skill que recebe `(tipo, tema, conteúdo)` e roteia sozinho: fato→`memory/<arquivo>.md` + linha no `topics/INDEX-<tema>.md`; comportamento→raiz/CLAUDE.md; estado→STATE.md; + `tag.sh` no ledger + push pro cérebro. Um funil = zero drift de formato, e o sync (Q2) herda a disciplina de graça.
2. **Git em `~/.claude` (subset curado).** `memory/`, `hooks/`, `skills/`, `workstreams/`, configs de state — commit automático no hook Stop (o ponto de gancho já existe). Ganha: histórico/diff de cada mudança de memória, rollback de 1 comando, proteção contra perda, e **o substrato do sync da Q2**. Excludes rígidos: segredos, caches, `projects/` (JSONL é grande demais pra git — já tem canal próprio).
3. **Evals — o próximo degrau real de produtividade.** O protocolo v3 nasceu de análise do trabalho diário; a próxima ferramenta dessa família não é outra camada de memória, é o **eval harness do próprio harness**: ~20 golden queries (o `knowledge-graph-miner` das 04:00 já minera padrões — ligar a saída dele à geração de casos) rodando no reindex 05UTC (o `eval_gate.py` JÁ está no pipeline; falta o conjunto de queries). Métrica no Telegram via OpenClaw. **Regra: nenhuma camada nova de memória entra sem eval que prove que a atual é insuficiente.**
4. **Ciclo padronizado de criação de ferramentas** (como nasceu o v3, agora como método): fricção observada nos transcripts → hook/skill mínimo → medir 1 semana → promover ou matar. Candidatos já visíveis: **PreCompact checkpoint** (salvar estado-vivo antes de toda compactação — sessões que "param pela metade" são exatamente isso); **SessionEnd distiller** (headless destila lições do transcript → proposta de memo, hoje 100% manual); **gate de completed com prova externa** (CLAUDE.md §10 virar hook, não texto).
5. **Higiene de verdade nos memos:** campo `verificado_em:` no frontmatter (memo que declara LIVE sem data de verificação = suspeito por default); job de frescor/expiry (pendência declarada desde 05-10); aposentar números ilusórios.

---

## Q2 — Sync Mac→VPS: análise e decisão

### Discordo de continuar os Sprints 3–7 como estão

**Eu discordo porque** o pipeline essencial já funciona (provas acima) e cada sprint novo adiciona um sistema que precisa do MESMO sync que te cansa. **O que eu faria em vez disso** é fechar o perímetro: eleger SoT, endurecer o canal existente, e matar/adiar o resto. **O risco da sua abordagem atual** é o de sempre: mais camadas `proposed` = mais frentes pela metade = mais fadiga, sem recall melhor no dia-a-dia.

### Arquitetura-alvo (simples, já 80% construída)

```
Mac (~/.claude)  ── SoT: memory/*.md · workstreams/ · hooks/ · skills/ · JSONL
   │
   ├─ tempo real: hook Stop/SessionEnd → cerebro_push (JSONL delta)   [✅ LIVE hoje]
   ├─ arrasto:    cerebro_sync rsync → KVM4                            [✅ LIVE, janela 6h]
   └─ (upgrade)   git commit no Stop → push repo privado → KVM4 pull   [substitui/reforça o rsync]

KVM4 ── índices DERIVADOS: cérebro (query/ingest) · reindex 05UTC · OpenClaw/recall
Notion ── export one-way (arquivo humano). Supabase ecosystem_memory ── decidir: vira O índice único ou morre.
```

### Plano de fechamento (1 sessão cada, com critério binário)

| # | Ação | Critério de DONE (verificável) |
|---|---|---|
| 1 | **Declarar o congelamento**: ADR curto que fixa SoT=arquivos; Notion=export one-way; Cognee/Supermemory/MetaMCP/Composio/SimStudio = ADIADOS até eval provar gap; Supabase `ecosystem_memory` = decidir matar ou promover a índice único | ADR commitado + roadmap 8-layer marcado superseded |
| 2 | **Endurecer o canal**: janela do rsync 6h→15min (ou git-push no Stop); alerta de falha → Telegram (OpenClaw já está lá); excludes de segredo auditados | falha simulada gera alerta no Telegram em <15min |
| 3 | **Canário do cérebro**: 1 golden query/dia no KVM4 → resposta esperada → alerta se degradar | canário rodando 3 dias seguidos com log |
| 4 | **Eval set do RAG**: 20 golden queries no `eval_gate.py` do reindex | reindex 05UTC falha o gate se recall cair |
| 5 | **Multi-conta** (seu item 3): campo `origin: user@host` em cada ingest/commit; snapshots de outras contas entram pelo MESMO funil | ingest de 2 origens distinguíveis na query |

Depois disso, "o mesmo cérebro, o mesmo conteúdo, em tempo real" deixa de ser projeto e vira **invariante monitorado** — que é o único estado em que você para de carregar ele na cabeça.

### O que NÃO fazer

- Não construir um segundo mecanismo de tempo-real: o push por hook já é o tempo-real; o rsync/git é o cinto-e-suspensório.
- Não sincronizar índices (vindex/embeddings) — sincroniza-se FONTE; índice regenera de cada lado.
- Não deployar as Edge Functions Notion↔Supabase paradas antes da decisão do item 1 — é exatamente o tipo de meia-obra que gera o cansaço.

---

## Pendências que esta análise cria (pra fila HITL)

1. **D1:** aprovar o congelamento do 8-layer (item 1) — supersede D-Roadmap-1..4 de 05-20.
2. **D2:** Supabase `ecosystem_memory`: matar ou promover a índice único? (recomendação: **matar por ora** — o cérebro KVM4 já cumpre o papel e tem canal de sync vivo).
3. **D3:** rsync 15min vs git-push-no-Stop (recomendação: **git**, porque resolve versionamento+sync+auditoria num mecanismo só).
