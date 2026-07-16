# Ads Inbound Instagram — Estratégia de Aquisição Paga (NexvyBeauty)

> **Data:** 2026-07-15 · **Autor:** estrategista de aquisição paga (síntese de 5 dimensões de pesquisa + realidade do codebase) · **Modo:** Conselheiro em Ads · **Escopo:** gerar INBOUND quente em número Meta oficial NOVO e exclusivo, via Ads Meta/IG, usando os 4.006 leads raspados como semente de lookalike e a esteira/raio-x como isca.

---

## Resposta desconfortável primeiro

**[Provável, alta confiança] O que bloqueia essa campanha não é provisionar o número — é o loop de sinal que não existe no código.** Provisionar o número novo e plugar o agente é trabalho de ~1 dia de ops (o pipeline de inbound já está pronto e deployado). Mas se você subir mídia hoje, a campanha vai otimizar por "conversa iniciada" — o sinal mais raso — e num público que é dos mais saturados de golpe/MLM do Meta (dona de salão 25-45), isso enche seu WhatsApp de curioso barato. Você vai ver "CPL baixo" e achar que ganhou, enquanto queima orçamento.

**As duas verdades que quase todo mundo erra:**

1. **O maior ROI dos 4.006 leads é EXCLUSÃO, não lookalike.** Você vai rodar cold outbound nos mesmos 1.919 telefones. Se não excluí-los da campanha de Ads, você paga pra alcançar gente que já está sendo abordada de graça — e suja a atribuição.
2. **O que faz o Ads valer é fechar o loop CTWA→CRM→CAPI.** Capturar o `ctwa_clid` na primeira mensagem e devolver ao Meta os eventos "pediu o raio-x / comprou". Isso NÃO existe no código hoje. Sem ele, o Advantage+ nunca aprende a buscar dona-que-compra em vez de curioso-que-manda-oi.

**Regra dura: não sobe 1 real de mídia de escala antes do G1 (captura de referral) estar de pé.** Um teste de gancho de 48h pode rodar antes; escala, não.

---

## 1. TL;DR + a arquitetura de aquisição em 3 vetores

### Os 3 vetores (e por que convergem)

| Vetor | Porta de entrada | Temperatura | Custo de mídia | Escala | Estado |
|---|---|---|---|---|---|
| **1. Cold outbound** | WhatsApp (1.919 tel.) + IG-DM (1.562 sem tel.) | Frio | ~zero | Limitada por número/deliverability | Rodando/em construção (Duda outbound + BDR) |
| **2. Ads inbound (CTWA)** | Número oficial NOVO exclusivo | **Quente (vem até nós)** | Pago, previsível | Escala com budget | Pipeline pronto; falta loop de sinal |
| **3. Esteira/raio-x (ISCA)** | Transversal — serve os dois | — | — | — | Backend pronto (Bloco A); front não construído |

O ponto que amarra tudo: **os 3 vetores convergem no MESMO funil e no MESMO roster de agentes.** A esteira/raio-x é o gancho do outbound ("posso te mostrar o raio-x do seu WhatsApp?") E o payoff do anúncio inbound. A diferença entre os vetores é só a **porta de entrada (número/conexão)** — a máquina downstream (Duda→Bia→Cakto→Lia) é a mesma.

### Como o inbound se encaixa (sem fragmentar)

```
                        ┌──────────────────────────────────────────┐
  VETOR 1: outbound ───▶│                                          │
  (número cold)         │   MESMO FUNIL / MESMO ROSTER DE AGENTES   │
                        │                                          │
  VETOR 2: Ads CTWA ───▶│   Duda (SDR, abre/qualifica)             │
  (número inbound NOVO) │      └─▶ ESTEIRA/RAIO-X (vetor 3, isca)   │
                        │           └─▶ Bia (closer) ─▶ Cakto       │
  demo 11 95213-9912 ──▶│                └─▶ Lia (pós-venda, P10)   │
  (não misturar)        │                                          │
                        └──────────────────────────────────────────┘
```

O inbound é **uma 3ª conexão Meta Cloud** sob o mesmo produto `nexvybeauty`. O webhook roteia por `connection_id` e herda o `product_id` da conexão — então o número novo entra reusando ~100% do que existe. O "agente específico" que o Marcelo quer não é uma persona nova (isso reintroduziria um bug de roteamento — ver §5): é a **Duda em MODO INBOUND**, uma abertura ciente do anúncio.

