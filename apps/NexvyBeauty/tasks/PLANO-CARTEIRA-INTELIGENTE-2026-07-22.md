# Plano — Carteira Inteligente (ingestão + classificação)

**22/07/2026** · Escrito depois do reconhecimento completo, não durante a implementação.

> **Por que este documento existe.** Hoje foram aplicadas 6 migrations em produção em
> sequência, cada uma corrigindo a anterior: backfill → faltava trigger → conteúdo das
> conversas nunca fora salvo → o modelo de eixos estava errado. Cada volta dessas custou
> tempo de lançamento. A causa foi sempre a mesma: **implementação começou antes do
> reconhecimento terminar.** Este plano inverte isso. Nada é escrito antes da Fase 0
> fechar, e cada passo tem check binário.

---

## 1. Estado atual — o que já está PROVADO (não re-descobrir)

| Fato | Prova |
|---|---|
| `is_br_dialable()` no ar, 15/15 casos de teste | migration `b4_carteira_classificacao_camada1` |
| 84.194 classificados: 80.982 lixeira · 3.212 a_revisar · 0 principal | query de contagem |
| RPC não grava mais o telefone no campo *nome* | `b4_upsert_clientes_wa_nome_vazio` |
| Trigger de FORMA no ar, 4/4 casos sintéticos | `b4_eixo1_forma_trigger_ingestao` |
| **O conteúdo das conversas NUNCA foi salvo** | `evolution-history-sync` linhas 238-249 extraem só telefone, pushName e timestamp |
| **Não há log de payload bruto** | `platform_crm_webhook_logs` = 0 linhas |
| Substrato ao vivo funciona | 11 conversas WhatsApp, **100%** com `visitor_phone_normalized`; 88 msgs, **83 com texto** |
| Chave de junção conversa↔cliente | `webchat_conversations.visitor_phone_normalized` ↔ `clientes.telefone_normalizado` |
| `detected_intent` **não** serve como sinal | coluna existe, **0 preenchidos** |
| Filtro de forma não descartou ninguém ativo | **0 de 80.982** na lixeira têm conversa |
| Classificáveis hoje, sem re-sync | **3 contatos** |
| Disparo do tenant sai de | `salon-automation-run` (cron) + `ai-followup-cron` |

---

## 2. As decisões (tomadas, não em aberto)

| # | Decisão | Quem decidiu |
|---|---|---|
| 1 | **Eixo RELAÇÃO não limita importação.** No dia zero de um legado não há agendamento; se fosse ramo da entrada, a carteira nasceria vazia — quebra de fluxo | Marcelo, 22/07 |
| 2 | **`pessoal` é tag/classificação, igual a `cliente`** — vive em `tipo_contato`, não é um estado de carteira à parte | Marcelo, 22/07 |
| 3 | **Disparo exige classificação resolvida; visualização não** | Marcelo, 22/07 |
| 4 | **Tudo precisa estar pronto antes do re-sync** | Marcelo, 22/07 |
| 5 | Proteção de dados via **ZDR** | Marcelo, 22/07 |

### O modelo em uma frase
**Classificação é faxineiro, não porteiro.** A importação deixa entrar quem tem forma de
telefone; o agente tira depois quem não é do salão.

```
IMPORTAÇÃO
│
├─ EIXO 1 · FORMA ──── não discável → lixeira ⛔  (determinístico, 100%, custo zero)
│                      discável     → ENTRA na carteira
│
├─ EIXO 2 · RELAÇÃO ── carimbo CONTÍNUO. Só promove, nunca rebaixa.
│                      Vazio no dia zero — e isso é normal.
│
└─ EIXO 3 · ASSUNTO ── agente lê a conversa DEPOIS
                        ├─ salão   → tipo_contato = lead (ou cliente, se houver transação)
                        ├─ misto   → tipo_contato = cliente/lead + flag em sinais_wa
                        ├─ pessoal → tipo_contato = pessoal  (visível, fora de campanha)
                        └─ incerto → tipo_contato = indefinido + carteira_estado = a_revisar
```

**Precedência, sem exceção:** decisão humana (`revisado_em`) > transação > forma > agente.

