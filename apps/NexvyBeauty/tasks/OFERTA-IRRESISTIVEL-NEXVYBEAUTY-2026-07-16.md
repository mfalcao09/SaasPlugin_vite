# A Oferta Irresistível — NexvyBeauty · Grand Slam Offer

> **Data:** 2026-07-16 · **Tipo:** ANÁLISE + DESIGN de oferta (READ-ONLY em prod — nada aplicado no banco/código/deploy)
> **Lente:** clone **Alex Hormozi** + **hormozi-squad** (agentes Offers/Pricing/Audit) + skill `100m-offers`. Instrumentos nomeados entre `[colchetes]`: `[DREAM OUTCOME]` · `[EQUAÇÃO DE VALOR]` · `[TRIM & STACK]` · `[STACK DE BÔNUS]` · `[GARANTIA GOD-MODE]` · `[NOME MÁGICO]`.
> **Supabase:** `fzhlbwhdejumkyqosuvq` · **Repo:** `apps/NexvyBeauty` · **Par:** `OFERTA-IRRESISTIVEL-NEXVYBEAUTY-2026-07-16.html`
> **Preço = fonte-única `public_plans` (runtime).** Este doc é análise interna e cita números pra raciocinar; **na copy de produção o número NUNCA é hardcoded** — vem de `public_plans` (o brain já injeta o de-para).

---

## 0. Resposta desconfortável primeiro (modo conselheiro)

**[Certo] O NexvyBeauty não tem oferta fraca. Tem oferta forte que se apresenta como fraca — e joga fora a melhor carta da mão.** Na régua Hormozi: *"isso ainda é um produto, não uma oferta"* — porque lista feature, ancora no número errado e não reverteu o risco de forma explícita. Três verdades, na ordem em que doem:

1. **Você tem a reversão de risco mais rara que existe — e a trata como etapa de funil, não como o centro da oferta.** Quase todo mundo vende *promessa* ("confia que funciona"). Vocês vendem *prova*: o **Raio-X** mostra o dinheiro real dela (nome, telefone, R$) **antes de pagar um centavo**. Na `[EQUAÇÃO DE VALOR]`, isso leva a **Probabilidade Percebida a ~10/10** — a alavanca que ninguém consegue empurrar. E hoje ela vive no rodapé.

2. **A oferta nunca EMPILHA nem NOMEIA o próprio valor — e ancora no número fraco.** A lead vê "SaaS que recupera cliente + gestão + IA, R$275" e compara com o nada. A única âncora usada é "de R$383 por R$275" (28% — fraco). A âncora devastadora está na mão dela: **ela perde ~R$2.760/mês** (teste real) = **R$33 mil/ano de custo de inação** = **~10x o preço**. A oferta lidera com a âncora fraca e esconde a de 10x.

3. **Zero bônus nomeado, naming genérico, anual invisível.** As objeções da dona (golpe, "vão mexer no meu WhatsApp", "vão achar robô", "tá caro", "vou largar") estão mapeadas mas **nenhuma virou um bônus com nome** que a mata. "Essencial/Premium/Ultra" não vende transformação. E o anual embute **2 meses grátis** (275×10=2.750) que ninguém usa.

**[Certo] O conserto não pede baixar preço, inventar feature nem mentir.** Pede: (a) Raio-X no centro absoluto como `[GARANTIA GOD-MODE]`; (b) `[TRIM & STACK]` do que já existe; (c) trocar a âncora fraca (de-para) pela forte (o dinheiro dela); (d) cada objeção vira `[STACK DE BÔNUS]`; (e) usar anual + good-better-best (Premium "Mais escolhido" já é o decoy certo). **Nada disso mexe no número de `public_plans`.**

**[Palpite calibrado] O teto de conversão não é a copy — é a fila do Raio-X.** O próprio funil de cold outreach concluiu: *"a copy compra os minutos; a demo fecha"*. A alavanca #1 é operacional (a esteira do Raio-X rodar liso e mostrar número forte). Toda a oferta abaixo é desenhada pra **empurrar tudo pro Raio-X** o mais rápido possível.

---

## 1. FASE 1 — Extração (pré-preenchida do contexto REAL)

> O processo Hormozi manda extrair 1 pergunta por vez. Aqui as respostas **já estão aterradas** no código, nos docs e na confirmação da controladora — re-interrogar seria desperdício. Preenchimento transparente:

| # | Pergunta Hormozi | Resposta (do contexto real) |
|---|---|---|
| P1 | O que vende e por quanto? | SaaS de IA pra salão: recupera clientes sumidas + gestão de carteira no WhatsApp + agente de IA. **Essencial R$275 · Premium R$427 · Ultra R$693** (lançamento) → 383/599/849 (tabela). |
| P2 | Quem compra? Dor mais cara? | Profissional da beleza por horário marcado (unhas, cílios, sobrancelha, pele, cabelo, make). **Dor mais cara: cliente some e não volta — dinheiro vazando que ela nem vê** (+ no-show). |
| P3 | Resultado dos sonhos? | Ver o dinheiro parado e **trazer a cliente de volta pelo próprio WhatsApp, sem gastar com anúncio, sem virar escrava de tecnologia.** |
| P4 | O que já tentou / por que duvida? | Caderno, print, memória; talvez agência que prometeu e queimou. **Duvida porque "já me venderam ferramenta que não funcionou" e teme golpe/clonagem do WhatsApp.** |
| P5 | Tempo pra ver resultado / esforço? | Hoje: zero reativação estruturada (nunca vê). Com o produto: **Raio-X em ~20 min; cliente de volta em dias; 5 min/dia (só aprova).** |
| P6 | 3 maiores motivos pra NÃO comprar? | (1) **"É golpe / vão mexer no meu WhatsApp"**; (2) **"tá caro / não sei se vale"**; (3) **"minhas clientes vão achar robô"**. |

