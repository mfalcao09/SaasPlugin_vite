# Playbook de Vendas NexvyBeauty — Mapa + Reestruturação Macro

**Data:** 2026-07-14 · **Tipo:** análise read-only (proposta, nada aplicado) · **Escopo:** agentes Duda/Bia + oferta
**Supabase:** `fzhlbwhdejumkyqosuvq` · **Repo:** `apps/NexvyBeauty`

---

## 0. Resposta desconfortável primeiro (modo conselheiro)

**[Certo] A oferta antiga NÃO é "texto numa coluna" — ela está costurada em 5 camadas. Trocar só o banco deixa a Duda se contradizendo.** O "Piloto Fundadora / garantia de devolução / 30 vagas" vive em:

1. **Código hardcoded** do `platform-sales-brain` — a regra 5 do prompt cita "Piloto" literalmente; o nome da rota é `oferta_piloto`; o bloco de escassez injeta "vagas de fundadora".
2. **8 colunas de banco** (6 em `platform_crm_products` + 2 agentes em `platform_crm_product_agents`).
3. **Uma view viva** (`founder_campaign_status`) + **uma trava no provisioning** (`cakto-plan-provisioning.ts`) que carimba toda org paga como fundadora.
4. **12 goldens de eval** que fixam o vocabulário antigo (um deles _exige_ a palavra "garantia").
5. **A landing page inteira** (`SalesPage.tsx`) — o CTA de WhatsApp que ABASTECE a Duda promete "30 vagas / devolvemos 100%".

Se você reescrever só as colunas, o código ainda diz "Piloto", a rota ainda se chama `oferta_piloto`, o bloco de escassez ainda injeta **"restam 30 de 30 vagas de fundadora"** (está LIVE agora — `campanha_encerrada=false`), e a LP ainda promete devolução. **Migração de dados sem migração de código + view + goldens = Duda incoerente.** Precisa ser um pacote.

**[Certo] Existe um price-drift já em produção.** As colunas `knowledge_base`/`plans`/`pricing` dizem **Essencial R$217, Premium R$387** e ensinam ao modelo "R = PR ÷ 217". A fonte-única real (`public_plans`) é **R$247 / R$391 / R$687**. O modelo está sendo alimentado com âncora velha enquanto o score determinístico usa 247. Consertar no mesmo passe.

**[Provável] O motor de score QCR-V deve ser MANTIDO, não jogado fora.** Ele já ancora no valor (PR = carteira × ticket × 35%) e roteia PLANO, não oferta. A reestruturação é cirúrgica: renomear a rota `oferta_piloto`, apagar a linguagem de fundadora, desligar a escassez de campanha, reescrever as 8 colunas para vender Essencial/Premium/Ultra ancorados na conta da recuperação.

---

## 1. CÓDIGO — como o prompt de runtime é montado (hardcoded vs banco)

### 1.1 `platform-sales-brain/index.ts` (o "cérebro" do WhatsApp de vendas)

O `systemPrompt` é montado em **linhas 1022-1054**. A anatomia:

| Bloco | Origem | Arquivo:linha |
|---|---|---|
| Identidade `Você é {persona.name}…` | **BANCO** (`platform_crm_product_agents`) | `index.ts:1022` |
| `SEU OBJETIVO PRINCIPAL` | **BANCO** (`primary_objective`) | `index.ts:1023` |
| `TOM E ESTILO` | **BANCO** (`tone_style`) | `index.ts:1024` |
| `INSTRUÇÕES ADICIONAIS DA PERSONA` | **BANCO** (`additional_prompt`) | `index.ts:1026` |
| `ESQUEMA DE QUALIFICAÇÃO` / `FRASES PROIBIDAS` | **BANCO** (`qualification_schema`, `prohibited_phrases`) | `index.ts:1027-1028` |
| Memória do lead + score-fato | **BANCO** (`platform_crm_leads.metadata`) computado em TS | `index.ts:298-355`, injetado `1029` |
| Bloco de conhecimento do produto | **BANCO** (`platform_crm_products`) | builder `157-186`, injetado `999-1001` |
| **Escassez da campanha fundadora** | **VIEW** `founder_campaign_status` + **template hardcoded** | `index.ts:169-173` |
| Links de pagamento (a "maquininha") | **BANCO** (`public_plans`) | `index.ts:226-234`, `982-989` |
| **REGRAS INVIOLÁVEIS 1-8** | **HARDCODED no código** | `index.ts:1031-1054` |
| **REGRAS DE FORMA (WhatsApp)** | **HARDCODED** | `index.ts:1044-1054` |

**As regras hardcoded que carregam resíduo da oferta antiga:**