> **Leitura a confirmar em uma linha:** "`pessoal` é tag como `cliente`" foi lido como
> *mesmo campo* (`tipo_contato`), não novo `carteira_estado`. Contato pessoal continua
> **visível** na carteira; o que muda é que campanha não o alcança. Se a intenção era
> tirá-lo da vista, é trocar um valor — mas o resto do plano não muda.

---

## 3. Fases, com check binário

### FASE 0 — Reconhecimento ✅ EXECUTADA (22/07)

Resolvida **sem reconexão e sem ação do Marcelo**: o Evolution roda no VPS com Postgres
próprio, e o histórico estava lá o tempo todo. Nós é que o descartávamos na entrada.

| # | Check | Resultado |
|---|---|---|
| 0.1 | O corpo da mensagem existe? | ✅ **SIM** — 128.434 de 166.383 mensagens com `conversation` não-vazio |
| 0.2 | Volume | 166.383 msgs · 73 MB · 860 contatos · 17/06/2025 → 21/07/2026 |

**Distribuição por tipo de contato** (o que reescreve o custo do Eixo 3):

| Balde | Contatos | Mensagens | Msgs/contato |
|---|---|---|---|
| **BR com telefone** | **350** | **81.476** | **233** |
| Grupo (`@g.us`) | 117 | 76.024 | 650 |
| LID sem telefone | 389 | 8.852 | 23 |
| Outro | 4 | 31 | 8 |

**Achados que mudaram o plano:**

1. **São 350 contatos a classificar, não 84.194.** Só 860 trocaram mensagem; o resto veio
   da agenda. Descontando grupos e LID, o alvo real é 350. O custo do Eixo 3 deixa de ser
   preocupação.
2. **A Fase 6 morre.** O legado não depende de reconexão — leio do Evolution direto.
   **Risco R3 eliminado e o plano perde seu único bloqueio humano.**
3. **Grupos são a maior massa de mensagem** (76 mil, 650 por grupo). Ingerir "conversa"
   sem separar por tipo de JID faria o classificador ler papo de grupo e concluir que a
   carteira inteira é pessoal. O Eixo 1 já evita isso de graça.
4. **Cobertura confirmada:** amostra de 10 dos 350 → 10/10 presentes em `clientes`, todos
   em `a_revisar`, **zero na lixeira**. Nenhuma cliente foi perdida.
5. **API do Evolution serve o carregador:** `chat/findMessages/{instance}` responde 200,
   aceita `where.key.remoteJid` (filtro por contato) e `offset` como tamanho de página
   (1.000 registros em ~318 ms). **Nenhuma credencial nova precisa ir para lugar algum** —
   a edge function usa `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` que já existem.

**Alarme falso registrado:** medi `is_br_dialable` contra JIDs crus e concluí que 72
contatos (82% da conversa) estavam na lixeira. Errado — `normalize_phone_br` insere o nono
dígito antes da checagem, e nenhuma linha foi afetada. A regra estava mesmo errada para
12 dígitos e foi corrigida (`b4_fix_is_br_dialable_celular_antigo`, 20/20 na suíte), mas o
impacto em produção era zero.

**⚠️ Reordenação obrigatória descoberta aqui:** existem **6 crons de disparo ativos**
(`campaign-dispatcher` a cada minuto, `ai-followup-cron` a cada 5, `salon-automation-daily`
diário) e `salon-automation-run` seleciona clientes **sem filtro de `carteira_estado`**.
Hoje nada dispara porque as 4 regras ativas partem de evento transacional que os 84 mil não
têm — segurança **acidental, não projetada**. Portanto **a Fase 3 (gate) vem ANTES** de
qualquer migração que torne contatos visíveis.

### FASE 1 — Persistir conteúdo na ingestão
| # | Passo | Check binário |
|---|---|---|
| 1.1 | `evolution-history-sync` grava mensagem em `webchat_messages` + cria/casa `webchat_conversations` | Sync de teste insere N msgs com `content <> ''` |
| 1.2 | Idempotência | Rodar 2×: contagem de mensagens **não muda** |
| 1.3 | Deploy | `deno check` limpo + função **ACTIVE** |

### FASE 2 — Tag de assunto
| # | Passo | Check binário |
|---|---|---|
| 2.1 | Valores `pessoal`/`misto`/`indefinido` em `tipo_contato` + CHECK constraint | `insert` com valor inválido **falha** |
| 2.2 | Contrato do classificador em `sinais_wa` (assunto, confiança, evidências, versão) | Linha de exemplo grava e lê |