**A isca é a arma anti-golpe.** Num público lotado de "fature 10k com cílios", picareta nenhuma consegue mostrar um produto real. O raio-x mostra o dinheiro parado NO WhatsApp DELA — é prova, não promessa. Toda a estratégia gira em fazer ela querer o raio-x, não em "vender o SaaS" no anúncio.

---

## 2. Audiência — o caminho do lookalike (com opções e trade-offs)

### O que você REALMENTE tem (números reais da base)

| Segmento | Total | Com telefone | é ICP? | Uso |
|---|---:|---:|---|---|
| **salao_cliente** (qualified) | 1.507 | **1.497** | ✅ ICP puro | **Semente do lookalike** |
| acionamento_via_instagram | 1.562 | 0 | ✅ ICP, só IG-DM | Fora de Ads (sem chave de match) |
| afiliado_infoproduto | 397 | 287 | ❌ vende curso, não é dona | **NÃO usar na semente** |
| revisao / descarte / lixeira | ~833 | ~135 | 🟡/❌ | Excluir da semente |
| **TOTAL** | **4.006** | **1.919** | | |

Fatos que mudam a execução:
- **Telefone já em `55<DDD>9XXXXXXXX`** (E.164 sem o `+`). Só prefixar `+`. [Certo]
- **Handle do Instagram NÃO é chave de match no Meta.** Isso condena os 1.562 IG-only a ficarem fora de custom audience — eles são canal IG-DM, não Ads. [Certo]
- **Match esperado (telefone-only, BR): 45-65%** → semente pura de 1.497 rende **~675-975 matched** — fica logo abaixo do piso confortável de 1.000 do lookalike clássico. [Provável]

### Os 3 usos dos 4.006, em ordem de ROI

1. **EXCLUSÃO (maior ROI, contraintuitivo).** Suba os 1.919 telefones como `CA_ExclusaoLeads` e **exclua** de todo adset de prospecção. Não canibaliza o outbound grátis, não suja atribuição. [Provável, alta]
2. **SEMENTE.** Os 1.497 `salao_cliente` puros → `CA_Semente_ICP`. **Não engorde com `afiliado_infoproduto`** — afiliado de infoproduto ensina o Meta a te trazer marqueteiro, não dona de salão. Semente pura de ~800 > semente suja de ~1.100. [Provável]
3. **RETARGETING.** Quem iniciou CTWA e não comprou → camada quente com criativo próprio ("vi que você não terminou o raio-x…").

### Recomendação de lookalike

**[Provável] Com semente fina (~800 matched), não gaste energia brigando 1% vs 5%.** Dois caminhos:

- **Caminho A (recomendado, 2026): Advantage+ Audience.** A semente `salao_cliente` entra como **sinal/sugestão** (não fronteira rígida), + interesses de beleza como audience suggestions. O A+ tolera semente fina muito melhor que o LAL clássico porque completa com o resto dos sinais dele. Menos adsets, aprende mais rápido.
- **Caminho B (LAL clássico, se quer leitura limpa): 1% e 3-5% em paralelo**, budget igual, adset limpo (sem cruzar com interesse), e deixa CPL + qualidade da conversa decidir em 7-10 dias.

**Geo: BR nacional** (a semente é nacional — DDDs 85, 81, 11, 49, 48, 35, 73…; travar em metrô joga fora o ICP). **Idade 25-45, gênero feminino como principal** (sugestão no A+, não trava).

**Não empilhe `LAL ∩ interesse ∩ geo-metro` como AND rígido** — em 2026 isso estrangula a entrega. Um eixo forte por adset.

### O pulo do gato (longo prazo)

Assim que você tiver **~100 compradores reais**, construa um **lookalike de COMPRADORES**. Ele enterra o lookalike dos 1.497 raspados — "quem comprou o SaaS" é sinal infinitamente melhor que "dona de salão que raspei do IG". O lookalike raspado é a ponte até lá, não o destino. Isso só funciona se o CAPI (§6) estiver instrumentado desde o dia 1.

---

## 3. Formato & Canal — CTWA no número oficial novo

### Por que CTWA (e não Lead Form nem DM Ads)