- **Regra 5 (`index.ts:1038`)** — cita "Piloto" literalmente no código:
  > "…carteira pequena/começando → plano de entrada com a conta honesta e **convite pro Piloto quando crescer**). NUNCA diga 'você não se encaixa'; Trial só se a lead pedir para testar sem compromisso."
- **Regra 2 (`index.ts:1035`)** — já está NEUTRA (instrui o modelo a NÃO prometer): "Não prometa **garantia de devolução** nem detalhes de oferta por conta própria — se houver condições especiais de lançamento, o time apresenta." (Pode ficar; só tirar o "condições especiais de lançamento".)
- **Regra 3 (`index.ts:1036`)** — "Escassez SÓ a real (o dado da campanha acima…)". A "campanha acima" some quando desligarmos o bloco.

**Bloco de escassez (`buildKnowledgeContext`, `index.ts:169-173`)** — template hardcoded alimentado pela view:
```
CAMPANHA: restam {slots_left} de {total_vagas} vagas de fundadora (dado real do banco…)
// ou, se encerrada:
CAMPANHA: campanha encerrada — as {total_vagas} vagas de fundadora foram preenchidas. NÃO ofertar condições de fundadora.
```

**`sanitizeReply` (`index.ts:373-391`)** — censura de vocabulário pós-processamento. Troca `grátis / desconto / promoção` por **"condições especiais de lançamento (o time apresenta)"**. Mantém-se útil, mas o texto de substituição ainda insinua "oferta de lançamento" → trocar por reancoragem neutra no valor.

**Motor de score QCR-V (determinístico, TS — `index.ts:505-650`):**
- `ENTRY_PLAN_SLUG='starter'` (`:514`) e `QCRV_ANCHOR_FALLBACK=217` (`:515`) — **fallback 217 está velho** (Essencial real = 247). Só morde se `public_plans` vier vazio, mas é dívida.
- `resolveAnchor(plans)` (`:523-532`) lê o preço do Essencial de `public_plans` em runtime = **247** hoje. OK.
- Tipo `QcrRota = 'oferta_piloto' | 'aprofundar' | 'essencial'` (`:535`) e decisão de rota (`:620-623`) — **o nome `oferta_piloto` é resíduo**; a guidance de texto (`:341-348`) já foi neutralizada para "conduza para o plano recomendado".
- Comentários (`:507-564`) ainda dizem "Piloto Fundadora" — cosmético, mas confunde manutenção.

**Modo implantação pós-compra (`ONBOARDING_RULE_BLOCK`, `index.ts:660`)** — hardcoded: "…NUNCA oferte plano, preço, upgrade, link de pagamento ou **condição de fundadora**." Gated (default OFF); baixo risco, mas neutralizar o texto.

### 1.2 `platform-sales-copilot/index.ts` (copiloto "Sugerir Resposta" do super-admin)

- **Fallback** `PLATFORM_KNOWLEDGE_CONTEXT` (`:40-46`) — **já é neutro** (planos por quantitativos, sem oferta). OK.
- **Mesmo bloco de escassez hardcoded** (`:181-185`): "CAMPANHA FUNDADORA AGORA: restam {slots_left} de {total_vagas} vagas de fundadora…". Precisa do mesmo desligamento.
- Lê as **mesmas colunas** do produto, incluindo `guarantee`, `discount_policy`, `pitch_*`, `objections` (`:149`) → herda automaticamente a reescrita das colunas.

### 1.3 A trava no provisioning — `_shared/cakto-plan-provisioning.ts`

- **`:197-216`** — na PRIMEIRA ativação de uma org paga, lê `founder_campaign_status` e carimba `organizations.founder_status = 'is_founder' | 'not_founder'`. **É esse write que faz o contador `slots_left` andar** (a view deriva de `count(is_founder)`). Non-fatal por construção.
- **`:228`** — `enabled_modules: ['erp_salao','crm_vendas','atendimento']` (fixo, não ligado à oferta — não mexer).
- **Impacto de desligar a campanha:** o carimbo `founder_status` vira cosmético (a view fica sem consumidor). **NÃO afeta** ativação de plano, billing, welcome, seeds nem handoff. Pode deixar como está ou neutralizar o write.

---

## 2. DADOS — colunas reais (trechos citados)

### 2.1 `platform_crm_products WHERE slug='nexvybeauty'` (id `806b5975…`)

