# HANDOFF — Prospecção Ativa (Camila) · 2026-08-06

> Escrito no fim da sessão, para a próxima começar sem redescobrir nada.
> Branch `feat/bdr-autonomo` · último commit `cd56c46` · worktree limpo, tudo publicado.

---

## 1. O PRÓXIMO TRABALHO — a cadeia do `wamid` (desenhado, NÃO implementado)

**Objetivo:** alimentar `delivered_count` para que o kill-switch por taxa de
não-entrega (escrito e testado em `cd56c46`) deixe de ser inerte.

**Por que não foi feito:** descobri no fim da sessão que **não existe chave** para
casar o ACK de entrega com a mensagem enviada. Não é "tratar um evento" — é
construir rastreabilidade que não existe.

### ⚠️ O RISCO QUE TORNA ISSO DELICADO

A regra é conservadora: `delivered === undefined` **não acusa**. Mas se a fonte for
ligada errada e gravar sempre `0`, a taxa de não-entrega lê **100% de falha** e
**pausa toda campanha saudável**. **Fonte errada é pior que fonte ausente.**
O teste `CONTROLE NEGATIVO — delivered undefined NÃO acusa` cobre o caso ausente;
**nada cobre o caso zero-falso.** Escrever esse teste é parte do trabalho.

### Os 4 elos → viraram 2. **ELOS 1-2 FEITOS** (commit `63b6dba`)

> ⚠️ **CORREÇÃO A ESTE HANDOFF, escrita depois de executá-lo.** O elo 1 como eu
> descrevi **não existia**. Eu supus que `evolution-core.ts` precisava devolver o
> wamid; ao **ler o caminho antes de mudá-lo**, o wamid **já chegava** ao motor —
> `platform-evolution-send` devolve a resposta bruta da Evolution (`:172`) e o
> `deliver` fazia `return { ok: true }`, **descartando**. Elos 1 e 2 colapsaram.
>
> **Lição para quem retomar: este documento é ponto de partida para VERIFICAR, não
> verdade para executar.** Foi escrito com o contexto no limite e carrega
> suposições. Leia o caminho antes de mudá-lo.

| # | Onde | Estado |
|---|---|---|
| ~~1~~+2 | `platform-cold-outreach/index.ts` | ✅ **FEITO** — captura `:520`, tipo `:494`, propaga `:388`, tipo payload `:564`, grava `metadata.wamid` `:675` |
| **3** | `platform-evolution-webhook/index.ts` (~`:215`, ao lado de `messages.upsert`) | ⏳ tratar `messages.update` / `MESSAGES_UPDATE`. Evento **já subscrito** em `evolution-core.ts:133`; o webhook só não trata |
| **4** | idem | ⏳ casar `key.id` → `platform_crm_messages` por `metadata.wamid` → ler `metadata.campaign_id` → `bumpCounter(..., { delivered: 1 })`. `bumpCounter` existe (`platform-cold-outreach/index.ts:~700`) e já aceita `delivered` |

**Atenção no elo 4:** `bumpCounter` vive no `platform-cold-outreach`, e quem vai
chamá-lo é o **webhook** — outra edge function. Ou se extrai para `_shared/`, ou o
webhook faz o `upsert` direto na tabela. Decidir isso é parte do trabalho; extrair
para `_shared/` obriga a redeployar quem importa.

### Critério de aceite (declarado ANTES de implementar)

1. `delivered_count > 0` em `platform_crm_cold_daily_counters` após envio real;
2. **controle negativo obrigatório:** campanha saudável **não** pausa — sem isso, o
   item 1 sozinho pode significar "grava zero e pausa tudo";
3. teste novo em `anti-ban.test.ts` com `delivered` vindo da fonte real.

---

## 2. ESTADO — o que está NO AR

| Função | Versão | Conteúdo |
|---|---|---|
| `platform-sales-brain` | **v93** | PR-A (coluna sem consumidor) + PR-D (relógio do debounce) + sanitizeReply por sentença + frase da Lia |
| `platform-sales-brain-canary` | **v3+** | tudo acima **+ PR-B completo** + gate de bolha + alerta de eval silenciado |
| `platform-cold-outreach` | atual | 4 bloqueantes corrigidos + **pin da persona** |
| `tmp-eval-agents` | v49+ | dela: `brain_slug`, `agentType`, `tmp_eval_runs`, gate de pré-compilação |

**Campanha:** `TESTE Gate G - numero do Marcelo` · `active` · `dry_run=false` ·
**fila sem itens PENDENTES** (1 `replied`, 1 `skipped` — o motor já disparou 2×).

---

## 3. O QUE AINDA SEPARA DO PRIMEIRO DISPARO REAL