| | **CTWA (Click-to-WhatsApp)** | Lead Form | DM Ads (IG Direct) |
|---|---|---|---|
| Cai onde? | **Thread no SEU número oficial** | Formulário Meta → você recebe o telefone | Caixa de DM do Instagram |
| Quem inicia? | **A dona (inbound real)** | Você (vira outbound: template pago, janela 24h) | A dona, mas no canal errado |
| Agente/esteira | **Nativo** (webhook → brain → Duda) | Precisa disparar template (caro, baixa resposta) | Handoff pra esteira é capenga; sem número oficial |
| Aderência ao pedido | **Total** | Contradiz "inbound" | Contradiz "número oficial WhatsApp" |

**Lead Form** te transforma no caçador (o oposto de "lead quente vem até nós"). **DM Ads** te tira do WhatsApp e do número oficial. **CTWA é o único que atende o objetivo declarado.** Objetivo de campanha: **Leads/Vendas com conversion location = WhatsApp** (ou Engajamento→WhatsApp no teste inicial).

### Caminho técnico do plug (ancorado no código)

```
Anúncio (Reels/Stories/Feed, CTA "Enviar mensagem")
  → clique abre wa.me do número dedicado (o número ligado à Página do anúncio)
  → 1ª mensagem chega na Cloud API COM bloco `referral`
       (source_id=ad_id, ctwa_clid, headline, body, ...)
  → POST platform-meta-whatsapp-webhook/{connection_id}
       · valida X-Hub-Signature-256 · idempotência por wamid
       · cria conversa+lead · HERDA product_id DA CONEXÃO
  → platform-sales-brain + agent-routing → pickSdrPersona = Duda (SDR) abre
  → Duda dispara a isca → esteira/raio-x → [PASSAR_BIA] → Cakto → Lia (P10)
```

**Arquivos que sustentam (todos deployados):**
- `supabase/functions/platform-meta-whatsapp-connect/index.ts` — wizard que provisiona o número (retorna `webhook_url` + `verify_token`).
- `supabase/functions/platform-meta-whatsapp-webhook/index.ts` — receptor; herda `product_id` da conexão (l.425-427); carimba `meta_connection_id` (l.190).
- `supabase/functions/_shared/agent-routing.ts` — `pickSdrPersona` determinístico (Duda abre).

**O gap crítico (o que precisa ser construído):**
- **G1 — Captura do `referral`/`ctwa_clid`.** VERIFICADO: o webhook **não lê** `messages[].referral` hoje (grep = zero). Sem persistir, você não sabe que o lead veio de anúncio, nem de qual criativo, e não tem o `ctwa_clid` pra atribuir a venda. É o caminho crítico.
- **G4 — CAPI de conversão.** Devolver `demo_completed`/`purchase` com o `ctwa_clid` pro Meta. Sem isso, o Advantage+ otimiza pela métrica errada. (Nomes exatos do payload CAPI-CTWA: conferir na doc Graph vigente antes de codar — não chutar o JSON.)

### O que o Marcelo provisiona (ops, quase nenhum código)

- [ ] **Número novo, limpo**, nunca usado no app WhatsApp/Business (senão não entra na Cloud API). Caminho natural: **novo número Salvy** que receba o código por SMS/ligação.
- [ ] Registrar como novo phone number na **MESMA WABA já verificada** ("Nexvy Beauty Demo", `1023556786945354`) — herda a verificação de negócio, menos burocracia. Pega `phone_number_id` + `waba_id`.
- [ ] **Registrar na Cloud API** (POST `/register` com PIN de 6 dígitos).
- [ ] App Meta com `whatsapp_business_messaging`; assinar a WABA + o campo **`messages`**.
- [ ] Rodar o wizard `platform-meta-whatsapp-connect` → nova connection row → novo `webhook_url`.
- [ ] **GOTCHA decisivo:** o CTWA abre **o número ligado à Página do Facebook** usada no anúncio. Então o número dedicado de inbound **tem que ser o número ligado à Página/conta de anúncio** dessa campanha. Se a Página aponta pro demo, ou troca, ou usa **uma Página separada** pra captação. Definir ANTES de subir criativo.
- [ ] **Aquecimento:** número Meta recém-criado tem tier inicial (250/1k conversas) e qualidade sensível. Suba budget gradual (não estoure R$500/dia num número frio no dia 1).