| Coluna | Conteúdo real (trecho) | Carrega |
|---|---|---|
| `guarantee` | "**GARANTIA PILOTO FUNDADORA: 30 dias** corridos a partir do SETUP individual. Se o painel 'Recuperado (30 dias)' não mostrar valor recuperado MAIOR que a mensalidade paga, **devolução de 100%**. O painel dentro do sistema é o juiz…" | Garantia de devolução, Piloto |
| `discount_policy` | "PROIBIDO DAR DESCONTO… Se pedirem, **reancorar na garantia** (o risco já é nosso). **Preço travado de fundadora**…" | Garantia, fundadora |
| `icp` | "…QUALIFICAÇÃO: **≥8 meses** de atendimento E **≥80 clientes** históricas… Sem carteira parada = **não é lead do piloto**." | Piloto, régua de corte (a que os goldens combatem) |
| `pitch_30s` | "…**Piloto de 30 dias**: se não recuperar mais que a mensalidade, **devolvemos o dinheiro**." | Piloto, devolução |
| `pitch_2min` | "…**ESCASSEZ REAL (30/30/1): 30 vagas de fundadora em 30 dias**… **RISCO NOSSO**… painel 'Recuperado (30 dias)'… **devolvemos 100%**. Vaga do dia não vendida NÃO acumula." | 30/30/1, vaga do dia, devolução |
| `objections` | "'Vai funcionar?' → **garantia com painel-juiz: se em 30 dias… devolvemos 100%**. 'Tá caro' → **Reancorar na garantia**…" | Garantia (6 linhas) |
| `plans` | "Trial (R$0)… **Essencial R$217/mês** (solo) · **Premium R$387/mês**… Ultra R$687/mês." | **PREÇO VELHO** (real 247/391) |
| `pricing` (JSON) | `{"planos":[…"Essencial",217…"Premium",387…"Ultra",687…]}` | **PREÇO VELHO** |
| `knowledge_base` | O peso-pesado (≈4 KB): "**═══ OFERTA VIGENTE: PILOTO FUNDADORA 'CLIENTE DE VOLTA' (30/30/1) ═══** … **30 vagas de FUNDADORA em 30 dias, máximo 1 onboarding por dia**… **CONDIÇÕES DE FUNDADORA**… **garantia individual de 30 dias (painel-juiz)** + linha direta com o fundador… **vaga do dia**… FLUXO DE FECHAMENTO: 1º garantia → 2º preço → 3º vaga do dia… **R = PR÷217**… **≥70 → Piloto Fundadora**… Essencial (R$217/mês)… PLAYBOOK CLOSER — BIA… **garantia painel-juiz ANTES do preço**… vaga do dia 30/30/1…" | Tudo: Piloto, 30/30/1, vaga do dia, garantia, âncora 217 |

### 2.2 `platform_crm_product_agents` (Duda + Bia — ambos `is_active=true`, `active_in_whatsapp=true`)

**Duda — SDR Qualificadora** (id `577fc770…`, `agent_type='custom'`):
- `primary_objective`: "…O score QCR-V roteia a OFERTA: **>=70 = Piloto Fundadora com a conta personalizada**; 40-69 = aprofundar; <40 = Essencial…"
- `additional_prompt`: "…escassez só a real (**1 vaga/dia**)… **convite pro Piloto** quando a carteira crescer… **Proibido desconto e 'teste gratuito' para o Piloto**…"

**Bia — Closer** (id `8b684f7e…`, `agent_type='closer'`):
- `primary_objective`: "…**garantia painel-juiz como transferência de risco** + a conta da carteira dele…"
- `additional_prompt`: "…**Garantia = transferência de risco: 'o risco é meu — se em 30 dias não recuperar mais que a mensalidade, devolvo'**. É a sua arma principal… escassez só a real (**vaga do dia**)… PROIBIDO desconto (reancore na garantia) e '**teste gratuito' para o Piloto**…"

`prohibited_phrases` = `[]` e `qualification_schema` = `null` em ambos (não estão em uso — o roteiro vive em `additional_prompt`).

---

## 3. INFRA

### 3.1 View `founder_campaign_status` (LIVE agora)
```sql
SELECT 30 AS total_vagas,
  count(*) FILTER (WHERE founder_status='is_founder')            AS fundadoras_ativas,
  GREATEST(0, 30 - count(*) FILTER (WHERE founder_status='is_founder')) AS slots_left,
  count(*) FILTER (WHERE founder_status='is_founder') >= 30      AS campanha_encerrada
FROM organizations;
```
**Estado atual:** `total_vagas=30, fundadoras_ativas=0, slots_left=30, campanha_encerrada=false`.
→ **A Duda está injetando "restam 30 de 30 vagas de fundadora" AGORA mesmo.** A campanha nunca foi "aposentada" no banco; só existe a decisão.

### 3.2 Planos (fonte-única real vs. o que o texto diz)

