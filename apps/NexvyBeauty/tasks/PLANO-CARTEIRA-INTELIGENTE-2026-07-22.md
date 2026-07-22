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

### FASE 0 — Reconhecimento que falta ⛔ GATE
Nenhuma linha de código antes disto fechar.

| # | Passo | Check binário |
|---|---|---|
| 0.1 | Logar **um** payload real de `MESSAGES_SET` | O JSON contém `message.conversation` **ou** `extendedTextMessage.text` não-vazio? **SIM/NÃO** |
| 0.2 | Medir volume da instância | Nº de mensagens e bytes estimados no histórico completo |

> **Se 0.1 for NÃO, o plano morre aqui e muda de forma — não no meio da implementação.**
> Sem corpo de mensagem no payload, classificar o legado é impossível e resta só o
> regime ao vivo. Este é exatamente o tipo de descoberta que hoje aconteceu tarde demais.

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

### FASE 6 — Re-sync ⛔ IRREVERSÍVEL
Só depois de 1-4 verdes. A reconexão da instância acontece **uma vez**: se o código não
estiver pronto, o histórico passa e é descartado de novo — exatamente o que já ocorreu.

| # | Passo | Check binário |
|---|---|---|
| 6.1 | Reconectar `meuteste1-sal-o1` (HITL Marcelo) | Instância `connected` |
| 6.2 | Histórico chega **com conteúdo** | `webchat_messages` cresce com `content <> ''` |
| 6.3 | Classificador roda sobre o legado | ≥ 90% dos discáveis com conversa saem de `indefinido` |
| 6.4 | Prova de ponta a ponta | Painel mostra distribuição real da carteira do salão |

---

## 4. Riscos que podem matar o plano — e onde eles aparecem

| # | Risco | Onde aparece | Mitigação |
|---|---|---|---|
| R1 | `MESSAGES_SET` não traz corpo da mensagem | Fase 0.1 | **Gate.** Descobrir antes, não no meio |
| R2 | Volume estoura storage/custo | Fase 0.2 | Medir antes; política de janela por conversa |
| R3 | Reconexão gasta a chance com código incompleto | Fase 6 | Ordem travada: 6 só depois de 1-4 verdes |
| R4 | Classificador marca cliente real como `pessoal` | Fase 4 | Transação nunca é rebaixada · `revisado_em` trava · botão de resgate |
| R5 | Campanha dispara antes da classificação | Fase 3 | Gate exige assunto resolvido |

---

## 5. Fora de escopo (declarado, para não virar Frankenstein)

- Score de propensão / RFM — outra frente
- Deduplicação de contatos — já existe merge por RPC
- Reclassificação retroativa de quem a dona já revisou — **nunca**, por desenho
- Qualquer mudança no fluxo de agendamento

---

## 6. Caminho crítico

```
FASE 0 (gate) → 1 → 2 → 3 → 4 → 5 → 6 (HITL, irreversível)
                     └── 3 pode correr em paralelo com 2 e 4
```

O único bloqueio humano está na Fase 6. Tudo antes disso é executável sem você.
