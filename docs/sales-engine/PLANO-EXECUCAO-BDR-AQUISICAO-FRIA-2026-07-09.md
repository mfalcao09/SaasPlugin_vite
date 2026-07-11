# Plano de Execução — BDR de Aquisição Fria (NexvyBeauty)

> **Data:** 2026-07-09 · **Autor:** Claude para Marcelo Silva · **Projeto:** SaasPlugin_vite
> **Natureza:** spec build-ready + checklist dia-0. **Dorme** até a GO-LIVE pingar "Onda 1 fechada = produto no ar"; a partir daí, executa sem deliberar.
> **Status das decisões:** as 10 decisões (D1-D10) foram cravadas por Marcelo em 2026-07-09, decisão por decisão (registro abaixo). Isto **é** a aprovação — não é mais proposta.
> **⚑ DONO (transferido por Marcelo 2026-07-09):** execução + orquestração desta frente pertencem à sessão **GO-LIVE `local_d4bae0c2` ("NexvyBeauty: GO LIVE")**, centralizado. A sessão BDR de origem é **suporte de contexto/consulta** (retém o "porquê": risco de ban, teste de match-rate, dados, rampa, racional das escolhas). Pendências D5 + parâmetros D6/D7 + build B1-B7 + guardrail = responsabilidade da GO-LIVE.
> **Gate de partida (invariável):** aquisição fria é estritamente **pós-Decolagem-verde** (produto usável no ar), não pós-provisionamento. A GO-LIVE (`local_d4bae0c2`) dá o sinal.

---

## 1. Decisões cravadas (o registro)

| # | Decisão | Cravado |
|---|---|---|
| **D1** | Canal do lead frio | **Ads → botão click-to-WhatsApp → opt-in no número oficial → Duda.** Nunca WhatsApp frio no número oficial. |
| **D2** | Autonomia v1 | **Playbook fixo + tetos diários + kill-switch**, com **aprovação em lote** na calibragem. |
| **D3** | Fonte de scrap | **Instagram > TikTok > Maps** (dados provam: IG dá 56% de celular casável; Maps daria fixo). |
| **D4** | ICP / palavras-chave | mesmas do trial: **nails, cabeleireira, manicure, lash, sobrancelha**. Micro-negócio de beleza (média 4,2k seguidores). |
| **D5** | Isca + criativos | **a elaborar** (pitches + criativos) — config, não bloqueia build. |
| **D6** | Verba inicial | **R$500** — orçamento de *aprendizado* (revela custo-por-opt-in; não escala). |
| **D7** | Volume | semente **limpa** de alguns milhares de celulares-ICP, no **ritmo sustentável** do scraper; **verba** define o teto de ativação (não o tamanho da base). |
| **D8** | Fronteira | nós = **aquisição → opt-in → handoff**; a **venda é da Duda**. |
| **D9** | Auto-melhoria (Hermes/eval "P1") | **diferida para v2.** v1 = playbook fixo. |
| **D10** | LGPD | **legítimo interesse + opt-out + registro de origem**, reusando o `consent_log` da GO-LIVE. |

---

## 2. Realidade dos dados (medido no trial, 2026-07-06)

Amostra: `prospectagram-leads-unificado-2026-07-06` — 124 leads, 5 palavras-chave, trial.

- **77% (95/124)** têm telefone/WhatsApp extraído da bio.
- **56% (70/124)** são **celular real casável** (o resto é fixo/inválido — descartar pra ads).
- 0 email · 0 CNPJ populado · porte 21–60k seguidores (média 4,2k) = ICP exato.

**Implicação:** match esperado em custom audience ~**56%** (só os celulares limpos) — bom pra direto E ótimo pra semente de lookalike. **O pipeline deve descartar fixo/inválido** antes de subir pra Meta (senão suja o match e a semente).

---

## 3. Arquitetura (o que se constrói)

```
IG (keywords D4) ──scrape──▶ prospect_staging ──valida/dedup/normaliza──▶ celulares-ICP limpos
                                                                              │
                                          ┌───────────────────────────────────┤
                                          ▼                                    ▼
                                  Custom Audience (direto)            Lookalike (semente)
                                          └───────────────┬───────────────────┘
                                                          ▼
                                          Campanha de ADS (verba D6, criativos D5)
                                                          │  click-to-WhatsApp
                                                          ▼
                              wa.me/<número-oficial>?text=Gostaria de saber mais sobre o NexvyBeauty
                                                          │  = INBOUND opt-in (nunca frio)
                                                          ▼
                                          Duda (platform-sales-brain) qualifica → vende
```