### FASE 3 — Gate de disparo ⚠️ o item que evita o pior dano
| # | Passo | Check binário |
|---|---|---|
| 3.1 | `salon-automation-run` exclui `tipo_contato = 'pessoal'` e exige assunto resolvido | Contato `pessoal` **não** recebe no teste |
| 3.2 | `ai-followup-cron` idem | idem |
| 3.3 | Front (AiGrowth, AcoesClientes) idem | Segmentação não lista `pessoal` |
| 3.4 | Varredura: nenhum outro caminho de envio escapa | `grep` de envio cruzado com o gate = 0 escapes |

### FASE 4 — Agente classificador
| # | Passo | Check binário |
|---|---|---|
| 4.1 | Edge `carteira-classify`: janela limitada (N recentes + N antigas, teto de caracteres) | Devolve JSON válido no schema, com evidências |
| 4.2 | Fila + cron incremental | Contato novo com conversa é classificado em ≤ 1 ciclo |
| 4.3 | Nunca sobrescreve `revisado_em`, nunca rebaixa quem tem transação | Teste com os 2 casos: estado **não muda** |
| 4.4 | Versionamento | Subir p/ v2 re-avalia só quem está em v1 **e** sem `revisado_em` |

### FASE 5 — Tela
| # | Passo | Check binário |
|---|---|---|
| 5.1 | Filtro por `tipo_contato` + contagens | Números batem com o SQL |
| 5.2 | Ações "É cliente" / "É pessoal" gravam `revisado_em` | Linha trava contra reclassificação |
| 5.3 | Painel de análise de carteira (o que se vende) | Mostra distribuição + evidência por contato |

### ~~FASE 6 — Re-sync~~ ⚰️ ELIMINADA pela Fase 0

Ela existia porque eu achava que só a reconexão traria o histórico de volta. **Errado** —
os dados estão no Postgres do Evolution, no VPS, e a API `chat/findMessages` os serve sob
demanda. A carga do legado virou a Fase 1: banco-a-banco, repetível quantas vezes eu
quiser, reversível, sem tiro único. **Risco R3 eliminado; o plano não tem mais bloqueio
humano.**

A prova de ponta a ponta que morava aqui migrou para o fim da Fase 5.

---

## 4. Riscos que podem matar o plano — e onde eles aparecem

| # | Risco | Onde aparece | Situação |
|---|---|---|---|
| R1 | Payload não traz corpo da mensagem | Fase 0.1 | ✅ **RESOLVIDO** — 128.434 msgs com corpo |
| R2 | Volume estoura storage/custo | Fase 0.2 | ✅ **RESOLVIDO** — 81.476 msgs para 350 contatos, trivial |
| R3 | Reconexão gasta a chance com código incompleto | ~~Fase 6~~ | ✅ **ELIMINADO** — leitura direta do Evolution, sem reconexão |
| R4 | Classificador marca cliente real como `pessoal` | Fase 4 | Aberto · Transação nunca rebaixa · `revisado_em` trava · botão de resgate |
| R5 | Campanha dispara antes da classificação | Fase 3 | ⚠️ **AGRAVADO** — `salon-automation-run` não filtra `carteira_estado` e há 6 crons ativos. Fase 3 promovida para ANTES de tornar contato visível |

---

## 5. Fora de escopo (declarado, para não virar Frankenstein)

- Score de propensão / RFM — outra frente
- Deduplicação de contatos — já existe merge por RPC
- Reclassificação retroativa de quem a dona já revisou — **nunca**, por desenho
- Qualquer mudança no fluxo de agendamento

---

## 6. Caminho crítico

```
FASE 0 ✅ → 3 (gate de disparo) → 1 (carga do legado) → 2 (tag) → 4 (classificador) → 5 (tela)
```

**Reordenado após a Fase 0.** A Fase 3 subiu para primeiro: enquanto
`salon-automation-run` não filtrar `carteira_estado`, nenhuma migração pode tornar
contato visível com segurança. A Fase 6 deixou de existir.

**Não há mais bloqueio humano.** Todo o caminho é executável sem o Marcelo.
