# Blueprint — Frente LDR/BDR (Outbound aos 4.006 leads) · NexvyBeauty

> **Data:** 2026-07-15 · **Modo:** READ-ONLY (investigação por query/read; nenhum código ou banco alterado) · **Tom:** Conselheiro
> **Banco:** `fzhlbwhdejumkyqosuvq` · **Produto:** NexvyBeauty (`806b5975-e268-402e-a65c-9e9503271041`)
> **Escopo:** motor de disparo, os 4.006 leads, personas LDR vs BDR, anti-spam/warm-up e o **modelo LGPD do cold outreach**.

---

## 0. A verdade desconfortável primeiro

**[Certo] Não existe hoje um pipeline funcional de cold-outbound-via-WhatsApp para esses 4.006 leads — e o "backend de disparo pronto" que o plano-mestre alega é falso no lado da plataforma.** Três buracos concretos, verificados agora:

1. O motor que o stub aponta para reuso (`manual-outreach`) lê a tabela **`product_agents` (tenant) que tem 0 linhas** e a tabela `leads` (tenant), **não** os `platform_crm_extracted_leads` nem os `platform_crm_product_agents`. Chamá-lo com um agente da plataforma dá "Agent not found".
2. O motor de campanhas da plataforma (`platform-campaign-dispatcher`) **entrega só em webchat** — o próprio cabeçalho diz *"A plataforma NÃO tem WhatsApp"* e, sem conversa aberta, o alvo vira `skipped_no_channel`. **Não há instância Evolution da plataforma provisionada** (`platform_crm_evolution_instances` = 0).
3. **100% dos 4.006 leads foram gravados com `finalidade = 'audiencia_ads'`** (a coluna tem comentário *"SÓ audiência de Ads"*). Contatá-los direto no WhatsApp é uma **finalidade nova** — exatamente o desvio que você (advogado) já marcou como "base legal própria" na direção do BDR autônomo.

**[Provável] A pergunta certa não é "como disparo pros 1.497", é "cold direto deve acontecer?".** A direção que você **já cravou** (D1–D10, 2026-07-09) roteia aquisição por **ads → click-to-WhatsApp → opt-in → Duda, NUNCA frio no número oficial**, e trata o raspado como **inteligência de ICP** (targeting/lookalike), não como lista de discagem. Construir um motor de blast frio aos 4.006 **reabre o gate jurídico que você fechou de propósito**. Isso não é detalhe de implementação — é a decisão-mãe da frente. Trato-a no §5 antes de qualquer fase.

---

## 1. Fact-Forcing Gate (4 fatos reexecutados no banco)

Reexecutados em query única contra `fzhlbwhdejumkyqosuvq` no momento da escrita:

| # | Fato | Valor | Fonte |
|---|---|---|---|
| **F1** | Total de leads · salão-cliente com WhatsApp · só-Instagram | **4.006** · **1.497** · **1.562** | `platform_crm_extracted_leads` (query agregada) |
| **F2** | Agentes do produto · personas BDR/prospector existentes | **6** · **0** | `platform_crm_product_agents` |
| **F3** | Instância WhatsApp da plataforma · linhas de opt-out · leads com `finalidade='audiencia_ads'` | **0** · **0** · **4.006 (100%)** | `platform_crm_evolution_instances`, `platform_crm_lead_optout`, coluna `finalidade` |
| **F4** | `product_agents` (tabela que o `manual-outreach` lê) | **0 linhas** | `product_agents` (tenant) |

Query de verificação (idempotente, read-only): `select` de 9 contagens em `platform_crm_extracted_leads`, `platform_crm_product_agents`, `platform_crm_evolution_instances`, `platform_crm_lead_optout`, `product_agents`. Resultado bate 1:1 com a tabela acima.

---

## 2. Estado real — o que existe (arquivo:linha)

### 2.1 Motor `manual-outreach` (tenant) — o que faz e como dispara

`supabase/functions/manual-outreach/index.ts` (387 linhas). É o **único** motor do repo que efetivamente envia WhatsApp de saída via IA.

