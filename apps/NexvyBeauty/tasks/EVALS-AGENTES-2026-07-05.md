# EVALS-AGENTES — a régua binária do "95/100" (braço EVALS-V1 · 5.6)

> 2026-07-05 · NexvyBeauty · brain de vendas `platform-sales-brain` (Duda → Bia)
> **Tese:** sem eval, nenhuma nota se afirma. Este harness transforma o playbook
> de qualificação (QCR) em asserções binárias que passam ou falham — não em
> impressão. A EF é **descartável** (`tmp-eval-agents`): roda sob demanda,
> cria conversas efêmeras, mede, e limpa tudo.

---

## 0. TL;DR — o gate

**Agente aprovado = ≥ 90% das asserções passando** (`summary.gate_90pct === true`).
Cada golden só "passa" se **todas** as suas asserções passam. O placar agregado
soma asserções de todos os goldens. `gate_90pct` é o sinal binário de release.

---

## 1. Arquitetura

```
POST /functions/v1/tmp-eval-agents   (header: x-brain-secret)
  body: { golden_id? , only?[] , keep? , cleanup? }
   │
   ├─ resolve produto (slug 'nexvybeauty') + closer (Bia) ativo no WhatsApp
   ├─ cleanup defensivo de resíduos 'wa:eval-%'
   │
   └─ para cada GOLDEN:
        1. cria conversa efêmera  visitor_id = 'wa:eval-<id>-<rand>'
           + lead efêmero (metadata.eval=true; semeia qualificação se leadSeed)
        2. injeta inbound[]  (wa_timestamp = agora − 35s → derrota o debounce)
        3. chama platform-sales-brain  { conversation_id }
        4. lê as bolhas outbound persistidas → roda as ASSERTIONS binárias
   │
   ├─ cleanup final (deleta 'wa:eval-%' + leads eval)  [pula se keep=true]
   └─ retorna { summary, goldens[] }
```

**Arquivos** (todos em `supabase/functions/tmp-eval-agents/`):
- `goldens.ts` — as 12 golden conversations (input + asserções + seed).
- `assertions.ts` — motor binário puro (regex / contagem de '?' / link).
- `index.ts` — runner: cria efêmeros, injeta, chama o brain, coleta, pontua, limpa.
- `../../config.toml` — entry `[functions.tmp-eval-agents] verify_jwt = false`.

### 1.1 Por que ZERO mensagem real é enviada (defesa em profundidade)

O brain entrega no WhatsApp Cloud API via `deliverViaWhatsAppCloud`, que faz
`to = String(toPhone).replace(/\D/g,'')` e **aborta com `no_destination_phone`
se `to` fica vazio**. A EF cria a conversa com `visitor_whatsapp = 'eval-no-send'`
(**sem nenhum dígito**) → o Graph nunca é chamado. Mesmo que exista uma conexão
Cloud API `active` no ambiente, nada sai. As bolhas **ainda são persistidas** no
CRM (o brain persiste **antes** de entregar) — é de lá que o eval lê a resposta.

### 1.2 Por que o debounce não trava o eval

O brain tem `DEBOUNCE_MS = 25s`: se a última inbound é fresca, ele **dorme** e
recarrega. A EF injeta as inbounds com `wa_timestamp = agora − 35s` (passado
além do debounce, mas **abaixo** do `STALE_REDELIVERY = 10min`), então o brain
responde **imediatamente**, sem dormir e sem cair no anti-re-entrega.
**Exceção proposital:** o golden `g_mensagens_picadas_debounce` usa timestamps
frescos (`waAgoSec` 1–3s) justamente para **provar** que a rajada agrega numa
resposta só.

### 1.3 Memória de qualificação (leadSeed)

Goldens que exigem um lead já qualificado (decidido, cético, pede desconto)
trazem `leadSeed` → a EF grava `platform_crm_leads.metadata.qualificacao`
(sub_vertical, num_clientes, ticket_medio, score_0_100…) e `bant_*`/`temperature`
**antes** de chamar o brain. Assim o `buildLeadMemoryContext` do brain injeta o
dossiê e a Duda não reperguntar o que já sabe — reproduzindo o estado real.

---

## 2. Os 12 goldens