---

## 4. Criativos & Pitches — do mais forte ao mais fraco

**A jogada macro: o anúncio vende o raio-x grátis, não o SaaS.** Grand Slam Offer do lead magnet: *dream outcome* = cadeira cheia / cliente antiga voltando; *perceived likelihood ↑* = "eu te MOSTRO o dinheiro parado antes de você pagar 1 real"; *time delay ↓* = "em 5 min você vê o seu número"; *effort ↓* = "só manda um oi". Nome padronizado: **"Raio-X do seu WhatsApp"**.

**Regra dos 3 segundos:** o thumbstop é 100% do jogo no Reels. Número específico OU pergunta auto-referente OU rosto real de susto. Nada de logo/intro/"olá pessoal".

### C1 — "O dinheiro dormindo no seu WhatsApp" (loss aversion + UGC) · MAIS FORTE
- **Hook (frame 1):** close no rosto de uma dona real (não modelo), susto genuíno + texto: **"Tinha R$ 4.200 PARADOS no meu WhatsApp e eu nem sabia."**
- **Visual:** UGC vertical 9:16, 15-25s, dentro do salão, celular na mão, luz natural, zero cara de agência.
- **Pitch (PAS):** cliente nova chega, antigas somem sem ela perceber → terça com cadeira vazia → IA lê o WhatsApp, mostra quem sumiu e chama de volta.
- **CTA:** "Manda **'raio-x'** no nosso WhatsApp que a gente te mostra quanto tá parado no SEU — de graça."
- **Por que:** número quebrado e crível (R$ 4.200, não "muito dinheiro"). Loss aversion > ganho. Rosto real mata o filtro anti-golpe.

### C2 — "Quantas sumiram em 180 dias?" (curiosidade + quiz)
- **Hook:** texto sobre fundo de salão: **"Quantas clientes suas sumiram nos últimos 6 meses?"** + "(quase toda dona erra por MUITO)"
- **Visual:** carrossel 4:5 (4 cards) ou estático. Roda barato, escala bem no A+.
- **Pitch:** loop de curiosidade auto-referente — ela QUER saber o próprio número. O agente calcula a partir de 2-3 perguntas.
- **CTA:** "Descubra seu número → chama no WhatsApp"

### C3 — "O raio-x por dentro" (demo real / show, don't tell)
- **Hook:** screen-recording do raio-x sendo gerado ao vivo: "clientes sumidas: 47 · R$ parado: R$ 6.800 · próxima a voltar: Ana".
- **Visual:** gravação de tela real da esteira + voiceover calmo, 20-30s.
- **Pitch:** "olha o produto de verdade funcionando." Perceived-likelihood dispara. É o oposto de todo golpe (que nunca mostra produto).
- **CTA:** "Quero meu raio-x gratuito"
- **Por que:** produto real = credibilidade instantânea. **Provavelmente o melhor CPL depois de aquecer.**

### C4 — "A cadeira vazia" (no-show / agenda)
- **Hook:** cadeira de salão vazia, iluminada + **"Toda cadeira vazia na terça é dinheiro que não volta."**
- **Visual:** UGC ou mini-cinematográfico 9:16, 12-20s.
- **Pitch:** agita no-show → "a IA lembra, confirma e reagenda antes da cadeira ficar vazia."

### C5 — "5 minutos por dia" (baixa o esforço / anti-overwhelm)
- **Hook:** dona tomando café, celular na mão + **"5 minutos. É só isso que eu faço no sistema por dia."**
- **Pitch:** ataca o medo "mais uma ferramenta complicada". Ótimo pra **retargeting** de quem viu e não clicou.

### C6 — Fundadora-pra-fundadora (autoridade + de-scam explícito)
- **Hook:** pessoa real na câmera, sem edição chique + **"Não é robô frio que espanta cliente. É tipo uma recepcionista que nunca dorme."**
- **Pitch:** constrói confiança, nomeia o medo do spam-bot. Segura o público cético que os outros 5 ativaram.

### Converte vs. cheira a golpe/MLM