| Plano | slug | `public_plans` (REAL, com checkout) | Texto nas colunas |
|---|---|---|---|
| Trial | trial | R$0 · sem checkout_url | R$0 |
| **Teste E2E** | teste | **R$10 · checkout LIVE** ⚠️ | (não citado) |
| Essencial | starter | **R$247** · pay.cakto/huzxqgr | R$217 ❌ |
| Premium | pro | **R$391** · pay.cakto/352rvm6 | R$387 ❌ |
| Ultra | premium | **R$687** · pay.cakto/7n2obhs | R$687 ✓ |

⚠️ **"Teste E2E" (R$10) tem `checkout_url` vivo em `public_plans`** e o cérebro monta os LINKS DE PAGAMENTO filtrando só por `checkout_url` presente (`index.ts:989`) → **hoje a Duda pode oferecer o link de R$10 a um lead real**. Risco lateral, sinalizado.

### 3.3 Goldens (`tmp-eval-agents/goldens.ts`) — quais codificam a oferta antiga

| Golden | O que assere hoje | Ação |
|---|---|---|
| `NO_FREE_TRIAL` (`:87-92`) | reason: "o **Piloto** é PAGO com garantia" | Reescrever reason (tirar Piloto/garantia); a assertion `must_not_contain grátis` fica |
| `h_pede_desconto_reancora_garantia` (`:318-346`) | **`must_contain 'garantia\|devolv\|risco é meu\|recuperar'`** | **Quebra** quando a garantia sair → trocar por `must_contain 'conta\|recupera\|vale\|retorno'` (reancorar no valor, não na garantia) |
| `k_reclamacao_grave_handoff` (`:411-439`) | `must_not_contain 'piloto\|contrat\|plano…'` | Manter (ainda válido; "piloto" no not_contain fica inócuo) |
| `d_ticket_alto_piloto` (`:219-239`) | título/cenário citam "Piloto" | Renomear cenário → "oferta do plano recomendado"; assertions seguem válidas |
| `b_decidido_manda_link`, `c_…_passa_bia`, `e_comecando_essencial`, `l_pergunta_preco` | Sem dependência de garantia/Piloto no _assert_ (só cenário) | Ajustar textos de cenário; assertions OK |
| Demais (a, f, g, i, j) | Neutros | Sem mudança funcional |

**A régua binária do eval fixa a oferta antiga em pelo menos 2 assertions (`NO_FREE_TRIAL.reason` e o `must_contain garantia` do golden h).** Sem atualizar os goldens no mesmo PR, o eval fica vermelho e bloqueia.

---

## PROPOSTA — reestruturação macro

### A. Nova arquitetura do playbook

| Papel | Vende o quê | Ancora em | Sai (aposentado) | Fica neutro |
|---|---|---|---|---|
| **Duda (SDR)** | Os 3 planos do catálogo: **Essencial / Premium / Ultra** | A **conta da recuperação da carteira** (PR = clientes × ticket × 35%) + porte da operação (solo/equipe/maior) | Piloto Fundadora, garantia de devolução, 30 vagas, vaga do dia, condição de fundadora, régua ≥80 clientes | Score QCR-V, "seu espaço", 1 pergunta/msg, preço só do banco, links de pagamento |
| **Bia (Closer)** | Fecha por VALOR o qualificado cético | A conta personalizada + **prova** (demo na carteira dela) + arrependimento legal de 7 dias | "garantia painel-juiz / devolvo 100%" como arma de fechamento | Herdar dossiê, não reapresentar, 12 objeções por valor |
| **Mentoria Cofounder** | **NÃO entra no playbook** | — | (mora em LP gated pós-login, só assinantes) | Adicionar linha proibida: Duda/Bia nunca mencionam mentoria |

**Princípios da nova redução de risco (substituem a garantia-gimmick):**
1. **Prova, não promessa:** demonstração de 20 min na carteira da própria cliente (conecta WhatsApp → importa top-30 → roda o scan → o R$ dela na tela).
2. **Arrependimento legal de 7 dias** (CDC art. 49) — é do checkout, não uma fala de venda. A Duda pode mencionar en passant ("e você tem o direito de arrependimento de 7 dias, previsto em lei"), mas **nunca** "devolvo se não recuperar".
3. **A conta que fecha:** o próprio potencial de recuperação (2-3 clientes de volta pagam a mensalidade) é o argumento — sem prometer devolução.

### B. Reescrita sugerida das colunas (texto novo proposto — PT-BR, tom Duda, neutro, "seu espaço")

> Regra de ouro na reescrita: **não hardcodar preço em prosa.** Onde hoje diz "R$217", apontar para "a seção LINKS DE PAGAMENTO" (que vem do banco). Isso mata o price-drift de raiz.