---

## 2. FASE 2 — Diagnóstico Hormozi

### BLOCO A — Por que a oferta atual é fraca

| Sintoma Hormozi | Onde acontece hoje |
|---|---|
| **Lista feature em vez de resultado** | "SaaS + gestão + IA" em vez de "seu dinheiro de volta na tela" |
| **Compete/ancora no número fraco** | de-para "de R$383 por R$275" (28%) lidera; a âncora de 10x (a perda dela) fica escondida |
| **Risco não revertido explicitamente** | o Raio-X existe mas não é declarado como a reversão de risco central da oferta |
| **Sem `[STACK DE BÔNUS]`** | objeções mapeadas, nenhuma virou bônus nomeado que mata o medo antes de ela falar |
| **`[NOME MÁGICO]` ausente** | "Essencial/Premium/Ultra" + oferta sem nome = dá pra comparar com qualquer CRM |

**Veredito Hormozi:** *"dá pra comparar com o concorrente → ainda não terminou o trabalho."* Um CRM genérico cabe na mesma planilha. **O Raio-X é o que torna incomparável — e está desligado do pitch.**

### BLOCO B — O mapa de valor `[EQUAÇÃO DE VALOR]`

```
              Sonho × Probabilidade Percebida
   Valor  =  ──────────────────────────────────
                  Tempo × Esforço
```

| Quadrante | Score hoje | O que falta / estratégia |
|---|:---:|---|
| **Sonho (Dream Outcome)** | 7/10 | Bom (dinheiro concreto), mas difuso. **Subir:** específico + emocional — "a cadeira enchendo com quem já foi sua". |
| **Probabilidade Percebida** | **9/10 (o ouro)** | **Aqui vocês ganham de todo mundo:** o Raio-X mostra o R$ DELA antes de pagar. **Estratégia: pôr no centro.** É o único quadrante que quase ninguém consegue levar a 9. |
| **Tempo de espera** | 8/10 | Raio-X em ~20 min, cliente em dias. **Manter:** "o número na sua tela em minutos". |
| **Esforço/Sacrifício** | 8/10 | Setup concierge + "só aprova". **Nomear:** "Setup Concierge de 30 min" e "1 clique". |

**Leitura:** a maioria briga pra subir o **Sonho** (prometer mais — e mentir). Vocês têm a alavanca rara — **Probabilidade a ~9/10 via prova própria**. Construa a oferta inteira pra chegar no Raio-X, porque é lá que a equação explode. Os 4 pontos a mexer: sonho ↑ (mais vívido), prova ✓ (já tem — só destacar), demora ↓ (já curta), esforço ↓ (já baixo — só nomear).

### BLOCO C — Os problemas virando solução (objeção → componente)

| Objeção (voz dela) | Vira → componente | Instrumento |
|---|---|---|
| "não sei quantas sumiram nem quanto vale" | 🔍 **Raio-X da Carteira** | `[GARANTIA GOD-MODE]` (prova) |
| "não tenho a lista de quem sumiu" | 📡 **Radar de Recuperação** | `[TRIM & STACK]` (core) |
| "não sei o que escrever sem parecer desesperada" | ✍️ **Mensagem no Seu Tom** | `[TRIM & STACK]` (effort) |
| "não tenho tempo/mão de puxar uma a uma" | 🤖 **4 Automações 24/7** | `[TRIM & STACK]` (effort) |
| "tecnologia me trava / vou largar" | 🛠️ **Setup Concierge de 30 min** | `[TRIM & STACK]` (effort) |
| "trabalho sozinha" | 💬 **A IA que Atende por Você** | `[TRIM & STACK]` (core) |
| **"é golpe / vão mexer no meu WhatsApp"** | 🛡️ **Blindagem do WhatsApp** | `[STACK DE BÔNUS]` |
| **"minhas clientes vão achar robô"** | ✅ **Garantia do Seu Tom** | `[STACK DE BÔNUS]` |
| **"e se faltar automação que eu preciso"** | 🌱 **Roadmap Vivo (cresce com você)** | `[STACK DE BÔNUS]` |
| **"e se eu me arrepender da compra"** | ⚖️ **7 Dias da Lei do Seu Lado (CDC)** | `[GARANTIA GOD-MODE]` |

---

## 3. FASE 3 — A GRAND SLAM OFFER

### 3.1 `[DREAM OUTCOME]` — o resultado dos sonhos em uma frase

> **"Ver, hoje, quanto dinheiro está parado na sua carteira — e trazer suas clientes sumidas de volta pelo seu próprio WhatsApp, em 5 minutos por dia, sem gastar um real com anúncio."**
>
> *Ganho emocional:* parar de olhar a cadeira vazia sabendo que a cliente existe, está no seu celular, e só faltou alguém chamar.