| Converte (fazer) | Cheira a golpe (fugir) |
|---|---|
| Dona real, salão real, luz natural | Modelo de banco de imagem, carrão/praia |
| Número quebrado e crível (R$ 4.200) | "Fature 10k/mês", "R$ 30.000 em 30 dias" |
| Mostrar o produto na tela (demo) | Só promessa, nenhum print de produto |
| "5 min por dia", "ferramenta que te ajuda" | "Renda extra", "trabalhe de casa", "seja sua chefe" |
| Recuperar SUA cliente (ativo dela) | "Oportunidade", "seja parceira", recrutar |
| Voz de dona pra dona, gíria de salão | Corporativês ("solução disruptiva") |

**Regra de ouro: se o criativo poderia ser de um curso de "ganhe dinheiro", está errado.**

**Fase 1 (validar o gancho):** C1 + C2 + C3 (loss-aversion, curiosidade, prova — os 3 ângulos mais ortogonais). **Fase 2:** C4, C5, C6 conforme o CPL do vencedor.

---

## 5. Agente inbound + funil

### Correção de nomes (modelo mental vs. código)

| Você diz | Papel no código | Agente |
|---|---|---|
| "agente inbound" (qualifica) | **SDR** (`agent_type='sdr'`) | **Duda** |
| "Duda (venda)" (fecha) | **Closer** (`agent_type='closer'`) | **Bia** |
| pós-compra (mesmo thread) | **Support** (`agent_type='support'`) | **Lia** (P10) |

### Decisão arquitetural: Duda em MODO INBOUND (recomendado)

**[Certo — verificado no código] NÃO criar um 2º agente `agent_type='sdr'` no produto.** `pickSdrPersona = agents.find(isSdrAgent) ?? null` — pega o **primeiro** SDR. Dois SDRs no mesmo produto rearmam a ambiguidade que o PR-B acabou de matar (a "roleta" que podia armar um casca no número oficial). O "agente específico" que o Marcelo quer se entrega por **comportamento** (MODO INBOUND), não por um segundo registro.

- **Número novo = 3ª conexão** sob o **mesmo produto `nexvybeauty`** → reusa TODO o funil (Duda→Bia→Cakto→Lia + esteira).
- Produto próprio quebraria o downstream (Bia, Lia, planos, esteira vivem em `806b5975…`; o brain carrega agentes por 1 product_id só, sem handoff cross-product).
- Persona com nome próprio na porta só se for requisito de marca → exige feature nova (binding `persona ↔ meta_connection_id` no roteador). Guardar pra depois.

### Persona, tom, primeira fala

Duda (SDR) com **abertura que espelha o anúncio**. A lead veio quente de um criativo com promessa específica — se a Duda abre genérica ("Oi, como posso ajudar?"), queima o match mental e derruba conversão. Pra espelhar, ela precisa do `referral.headline` (gap G1).

Tom (já é regra do brain): bolhas ≤300 caracteres, **1 pergunta por mensagem**, máx. 1 emoji, micro-ack, linguagem de dona ("suas clientes", "sua agenda"), nunca inventa preço.

**Aberturas por ângulo** (já carregam a 1ª pergunta de qualificação):
> **"dinheiro parado":** "Oi! Vi que você veio pelo anúncio do raio-x do WhatsApp 💚 Em 2 min eu te mostro, no seu número real, quanto tá parado em cliente que sumiu. Você atende em salão ou como autônoma?"

> **"cliente que some":** "Oi! Aquela cliente que some e não volta — dá pra ver quantas são e quanto valem, direto do seu WhatsApp. Posso te fazer esse raio-x agora. Você tem salão próprio ou atende sozinha?"

### Qualificação (mapear no QCR-V existente, não criar esquema novo)

| Pergunta | Campo QCR-V | Por quê |
|---|---|---|
| Salão próprio ou autônoma? | `sub_vertical` | Copy + se há equipe |
| Quantas cadeiras/profissionais? | porte → `pr` | Tamanho da carteira parada = R$ do raio-x |
| Usa sistema hoje? | `dor_flags` | Sem sistema = dor de agenda; concorrente = objeção de troca |
| Qual a dor? | `bant_need` | Escolhe o ângulo da conta do raio-x |