**`guarantee`** (não há mais garantia — instruir o que NÃO prometer):
```
SEM garantia de devolução por resultado. A redução de risco vem da PROVA, não de promessa:
demonstração de 20 min na carteira da própria cliente (o R$ recuperável dela na tela) + o
direito de arrependimento de 7 dias do checkout (CDC art. 49, do e-commerce, não uma condição
de venda). NUNCA prometa "devolvemos o dinheiro se não recuperar", "painel-juiz", "risco é
nosso" nem qualquer devolução condicionada a desempenho.
```

**`discount_policy`**:
```
PROIBIDO desconto — regra inviolável. Se pedirem, reancorar no VALOR: a conta da recuperação da
carteira (2-3 clientes de volta já pagam a mensalidade). O preço dos planos é o oficial do banco
(seção LINKS DE PAGAMENTO). Nunca prometer feature futura para fechar. Nunca inventar "preço
travado" ou "condição de lançamento".
```

**`icp`** (tirar a régua de corte que a Duda tem de ignorar):
```
Profissionais da beleza: lash designer, nail designer/manicure, designer de sobrancelha,
podóloga, esteticista, dona de salão/espaço. NÃO existe corte de qualificação — somos SaaS: toda
profissional recebe o plano certo para a realidade dela (carteira grande/ticket alto →
Premium/Ultra; solo/começando → Essencial). Quem tem carteira histórica no WhatsApp/caderno
aproveita o Radar de recuperação desde o dia 1; quem está começando organiza agenda e atendimento
e o Radar cresce junto.
```

**`pitch_30s`**:
```
Quem vive de hora marcada perde dinheiro todo mês com cliente que some — e nem vê. O NexvyBeauty é
uma IA que varre a sua carteira, mostra quem sumiu e quanto vale, escreve a mensagem e dispara
pelo SEU WhatsApp com 1 clique. Recuperando só 2-3 clientes por mês, o sistema já se paga.
```

**`pitch_2min`**:
```
1. MECANISMO: Radar semanal na carteira + 4 automações (aniversário, lembrete 24h, pacote
   vencendo, cliente sumida) rodando sozinhas.
2. ESFORÇO ZERO: setup concierge de 30 min, no WhatsApp atual, sem trocar número — ela só aprova.
3. A CONTA QUE FECHA (por sub-vertical): Lash (~R$150-250): UMA cliente de volta paga o mês.
   Nails (~R$50-90): 3 pagam o mês. Sobrancelha (~R$80-150): 2 pagam. Salão/equipe: 2-3 pagam.
4. PROVA, NÃO PROMESSA: demonstração de 20 min na carteira dela — o R$ recuperável na tela antes
   de decidir. (Sem garantia de devolução; o argumento é a conta.)
5. PLANO CERTO PELO PORTE: solo → Essencial; salão/equipe → Premium; operação maior → Ultra.
   Preço sempre o da seção LINKS DE PAGAMENTO.
```

**`objections`**:
```
"Vai funcionar mesmo?" → Demonstração na carteira DELA: o R$ recuperável aparece na tela antes de
  decidir. A conta é a prova.
"Vale o investimento?" → A conta da sub-vertical: lash = 1 cliente de volta paga o mês; nails = 3;
  sobrancelha = 2; salão = 2-3.
"Vai me dar trabalho?" → Setup concierge de 30 min; ela só aprova as mensagens.
"Já uso WhatsApp Business + agenda" → Não substituímos: turbinamos. Mesmo número, mesmo WhatsApp.
"Tá caro / pede desconto" → NUNCA desconto. Reancorar na conta: recuperando 2-3 clientes já se
  paga. Nunca prometer devolução.
"E se eu não gostar?" → Direito de arrependimento de 7 dias do checkout (lei). Nada de promessa de
  devolução por resultado.
```

**`plans`** (preços fora da prosa):
```
Essencial (profissional solo) · Premium (salão/equipe) · Ultra (operação maior). Trial (R$0)
existe como teste do produto, sem acompanhamento. Os PREÇOS oficiais estão SEMPRE na seção LINKS
DE PAGAMENTO desta conversa (banco/public_plans) — nunca inventar, arredondar ou citar de memória.
```

**`pricing`** (JSON — atualizar valores reais E remover nota de fundadora):
```json
{"planos":[
  {"nome":"Essencial","publico":"profissional solo","preco_mensal":247},
  {"nome":"Premium","publico":"salao/equipe","preco_mensal":391},
  {"nome":"Ultra","publico":"operacao maior","preco_mensal":687}],
 "fonte_precos":"public_plans / LINKS DE PAGAMENTO — NUNCA inventar; ler sempre do banco"}
```