- **Entrada:** `{ lead_ids[], agent_id, organization_id, objective?, mode: 'direct'|'conversational', force_when_human?, instance_id? }` (`:20-40`).
- **Agente:** carregado de **`product_agents`** (`:50-54`) — tabela **tenant, hoje 0 linhas** (F4). Aqui está o descasamento: os agentes de venda vivem em `platform_crm_product_agents`.
- **Lead:** carregado de `leads` (tenant) (`:106-110`); normaliza telefone e prefixa `55` (`:112-117`); pula se sem telefone (`:113-115`).
- **Geração:** monta system-prompt com persona + knowledge base + modo, e chama gateway IA `google/gemini-2.5-flash` (`:206-219`).
- **Envio:** invoca `evolution-send` com `to`, `payload.text` (`:243-251`); quebra em até 2 bolhas (`:236-238`) com **800ms entre bolhas** (`:259`).
- **Dedupe/anti-flood atual:** por `(lead, agent)` — pula se houve outreach do mesmo agente **nas últimas 24h** (`:121-139`); pula se a conversa está `human_active`/`waiting_human` (`:150-155`).
- **Follow-up:** enfileira em `ai_outreach_queue` com **24h/48h**, `business_hours 09:00–18:00`, `business_days Mon–Fri`, `max_followups 2` (`:359-368`).

**Conclusão:** é um bom motor de outreach **retroativo/inbound** (falar com quem já está no funil do salão-tenant). **Não** é um motor de prospecção fria da plataforma — canal, tabelas e persona estão errados para os 4.006.

### 2.2 Disparo no lado da plataforma — webchat-only

`supabase/functions/platform-campaign-dispatcher/index.ts` (482 linhas), cron 1/min.

- Cabeçalho declara: *"A plataforma NÃO tem WhatsApp"* (`:19`); validações de WhatsApp (`whatsapp_opt_in`/telefone BR) **removidas** (`:15-17`); sem conversa aberta → `skipped_no_channel` (`:26`).
- Throughput: `GLOBAL_LIMIT = 100` alvos/tick (`:50`), `CONCURRENCY = 8` (`:51`); respeita janela horária de recorrência (`:53-69`).
- **Não há warm-up, teto diário por número, jitter humano nem gate de segmento.** É cap de vazão, não anti-ban.

`ProspeccaoCampanhasStub.tsx` (`:3-16`) confirma o plano: *"selecionar segmento da Base consolidada → disparar em massa via `manual-outreach` (que JÁ existe)"*. **O plano assume o reuso do motor tenant — que lê tabelas vazias.** É o gap central de wiring.

### 2.3 Os 4.006 leads — segmentos e canais

`platform_crm_extracted_leads`. Taxonomia definida em `20260712_extracted_leads_segment.sql:2-3` (`qualified` = pronto p/ venda **só** `salao_cliente`) + `acionamento_via_instagram` adicionado na view consolidada (`20260714_consolidated_leads_view.sql:61-66`).

| Segmento | Total | Com telefone/WhatsApp | Qualified | Canal viável | Alvo de venda do SaaS? |
|---|---:|---:|---:|---|---|
| **`salao_cliente`** | **1.507** | **1.497** | **1.507** | **WhatsApp** (phone BR) | **Sim — é o ICP** |
| **`acionamento_via_instagram`** | **1.562** | 0 | 0 | **Instagram DM** (sem telefone) | Sim, mas outro canal |
| `afiliado_infoproduto` | 397 | 287 | 0 | WhatsApp | Não — canal de afiliação, não cliente |
| `revisao` | 293 | 32 | 0 | — | Só após revisão humana |
| `descarte` | 247 | 103 (44 já excluídos) | 0 | — | **Nunca** |

**Acionável por canal:** WhatsApp para venda do SaaS = **1.497** (`salao_cliente` com telefone, todos `qualified`, `phone_is_br=true`). Instagram DM = **1.562** (zero telefone). Semente limpa (`is_seed`) = **66** no total (26 em `salao_cliente`). Base consolidada dedup = **4.005** linhas (1 colisão de handle fundida; nada perdido). 5 extrações.

### 2.4 Personas — LDR existe, BDR não

`platform_crm_product_agents` (6 agentes, produto Beauty):

| Persona | `agent_type` | Papel | Prompt | Canais |
|---|---|---|---|---|
| **Duda — SDR Qualificadora** | `sdr` | Vende/qualifica quem chega ao funil | 1.790 ch | WA+IG+Inbox |
| **Bia — Closer** | `closer` | Fecha por valor o que a Duda passou | 1.589 ch | WA+IG+Inbox |
| **Lia · Implantação** | `support` | Onboarding pós-compra | 1.222 ch | WA |
| **Nina — Sucesso/Retenção** | `retention` | Cuida de quem já usa | 1.215 ch | WA+IG+Inbox |
| Nexvy — Ativação Pós-Venda | `custom` | *(aposentado como papel — P2)* | **0** | — |
| Orquestrador Cliente-de-Volta | `custom` | Reativação | **0** | — |