**Depois da 2ª-3ª resposta, a Duda NÃO continua perguntando — dispara a isca.** A qualificação pesada (ticket, nº de clientes) o **próprio raio-x coleta**. É o diferencial: **a lead se qualifica sozinha ao ver o próprio dinheiro.** Fora do ICP (curiosa/concorrente) → agradece e encerra, marca `dor_flags:['fora_icp']`, `temperature:cold` (também vira sinal negativo pro Meta).

### Roteamento E2E

```
CTWA → webhook/{connection_id} → [G1 grava ad_id/ctwa_clid] → Duda MODO INBOUND
  → qualificação leve → dispara isca → ESTEIRA/RAIO-X (empresa+ticket → varre WhatsApp
     → "R$ X parado em Y sumidas" → planos)
  → FECHOU → [PASSAR_BIA] Bia fecha → Cakto → cakto-webhook → provisiona plano
     → onboarding-handoff pina Lia (P10) no MESMO thread
  → NÃO FECHOU (72h) → Duda retoma no mesmo thread com a conta do raio-x
```

---

## 6. Otimização & Tracking

### A verdade primeiro

**[Certo] Hoje você NÃO consegue otimizar essa campanha** — a atribuição (CTWA→WhatsApp→CRM via `ctwa_clid`) e o CAPI não estão construídos. O que existe: rastreio web/LP (`src/lib/tracking.ts` + `capture-lead`) — serve tráfego que passa por landing, **não** o CTWA que cai direto no WhatsApp. O design já previu o resto (enums `meta_ctwa_received`/`campaign_identified` prontos, coluna `source_ref jsonb` na lead) — **falta ligar o cano**, não redesenhar.

### O funil de 6 eventos (o que medir)

| # | Evento | Vira CAPI? | Alvo de otimização? |
|---|---|---|---|
| 1 | Clique no anúncio | — | Não (vaidade) |
| 2 | **Conversa iniciada** (`ctwa_clid` capturado) | `Lead` | Só no início (frio) |
| 3 | **Lead qualificada** (é dona real) | `Qualified` custom | **SIM — alvo principal** |
| 4 | **Demo/raio-x entregue** (viu o R$) | `Schedule`/custom | **SIM — sinal mais rico** |
| 5 | Checkout gerado | `InitiateCheckout` | Fundo de funil |
| 6 | Compra | `Purchase` (com value) | Define ROAS real |

**Decisão-chave:** otimize por **evento 3 (qualificada)** nas primeiras semanas, migre pra **evento 4 (demo entregue)** quando houver volume (~50 demos/semana/adset). Otimizar por compra direto não terá volume pro algoritmo aprender no começo.

### Métricas certas vs. vaidade

| Métrica | Para que serve | Alvo BR (baixa confiança até ter dado próprio) |
|---|---|---|
| CPM | Saúde do leilão | R$ 12-30 |
| Custo/conversa iniciada | Topo de funil | R$ 4-18 (abaixo de R$4 = desconfie da qualidade) |
| **CPL qualificado** | **KPI operacional #1** | R$ 25-80 |
| Custo/demo entregue | Eficiência da isca | R$ 40-120 |
| Conversa→qualificada | Saúde audiência + agente | 25-45% |
| **CAC** | **KPI de negócio #1** | R$ 150-450 |
| LTV:CAC | Sustentabilidade | ≥ 3:1 |

**Vaidade (não decida por elas):** impressões, alcance, cliques totais, "conversas iniciadas" isoladas, curtidas.

**A âncora é CAC vs. LTV, não ROAS de 1ª compra.** Com preço de lançamento 275/427/693 e retenção, um CAC de R$300-400 fecha se a retenção passar de ~4-6 meses — isso te dá **folga pra pagar mais caro pela lead** que um e-commerce pagaria. **Julgue ROAS em D30/D90, nunca D1** (a dona pensa dias/semanas; matar adset por ROAS de dia 1 é o erro mais caro).

> **Franqueza sobre os números:** esses benchmarks são **pontos de partida pra instrumentar, não promessa**. Seu público é dona de salão (B2B micro), não consumidora de beleza — custo mais alto que beleza-B2C porque o universo é menor e mais caro de alcançar. O único benchmark que vale é o SEU, depois de 2 semanas de dado real. Defina **tetos de kill** ancorados nesses ranges (ex.: "adset com custo/qualificada > R$120 após R$150 gastos = pausa") e recalibre semanalmente pela sua mediana.