**`knowledge_base`** (reescrita macro — remove a seção OFERTA/30-30-1 inteira, mantém o QCR-V como leitura de VALOR e o playbook da Bia sem garantia):
```
═══ POSICIONAMENTO ═══
NexvyBeauty é a plataforma de gestão + IA de recuperação de carteira para espaços de beleza. A
venda ancora no VALOR: a IA varre a carteira, mostra quem sumiu e quanto vale, e recupera pelo
WhatsApp da própria profissional. NÃO há programa "Piloto Fundadora", NÃO há garantia de
devolução, NÃO há vagas/escassez de campanha. Vendemos os planos do catálogo (Essencial/Premium/
Ultra) pelo porte da operação e pela conta da recuperação.

═══ VENDA CONSULTIVA — QCR-V (Qualificação de Carteira Recuperável, para ESCOLHER o plano) ═══
MISSÃO: toda lead sai com um plano recomendado. Pagou é cliente; você NUNCA decide "apta/inapta".
LEITURA (não corte): Potencial Recuperável PR = clientes históricas × ticket médio × 35% ("se SÓ
35% sumiram…"). Compare PR com a mensalidade para ESCOLHER o plano e calibrar a promessa — nunca
para negar.
TICKETS TÍPICOS (confirmar): cílios R$150-250 · unhas R$50-90 · sobrancelha R$80-150 · podologia
R$60-120 · estética R$120-300 · salão varia.
DESCOBERTA (1 pergunta/msg, micro-ack antes, pule o que já sabe): área → tempo → carteira histórica
→ ticket médio.
SCORE 0-100 (roteia o PLANO, nunca aceita/rejeita): D1 Potencial 50 (R=PR÷[preço do Essencial]:
R≥5→50 · 3-5→40 · 1,5-3→25 · <1,5→10 · sem carteira OU sem ticket → provisório, continue
descobrindo) · D2 Tempo 20 · D3 Recorrência 15 · D4 Dor 15.
ROTAS DE RECOMENDAÇÃO:
• Score alto + carteira robusta → Premium/Ultra com a conta personalizada ("você tem ~N clientes
  que valem ~R$X; recuperando 2-3 já paga o mês").
• 40-69 → aprofundar 1-2 perguntas e recalcular.
• Carteira pequena/começando → Essencial com expectativa honesta (organiza agenda+atendimento hoje,
  o Radar cresce junto). NUNCA "não se encaixa".
PREÇO: sempre o da seção LINKS DE PAGAMENTO (banco). Proibido desconto e "teste gratuito" como
despacho.

═══ PLAYBOOK CLOSER — BIA (fechamento por VALOR do cliente cético) ═══
A Bia recebe o lead que a Duda qualificou (score alto) mas não fechou. O inimigo é a INDECISÃO
(medo de errar), não "não vê valor". Reduza o medo com PROVA e CONTA, não com garantia.
MAPA (7 micro-passos): 0-Herdar o dossiê · 1-Reframe ("o raio-x do dinheiro parado") · 2-A conta
DELA (carteira×ticket×35%) · 3-Need-payoff (a lead verbaliza o ganho) · 4-Reduzir o risco com
PROVA: demonstração na carteira dela + arrependimento de 7 dias do checkout (NUNCA "devolvo se não
recuperar") · 5-Recomenda UM plano (não cardápio) · 6-Próximo passo concreto · 7-Link do plano +
pós.
OBJEÇÕES por VALOR (nunca desconto, nunca garantia de devolução): tempo → devolve tempo · tá caro →
reancora na conta · vou pensar → nomear a dúvida · funciona pra mim → demo na carteira + prova
social do sub-vertical · me manda tudo → recomenda UM.
COERÊNCIA: preço SEMPRE de LINKS DE PAGAMENTO; nunca arredondar; ≤300 chars; 1 pergunta/msg; ≤1
emoji; nunca se reapresentar. NUNCA mencionar mentoria/Cofounder (produto de outra esteira).
ENVIO DO LINK: "quero/como pago/fechou" → checkout_url do plano recomendado, sem mais demonstração.
```

**Duda — `primary_objective`** (proposto):
```
Vender o NexvyBeauty ajudando cada profissional da beleza a escolher o plano certo para a realidade
dela. Descobrir em conversa natural (1 pergunta por vez): área, tempo, carteira histórica, ticket.
O score QCR-V roteia o PLANO: carteira robusta → Premium/Ultra com a conta personalizada;
intermediário → aprofundar; solo/começando → Essencial com expectativa honesta. Preço sempre da
seção LINKS DE PAGAMENTO. NUNCA rejeitar venda nem decidir "apta/inapta". Sem Piloto, sem garantia
de devolução, sem vagas de campanha, sem mentoria.
```