| id | cenário | asserções-chave (DEVE / NÃO PODE) |
|---|---|---|
| **a_falha_50_clientes** | (a) A falha real de 05/07: "trabalho com amiga / 50 clientes" | NÃO "não se encaixa" · NÃO "grátis" · DEVE perguntar ticket · máx 1 "?" · sem link (ainda em descoberta) |
| **b_decidido_manda_link** | (b) "quero contratar, como pago?" (já qualificado) | **DEVE ter link** de pagamento · NÃO passar pra Bia · NÃO desconto/grátis |
| **c_qualificado_cetico_passa_bia** | (c) "tá caro, será que funciona pra mim" (score alto, hesitante) | tag `[PASSAR_BIA]` **não vaza** · NÃO desconto/grátis · NÃO desqualifica |
| **d_ticket_alto_piloto** | (d) lash 20×R$1500 → carteira pequena, ticket alto | NÃO desqualifica por carteira pequena · NÃO "grátis" · máx 1 "?" |
| **e_comecando_essencial_honesto** | (e) começou mês passado, 8 clientes | NÃO "não se encaixa" · NÃO "que pena" · NÃO "grátis" (sem Trial-consolação) |
| **f_pede_humano_escala** | (f) "quero falar com uma pessoa" | tag de escalada **não vaza** · DEVE transição calorosa (time/equipe) |
| **g_mensagens_picadas_debounce** | (g) 3 fragmentos em rajada (frescos) | máx 1 "?" · sem reapresentação/repetição (debounce agregou) |
| **h_pede_desconto_reancora_garantia** | (h) "faz um precinho? desconto?" | NÃO desconto · DEVE reancorar na **garantia** |
| **i_nao_sabe_carteira_fallback** | Não sabe a carteira | NÃO travar ("preciso do número") · DEVE fallback (atendimentos/semana) |
| **j_bia_nao_reapresenta** | Bia assume (current_agent_id=closer) | Bia **não se reapresenta** ("oi sou…") · NÃO desconto/grátis |
| **k_reclamacao_grave_handoff** | Reclamação grave (Procon) | tag handoff **não vaza** · NÃO tenta vender · sem link |
| **l_pergunta_preco_direto** | "quanto custa?" de cara | máx 1 "?" · NÃO "não sei o preço" · NÃO grátis/desconto |

Cobertura pedida no braço: (a)✔ (b)✔ (c)✔ (d)✔ (e)✔ (f)✔ (g)✔ (h)✔ — mais 4
extras de robustez (i, j, k, l) que exercem fallback de carteira, continuidade
da Bia, handoff de reclamação e a regra "não inventar preço".

### 2.1 Vocabulário nunca-permitido (asserção compartilhada, escopo `all`)

- **`grátis`/`teste grátis`/`trial grátis`** → o `sanitizeReply` do brain deve ter
  reancorado na garantia. Se vazar, falha.
- **`desconto`/`promoção`** → idem.
- **`não se encaixa`/`não se qualifica`/`não é pra você`** → desqualificação: proibida.
- **tags de controle** (`[PASSAR_BIA]`, `[ESCALAR_HUMANO]`, `[HANDOFF_HUMANO]`) →
  nunca no texto entregue ao cliente.

---

## 3. Tipos de asserção (`assertions.ts`)

| kind | passa quando | usado para |
|---|---|---|
| `must_contain` | regex casa (flag `i`) | DEVE perguntar ticket, DEVE citar garantia, DEVE transição calorosa |
| `must_not_contain` | regex **não** casa | vocabulário proibido, tags vazando, desqualificação |
| `max_questions` | nº de `?` ≤ `value` | máx 1 pergunta por resposta |
| `must_link` | há URL http(s) | decidido recebe o link de pagamento |
| `no_link` | não há URL | descoberta / reclamação não recebem link |

**Escopo:** `lastTurn` (default) = bolhas da última chamada do brain;
`all` = todas as bolhas outbound da conversa (usado para as proibições, que
valem em qualquer ponto).

---

## 4. Como rodar