### Budget — teste → escala

- **Estrutura recomendada (híbrido faseado):** começa em **LAL 1% ABO** pra achar criativo/ângulo vencedor com atribuição limpa; quando 1-2 criativos provarem custo/qualificada estável, **migra o vencedor pra Advantage+/CBO** pra escalar.
- **Fase de teste (sem. 1-2):** R$ 60-100/dia, **1 campanha, 3-4 adsets** (LAL 1%, LAL 1-3%, interesses-salão, broad-A+ de controle), 3-5 criativos/adset em ângulos diferentes. **Regra de leitura: não toque em nada antes de R$100-150/adset OU ~50 conversas** (abaixo disso é ruído).
- **Fase de escala (sem. 3+):** escala o vencedor **+20-30% a cada 2-3 dias** (aumento brusco reseta o learning). Mantenha 10-20% num adset de exploração sempre testando criativo novo (fadiga em frequência > ~2,5).

### O loop de otimização

Cadência: leitura diária rápida, **decisão real 2-3x/semana** (nunca otimize por dado de < 3 dias). Mude **uma coisa por vez**, de cima pra baixo:
1. **Criativo (~70% do resultado):** pause anúncio com custo/qualificada > 2× a mediana; escale o vencedor.
2. **Ângulo/oferta:** ângulo que ganha em 2+ públicos vira mais variações.
3. **Público:** realoca do LAL/interesse pior pro melhor; se broad-A+ superar LAL na qualificada, migra.
4. **Agente:** se custo/conversa ótimo mas custo/qualificada péssimo, o gargalo é a **Duda abrindo mal**, não o criativo — cruze `journey_events` antes de culpar o anúncio.

**Loop maduro (fase 2):** o agente `ads-optimize` (`ads_recommendations` → HITL → aplica → `ads_mutations_log`) propõe "pausa ad X / +30% no ad Y". Só tem valor depois que o custo/qualificada por `ad_id` existir.

---

## 7. Caminhos (A/B/C) + recomendação + próximos passos

### As 3 opções

| | **Caminho A — Validar tração JÁ** | **Caminho B — Inbound com loop de sinal** ⭐ | **Caminho C — Inbound + NexvyAds completo** |
|---|---|---|---|
| **O que é** | Número + Duda + CSV lookalike no Ads Manager, otimiza por "conversa" | A + G1 (referral) + G3 (modo inbound) + G4 (CAPI), otimiza por qualificada/demo | B + `ads_schema.sql` aplicado + `ads-sync` + App Review + `ads-optimize` |
| **Esforço** | **Baixo** (dias, ~100% ops) | **Médio** (2-3 edge functions + branch no brain) | **Alto** (App Review Meta = caminho crítico de **semanas**) |
| **Buildável** | G3 opcional | G1, G3, G4 | + schema/sync/agente |
| **Trade-off** | Paga pra otimizar pela métrica errada; CPL enganoso; queima budget aprendendo com sinal ruim | 1-2 semanas de build antes de escalar, mas é o único que faz o algoritmo trabalhar a favor | NÃO bloqueia captar leads — só a leitura de gasto/otimização DENTRO do painel |
| **Quando** | Só teste de gancho de 48h | **Produção** | Fase 2 (paralelo) |

### Recomendação

**Caminho B agora. Caminho C em paralelo (o App Review track já começa hoje porque leva semanas). Caminho A só se a urgência for validar o gancho de criativo em 48h — e mesmo assim, migra pra B em ~1 semana.**

O motivo é o loop de sinal: sem G1+G4, você está pagando pra ensinar o Meta a te trazer curioso. Num público saturado de golpe, isso é caro e lento. Os gaps são pequenos (2-3 edge functions), o payoff é a diferença entre "campanha cara e mediana" e "barata e escalável".

### Próximos passos ordenados

**🔧 OPS — Marcelo / provisão do número (nenhum código):**
1. Número novo limpo (Salvy) → *check: recebe SMS de verificação.*
2. Registrar na WABA verificada `1023556786945354` + Cloud API (PIN) → *check: `phone_number_id` emitido.*
3. **Decidir a Página do anúncio** e ligar o número a ela (gotcha CTWA) → *check: preview de CTWA abre o número certo.*
4. Rodar wizard `platform-meta-whatsapp-connect` → nova conexão/webhook → *check: GET hub.challenge responde 200; mensagem manual cai no inbox.*
5. **(Caminho C, paralelo)** Iniciar App Review Meta Ads (`ads_read`/`ads_management`) → *check: submissão aceita.*