**Duda — `additional_prompt`** (proposto): mesmo texto atual, trocando os blocos de fundadora por:
```
… dinheiro só pela conta da recuperação (nunca "qual seu orçamento").
- Carteira pequena/começando → Essencial (preço SEMPRE da seção LINKS DE PAGAMENTO) com a conta
  honesta. Trial só se a lead pedir para testar sem compromisso.
- NUNCA prometer garantia de devolução, "painel-juiz", "risco é nosso" nem vagas/escassez de
  campanha. Redução de risco = demonstração na carteira dela + arrependimento legal de 7 dias.
- Proibido desconto. NUNCA mencionar mentoria/Cofounder.
- Planos por porte: Essencial (solo) · Premium (salão/equipe) · Ultra (operação maior).
```

**Bia — `primary_objective`** (proposto):
```
Fechar por VALOR o lead que a Duda qualificou mas não fechou: ele pode pagar, mas duvida do
resultado. Vencer a INDECISÃO reduzindo o medo de errar com PROVA (demonstração na carteira dele) e
a conta personalizada — NÃO com garantia de devolução. Conduzir ao link do plano recomendado. Nunca
refaz descoberta, nunca se reapresenta, nunca dá desconto, nunca menciona mentoria.
```

**Bia — `additional_prompt`** (proposto): trocar a linha da garantia por:
```
- Redução de risco = PROVA, não promessa: demonstração de 20 min na carteira dele (o R$ recuperável
  na tela) + direito de arrependimento de 7 dias do checkout. NUNCA "o risco é meu / devolvo se não
  recuperar / painel-juiz".
```
(o resto do prompt da Bia — não reapresentar, preço do banco, proibido desconto, tom WhatsApp — permanece).

### C. Campanha 30/30/1 — desligar (como e impacto)

**Recomendado (mais limpo): desligar no CÓDIGO, deixar a view morrer sem consumidor.**
1. Remover a injeção do bloco de escassez em `platform-sales-brain/index.ts:169-173` **e** `platform-sales-copilot/index.ts:181-185` (ou gate por env `FOUNDER_CAMPAIGN_ENABLED`, default `false`).
2. `cakto-plan-provisioning.ts:197-216` — neutralizar o write de `founder_status` (ou deixar; vira cosmético sem a view sendo lida). **Não afeta** ativação/billing/welcome/handoff.
3. `founder_campaign_status` — deixar como view órfã (não dropar agora: evita quebrar migrations que a referenciam; dropar num passe posterior de limpeza).

**Impacto no provisioning:** nenhum no caminho pago. O único efeito é `founder_status` deixar de significar algo. `enabled_modules` e o resto seguem idênticos.

**Por que NÃO desligar só mexendo na view:** se você fizer a view retornar `campanha_encerrada=true`, o template hardcoded ainda injeta a frase feia "**as 30 vagas de fundadora foram preenchidas. NÃO ofertar condições de fundadora**" — que continua ensinando ao modelo que existe "condição de fundadora". Tem que sair do código.

### D. Plano de migração

**D.1 — Forward migration de DADOS: `20260714_sunset_piloto_e_novo_playbook.sql`** (esboço, NÃO aplicar):
```sql
-- Reseta o playbook do NexvyBeauty: aposenta Piloto/garantia/campanha, ancora no valor + catálogo.
BEGIN;

UPDATE platform_crm_products SET
  guarantee       = $$SEM garantia de devolução por resultado… (texto §B)$$,
  discount_policy = $$PROIBIDO desconto — reancorar no VALOR… (texto §B)$$,
  icp             = $$Profissionais da beleza… NÃO existe corte… (texto §B)$$,
  pitch_30s       = $$Quem vive de hora marcada… se paga. (texto §B)$$,
  pitch_2min      = $$1. MECANISMO… (texto §B)$$,
  objections      = $$"Vai funcionar?" → demonstração… (texto §B)$$,
  plans           = $$Essencial (solo) · Premium (salão/equipe) · Ultra… (texto §B)$$,
  pricing         = $${"planos":[{"nome":"Essencial",…247},{"nome":"Premium",…391},{"nome":"Ultra",…687}], …}$$::jsonb,
  knowledge_base  = $$═══ POSICIONAMENTO ═══ … (texto §B)$$,
  updated_at      = now()
WHERE slug = 'nexvybeauty';

UPDATE platform_crm_product_agents SET
  primary_objective = $$Vender o NexvyBeauty… (texto §B Duda)$$,
  additional_prompt = $$TOM: colega de profissão… (texto §B Duda)$$,
  updated_at = now()
WHERE id = '577fc770-1688-464c-9ff9-46244c9b203b'; -- Duda

UPDATE platform_crm_product_agents SET
  primary_objective = $$Fechar por VALOR… (texto §B Bia)$$,
  additional_prompt = $$VOCÊ É A BIA — CLOSER DE VALOR… (texto §B Bia)$$,
  updated_at = now()
WHERE id = '8b684f7e-e7a7-436d-aa48-4817e203ccaf'; -- Bia

COMMIT;
```
> Preferir `UPDATE … WHERE id=` (ids estáveis capturados nesta análise) a `WHERE name ILIKE`.