- **LDR (qualificador de leads que chegam) = Duda.** Existe, production-grade, é `sdr`. No jargão clássico, LDR ≈ SDR-inbound = qualifica o que o marketing/ads traz.
- **BDR (prospector outbound / primeiro-toque frio) = AUSENTE.** Nenhum agente tem `agent_type ∈ {prospector,bdr,outbound,ldr}` (F2 = 0). Nenhum prompt de primeiro-toque frio existe. Duda **responde** quem já veio qualificado — ela **não prospecta frio**.
- **O que falta para o BDR:** (a) prompt de primeiro-toque que **leva ao opt-in, não vende** (alinhado ao D8: "venda é da Duda"); (b) `agent_type='prospector'`; (c) reconhecimento no roteador; (d) wiring a um motor de disparo platform-side + número dedicado.

### 2.5 Roteador (`_shared/agent-routing.ts`, do PR #68 — não deployado)

- Reconhece **só** `sdr` / `closer` / `retention` (`:14-38`); `pickSdrPersona() ?? null` mata a roleta `agents[0]` (`:44-47`) — abre conversa só com a Duda ou cala com segurança.
- **Não reconhece `prospector`.** Um BDR precisaria de `isProspectorAgent()` + uma regra de "primeiro-toque de saída" que **não** passa pelo caminho inbound do brain.
- Nota: o outbound do `manual-outreach` **gera a 1ª mensagem sozinho** (não pelo brain); o brain (`platform-sales-brain`) é reativo (responde a inbound). Então o BDR precisa de um gerador de 1º-toque próprio, como o `manual-outreach` faz — mas platform-scoped.

### 2.6 Anti-spam / deliverability / warm-up — essencialmente ausente

| Controle | Existe? | Onde / gap |
|---|---|---|
| Delay entre bolhas | ✅ 800ms | `manual-outreach:259` |
| Dedupe por (lead, agente) 24h | ✅ | `manual-outreach:121-139` |
| Janela comercial (09–18, Seg–Sex) | ✅ | `ai_outreach_queue` defaults `:359-364` |
| Cap de vazão por tick | ✅ 100/8 | `platform-campaign-dispatcher:50-51` |
| **Warm-up ramp (rampa de aquecimento de chip)** | ❌ | inexistente |
| **Teto diário por número/instância** | ❌ | inexistente |
| **Jitter humano (intervalo aleatório entre leads)** | ❌ | inexistente |
| **Gate de segmento no disparo** | ❌ | inexistente (nada impede disparar em `descarte`) |
| **Detecção de bloqueio/queda de quality-rating** | ❌ | inexistente |
| **Kill-switch de campanha fria** | ❌ | inexistente |

**[Certo] Para cold outbound em volume, isto é o cenário de ban.** Baileys/Evolution em chip novo, sem rampa e sem teto, disparando frio = bloqueio + denúncia + morte do número em dias. A própria memória do BDR crava: *"API oficial Meta + template aprovado NÃO blinda de ban"* e *"scraping rápido queima conta"*.

### 2.7 LGPD — o que já existe na infra

- **Base legal e finalidade gravadas por lead:** `lgpd_basis = 'art7_par4_publico'`, `finalidade = 'audiencia_ads'` (`leads-extraction-webhook:155-156`; `leads-import-profiles:163-164`; default da coluna em `20260712_platform_crm_lead_extractions.sql:96`).
- **Opt-out (Art. 18) na INGESTÃO:** ambos os caminhos de import filtram `platform_crm_lead_optout` por telefone/@handle antes de estagiar (`leads-import-profiles:112-136`; `leads-extraction-webhook:88-126`). **Mas a tabela está vazia (0 linhas)** e **nada popula ela em runtime** — não há handler de "SAIR/PARE" no `platform-sales-brain` (grep = nada). Ou seja: o opt-out é honrado no re-import, **não durante a conversa**.
- **Número oficial:** `platform_crm_whatsapp_meta_connections` = 2 (WABA demo). Por D1, **só para opt-in inbound, nunca frio**.
- `lgpd_consents` = 1 linha (tenant-side). Não cobre o cold da plataforma.

---

## 3. O modelo LGPD do cold outreach (o coração)

> Você é o advogado — este é o **modelo de engenharia enforçável** + os pontos de decisão. Sua validação jurídica prevalece sobre qualquer coisa aqui.