**⚙️ BUILDÁVEL — código (Caminho B):**
6. **G1** — capturar `referral`/`ctwa_clid` no webhook, gravar em `source_ref jsonb` + `utm_*` + journey `meta_ctwa_received` → *check: mensagem vinda de anúncio de teste grava `ctwa_clid` no lead.* **CRÍTICO.**
7. **G3** — MODO INBOUND no brain (Duda espelha `referral.headline`), branch análogo ao `retentionActive`/`onboardingActive` → *check: lead CTWA cita o ângulo do anúncio na 1ª bolha; lead não-CTWA abre padrão.*
8. **G4** — edge `capi-send`: `demo_completed`/`purchase` com `ctwa_clid` + `event_id` dedup (token só no servidor) → *check: Events Manager mostra evento `business_messaging` atribuído ao ad, sem duplicar Pixel.*

**📊 AUDIÊNCIA — Marcelo no Ads Manager:**
9. CSV `CA_ExclusaoLeads` (1.919 tel., `+55…`) + CSV `CA_Semente_ICP` (1.497 puros) → *check: semente com match ≥ 700 (se <500, revisar formato `+55`).*
10. Gerar Advantage+ Audience (semente = sinal) OU LAL 1% + 3-5% → *check: audience "pronta" sem erro de tamanho.*
11. Subir campanha CTWA → número inbound, criativos C1/C2/C3, **exclusão `CA_ExclusaoLeads` em TODOS os adsets** → *check: custo/conversa estável + ≥1 qualificada/dia/adset em 7-10 dias.*

**🗃️ FASE 2 (Caminho C):** aplicar `ads_schema.sql` + ligar `ads-sync` (spend) + construir `ads-optimize` → *check: `ads_metrics` populando spend por ad; join com CRM fecha custo/qualificada por `ad_id`.*

### Critério de sucesso (declarativo)

- Lead que clica no CTWA recebe, em <10s, a 1ª bolha da Duda **espelhando o anúncio** + a 1ª pergunta (não "Oi, como ajudo?").
- `purchase` com `ctwa_clid` chega ao Meta; CPA por anúncio visível.
- Nenhum 2º SDR fala no número oficial — `pickSdrPersona` continua determinístico (sem regressão do PR-B).
- Ancoragem de decisão em **CAC vs. LTV** com janela D30/D90, não ROAS D1.

---

## Arquivos-âncora (absolutos)

- Webhook Meta (G1 vai aqui): `apps/NexvyBeauty/supabase/functions/platform-meta-whatsapp-webhook/index.ts`
- Provisão do número: `apps/NexvyBeauty/supabase/functions/platform-meta-whatsapp-connect/index.ts`
- Roteador de persona: `apps/NexvyBeauty/supabase/functions/_shared/agent-routing.ts`
- Brain (MODO INBOUND / G3 vai aqui): `apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts`
- Handoff P10: `apps/NexvyBeauty/supabase/functions/_shared/onboarding-handoff.ts`
- Rastreio web (pronto): `apps/NexvyBeauty/src/lib/tracking.ts` · `apps/NexvyBeauty/supabase/functions/capture-lead/index.ts`
- Schema Ads (untracked, Fase 2): `apps/NexvyBeauty/supabase/migrations_platform_crm/20260712_ads_schema.sql`
- Enums de jornada CTWA (prontos): `apps/NexvyBeauty/supabase/migrations_platform_crm/20260712_platform_crm_journey_events.sql`
- Esteira/raio-x (padrão a reusar): `apps/NexvyBeauty/tasks/ESTEIRA-DEMONSTRACAO-BLUEPRINT-2026-07-15.md`

---

*Documento pareado: `.md` (fonte) + `.html` (visual dark self-contained). Síntese de 5 dimensões de pesquisa (audiência · formato-canal · criativo-pitch · agente-inbound · otimização-tracking) + mapa de realidade do codebase. Fact-Forcing Gate: 4 fatos re-verificados no código vivo antes do primeiro Write.*