Corta o "até 70%" (hedge que enfraquece) e "180 dias" (proibido — copy é "seus últimos meses"). O número forte não é % prometida — é **o R$ que o Raio-X mostra**.

### 3.2 `[TRIM & STACK]` — o value stack (core + speed/effort/proof)

> **⚠️ Adaptação de conselheiro pra ESTE público (crítica — e Hormozi-compliant):** o público é cético e queimado por agência/MLM. Um "VALOR TOTAL R$3.500 → você paga R$275" grande demais **liga o detector de golpe** exatamente na persona que você mais quer. O próprio checklist do squad exige *"números realistas, não fantasia"*. Então: **âncora primária = o dinheiro DELA** (inatacável); o stack abaixo é suporte, com valores como *"o que custaria montar isso à mão"* (referência de mercado honesta), não número mágico.

| Tipo | Componente (nome proprietário) | O que faz (feature real) | Referência solta* |
|---|---|---|---|
| **CORE** | 📡 **Radar de Recuperação** | Varre a carteira toda semana e entrega a lista nova de quem sumiu + R$ | analista part-time ~R$300/mês |
| **CORE** | 💬 **A IA que Atende por Você** | Responde, qualifica e reativa no WhatsApp (Essencial: recepção; Premium: atende/qualifica/reativa sozinho) | recepcionista ~R$500/mês |
| **CORE** | 📅 **Carteira + Agenda + Painel** | Fim do caderno: agenda, carteira e faturamento num lugar | ERP salão ~R$150/mês |
| **EFFORT** | 🤖 **4 Automações 24/7** | Aniversário · lembrete 24h (mata no-show) · pacote vencendo · cliente sumida | assistente ~R$250/mês |
| **EFFORT** | ✍️ **Mensagem no Seu Tom** | A IA escreve, com o nome da cliente, no jeito dela; ela aprova em 1 clique | copywriter ~R$200/mês |
| **EFFORT** | 🛠️ **Setup Concierge de 30 min** | A equipe configura tudo no WhatsApp atual — sem trocar número, ela não mexe em nada técnico | onboarding pago ~R$300 (1x) |
| **PROOF** | 🔍 **Raio-X da Carteira** | Mostra na tela quem sumiu (nome+fone) e quanto vale — **antes de pagar** | consultoria retenção ~R$300–800 → **grátis (é a prova)** |

\* *Referência ilustrativa do que cada peça custaria contratada solta — NÃO preço de venda. Só dá dimensão.* Soma de referência: **~R$1.400/mês em ferramentas soltas + R$300 de setup**, e o Raio-X grátis — por a partir de **R$275/mês**. (~5x no stack; ~10x contra o custo de inação — ver 3.3.)

### 3.3 Ancoragem de preço `[EQUAÇÃO DE VALOR]` + resposta ao "como enquadrar 275→383"

Três âncoras, **nesta ordem de força** (a atual usa só a 3ª, a mais fraca):

1. **PRIMÁRIA — o custo de inação (o Raio-X).** "Você perde ~R$X/mês em clientes que sumiram." Exemplo real: **R$2.760/mês = R$33.120/ano.** Contra Essencial (R$3.300/ano) → **valor-preço ~10:1**. É o número dela, imbatível. **Lidera sempre.** *(Nota Hormozi/Pricing: a 10x-rule sugere que vocês estão até **subprecificados** — o de-para 275→383 fecha parte honesta desse gap, não é "aumento por ganância".)*
2. **SECUNDÁRIA — o de-para de tabela.** "É preço de lançamento: de [tabela] por [lançamento], sobe em breve." Verdadeiro, cria urgência — mas só ~28%, então **suporte, não manchete.** (Sem "travado pra sempre" — proibido de propósito.)
3. **TERCIÁRIA — o anual (2 meses grátis).** `[mensal]×10 = [anual]` → **"no plano anual, 2 meses são por nossa conta."** Fecha o cético que quer garantir o preço de lançamento por mais tempo.

**Good-better-best (já no banco — reforçar, NÃO reinventar; nada de 4º plano):**

| Tier | Papel psicológico | Frame de venda |
|---|---|---|
| **Essencial** | âncora baixa / porta de entrada | "Comece a recuperar — recepção de IA + agenda + CRM" |
| **Premium — "Mais escolhido"** | **o decoy/alvo** (pra cá vai a maioria) | "Atende, qualifica e reativa cliente **sozinho** — pra equipe que quer crescer" |
| **Ultra** | âncora alta (faz o Premium parecer razoável) | "Multi-unidade, IA de **voz**, integrações — pra redes" |

### 3.4 `[GARANTIA GOD-MODE]` — a reversão de risco (a jogada central)

**[Certo] Contraintuitivo, leia com atenção.** Hormozi normalmente empurra garantia condicional ("recupere X ou reembolso"). **Para este produto/público seria mais FRACO:** (a) a operação não sustenta prometer resultado (profundidade do histórico do WhatsApp é incerta — a própria esteira admite); (b) "devolvo 100%" é o timbre EXATO da agência que queimou a dona (documentado no funil de cold outreach). A reversão correta já existe e é **superior a reembolso** — é a **anti-garantia premium + prova específica dela**:

> ### 🔒 "A gente não te promete. A gente te mostra."
> **"Você não compra uma promessa. Você compra um número que já viu com os próprios olhos.** Antes de pagar um único real, o Raio-X mostra na sua tela quantas clientes sumiram, quem são e quanto valem. Você decide **depois** de ver o dinheiro. Não fez sentido? Fica com o Raio-X de brinde e a gente apaga tudo em 72h, com confirmação."**

Três camadas, todas honestas e cumpríveis (o checklist do squad exige *"garantia que o negócio consegue cumprir"*):

| Camada | O que é | Mata o medo de |
|---|---|---|
| **1. Prova antes do pagamento** | o Raio-X: o R$ dela na tela antes de decidir | "e se não funcionar / for enganação" |
| **2. Segurança legal** | arrependimento de **7 dias** (CDC art. 49) — "a lei do seu lado, sem letra miúda" | "e se eu me arrepender da compra" |
| **3. Apagamento com prova** | não fechou → tudo apagado em 72h com confirmação (LGPD) | "e se ficarem com meus dados" |

**Proibido:** "painel-juiz", "risco é nosso", "devolvo se não recuperar", "resultado garantido".

### 3.5 `[STACK DE BÔNUS]` — cada bônus mata uma objeção

| Bônus (nomeado) | O que entrega | Objeção que mata |
|---|---|---|
| **🛡️ Blindagem do WhatsApp** | "A gente **nunca** pede senha, código ou acesso ao seu WhatsApp pra te mostrar o Raio-X. Quando ativa, é o **seu** número, você no controle." | **"É golpe? Vão clonar meu WhatsApp?"** (objeção #1) |
| **✅ Garantia do Seu Tom** | "**Nada, nunca**, sai pra sua cliente sem você aprovar. Cada mensagem passa por você — no seu jeito, com o nome dela." | **"Minhas clientes vão achar robô"** |
| **🌱 Roadmap Vivo (cresce com você)** | "Achou uma tarefa do seu espaço que caberia um robô? Você pede. Serve a **todo** salão → implementamos **de graça**. Só sua → agente sob medida (add-on). O sistema nunca para de automatizar seu negócio." | **"Vou enjoar / produto vai ficar parado no tempo"** |
| **⚖️ 7 Dias da Lei do Seu Lado** | "Arrependeu em 7 dias? O CDC te devolve. Sem letra miúda, sem promessa de resultado." | **"E se eu me arrepender?"** |

*(O 🌱 Roadmap Vivo é o pitch ponto 7 — subir de letra-miúda pra bônus nomeado é a maior alavanca de diferenciação: nenhum concorrente promete crescer com ela.)*

### 3.6 Escassez e urgência — só o que é verdade

**Escassez:** a ÚNICA legítima é temporal (preço de lançamento sobe pra tabela). **Nada de "X vagas"** — o Marcelo matou isso de propósito (era desonesto), é linha dura. *(A validar: se o Setup Concierge é manual e tem teto real de onboarding/semana, "a fila do concierge" seria escassez de capacidade honesta — usar SÓ se for verdade.)*

**Urgência (duas, honestas):**
1. **A hemorragia (a mais forte — e nova).** "Quem sumiu há 40 dias volta fácil; há 6 meses, raramente. **Cada semana, o seu Raio-X encolhe.**" Mecanismo real, específico, sem relógio falso.
2. **O preço.** "O valor de agora é o de lançamento e sobe pra tabela em breve."

### 3.7 `[NOME MÁGICO]` — MAGIC naming

| Peça | Proposta | Racional |
|---|---|---|
| **Nome do método/oferta** | **"Cliente de Volta"** (já tem equity na LP `main`) | Container = método; outcome = cliente de volta. O sonho em 3 palavras. |
| **Tagline** | *"O sistema que traz sua cliente de volta pelo seu WhatsApp — em 5 minutos por dia."* | sonho + esforço-baixo + canal dela |
| **Nome do hook (a demo)** | **"Raio-X da Carteira"** | "Raio-X" = ver o escondido (o dinheiro parado). Power word, curioso, específico. |
| **Tiers** | Essencial *"Comece a recuperar"* · Premium **"Mais escolhido"** *"Recupera e atende sozinho"* · Ultra *"IA em escala, pra redes"* | transformação, não tamanho |

### 3.8 Qualifier — "Isso NÃO é pra você se…" (exclusividade honesta)

> Instrumento do squad pra subir valor percebido sem inventar escassez — e de quebra alinha o ICP:
>
> **"O Cliente de Volta NÃO é pra você se:** você não atende por horário marcado; não tem histórico de clientes no seu WhatsApp; ou quer que o sistema dispare mensagem pra sua cliente **sem você aprovar** — porque aqui **nada sai sem o seu ok**. É pra quem tem carteira (mesmo pequena) e quer parar de perder cliente que já é sua."

*(Fora do ICP, como no produto: procedimento exclusivamente médico e comércio de cosmético sem atendimento. Nunca desqualificar por tamanho de carteira.)*

### 3.9 A OFERTA EM UMA PÁGINA (stack slide — o artefato pra levantar copy)

> **Números entre `[…]` vêm de `public_plans` em runtime — não hardcodar na copy de produção.**

```
═══════════════════════════════════════════════════════════
CLIENTE DE VOLTA — NexvyBeauty
O sistema que traz sua cliente sumida de volta pelo seu
próprio WhatsApp, em 5 minutos por dia, sem gastar com anúncio.

Pra: profissional da beleza que atende por horário marcado
     (unhas, cílios, sobrancelha, pele, cabelo, maquiagem…)
═══════════════════════════════════════════════════════════

A PROVA (antes de pagar um real):
🔍 RAIO-X DA CARTEIRA — te mostramos na tela quantas clientes
   sumiram, quem são e quanto valem em R$. Você decide DEPOIS
   de ver o número. (levantado do nosso lado — sem pedir senha
   nem acesso ao seu WhatsApp)

O QUE VOCÊ RECEBE:
✓ 📡 Radar de Recuperação — a lista de quem sumiu, toda semana, sozinho
✓ 💬 A IA que Atende por Você — responde, qualifica e reativa
✓ 📅 Carteira + Agenda + Painel — fim do caderno; você vê seu faturamento
✓ 🤖 4 Automações 24/7 — aniversário, lembrete de horário, pacote vencendo, cliente sumida
✓ ✍️ Mensagem no Seu Tom — a IA escreve com o nome da cliente; você aprova em 1 clique
✓ 🛠️ Setup Concierge de 30 min — configuramos tudo, no seu número, você não mexe em nada

BÔNUS (cada um mata um medo):
+ 🛡️ Blindagem do WhatsApp — nunca pedimos senha/acesso; é o seu número
+ ✅ Garantia do Seu Tom — nada sai pra cliente sem você aprovar
+ 🌱 Roadmap Vivo — pediu automação nova? Serve a todo salão = grátis. Só sua = sob medida
+ ⚖️ 7 Dias da Lei do Seu Lado — arrependeu em 7 dias? O CDC te devolve

A GENTE NÃO TE PROMETE — TE MOSTRA:
Você compra um número que já viu. Não fechou? Apagamos tudo em 72h.

A CONTA QUE FECHA:
VOCÊ PERDE HOJE:  [o R$ do seu Raio-X]   (ex.: R$2.760/mês = R$33 mil/ano)
O SISTEMA CUSTA:  [preço de lançamento]  (de [tabela] por [lançamento])
VOCÊ RECUPERA:    2–3 clientes de volta e ele já se pagou
NO ANUAL:         2 meses por nossa conta

URGÊNCIA (real): cada semana o seu Raio-X encolhe (quem sumiu há
6 meses raramente volta) — e o preço de lançamento sobe em breve.

NÃO é pra você se: não atende por horário marcado, não tem
carteira no WhatsApp, ou quer disparo sem aprovar cada mensagem.

PRÓXIMO PASSO:
Responde "quero" e a gente monta o seu Raio-X. Grátis, sem
compromisso, sem acesso ao seu WhatsApp.
═══════════════════════════════════════════════════════════
```

---

## 4. Objeções × rebatidas — embutidas na oferta

| Objeção (voz dela) | Onde a oferta responde | Rebatida (1 linha) |
|---|---|---|
| **"É golpe? Vão mexer no meu WhatsApp?"** | Bônus 🛡️ + reversão de risco | "Não pedimos senha nem acesso — levantamos do nosso lado. Ativou? É o seu número, você no controle." |
| **"Minhas clientes vão achar robô"** | Bônus ✅ + componente ✍️ | "Nada sai sem você aprovar — no seu tom, com o nome dela." |
| **"Vai funcionar? / já me enganaram"** | 🔍 Raio-X | "Você vê o R$ na tela antes de pagar. É prova, não promessa." |
| **"Tá caro / não sei se vale"** | Ancoragem 3.3 + conta por nicho | "Você perde R$X/mês; o plano custa [preço]. Recuperar 2 clientes já paga." |
| **"Me deixa pensar"** | Urgência da hemorragia 3.6 | "Sem pressão falsa — mas cada semana seu Raio-X encolhe, e o lançamento sobe." |
| **"Vai me dar trabalho / não sei mexer"** | 🛠️ Setup Concierge | "A gente configura tudo. 5 min/dia, você só aprova." |
| **"Já uso WhatsApp Business + agenda"** | componente 📅 + copy | "Mesmo número, mesmo WhatsApp — a gente turbina, não troca." |
| **"E se eu me arrepender?"** | Bônus ⚖️ 7 dias CDC | "A lei te devolve em 7 dias. Sem letra miúda." |
| **"E se faltar automação que preciso?"** | Bônus 🌱 Roadmap Vivo | "Você pede. Serve a todo salão = grátis. Só sua = sob medida." |

---

## 5. Antes × depois

| Dimensão | ANTES | DEPOIS (Grand Slam) |
|---|---|---|
| **Reversão de risco** | demo = etapa de funil | **Raio-X = centro** (anti-garantia + prova própria) |
| **Âncora de preço** | de-para 28% (fraco) | **custo de inação ~10x** lidera; de-para + anual = suporte |
| **Value stack** | inexistente | **7 componentes nomeados** (core/effort/proof) + referência honesta |
| **Bônus** | zero | **4 nomeados**, cada um mata uma objeção |
| **Naming** | genérico, oferta sem nome | **"Cliente de Volta"** + **"Raio-X da Carteira"** + taglines |
| **Anual** | invisível | **"2 meses por nossa conta"** |
| **Urgência** | "sobe em breve" (vaga) | **hemorragia** (Raio-X encolhe) + preço sobe |
| **"Cresce com você"** | letra miúda | **Bônus 🌱 Roadmap Vivo** (moat) |
| **Qualifier** | inexistente | **"NÃO é pra você se…"** (exclusividade honesta) |
| **Honestidade** | já honesta | **mantida** — zero escassez inventada, zero garantia de performance |

---

## 6. TESTE HORMOZI + checklist de qualidade

**O TESTE (4 perguntas do clone):**

| Pergunta | Veredito |
|---|---|
| Dá pra comparar com o concorrente? | **Não** — nenhum CRM mostra o R$ dela **antes de pagar** (o Raio-X é category-of-one). |
| O valor percebido é muito maior que o preço? | **Sim** — custo de inação ~R$33k/ano vs R$3,3k/ano (Essencial). ~10:1. |
| O risco está com você ou com o cliente? | **Com a gente** — ela vê o número antes de pagar + 7 dias CDC + apaga em 72h. |
| O cliente sentiria burrice em recusar? | **Perto** — ela recusa um raio-x grátis que mostra o próprio dinheiro parado. O atrito que resta é operacional (a fila do Raio-X), não retórico. |

**Checklist de qualidade do squad (HORMOZI-CL-001) — itens CRÍTICOS:**
- ✅ Dream outcome visualizável (CRÍTICO) · ✅ Probabilidade endereçada com prova (CRÍTICO) · ✅ Grand Slam "burrice dizer não" (CRÍTICO) · ✅ Revenue model explícito (CRÍTICO — planos live) · ✅ Next steps específicos (CRÍTICO — §7).
- ✅ Risk reversal presente e crível · ✅ Escassez lógica, não fabricada · ✅ Números realistas, não fantasia (por isso a âncora é a perda dela, não um "valor total" inflado).
- **Resultado: PASS.**

---

## 7. O que muda pra entregar — por dono (e o que é decisão do Marcelo)

> Quase tudo é **copy/apresentação** (não código, não banco). O produto já entrega; falta **empacotar**. Quick wins (<7 dias) marcados.

### 7.1 Copy — sem tocar banco/código (baixo risco · quick win)

| Onde | Mudança | Dono |
|---|---|---|
| LP (`main:SalesPage.tsx`) | Reordenar em torno de "Cliente de Volta" + Raio-X no topo; value stack nomeado; ancoragem "perda dela"; bônus; anual; qualifier | copy (revisão Marcelo) |
| Prompts Duda/Bia (`platform_crm_product_agents`) | Injetar nomes (Raio-X, Radar, Roadmap Vivo, Blindagem) + ancoragem "perda dela primeiro" + o anual | **decisão Marcelo** (edição em prod) |
| `platform_crm_products` (pitch/objections) | Nomear componentes/bônus; reversão de risco na versão anti-garantia | **decisão Marcelo** |

### 7.2 Já pronto no produto (só empacotar)

Raio-X (esteira demo ~65%), Radar, 4 automações, IA que atende, Setup concierge, Carteira/Agenda, de-para de preço, anual, good-better-best, "cresce com você". **Nada novo a construir pra oferta** — o trabalho é posicionamento.

### 7.3 Decisões do Marcelo (HITL)

1. **Renomear planos no banco?** Recomendo **não** (acopla LP+agentes+`public_plans`) — só taglines.
2. **"Cliente de Volta"** como nome oficial do método? (tem equity na LP).
3. **"Fila do Concierge"** como escassez de capacidade — **só se for verdade**.
4. **Valores de referência do stack** na copy pública — usar/omitir? (Recomendo âncora na perda dela; referências discretas ou ausentes — o público cético desconfia de "valor total" inflado.)
5. **Subprecificação:** a 10x-rule sugere que o Essencial pode estar barato; o de-para 275→383 fecha parte honesta — **avaliar** se a tabela deveria ser mais alta (decisão de negócio, não desta análise).
6. Aplicar qualquer mudança no **live** = OK da controladora + Marcelo (nada aqui foi aplicado).

---

## 8. Rodada 2 — Naming segmentado + Ladder de preço (perguntas do Marcelo)

> Aterrado no banco LIVE (query read-only 2026-07-16): preços confirmados (275/383 · 427/599 · 693/849; Trial/Teste `is_public=false`) e **apenas 1 org ativa (plano Ultra, provável interna) — efetivamente PRÉ-LANÇAMENTO, sem base pagante.** Isso muda o cálculo de preço (§8.2). Rodado por `hormozi-squad` + `100m-offers` + `100m-leads`.

### 8.1 Naming — "Cliente de Volta" é estreito demais (o Marcelo acertou)

**[Certo]** "Cliente de Volta" nomeia SÓ um dos dois trabalhos do produto:
- **Recuperação (retenção)** — pra quem TEM carteira com vazamento. Aqui o Raio-X brilha.
- **Encher/manter agenda (captação + no-show)** — pra quem COMEÇA ou cuja dor é cadeira vazia/faltas, não churn.

Pior: pra iniciante de histórico raso, **o próprio Raio-X volta vazio** (o blueprint prevê "< 5 sumidos → mensagem honesta de histórico curto"). Liderar TUDO com Cliente de Volta + Raio-X **se auto-seleciona contra** o segmento iniciante. **Mas** o `salao_cliente` do cold outreach (1.497) é carteira-pesado — pra ESSE canal, Cliente de Volta é perfeito. Então não mata; escopa.

**Recomendação — naming em hierarquia (não um nome só):**

| Camada | Nome | Pra quem / papel |
|---|---|---|
| **Promessa-mãe (guarda-chuva)** | **"Agenda Cheia"** | todos os segmentos — subsume recuperação + captação + no-show; bate na dor emocional (a cadeira vazia) |
| **Benefício (tagline)** | *"Agenda cheia é dinheiro no bolso — sem gastar com anúncio."* | conecta ao "Dinheiro no Bolso" que o Marcelo levantou |
| **Lead magnet / prova (recuperação)** | **"Raio-X da Carteira"** | quem TEM carteira (cold outreach) — o hook killer, escopado |
| **Sub-promessa recuperação** | "traga sua Cliente de Volta" | mecanismo, não o nome do todo |
| **Sub-promessa iniciante/no-show** | "encha e mantenha sua agenda / cadeira nunca vazia" | quem começa ou cuja dor é falta, não churn |

Em Hormozi: o nome-mãe promete o **dream outcome que o mercado INTEIRO compartilha** → "Agenda Cheia". O Raio-X segue como lead magnet "Reveal Problems" (100m-leads) pro segmento onde funciona.

### 8.2 Preço — a direção do Marcelo está certa, os multiplicadores QUEBRAM a escada

**[Certo, com a matemática]** Subir a tabela: concordo. Mas **2x/1,8x/1,2x invertem/achatam o good-better-best** — matam o decoy que a gente reforçou:

| Base do multiplicador | Essencial 2x | Premium 1,8x | Ultra 1,2x | O que quebra |
|---|---|---|---|---|
| sobre **lançamento** (275/427/693) | 550 | 769 | 832 | Premium↔Ultra a **8%** (769 vs 832) → Ultra vira quase-Premium, decoy morre |
| sobre **tabela atual** (383/599/849) | 766 | 1.078 | **1.019** | **Ultra fica MAIS BARATO que Premium** → escada invertida |

A intenção é boa ("Essencial é o mais subprecificado vs valor — regra 10x mais violada na entrada"). Mas **"mais subprecificado vs valor" ≠ "quem pode pagar mais agora"**: o comprador do Essencial é a solo (ticket R$50-90, ~R$3-6k/mês) — R$550/mês = 10-18% do faturamento dela. Tem o MENOR caixa e é a maior fonte de volume do cold outreach.

**O que o banco muda:** só **1 org ativa (Ultra, provável interna) = sem base pagante.** Logo: subir a **tabela** (futuro/âncora) tem **risco ~zero** (sem cohort/grandfathering). Mas há **zero prova/depoimento** ainda → o flywheel (100m-leads: "o melhor anúncio é um cliente feliz" + LAIRE-Earn) nem começou. Entrada cara **estrangula o volume que gera as primeiras histórias de sucesso**.

**Recomendação (Ladder A) — mantém a entrada de lançamento acessível, sobe a TABELA com escada limpa:**

| Tier | Lançamento (mantém) | Tabela hoje | **Tabela proposta** | De-para (âncora) |
|---|---|---|---|---|
| Essencial | R$275 | 383 | **R$450** | "de R$450 por R$275" (−39%) |
| Premium "Mais escolhido" | R$427 | 599 | **R$720** | "de R$720 por R$427" (−41%) |
| Ultra | R$693 | 849 | **R$1.190** | "de R$1.190 por R$693" (−42%) |

Escada tabela A: 450 : 720 : 1.190 = **1 : 1,6 : 2,64** ✅ (Premium = meio inteligente; Ultra claramente premium — voz IA + API justificam). De-para de 39-42% (vs 28% hoje) = **âncora + urgência mais fortes**. Anual segue ×10 (2 meses grátis). Entrada de lançamento intacta → cold outreach + flywheel preservados.

**Se o Marcelo insistir em dobrar a entrada (Ladder B):** Essencial tabela 550, Premium **850**, Ultra **1.290** (1 : 1,55 : 2,35 ✅ — a escada sobe junto pra não quebrar). Custo: no salto lançamento→tabela, a solo paga 550 → risco de resistência na entrada. Mitiga: grandfather do cohort de lançamento + segurar a entrada baixa por mais tempo.

**"Vamos conseguir mostrar o valor?"** — **[Certo] SIM:** a âncora é o **custo de inação** (o Raio-X, ~R$33k/ano de vazamento médio), não a etiqueta. Mesmo Essencial a R$450 tabela = 5.400/ano = **~6:1** vs o vazamento. O teto real não é justificar valor — é o **caixa da solo relativo ao faturamento dela** na entrada. Por isso: sobe a TABELA (âncora + futuro), mantém a ENTRADA de lançamento acessível AGORA (fase de comprar prova).

**HITL:** aplicar reajuste = write em `platform_plans` (+ recriar view `public_plans` se tocar colunas) = decisão do Marcelo + controladora. **Nada aplicado nesta sessão (READ-ONLY).**

---

## 9. Script de Oferta Unificado — "Agenda Cheia começa pelas clientes que você já tem"

> Resposta à pergunta do Marcelo: **sim, as duas promessas cabem no MESMO script** — não como nomes concorrentes, mas como **outcome + mecanismo**. "Agenda Cheia" é o destino (promessa-mãe, serve todos); "Cliente de Volta" (via Raio-X) é o **caminho mais rápido e barato** pra chegar lá (mecanismo/prova, pra quem tem carteira). O iniciante é pego no passo 4.
> **Ladder A aprovada pelo Marcelo (2026-07-16)**; aplicar no banco = HITL pendente (SQL no fim).

**A espinha (a linha que casa as duas):** *"Agenda cheia começa pelas clientes que você já tem."*

**[1 · Promessa-mãe — Agenda Cheia]**
Toda profissional de beleza quer a mesma coisa: **agenda cheia e dinheiro no bolso** — sem depender de anúncio e sem virar refém do celular.

**[2 · O mecanismo surpresa → Cliente de Volta]**
E o caminho mais rápido pra encher a agenda não é caçar cliente nova. É **trazer de volta as que já foram suas e sumiram**. Elas já te conhecem, já confiam, já gastaram com você — é dinheiro que já era seu, **parado no seu WhatsApp**.

**[3 · A prova → Raio-X da Carteira]**
E a gente te mostra exatamente quanto: o **Raio-X da Carteira** varre o seu WhatsApp e mostra na tela **quantas clientes sumiram, quem são e quanto valem em R$ — antes de você pagar um real.**

**[4 · Alarga pro iniciante/no-show — ainda Agenda Cheia]**
Está começando e a carteira ainda é pequena? A agenda enche **pela frente** também: a **IA que atende e qualifica** quem te chama, o **lembrete que mata a falta** (o no-show que rouba a sua cadeira) e as **automações 24/7**. Do jeito que a sua carteira estiver, a agenda enche.

**[5 · Reversão de risco]**
A gente não te promete — te **mostra**. Você decide depois de ver o número. Não fez sentido? Fica com o Raio-X de brinde e a gente apaga tudo em 72h.

**[6 · Preço ancorado na perda (escada A)]**
Você está perdendo **[o R$ do seu Raio-X]** por mês. O sistema custa **[preço de lançamento]** — de **[preço de tabela]** (sobe em breve). Recuperar 2-3 clientes já paga. No anual, **2 meses por nossa conta**.

**[7 · Fechamento — casa as duas promessas]**
**Agenda cheia começa pelas clientes que você já tem.** Responde **"quero"** que eu monto o seu Raio-X — grátis, sem compromisso, sem acesso ao seu WhatsApp.

> **Nuance de canal:** na **LP** e na venda geral, começa no passo 1 (Agenda Cheia). No **cold outreach** ao `salao_cliente` (carteira-pesado), pode ABRIR direto no passo 2/3 (Cliente de Volta), porque ela já tem carteira — e voltar pra "agenda cheia" no fechamento.

**Pronto pra aplicar a Ladder A (quando derem GO — write em prod, HITL):**
```sql
-- Sobe SÓ a tabela (list_price_monthly). Lançamento (price_monthly) intocado.
-- A coluna já existe na view public_plans → NÃO precisa recriar a view.
UPDATE public.platform_plans SET list_price_monthly = 450  WHERE slug = 'starter'; -- Essencial
UPDATE public.platform_plans SET list_price_monthly = 720  WHERE slug = 'pro';     -- Premium
UPDATE public.platform_plans SET list_price_monthly = 1190 WHERE slug = 'premium'; -- Ultra
-- check: SELECT slug, price_monthly, list_price_monthly FROM public_plans WHERE is_public ORDER BY display_order;
```

---

## Anexo — regras respeitadas + preços LIVE + fontes

**Regras duras honradas:**
- ✅ Preço = `public_plans` runtime; zero número hardcoded na copy de produção (só citado nesta análise).
- ✅ Escassez só temporal-honesta; nenhuma "vaga/fundadora" reintroduzida.
- ✅ Sem garantia de performance/devolução; reversão = Raio-X (prova) + CDC 7 dias + apagamento 72h.
- ✅ 3 tiers reforçados (Premium "Mais escolhido" = decoy); nenhum 4º plano inventado.
- ✅ READ-ONLY em prod — nada aplicado no banco/código/deploy.

**Preços LIVE (confirmados no banco pela controladora, 2026-07-16):**

| Plano | slug | Lançamento | Tabela | Anual | Selo | Descrição live |
|---|---|---|---|---|---|---|
| Essencial | starter | R$275 | R$383 | R$2.750 (~2 meses grátis) | — | Recepcionista de IA + agenda + CRM |
| Premium | pro | R$427 | R$599 | R$4.270 | **Mais escolhido** | Atende, qualifica e reativa sozinho |
| Ultra | premium | R$693 | R$849 | R$6.930 | — | Multi-unidade, IA de voz, integrações |

Teste E2E (R$10) e Trial (R$0) = `is_public=false` (não vazam — fix R5 correto).

**Fontes:** `PACOTE-SUNSET-LANCAMENTO-2026-07-14.md`, `COLD-OUTREACH-SCRIPT-ANALISE-2026-07-15.md`, `ESTEIRA-DEMONSTRACAO-BLUEPRINT-2026-07-15.md` (v2), `usePlatformPlans.ts`, `platform-sales-brain/index.ts`, `migrations_platform_crm/20260714_add_list_price_arquitetura.sql`, confirmação LIVE pela controladora. Frameworks: `100m-offers` + clone Hormozi + `hormozi-squad` (Offers/Pricing/Audit).

*Análise/design — nada aplicado. Marcelo decide o que vira copy no live.*