### 3.1 O problema central: mudança de finalidade

**[Certo] Os 4.006 foram coletados sob `finalidade = 'audiencia_ads'` com base `art7_par4_publico` (dado público).** O Art. 7º §4 dispensa **consentimento** para dado tornado manifestamente público — mas **não** dispensa os demais princípios: **finalidade, adequação, necessidade, transparência, não-discriminação** (Art. 6º). Dado público continua sujeito a finalidade específica e legítima.

**Contatar direto no WhatsApp é finalidade DIFERENTE de montar audiência de ads.** Reaproveitar `audiencia_ads` → `contato_comercial` sem reavaliar a base é violação de **limitação de finalidade** (Art. 6º, I). Você mesmo cravou isto na direção do BDR: *"transferir dado a terceiro/Meta ≠ contatar no funil — base legal própria"*.

**Consequência de engenharia:** cold WhatsApp direto exige (a) **nova base legal** — legítimo interesse (Art. 7º, IX) com **LIA/teste de proporcionalidade** próprio; (b) **atualizar `finalidade`** no registro para algo como `prospeccao_comercial_b2b`; (c) documentar o balanceamento. Isto é ato **constitucional** (Seção 14 §10) — **só sua palavra direta ratifica**, nunca por relay.

### 3.2 Modelo proposto (se você ratificar o contato direto)

| Princípio LGPD | Controle técnico enforçável | Estado hoje |
|---|---|---|
| **Finalidade** (Art. 6º I) | Coluna `finalidade` reflete o uso real; disparo lê a finalidade certa; audita | ❌ hoje é `audiencia_ads` (100%) |
| **Necessidade/minimização** (Art. 6º III) | **Segment-gate:** disparo só em `salao_cliente` + `qualified` + `phone_is_br`; nunca `descarte`/`afiliado`/`revisao` | ❌ nenhum gate no disparo |
| **Transparência** (Art. 6º VI) | 1ª mensagem diz **quem somos + de onde veio o contato** ("vi seu Instagram público @x") + como sair | ❌ prompt BDR não existe |
| **Livre acesso / oposição** (Art. 18) | Opt-out em 1 palavra ("SAIR"/"PARE") → grava `platform_crm_lead_optout` + **para a cadência na hora** + honra no re-import | ⚠️ só no re-import; runtime ausente |
| **Eliminação / TTL** (Art. 16) | Lead frio não convertido expira (ex. 180 dias) → elimina/anonimiza | ❌ inexistente |
| **Accountability** (Art. 37) | Log por lead: base legal + finalidade + origem + timestamp de contato + evento de opt-out | ⚠️ base/finalidade sim; log de contato/opt-out runtime não |
| **Segurança** (Art. 46) | Número dedicado (nunca o oficial); dados não trafegam no front | ⚠️ número dedicado não provisionado |

### 3.3 Enquadramento B2B (atenua, não elimina)

**[Provável]** O alvo são **estabelecimentos** (salões/profissionais da beleza, muitos MEI/PJ). Contato **comercial B2B** tem legítimo interesse mais defensável que B2C. **Porém** o dado capturado é o **celular pessoal** do profissional (PF) — zona cinza. É decisão sua onde traçar a linha; a engenharia consegue **segmentar por sinais de PJ** (tem CNPJ no bio, categoria comercial) para reforçar o enquadramento B2B se você quiser esse gate.

### 3.4 O canal Instagram DM tem regras próprias

Os **1.562** `acionamento_via_instagram` não têm telefone → canal é **DM do Instagram**, com limites da própria Meta (DMs a não-seguidores, risco de block/shadowban) e ToS distintos. **Não é WhatsApp e não herda o modelo acima** — é uma frente de canal separada, com seu próprio gate. Fora do MVP.

---

## 4. Arquitetura proposta (reuso vs novo)

### 4.1 Reusar (não reconstruir)

- **Duda (LDR/SDR)** — já qualifica inbound; é o destino do opt-in (D8). Zero trabalho.
- **`evolution-send`** — camada de envio WhatsApp já existe.
- **`ai_outreach_queue` + lógica de follow-up/dedupe/janela** do `manual-outreach` — o padrão de cadência é bom; portar 1:1 para o lado plataforma.
- **`platform_crm_lead_optout` + filtro de ingestão** — a espinha do opt-out já existe; falta o gatilho runtime.
- **Roteador `agent-routing.ts`** — estender, não reescrever.

### 4.2 Construir novo (o front-half do BDR)