| Item | Dono | Nota |
|---|---|---|
| `delivered_count` sem fonte | **meu** | seção 1 |
| Campanha de **produção** não existe | Marcelo | a de teste tem **janela 24/7** e **jitter 1-3s** — config de teste armada como produção. **Criar nova, não reaproveitar** |
| Fila vazia — zero leads | Marcelo | popular é ato irreversível de **1 minuto** (cron `* * * * *`) |
| Roteador não conhece `prospector` | meu | consertei o **motor**, não a **classe**. A correção estrutural mexe em `agent-routing.ts`, que serve o canal da Controladora |

---

## 4. FATOS MEDIDOS QUE NÃO PODEM SER REDESCOBERTOS DO ZERO

- **A prospecção era atendida pela DUDA.** A campanha declara `Camila · Prospecção`
  (`agent_type: 'prospector'`); o motor gravava o id só no `metadata` da mensagem;
  a conversa nascia com `current_agent_id = NULL`; o roteador **não conhece
  `prospector`** e caía em `sdr_open` → Duda. Corrigido em `da5409a`, no insert
  **e** no reuso. A conversa real (`wa_evo:5518996267790`, 90 msgs) **ainda tem pin
  NULL** — o fix age no próximo tick que a tocar, não retroativamente.
- **`blocked_count` e `reported_count` são INALIMENTÁVEIS.** O WhatsApp não
  notifica bloqueio nem denúncia. Não é falta de trabalho, é ausência de sinal.
  Os ramos ficam com o limiar preservado; o motor declara no log que roda sem eles.
- **Teto real da campanha: 5/dia** (o 20 é o default do código, não a config).
- **Teto da edge function: 150s** (`IDLE_TIMEOUT`), não o `BRAIN_TIMEOUT_MS`.
- **Regra de lote do eval: ≤ 4 TURNOS**, não ≤ 2 goldens — o custo é por turno.
- **504 do eval é irrelevante:** a função completa e o gateway desiste. O placar
  fica em `tmp_eval_runs` — ler de lá, não do corpo HTTP.

### Placares reais (Camila confirmada por `agent_final`)

- `evo-nome-repetido-bolhas-seguidas` → **18/18** — prova o gate de bolha.
- `evo-adiar-pra-sabado-nao-e-recusa` → 17/19; as 2 falhas eram **régua minha
  torta**, já corrigida (lista enumerada de 7 palavras + `\d{1,2}h` que a lead
  nunca disse).

---

## 5. ARQUIVOS FORA DO REPO (scratchpad — some se limpar)

```
scratchpad/goldens-evolution-8.json   ← fonte dos 8 goldens, já com correções
scratchpad/goldens-evolution-v2.ts    ← entregue à Controladora
scratchpad/valida-final.sh            ← validador de 2 passagens
```

O validador faz **duas** verificações, e a segunda existe porque entreguei **duas
vezes** um arquivo que não compilava:
1. `deno check` do arquivo como **módulo**, copiando a interface REAL de
   `SaasPlugin_vite/.../tmp-eval-agents/goldens.ts` — worktree **dela**, não o meu;
2. patterns válidos no motor do harness.

---

## 6. COMBINADOS COM A CONTROLADORA GO-LIVE

- **Um run por vez** — o eval não tem trava de concorrência.
- **Avisar antes** de disparar no canary; ela avisa antes de tocar no que é meu.
- **Canal oficial (Duda) é dela.** Não encostar — já fui corrigido nisso.
- Ela está no `human_active` sem retorno (7 leads) e no teste ponta a ponta.
- **Rodar mais goldens melhora a régua, não move o go-live.** Aviso dela, aceito.

---

## 7. PADRÕES DE ERRO DESTA SESSÃO — ler antes de afirmar qualquer coisa

Todos os erros de hoje têm **uma única forma**: *afirmar a categoria a partir de
uma medição que não a testava.*

| Erro | Forma |
|---|---|
| "brain v92" | inferido por aritmética, nunca medido |
| "migrations não aplicadas" | filtro `platform_cold%`; o prefixo é `platform_crm_cold%` |
| "fila vazia" | `replied` é prova de tráfego, não de ausência |
| "5 tabelas" | contei uma de outro sistema |
| "teto 20/dia" | li o default do código, não a config da campanha |
| trava `->>` vs `->` | testei a **forma** do predicado, não o comportamento |
| `import type` faltando (2×) | validador checava patterns, não compilava o módulo |
| `minSampleDelivery` decorativo | ramo aninhado no portão do outro mecanismo |

**Regras que saíram disso:**
- **Zero linhas não prova ausência** — prova que o filtro não casou.
- **Estado terminal não é estado ausente.**
- **`replace_all` bem-sucedido não prova cobertura** — conferir o efeito, contando.
- **Prometer atenção não é um check.** A promessa não roda.
- **Critério declarado antes protege contra racionalizar o RESULTADO; não protege
  contra RÉGUA TORTA.** São duas defesas diferentes.
- **Controle negativo que falha acusa o GOLDEN**, não a agente, até prova em contrário.
- **Dois mecanismos independentes não compartilham porta de entrada** — o mais
  restritivo vence em silêncio.