**D.2 — PR de CÓDIGO companheiro (mesma janela, senão a Duda contradiz o banco):**
- `platform-sales-brain/index.ts`: remover bloco de escassez (`:169-173`); tirar "Piloto" da regra 5 (`:1038`); neutralizar `sanitizeReply` (`:381-382`) e `ONBOARDING_RULE_BLOCK` (`:660`); renomear rota `oferta_piloto`→`premium` (tipo `:535`, decisão `:620-623`, guidance `:341`); `QCRV_ANCHOR_FALLBACK` 217→247 (`:515`).
- `platform-sales-copilot/index.ts`: remover bloco de escassez (`:181-185`).
- (Opcional) `cakto-plan-provisioning.ts`: neutralizar `founder_status` (`:197-216`).

**D.3 — Goldens a atualizar (`tmp-eval-agents/goldens.ts`, no mesmo PR):**
- `NO_FREE_TRIAL.reason` (`:91`) — tirar "Piloto/garantia".
- `h_pede_desconto_reancora_garantia` (`:318-346`) — **trocar** o `must_contain 'garantia|devolv|risco é meu|recuperar'` por `must_contain 'conta|recupera|vale|retorno|2-3 clientes'` (reancorar no valor).
- `d_ticket_alto_piloto` (`:219-239`) — renomear id/título/cenário para "plano recomendado".
- Cenários de `b`, `c`, `e`, `l` — limpar menções a "Piloto" no texto descritivo.

### E. Riscos e ordem de execução

| # | Risco | Mitigação |
|---|---|---|
| R1 | **Data-only** deixa código dizendo "Piloto" + escassez injetando "30 vagas" → Duda incoerente | Ship **D.1 + D.2 juntos** |
| R2 | Goldens quebram (h exige "garantia") → eval vermelho bloqueia | **D.3 no mesmo PR**; rodar eval até verde antes de merge |
| R3 | **A LP `SalesPage.tsx` ainda vende Piloto + devolução 100% + 30 vagas** (`:1030-1055`) — é o CTA de WhatsApp que abastece a Duda; lead chega esperando a oferta de fundadora e a Duda vende outra coisa | Sunset da LP **em lockstep** (fora do escopo desta análise, mas ACOPLADO — não pode ficar para depois) |
| R4 | Price-drift reintroduzido se a reescrita hardcodar preço | Prosa aponta para "LINKS DE PAGAMENTO"; só o `pricing` JSON leva número (247/391/687) |
| R5 | **"Teste E2E" R$10 com checkout vivo em `public_plans`** vaza como link ofertável | Tirar de `public_plans` (checar por que `is_public=false` não o filtra) ou zerar `checkout_url` |
| R6 | Modo implantação (gated) ainda diz "condição de fundadora" (`:660`) | Neutralizar texto no D.2 (baixa urgência, default OFF) |

**Ordem sugerida (cada passo com check binário):**
1. Escrever textos novos das colunas + agentes → *check: revisão humana aprova o tom.*
2. Migration D.1 (staging) → *check: `SELECT` mostra colunas sem "Piloto|fundadora|devolução".*
3. PR de código D.2 → *check: `grep -i "fundadora|piloto|vagas"` nas 2 functions = 0 matches funcionais.*
4. Goldens D.3 → *check: eval roda 12/12 verde.*
5. Sunset LP `SalesPage.tsx` → *check: LP sem "Piloto Fundadora / devolvemos 100% / 30 vagas".*
6. (Opcional) neutralizar provisioning + esconder Teste E2E → *check: LINKS DE PAGAMENTO só mostra Essencial/Premium/Ultra.*

---

## Anexo — arquivos-fonte citados (todos caminhos absolutos)

- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-sales-copilot/index.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/_shared/cakto-plan-provisioning.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/tmp-eval-agents/goldens.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/src/pages/SalesPage.tsx` (LP acoplada, fora do escopo)
- Banco `fzhlbwhdejumkyqosuvq`: `platform_crm_products`, `platform_crm_product_agents`, view `founder_campaign_status`, `platform_plans`, `public_plans`

*Proposta — nada aplicado. Marcelo decide a partir daqui.*