| Componente | Descrição | Por que novo |
|---|---|---|
| **Persona BDR** (`agent_type='prospector'`) | Prompt de 1º-toque que **leva ao opt-in, não vende**; origem transparente | F2 = 0; papel inexistente |
| **`isProspectorAgent()` no roteador** | Reconhece o BDR; primeiro-toque não passa pelo caminho inbound do brain | roteador só conhece sdr/closer/retention |
| **`platform-manual-outreach`** (edge nova) | Fork do `manual-outreach` lendo `platform_crm_extracted_leads` + `platform_crm_product_agents` + instância Evolution **da plataforma** | o tenant lê tabelas vazias (F4) |
| **Camada anti-ban** | Warm-up ramp + teto diário/número + jitter + segment-gate + kill-switch + detecção de queda | tudo ausente (§2.6) |
| **Opt-out runtime** | Handler "SAIR/PARE" no brain → grava optout + para cadência | ausente |
| **Instância Evolution dedicada** | Número **burner**, nunca o oficial (D1) | `platform_crm_evolution_instances` = 0 |
| **TTL/expurgo** de lead frio | Job de retenção | ausente |

---

## 5. Decisões para o Marcelo

### 5.1 Leitura do pedido — confirme antes de eu (ou a GO-LIVE) construir

"LDR/BDR outbound aos 4.006" tem 3 leituras, com implicações jurídicas opostas:

- **(a) Cold WhatsApp direto aos 1.497** — implicação: **finalidade nova + LIA + número burner + warm-up**; reabre o gate que D1/via-limpa fecharam. **Não ratificado.**
- **(b) Os 4.006 como inteligência de ICP** → ads por interesse + lookalike semeado de first-party → opt-in → Duda. Implicação: **é a via-limpa que você já cravou (D3–D10)**, sem gate novo. **Ratificado.**
- **(c) Híbrido** — Instagram DM (mais brando) aos 1.562 sem-telefone + ads para o resto + BDR frio só como piloto gated na semente limpa.

**Minha leitura recomendada: (b) como default ratificado, com (a) apenas como piloto gated e explicitamente aprovado.** Confirma ou ajusta?

### 5.2 Ratificado vs precisa do seu "aprovo"

**Já ratificado (D1–D10, 2026-07-09) — pode construir:**
- Aquisição por **ads → click-to-WhatsApp → opt-in → Duda**; nunca frio no número oficial (D1).
- Raspado = **inteligência de ICP** (targeting/lookalike de first-party), não lista de discagem (via-limpa).
- Playbook fixo + tetos + kill-switch + aprovação em lote (D2); piloto R$500 medindo custo-por-opt-in (D6); LGPD legítimo-interesse + opt-out + origem (D10).

**Precisa do seu "aprovo" explícito (constitucional — nunca por relay):**
1. **Cold WhatsApp direto** aos leads raspados → mudança de `finalidade` (`audiencia_ads`→`prospeccao_comercial`) + LIA. *(Sem isto, nada dispara frio.)*
2. **Provisionar número/instância burner** para cold.
3. **Qualquer uso do número oficial para frio** → já vetado por D1; nem entra na fila.

**Overlap com o BDR-autônomo NÃO-ratificado:** a arquitetura "BDR 24/7 autônomo" (memória `project_bdr_autonomo_e_infra_cerebro`) permanece **PROPOSTA EM DISCUSSÃO**, e sua execução foi **transferida à sessão GO-LIVE `local_d4bae0c2` e está PARKED até Onda 1 verde**. A auto-melhoria (Hermes/eval P1) está **diferida para v2 (D9)**. Este blueprint é o **front-half do BDR** (sourcing→opt-in→handoff) — **não** liga autonomia nem auto-edição de skills. Ligá-los é decisão separada, pós-eval-de-conversão.

### 5.3 Cadência e canais (proposta, se (a) for ratificado)

- **Canal primário:** número **burner** dedicado via Evolution — nunca o oficial.
- **Cadência:** 1º-toque (opt-in) → +24h → +48h, máx. 2 follow-ups (reusa defaults do `manual-outreach`), janela 09–18 Seg–Sex, jitter 40–180s entre leads.
- **Volume:** warm-up ramp (ex. 20/dia dia 1 → dobra a cada 2–3 dias até teto), teto diário por número, começar pela **semente limpa (26 seeds `salao_cliente`)**.
- **Personas:** BDR (`prospector`, 1º-toque→opt-in) → handoff → **Duda (LDR/`sdr`)** qualifica → **Bia (`closer`)** fecha. Zero venda no frio.