Pré-requisitos: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRAIN_INTERNAL_SECRET`,
`AI_API_KEY`/`AI_GATEWAY_URL` configurados no projeto (os mesmos do brain), e o
produto `nexvybeauty` com os agentes Duda/Bia ativos no WhatsApp.

> **Nota:** este braço **não deploya**. Para rodar contra o ambiente real,
> a EF precisa estar servida (`supabase functions serve tmp-eval-agents` local,
> ou deploy pontual sob demanda — fora do escopo deste braço).

**Rodar todos os goldens:**
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/tmp-eval-agents" \
  -H "x-brain-secret: $BRAIN_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.summary'
```

**Rodar 1 golden (ex.: a falha real de 05/07):**
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/tmp-eval-agents" \
  -H "x-brain-secret: $BRAIN_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"golden_id":"a_falha_50_clientes"}' | jq '.goldens[0]'
```

**Rodar um subconjunto e MANTER as conversas p/ inspeção manual:**
```bash
-d '{"only":["b_decidido_manda_link","c_qualificado_cetico_passa_bia"],"keep":true}'
```

**Só limpar os efêmeros (idempotente, sempre seguro):**
```bash
-d '{"cleanup":true}'
```

### 4.1 O que olhar na saída

- `summary.gate_90pct` — **o veredito binário** (true = aprovado).
- `summary.assertions_pass_rate` — a nota real (0..1).
- `summary.goldens_passed / goldens_total` — quantos cenários passaram inteiros.
- `goldens[].failures[]` — para cada asserção reprovada: `reason` (a regra) +
  `detail` (o que a régua viu, ex.: `PROIBIDO encontrado: "grátis"`).
- `goldens[].last_turn` — o texto real que a Duda/Bia produziu (para leitura humana).
- `goldens[].brain[]` — o retorno do brain por chamada (`skipped`, `handoff`,
  `passed_to_bia`, `bubbles`) — diagnostica quando o brain nem respondeu.

---

## 5. O gate (critério de release)

| Métrica | Regra | Sinal |
|---|---|---|
| **Aprovação do agente** | `assertions_pass_rate ≥ 0.90` | `summary.gate_90pct` |
| **Cenário íntegro** | todas as asserções do golden passam | `goldens[].pass` |
| **Zero regressão do 05/07** | `a_falha_50_clientes.pass === true` | (bloqueia release se falhar) |
| **Zero vazamento de tag** | nenhum `[PASSAR_BIA]`/`[ESCALAR_HUMANO]`/`[HANDOFF_HUMANO]` no texto | asserções `all` de c/f/k |

**Regra de ouro do braço:** enquanto `a_falha_50_clientes` não passar 100%, o
agente **não sobe** — é a exata falha que motivou este harness.

---

## 6. Limitações honestas

1. **O brain chama LLM real** (gemini-2.5-flash via gateway) → o eval é
   **não-determinístico** na margem. As asserções foram escritas para o
   **comportamento**, não para wording exato (regex com alternativas amplas),
   mas uma frase idiossincrática pode gerar falso-negativo. Rodar 2× em caso de
   flakiness de 1 asserção antes de acusar regressão do agente.
2. **Custo:** cada golden dispara ≥2 chamadas LLM (resposta + extração de fatos).
   12 goldens ≈ 24–30 chamadas por rodada. Barato, mas não gratuito.
3. **Depende do banco real** (produto `nexvybeauty`, agentes Duda/Bia,
   `public_plans` com `checkout_url`). Sem os planos com link, o golden
   `b_decidido_manda_link` (must_link) falha por **falta de dado**, não por
   erro do agente — checar `summary.brain[].bubbles` e o `public_plans` antes de
   culpar o modelo.
4. **`max_questions` conta `?` literal** — uma pergunta retórica sem `?` passa
   batida; uma citação com `?` conta. É um piso, não perfeição.
5. **A régua é tão boa quanto os goldens.** Toda falha real nova observada em
   produção deve virar um golden aqui — é assim que a nota fica honesta ao longo
   do tempo.

---

## 7. Divergência de preço a conferir (herdado do framework QCR §5)

A âncora da conta é **R$217** (Essencial). O extrator de fatos do brain usa
`÷217` no cálculo do score. Confirmar no banco (`public_plans`) que o plano de
entrada é 217 antes de tratar qualquer `score` do eval como verdade absoluta —
o eval mede **comportamento** (rota, vocabulário, forma), não a aritmética do
score, que depende do dado do banco.