### 3.1 Componentes a construir (nossos)
1. **Scraper IG** — reusa prospectagram (ou equivalente via Apify, ban-aware). Entrada: keywords D4. Saída → `prospect_staging`. Ritmo sustentável (D7), não burst.
2. **`prospect_staging`** (tabela nova no sales-spark, ADITIVA — não altera leads/conversations que a Duda consome; alinhar com D10/consent_log da GO-LIVE):
   - `id uuid`, `organization_id uuid`, `handle text`, `nome text`, `telefone text`, `telefone_e164 text` (normalizado), `is_mobile boolean`, `whatsapp_link text`, `website text`, `categoria text`, `seguidores int`, `bio text`, `palavras_chave text`, `origem text DEFAULT 'instagram'`, `dedupe_key text` (telefone_e164 normalizado), `status text` (raw/validated/rejected/pushed_to_ad), `created_at`, `updated_at`. RLS org-scoped + service_role (padrão sales-spark).
3. **Pipeline validar/dedup/normalizar** — E.164, filtra `is_mobile`, dedup por `dedupe_key`, marca rejeitados (fixo/inválido). Só `validated` sobe pra Meta.
4. **Exportador de audiência** — gera CSV de custom audience (coluna `phone` E.164) + dispara upload/refresh periódico. (Upload manual no Ads Manager na v1; automação via Marketing API na v2.)
5. **Guardrails**: kill-switch (para scraper + pausa ads + Duda), tetos diários (scrape/dia, ativação/dia), circuit-breaker por sinal (report/block-rate). **O circuit-breaker é um módulo COMPARTILHADO com a GO-LIVE (`shared/outbound-guardrail` ou equiv.)** — acordado entre sessões 2026-07-09: mesmo motor (taxa de bloqueio + não-entrega → pausa automática), cada frente pluga sua **política + fonte de sinal** (nós: quality-rating do número oficial Meta; GO-LIVE: spike Baileys do número do salão). NÃO construir um circuit-breaker solo — a GO-LIVE pinga antes de fechar o schema na Onda 1 dela pra convergirmos num módulo só.
   - **Contrato de interface (travado entre sessões 2026-07-09):**
     - `Signal = {ts, metric_id, value, window}` — série temporal normalizada; o **adapter** de cada frente traduz a fonte real → Signal (nós: report-rate da Graph API; GO-LIVE: bloqueio/não-entrega Baileys).
     - `Policy = {metric_id, yellow_at, red_at, window, cooldown}` — declarativa; cada frente escreve a sua; histerese via `cooldown` (não volta a verde no 1º respiro).
     - **Núcleo burro:** compara Signal vs Policy → emite `pause`/`resume`/`alert`; não sabe nada de WhatsApp. Convenção: **maior = pior** (breach quando `value ≥ threshold`); métrica "menor = pior" (ex.: taxa de entrega) é invertida NO adapter (`1-rate`) pra manter o núcleo agnóstico.
     - **Kill-switch por frente:** o `pause` aciona o kill-switch da SUA operação (nós: ads+Duda; GO-LIVE: disparo Baileys). O módulo decide QUANDO; o QUE é de cada um.

### 3.2 Componentes que já existem (não reconstruir)
- Número oficial Cloud API + webhook inbound + **Duda** (`platform-sales-brain`) — **provado E2E** pela GO-LIVE.
- sales-spark (cadências, memória, A/B, pipeline).
- `consent_log` (a GO-LIVE cria na Onda 1 — reusar pra D10).

---

## 4. Sequência de build (cada passo dorme até o gate)

| Passo | Entrega | Check binário |
|---|---|---|
| B1 | `prospect_staging` (migration ADITIVA) | aplica limpa; RLS testada; sincronizada com consent_log da GO-LIVE |
| B2 | Scraper IG → staging (keywords D4) | run de teste popula ≥N leads validados; ritmo sem derrubar conta |
| B3 | Pipeline validar/dedup/normalizar | de 124 brutos → só os ~70 celulares limpos marcados `validated` |
| B4 | Exportador de custom audience | CSV E.164 pronto pro Ads Manager |
| B5 | **Teste de match-rate** (grátis) | Meta reporta match real; ≥30% → custom direto; <30% → lookalike |
| B6 | Campanha piloto (R$500, criativos D5) | mede **custo-por-opt-in**; click-to-WhatsApp cai na Duda |
| B7 | Guardrails (kill-switch + tetos + circuit-breaker) | kill-switch testado; teto corta; circuit-breaker dispara em sinal simulado |

> **B5 e B6 são o coração empírico.** Tudo antes é encanamento; eles dizem se a operação fecha (custo-por-opt-in < valor do cliente).

---

## 5. Checklist de execução dia-0 (quando a GO-LIVE der o verde)

1. [ ] Confirmar com GO-LIVE: Decolagem-verde + número oficial + Duda estáveis.
2. [ ] Rodar scraper IG (keywords D4) → `prospect_staging` (1ª leva, ritmo sustentável).
3. [ ] Pipeline valida → celulares-ICP limpos.
4. [ ] **Teste de match-rate** (B5) → decidir custom-direto vs lookalike.
5. [ ] Subir criativos (D5) + campanha R$500 com destino click-to-WhatsApp → número oficial.
6. [ ] Ligar guardrails (kill-switch, tetos, circuit-breaker).
7. [ ] Monitorar 48-72h: custo-por-opt-in, report-rate, opt-in→demo (Duda).
8. [ ] Decisão de escala: custo-por-opt-in aceitável → aumentar verba; senão iterar criativo/ICP.