---

## 6. Fases + check binário

| Fase | Entrega | Check binário | Depende de |
|---|---|---|---|
| **F0 · Gate jurídico** | Decisão de finalidade + LIA + canal, registrada por você | ✅ Marcelo grava "ratifico (a)" **ou** "só via-limpa (b)" | **você** |
| **F1 · Segurança (buildável já, independe do gate)** | Handler opt-out runtime ("SAIR/PARE" → `platform_crm_lead_optout` + para cadência) + TTL + log de accountability | ✅ E2E: msg "SAIR" grava row em `platform_crm_lead_optout` e a cadência para | — |
| **F2 · Persona BDR (draft inerte)** | `agent_type='prospector'` + prompt 1º-toque→opt-in + `isProspectorAgent()` no roteador | ✅ `deno test` do roteador reconhece `prospector`; agente **não wired** (inerte) | — |
| **F3 · Plumbing platform outbound (dormant)** | `platform-manual-outreach` lendo tabelas da plataforma + camada anti-ban (warm-up/teto/jitter/segment-gate/kill-switch), **em DRY-RUN** | ✅ dry-run gera mensagens + enfileira **sem enviar** (envio atrás de flag OFF); segment-gate recusa `descarte`/`afiliado` | F1, F2 |
| **F4 · Piloto controlado** | Warm-up real na semente limpa (26 seeds), número burner, custo R$0, métrica = **opt-in-sem-report** | ✅ N msgs enviadas via burner; kill-switch testado; opt-out honrado; **zero uso do oficial** | **F0 (a) ratificado** + F3 |

**Regra de ouro (Seção 14 §10):** F1/F2/F3 são operacionais e buildáveis; **F4 e a mudança de finalidade são constitucionais** — só param na sua palavra direta.

---

## 7. MVP mínimo

**[Provável] O MVP honesto NÃO é "blast nos 1.497".** Dado o gate de finalidade + a via-limpa ratificada, o MVP mínimo defensável é:

1. **Opt-out runtime + accountability log** (F1) — melhoria de segurança **necessária de qualquer forma**, independe do gate. Fecha o buraco de "opt-out só no re-import".
2. **Persona BDR draft + roteador** (F2) — artefato inerte, sem risco.
3. **`platform-manual-outreach` em DRY-RUN** (F3) — plumbing pronto e **dormente**; prova que gera mensagem certa + honra segment-gate + optout, **sem enviar nada**.
4. **Doc de decisão de finalidade/LIA para você** (F0) — o único item que destrava o envio real.

**Só se você ratificar (a):** piloto na **semente limpa de 26 seeds `salao_cliente`** via número burner com warm-up, medindo **custo-por-opt-in** — espelhando a disciplina do piloto R$500 de ads que você já aprovou (D6). Semente limpa > volume (D7).

Isto entrega valor real (segurança + plumbing + persona) sem tocar no gate jurídico, e deixa **um único botão** (sua ratificação de finalidade) entre o dormente e o piloto.

---

## 8. Riscos e recomendação final

- **[Certo]** Disparar frio aos 1.497 hoje, como está, = ban de número + exposição de finalidade (`audiencia_ads`≠contato) + opt-out não-honrado em runtime. Três falhas simultâneas.
- **[Provável]** A via-limpa (b) entrega o mesmo objetivo comercial (clientes novos) sem reabrir o gate: os 4.006 são ouro **como targeting**, não como lista de discagem.
- **Recomendação:** construir F1–F3 (seguro, buildável, valor real) + o doc de decisão F0. **Não** disparar frio sem sua ratificação de finalidade. Se ratificar, pilotar só na semente limpa, medindo opt-in-sem-report — nunca volume primeiro.

> **Discordância estruturada:** se o pedido implícito era "monta o blast pros 1.497 e manda ver", eu discordo — o risco é ban + exposição LGPD numa frente onde você é o advogado e já cravou a via-limpa. O que eu faria em vez disso: F1–F3 dormentes + a decisão de finalidade na sua mão. Se você tem informação nova (ex.: já decidiu que o contato direto B2B é defensável e quer assumir o risco), me diga e eu ajusto o plano para priorizar F4.

---

*Blueprint READ-ONLY. Nenhum código, migration ou registro foi alterado. Pareado com `LDR-BDR-OUTBOUND-BLUEPRINT-2026-07-15.html`.*
