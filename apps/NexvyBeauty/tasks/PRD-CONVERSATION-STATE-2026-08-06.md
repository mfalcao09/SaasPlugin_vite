# PRD — `conversation_state`: a agente passa a saber onde está

> **Data:** 2026-08-06 · **Branch:** `feat/bdr-autonomo` · **Autoria:** sessão BDR/Camila
> **Revisão crítica:** sessão Controladora GO-LIVE (3 rodadas, ver §7)
> **Autorizado por:** Marcelo, 2026-08-06 ("Autorizado, GO" ao pacote de 5)

---

## 1. O problema, em uma frase

A agente não tem **estado** — tem **transcrição**. A cada turno um `gemini-2.5-flash`
re-deriva do histórico bruto *em que estágio estou · o que prometi · o que já
ofereci · o que ela recusou*, e re-deriva **errado sob pressão** (rajada, objeção,
aborto de lote).

### Defeitos medidos em produção (2026-08-05/06) e sua causa real

| # | Defeito observado | Causa | Fecha em |
|---|---|---|---|
| 1 | Anunciou "três pontos", entregou 2, nunca fechou o 3º | lote abortado + regeneração sem saber onde parou | **PR-D** |
| 2 | Ofereceu demonstração 2×, a 2ª **depois** de "tá chato" | **falta de estado** | **PR-B** |
| 3 | 3 lotes em 24s re-reconhecendo a mesma objeção + "sou a Camila" após 25min | hand-back ignora debounce (`9396→3680→0`) | **PR-D** |

**Honestidade de escopo:** 2 dos 3 defeitos são PR-D. Este PRD entrega o estado
(A/B/C); sem D, o defeito nº3 sobrevive — mais educado, não resolvido.

---

## 2. O que NÃO é este projeto

- Não é reescrita de prompt. O v4 já está em produção e é alçada do dono.
- Não é o agendador de turno (PR-D). Fica fora, com escopo próprio.
- Não é um segundo "cérebro". É **memória de curto prazo** do cérebro que existe.

---

## 3. O órgão

| | |
|---|---|
| **Módulo** | `supabase/functions/_shared/conversation-state.ts` — funções puras, **zero IO** |
| **Persistência** | `platform_crm_conversations.conversation_state` (JSONB, nullable) |
| **Chamado por** | `platform-sales-brain`, em 4 pontos existentes |
| **Chama** | ninguém |
| **Testes** | `conversation-state.test.ts` (`deno test`), padrão do `_shared/cold-outreach/persona.test.ts` |

**Nome sem `bdr_`, deliberadamente** (crítica aceita da Controladora): se nascer
`bdr_state`, a Duda precisa do mesmo órgão em duas semanas e alguém cria
`sdr_state` — dois estados, dois reducers, duas verdades no mesmo cérebro
compartilhado. **Um órgão, dois inquilinos, políticas separadas por agente.**

---

## 4. A lei dos tiers (o que impede o estado de mentir)

Cicatriz que fundamenta: o `sanitizeReply` da Duda fazia substituição cega sobre a
saída do modelo e **destruía 100% das negações** — o padrão casava dentro da frase
negada. Um reducer ingênuo marcaria `demo_ofertas++` em
**"não vou ficar te oferecendo demonstração"** — a frase em que a lead reclamou.

| Tier | Origem do campo | Modo de falha | Pode virar "fato" no prompt? |
|---|---|---|---|
| **1** | ato do **código** (zero inferência) | não falha | ✅ |
| **2** | tag explícita do modelo (`[OFERTA_DEMO]`, padrão do `[PASSAR_BIA]`) | **subconta** → reoferta 1× a mais | ✅ com controle negativo |
| **3** | regex sobre prosa | **mente** | ❌ **proibido** |

**Regra de ouro:** campo em dúvida **OMITE**, nunca assume default.
*Estado ausente → o modelo improvisa. Estado errado → o modelo obedece com
convicção.* O segundo é pior.

### Campos (v1)

| Campo | Tier | Como é obtido |
|---|---|---|
| `apresentou` | 1 | existe outbound nesta conversa? |
| `link_enviado` | 1 | marcado **no gate do PR-12**, onde o código intercepta a URL |
| `nome_ultimo_uso_seq` | 1 | busca literal do nome nas próprias bolhas |
| `demo_ofertas` / `demo_recusas` | 2 | tag do modelo + `classifyReply` (já existe em `_shared/cold-outreach/opt-out.ts`) |
| `objecoes_vistas` | 2 | tag do modelo |
| `estagio` | — | **função pura** dos campos tier 1. Nunca armazenado: se deriva, não diverge |
| ~~`promessa_aberta`~~ | ~~3~~ | **CORTADO** — semântica pura, mentiria com peso de fato |

---

## 5. Concorrência: por que a trava entra no PR-A

Três hand-backs concorrentes fazem *read-modify-write* no mesmo JSONB.
`atualizado_seq` como checagem de leitura é **guarda, não lock** → **lost update**:
`demo_ofertas` grava 1 quando foram 3, e o estado passa a mentir exatamente na
conversa em que ele mais importa.

**Solução (padrão já provado no `brain_claim`, brain:1449-1452):** UPDATE
condicional com RETURNING — `set ... where atualizado_seq < :seq returning *`.
Serializa sob READ COMMITTED; o perdedor relê e reduz de novo.

---

## 6. Os 3 PRs

| PR | Entregável | Check binário |
|---|---|---|
| **A** | migration (coluna nullable) + módulo + testes + trava otimista | `deno test` verde, incl. **controles negativos**; **zero mudança de comportamento** (ninguém lê ainda) |
| **B** | brain consome; **PR-12 e PR-14 deletados e absorvidos** | demo recusada → **0** reofertas em 10 msgs · gates atuais sem regressão · goldens do canal verdes |
| **C** | prompt fatiado por estágio | ≤5.000 chars/turno **com as travas em TODAS as fatias** |

### Controle negativo (a peça que torna o reducer medido, não apostado)

Todo campo tier 2/3 ganha um golden cuja entrada é a **negação** do padrão:

```
"não vou ficar te oferecendo demonstração"  →  demo_ofertas NÃO incrementou
"não mando link nenhum agora"               →  link_enviado continua false
```

**Se o controle negativo falha, o campo não pode ser tier 2/3** — rebaixa para
tier 1 ou sai do estado. Rodam no `tmp-eval-agents` (ACTIVE v43), junto dos 8
goldens do canal Evolution.

---

## 7. Créditos da revisão

Da sessão Controladora GO-LIVE, incorporado integralmente: a lei dos tiers · o
corte do `promessa_aberta` · a regra "campo em dúvida omite" · o nome sem `bdr_` ·
`estagio` como função derivada · travas em todas as fatias do PR-C · o **golden de
controle negativo** · e o achado do *lost update*, que era defeito real do desenho
original.

---

## 8. Riscos assumidos

1. **Tags tier 2 dependem de o modelo emitir.** Modo de falha escolhido
   conscientemente: subcontar (seguro) em vez de mentir (inaceitável).
2. **Sem PR-D, o defeito nº3 sobrevive.** Documentado, não escondido.
3. **Coluna compartilhada com a Duda.** Escrita só quando há política do agente;
   a Duda pode adotar quando quiser, sem migration nova.