---

## 6. Config em aberto (não bloqueia build; refina em paralelo)

- **D5 — Isca + criativos.** Rec: isca de **valor-diagnóstico** ("descubra quantas clientes sumiram da sua agenda") > pitch direto. Precisa da voz do Marcelo + peças criativas.
- **D10 — Fio LGPD.** Reusar `consent_log` da GO-LIVE; opt-out honrado no 1º toque da Duda; campo `origem` desde o dia 1.
- **D6/D7 — parâmetros** (verba/dia, teto de scrape/dia) — setar na largada.

---

## 7. Riscos e guardrails

1. **Número oficial** — nunca frio, só inbound opt-in (D1). Circuit-breaker por quality-rating. [Certo]
2. **Scraping IG** — contas de coleta caem; ritmo sustentável + Apify ban-aware; nunca burst (D7). [Provável]
3. **Match sujo** — fixo/inválido descartado antes da Meta (senão suja audiência). [Certo]
4. **Verba** — R$500 é aprendizado, não escala; escalar só com custo-por-opt-in provado. [Certo]
5. **LGPD** — legítimo interesse defensável só com opt-out imediato + minimização + origem registrada. [Provável]
6. **Colisão com GO-LIVE** — `prospect_staging` é aditiva; qualquer PR que toque `platform-sales-brain` sincroniza com a GO-LIVE antes (acordado entre sessões).

---

## 8. Flags de honestidade

- Cobertura 77% telefone / 56% celular: **[Certo]** (medido no arquivo do trial, 2026-07-09).
- Match esperado ~56%: **[Provável]** — confirmar no teste B5 (grátis).
- IG > Maps pra WhatsApp-alcançável: **[Provável]**, sustentado pelos dados do trial.
- Custo-por-opt-in de R$500: **[Palpite]** — só o piloto B6 revela.
- "Semente limpa > volume bruto" pra lookalike: **[Provável]** (comportamento conhecido da Meta).

---

## 9. Pendências do Marcelo (HITL)

- [ ] **D5:** aprovar a linha da isca + produzir/aprovar criativos.
- [ ] Setar parâmetros D6/D7 na largada (verba/dia, teto scrape/dia).
- [ ] Dar o "vai" quando a GO-LIVE confirmar produto no ar.

---

## 10. Prompt de início da sessão executora (copiar/colar ao abrir a sessão)

> Cole o bloco abaixo como primeira mensagem da **nova sessão executora**, no dia do "vai". Ele bootstrapa a sessão com o gate, a ordem de trabalho e a coordenação — sem depender do histórico desta discussão.

```
Você é a sessão EXECUTORA da frente BDR de Aquisição Fria do NexvyBeauty.
FONTE DE VERDADE: docs/sales-engine/PLANO-EXECUCAO-BDR-AQUISICAO-FRIA-2026-07-09.md
— leia o arquivo INTEIRO antes de qualquer ação.

GATE (invariável): só construa/execute se a sessão GO-LIVE
(local_d4bae0c2 "NexvyBeauty: GO LIVE") já confirmou "produto no ar / Onda 1
iniciada". Se ela ainda NÃO confirmou, PARE e avise o Marcelo — construir antes
é foguete sem pista.

ESTADO: as 10 decisões (D1-D10) estão cravadas (§1 do doc). Nada foi construído.
A branch feat/sales-eval-p1 (refactor antigo da Duda) foi DELETADA de propósito —
ignore, pertencia à v2 (D9 diferido). Rode `git status` e verifique o working-tree
antes de tocar em qualquer coisa (há sessões paralelas — cautela).

ORDEM DE TRABALHO: siga a sequência B1→B7 (§4 do doc). Comece por B1 (migration
ADITIVA `prospect_staging` — NÃO altere leads/conversations que a Duda consome).
Cada passo tem check binário; não avance sem provar o anterior. O coração é B5
(teste de match-rate, grátis) + B6 (piloto R$500 medindo custo-por-opt-in).

COORDENAÇÃO OBRIGATÓRIA: o circuit-breaker é um módulo COMPARTILHADO
(`shared/outbound-guardrail`). ANTES de projetar/construir o guardrail, pingue a
GO-LIVE (local_d4bae0c2) pra convergir no schema — NÃO construa um solo. Qualquer
PR que toque `platform-sales-brain` também exige sync com ela antes.

DADOS: amostra em ~/Downloads/prospectagram-leads-unificado-2026-07-06.{csv,json}
(124 leads trial; 77% com telefone, 56% celular casável). É PII REAL — nunca
commitar dado pessoal; só schema/agregados.

PENDÊNCIAS DO MARCELO (não construa sem, pergunte se faltarem): D5 (isca +
criativos), parâmetros D6/D7 (verba/dia, teto de scrape/dia).

Comece confirmando o GATE com o Marcelo. Se verde, leia o doc e ataque B1.
```
