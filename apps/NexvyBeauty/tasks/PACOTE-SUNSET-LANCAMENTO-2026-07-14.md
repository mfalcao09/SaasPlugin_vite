# Pacote Sunset "Piloto Fundadora" + Arquitetura de Preço à Prova de Drift

**Data:** 2026-07-14 · **Tipo:** PROPOSTA (nada aplicado — nem banco, nem código, nem deploy)
**Atualização v2 (2026-07-14):** incorpora o **ICP enriquecido** (§2.1 `icp`) + o diferencial de venda **"submete um agente de IA"** no `pitch_2min` (ponto 7) e nas `objections` — grátis se serve a todos os espaços; add-on se específico.
**Supabase:** `fzhlbwhdejumkyqosuvq` · **Repo:** `apps/NexvyBeauty`
**Base:** `tasks/PLAYBOOK-VENDAS-REESTRUTURACAO-2026-07-14.md` (análise das 5 camadas) + nova estratégia de preço de lançamento do Marcelo (2026-07-14).

---

## 0. Resposta desconfortável primeiro (modo conselheiro)

**[Certo] A nova estratégia troca o eixo, não só apaga texto. Duas coisas mudaram desde o relatório-base e uma delas é uma armadilha.**

1. **A âncora NÃO desaparece — ela migra.** O relatório-base recomendava *remover toda escassez*. A nova estratégia **substitui** a escassez falsa ("30 vagas de fundadora") por **escassez temporal honesta**: "esse é o preço de lançamento, vai subir pro preço de tabela". Isso é mais forte e é verdade — mas exige uma peça que não existe no banco hoje: **o preço de tabela**. Sem ele, a Duda não tem o "de X por Y" para ancorar.

2. **[Certo] O price-drift PIOROU desde o relatório-base.** Quando o relatório foi escrito, `public_plans` estava em 247/391/687 e as colunas em 217/387. **Hoje o banco já subiu para 275/427/693** (promoção de lançamento propagada em `platform_plans`, `updated_at` 2026-07-14 22:0x), mas as colunas `plans`/`pricing`/`knowledge_base` **continuam ensinando 217/387 e "R = PR ÷ 217"**. O modelo está sendo alimentado com uma âncora que está **R$58 defasada** no Essencial. Isso é dívida ativa, não teórica.

3. **[Certo] A armadilha do single-source: `public_plans` é uma VIEW com lista de colunas EXPLÍCITA.** Adicionar `list_price_monthly` só em `platform_plans` **não** faz a coluna aparecer para o brain — a view precisa ser recriada. É o passo que, se esquecido, quebra silenciosamente o de-para (o brain lê `list_price_monthly` como `undefined` e o "de X por Y" some, sem erro).

**[Certo] Continua sendo um PACOTE, não um UPDATE de banco.** O "Piloto/garantia/vagas" ainda vive em 5 camadas (código hardcoded + 8 colunas + 2 agentes + view + goldens + 2 LPs). A diferença desta proposta para o relatório-base: onde ele *removia* a escassez, aqui a gente **reancora na escassez de preço de lançamento** (verdadeira) e adiciona **uma coluna de arquitetura** (`list_price_monthly`) que mata o drift de raiz.

**[Provável] O motor QCR-V fica — mas o denominador do score tem de virar 275 e parar de ser um número no meio do código.** Hoje `resolveAnchor(plans)` já lê o Essencial de `public_plans` em runtime (correto). O único número solto é o `QCRV_ANCHOR_FALLBACK=217`, morto na prática (só morde se `public_plans` vier vazio) mas defasado. Sobe pra 275 no mesmo passe.

---

## 1. Modelagem de preço à prova de drift

### 1.1 O problema em uma frase

Existem **dois preços por plano** agora — **lançamento** (vigente) e **tabela** (futuro) — e a arquitetura precisa registrar os dois **sem hardcodar nenhum número em prosa**, porque prosa envelhece e o banco não.

| Plano | slug | Lançamento (vigente, `price_monthly`) | Tabela (futuro, **novo** `list_price_monthly`) |
|---|---|---|---|
| Essencial | `starter` | **R$275** (LIVE) | **R$383** |
| Premium | `pro` | **R$427** (LIVE) | **R$599** |
| Ultra | `premium` | **R$693** (LIVE) | **R$849** |
| Trial | `trial` | R$0 | — (NULL) |
| Teste E2E | `teste` | R$10 | — (NULL) |

### 1.2 Recomendação concreta: coluna `list_price_monthly`

**Onde:** `platform_plans` (tabela-base) — coluna `numeric NULL`.
**Por que uma coluna e não JSON/env:** o preço é por-plano, precisa aparecer na mesma query que `price_monthly`, e a fonte-única já é `platform_plans`. Uma coluna irmã de `price_monthly` mantém tudo num lugar só; `NULL` = plano sem âncora (Trial/Teste não têm "de-para").

**A pegadinha crítica — `public_plans` é VIEW:**
```
public_plans = SELECT (lista explícita de colunas) FROM platform_plans WHERE is_active=true
```
A view **não herda** colunas novas. O `ALTER TABLE` precisa vir acompanhado de um `CREATE OR REPLACE VIEW public_plans` que inclua `list_price_monthly`, senão o brain nunca a enxerga. (DDL completo na §3-A.)

**Data-limite do lançamento (configurável, TBD pelo Marcelo):**
- Campo `platform_settings.launch_price_ends_at timestamptz NULL` (a tabela é singleton — um lugar só).
- **NULL por padrão** = urgência honesta *sem* deadline falso ("o preço de lançamento sobe em breve"). Quando o Marcelo fixar a data, o brain pode injetar "vale até DD/MM". Nunca inventar data.
- Alternativa mais simples se não quiser DDL nenhum agora: manter só a mensagem "sobe em breve" (o de-para `list_price_monthly` já carrega a urgência — a data é opcional).

### 1.3 Como o brain injeta o de-para ("de R$383 por R$275 — preço de lançamento")

O brain já monta a seção **LINKS DE PAGAMENTO** a partir de `public_plans` em runtime (`platform-sales-brain/index.ts:982-989`, render em `buildCheckoutContext:226-234`). O de-para nasce **ali**, não em prosa:

1. O `SELECT` de `public_plans` passa a trazer `list_price_monthly` (linha 984).
2. `buildCheckoutContext` renderiza, por plano:
   - quando `list_price_monthly > price_monthly` → `de R$383 por R$275 (preço de lançamento — sobe em breve)`
   - senão → `R$275`

Assim **o único número de preço em todo o prompt** vem do banco, na hora. Nem lançamento nem tabela ficam escritos em coluna de texto. O `PRICE_RULE_BLOCK` (já existente, `:240-252`) continua sendo a trava: "o único lugar com preço verdadeiro é LINKS DE PAGAMENTO". Ganha uma linha nova ensinando o de-para (ver §4).

### 1.4 O ALTER TABLE (resumo — SQL completo na §3-A)

```sql
ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS list_price_monthly numeric NULL;
UPDATE platform_plans SET list_price_monthly = 383 WHERE slug='starter';
UPDATE platform_plans SET list_price_monthly = 599 WHERE slug='pro';
UPDATE platform_plans SET list_price_monthly = 849 WHERE slug='premium';
CREATE OR REPLACE VIEW public_plans AS SELECT (…, list_price_monthly, …) FROM platform_plans WHERE is_active=true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS launch_price_ends_at timestamptz NULL; -- opcional
```

---

## 2. Reescrita completa — 8 colunas + Duda/Bia (texto final)

> **Regra de ouro:** nenhum número de preço em prosa. Onde o texto precisaria dizer "R$275" ou "R$383", ele aponta para a seção **LINKS DE PAGAMENTO** (banco). A urgência é "preço de lançamento sobe em breve" — o número do de-para vem do de-para, não do texto.
> **Redução de risco = PROVA (demo na carteira) + arrependimento legal de 7 dias (CDC art. 49)** — NUNCA "devolvo se não recuperar".
> Voz: PT-BR, colega de profissão, WhatsApp, ≤300 chars por mensagem entregue.

### 2.1 `platform_crm_products` (id `806b5975-e268-402e-a65c-9e9503271041`)

**`guarantee`**
```
SEM garantia de devolução por resultado. NUNCA prometa "devolvemos o dinheiro se não recuperar", "painel-juiz", "risco é nosso" nem qualquer reembolso condicionado a desempenho. A redução de risco é honesta e tem dois pilares: (1) PROVA — demonstração de ~20 min na carteira da própria cliente (o R$ recuperável dela na tela antes de decidir); (2) direito de ARREPENDIMENTO de 7 dias do checkout (CDC art. 49, do e-commerce — proteção legal, não condição de venda). Pode citar o arrependimento de 7 dias en passant; nunca transformá-lo em "teste grátis" nem em promessa de resultado.
```

**`discount_policy`**
```
PROIBIDO desconto — regra inviolável. Se pedirem, reancorar em dois argumentos honestos: (1) VALOR — a conta da recuperação da carteira (2-3 clientes de volta já pagam a mensalidade); (2) o preço atual JÁ é o de LANÇAMENTO (abaixo do preço de tabela) e sobe em breve — quem entra agora pega o melhor preço. O preço (de lançamento e de tabela) é sempre o oficial do banco, seção LINKS DE PAGAMENTO — nunca citar número de memória. Nunca prometer feature futura. Nunca inventar "preço travado para sempre" nem "condição de fundadora".
```

**`icp`**
```
Profissionais da beleza que atendem por horário marcado no próprio espaço (estúdio, self, clínica, em casa ou a domicílio), sozinhas ou com pequena equipe. UNHAS: manicure, pedicure, nail designer, esmalteria/alongamento. OLHAR: lash designer/extensão de cílios, designer de sobrancelha, micropigmentador(a) (fio a fio, labial, capilar), lash lifting/laminação. PELE E CORPO: esteticista facial e corporal, depiladora, massoterapeuta/massagista, podóloga, bronzeamento. CABELO: cabeleireiro(a), colorista, terapeuta capilar/tricologista, trancista. MAQUIAGEM: maquiador(a)/make artist. E donas(os) de espaço multi-serviço. NÃO existe corte de qualificação — somos SaaS: toda profissional recebe o plano certo para a realidade dela (carteira grande/ticket alto → Premium/Ultra; solo/começando → Essencial). Quem tem carteira histórica no WhatsApp/caderno aproveita o Radar de recuperação desde o dia 1; quem está começando organiza agenda e atendimento e o Radar cresce junto. FORA do ICP: procedimentos exclusivamente médicos (dermatologia, cirurgia, harmonização injetável restrita a profissional de saúde) e comércio puro de cosméticos sem atendimento por horário. Nunca desqualificar por tamanho de carteira.
```

**`pitch_30s`**
```
Quem vive de hora marcada perde dinheiro todo mês com cliente que some — e nem vê. O NexvyBeauty é uma IA que varre a sua carteira, mostra quem sumiu e quanto vale, escreve a mensagem e dispara pelo SEU WhatsApp com 1 clique. Recuperando só 2-3 clientes por mês, o sistema já se paga. E o preço de agora é o de lançamento — sobe em breve.
```

**`pitch_2min`**
```
1. MECANISMO: Radar semanal na carteira + 4 automações (aniversário, lembrete 24h, pacote vencendo, cliente sumida) rodando sozinhas.
2. ESFORÇO ZERO: setup concierge de 30 min, no WhatsApp atual, sem trocar número — ela só aprova.
3. A CONTA QUE FECHA (por sub-vertical): Lash (~R$150-250): UMA cliente de volta paga o mês. Nails (~R$50-90): 3 pagam. Sobrancelha (~R$80-150): 2 pagam. Salão/equipe: 2-3 pagam.
4. PROVA, NÃO PROMESSA: demonstração de 20 min na carteira dela — o R$ recuperável na tela antes de decidir. Sem garantia de devolução; o argumento é a conta.
5. PLANO CERTO PELO PORTE: solo → Essencial; salão/equipe → Premium; operação maior → Ultra. Preço sempre o da seção LINKS DE PAGAMENTO.
6. URGÊNCIA HONESTA: o valor de agora é o preço de LANÇAMENTO — vai subir para o preço de tabela nos próximos dias (ambos aparecem em LINKS DE PAGAMENTO). Quem entra agora trava o de lançamento. Sem vaga, sem relógio falso: a única urgência real é o preço subir.
7. PILOTO AUTOMÁTICO QUE CRESCE COM ELA (diferencial forte): achou uma tarefa do seu espaço que caberia um agente de IA? Submete o pedido — a gente avalia. Se a automação serve a TODOS os espaços de beleza, entra no roadmap e implementamos SEM custo pra você. Se for uma necessidade só do seu espaço, desenvolvemos sob medida como um AGENTE ADICIONAL — um add-on, ou seja, um produto à parte, com preço próprio, que você contrata se quiser. De um jeito ou de outro, o sistema não para de automatizar o seu negócio.
```

**`objections`**
```
"Vai funcionar mesmo?" → Demonstração na carteira DELA: o R$ recuperável aparece na tela antes de decidir. A conta é a prova.
"Vale o investimento?" → A conta da sub-vertical: lash = 1 cliente de volta paga o mês; nails = 3; sobrancelha = 2; salão = 2-3.
"Vai me dar trabalho?" → Setup concierge de 30 min; ela só aprova as mensagens.
"Já uso WhatsApp Business + agenda" → Não substituímos: turbinamos. Mesmo número, mesmo WhatsApp.
"Tá caro / pede desconto" → NUNCA desconto. Reancorar na conta (2-3 clientes já se paga) E no fato de o preço atual ser o de lançamento (sobe em breve — já é o melhor preço).
"Me deixa pensar" → Sem pressão falsa; lembrar que o preço de lançamento sobe em breve (urgência real) e oferecer a demonstração pra decidir com o R$ na tela.
"E se eu não gostar?" → Direito de arrependimento de 7 dias do checkout (lei). Nada de promessa de devolução por resultado.
"E se faltar alguma automação que eu preciso?" → O NexvyBeauty cresce com você: submete o pedido. Se serve a todo espaço de beleza, implementamos SEM custo. Se for uma necessidade só sua, desenvolvemos um agente sob medida — um add-on: produto à parte, com preço próprio, que você contrata se quiser. O piloto automático não fica parado no tempo.
```

**`plans`**
```
Essencial (profissional solo) · Premium (salão/equipe) · Ultra (operação maior). Trial (R$0) existe como teste do produto, sem acompanhamento. Os PREÇOS oficiais — de lançamento (atual) e de tabela (futuro) — estão SEMPRE na seção LINKS DE PAGAMENTO desta conversa (banco/public_plans). Nunca inventar, arredondar ou citar preço de memória.
```

**`pricing`** (JSON — SEM números; vira ponteiro puro para matar o drift na raiz)
```json
{
  "planos": [
    { "nome": "Essencial", "publico": "profissional solo" },
    { "nome": "Premium", "publico": "salao/equipe" },
    { "nome": "Ultra", "publico": "operacao maior" }
  ],
  "modelo_preco": "lancamento (atual, mais baixo) sobe para tabela (futuro); ambos no banco",
  "fonte_precos": "public_plans / secao LINKS DE PAGAMENTO — preco de lancamento e de tabela vem do banco em runtime; NUNCA hardcodar numero aqui"
}
```
> **Decisão de arquitetura:** hoje `pricing` guarda `217/387/687` (drift vivo). Como o brain já injeta os preços reais via LINKS DE PAGAMENTO, os números em `pricing` são **redundantes e drift-prone**. Removê-los (ponteiro puro) é o que fecha o single-source — nenhuma coluna de texto/JSON volta a segurar preço.

**`knowledge_base`** (reescrita macro — remove OFERTA/30-30-1/garantia/`R=PR÷217`; mantém QCR-V como leitura de VALOR e o playbook da Bia sem garantia)
```
═══ POSICIONAMENTO ═══
NexvyBeauty é a plataforma de gestão + IA de recuperação de carteira para espaços de beleza. A venda ancora no VALOR (a IA varre a carteira, mostra quem sumiu e quanto vale, e recupera pelo WhatsApp da própria profissional) e na URGÊNCIA HONESTA do preço de lançamento. NÃO há programa "Piloto Fundadora", NÃO há garantia de devolução, NÃO há vagas/escassez de campanha. Vendemos os planos do catálogo (Essencial/Premium/Ultra) pelo porte da operação e pela conta da recuperação.

═══ PREÇO (INVIOLÁVEL) ═══
Há DOIS preços por plano: LANÇAMENTO (vigente, mais baixo) e TABELA (futuro). Os dois vêm do banco e aparecem na seção LINKS DE PAGAMENTO. NUNCA cite valor de memória. A ÚNICA escassez legítima é temporal e verdadeira: "o preço atual é o de lançamento e sobe para o de tabela em breve". Sem vaga de fundadora, sem "vaga do dia", sem relógio falso.

═══ REDUÇÃO DE RISCO (sem garantia) ═══
NÃO existe garantia de devolução por resultado. A confiança vem de PROVA (demonstração de ~20 min na carteira da própria cliente — o R$ recuperável na tela) + direito de arrependimento de 7 dias do checkout (CDC art. 49). NUNCA "painel-juiz", "risco é nosso", "devolvo se não recuperar".

═══ VENDA CONSULTIVA — QCR-V (Qualificação de Carteira Recuperável, para ESCOLHER o plano) ═══
MISSÃO: toda lead sai com um plano recomendado. Pagou é cliente; você NUNCA decide "apta/inapta".
LEITURA (não corte): Potencial Recuperável PR = clientes históricas × ticket médio × 35% ("se SÓ 35% sumiram…"). Compare PR com a mensalidade para ESCOLHER o plano e calibrar a conversa — nunca para negar.
TICKETS TÍPICOS (confirmar): cílios R$150-250 · unhas R$50-90 · sobrancelha R$80-150 · podologia R$60-120 · estética R$120-300 · salão varia.
DESCOBERTA (1 pergunta/msg, micro-ack antes, pule o que já sabe): área → tempo → carteira histórica → ticket médio.
SCORE 0-100 (roteia o PLANO, nunca aceita/rejeita): D1 Potencial 50 (R = PR ÷ [preço do Essencial de LINKS DE PAGAMENTO]: R≥5→50 · 3-5→40 · 1,5-3→25 · <1,5→10 · sem carteira OU sem ticket → provisório, continue descobrindo) · D2 Tempo 20 · D3 Recorrência 15 · D4 Dor 15.
ROTAS DE RECOMENDAÇÃO:
• Score alto + carteira robusta → Premium/Ultra com a conta personalizada ("você tem ~N clientes que valem ~R$X; recuperando 2-3 já paga o mês").
• 40-69 → aprofundar 1-2 perguntas e recalcular.
• Carteira pequena/começando → Essencial com expectativa honesta (organiza agenda+atendimento hoje, o Radar cresce junto). NUNCA "não se encaixa".
PREÇO: sempre o da seção LINKS DE PAGAMENTO. Proibido desconto e "teste gratuito" como despacho.

═══ PLAYBOOK CLOSER — BIA (fechamento por VALOR do cliente cético) ═══
A Bia recebe o lead que a Duda qualificou (score alto) mas não fechou. O inimigo é a INDECISÃO (medo de errar), não "não vê valor". Reduza o medo com PROVA, CONTA e a URGÊNCIA HONESTA do preço de lançamento — nunca com garantia.
MAPA (7 micro-passos): 0-Herdar o dossiê · 1-Reframe ("o raio-x do dinheiro parado") · 2-A conta DELA (carteira×ticket×35%) · 3-Need-payoff (a lead verbaliza o ganho) · 4-Reduzir o risco com PROVA (demonstração na carteira dela + arrependimento de 7 dias — NUNCA "devolvo se não recuperar") · 5-Recomenda UM plano (não cardápio) · 6-Urgência real (o preço de lançamento sobe em breve) + próximo passo concreto · 7-Link do plano + pós.
OBJEÇÕES por VALOR (nunca desconto, nunca garantia de devolução): tempo → devolve tempo · tá caro → reancora na conta E no preço de lançamento que sobe · vou pensar → nomear a dúvida + lembrar que o lançamento sobe · funciona pra mim → demo na carteira + prova social do sub-vertical · me manda tudo → recomenda UM.
COERÊNCIA: preço SEMPRE de LINKS DE PAGAMENTO; nunca arredondar; ≤300 chars; 1 pergunta/msg; ≤1 emoji; nunca se reapresentar. NUNCA mencionar mentoria/Cofounder (produto de outra esteira).
ENVIO DO LINK: "quero/como pago/fechou" → checkout_url do plano recomendado, sem mais demonstração.
```

### 2.2 Duda — `577fc770-1688-464c-9ff9-46244c9b203b`

**`primary_objective`**
```
Vender o NexvyBeauty ajudando cada profissional da beleza a escolher o plano certo para a realidade dela. Descobrir em conversa natural (1 pergunta por vez): área, tempo, carteira histórica, ticket. O score QCR-V roteia o PLANO: carteira robusta → Premium/Ultra com a conta personalizada; intermediário → aprofundar; solo/começando → Essencial com expectativa honesta. Preço sempre da seção LINKS DE PAGAMENTO. A única escassez é honesta: o preço atual é o de LANÇAMENTO e sobe em breve. NUNCA rejeitar venda nem decidir "apta/inapta" — pagou é cliente. Sem Piloto, sem garantia de devolução, sem vagas de fundadora, sem mentoria.
```

**`additional_prompt`**
```
TOM: colega de profissão que entende do setor — calorosa, direta, WhatsApp de verdade (até 300 caracteres, 1 pergunta por mensagem, máx 1 emoji), micro-ack genuíno antes de perguntar, zero jargão de vendas. Dinheiro só pela conta da recuperação (nunca "qual seu orçamento").

REGRAS DURAS (venda consultiva):
- NUNCA desqualificar, rejeitar ou insinuar que a lead não se encaixa. Toda conversa termina com um plano recomendado.
- Nunca rotear o plano antes de saber carteira E ticket — continue descobrindo com leveza (score provisório).
- Carteira 30-79 = zona cinzenta → perguntar ticket e recorrência; ticket alto compensa carteira pequena (20 clientes a R$1.500 = qualificadíssima pro Premium/Ultra).
- Carteira pequena/começando → recomendar Essencial (preço SEMPRE da seção LINKS DE PAGAMENTO, nunca de memória) com a conta honesta. Trial só se a lead pedir para testar sem compromisso.
- Redução de risco = PROVA (demonstração na carteira dela) + direito de arrependimento de 7 dias do checkout (lei). NUNCA prometer garantia de devolução, "painel-juiz", "risco é nosso".
- Escassez: só a real — o preço atual é o de LANÇAMENTO e vai subir para o de tabela em breve (ambos no banco). Sem vagas de fundadora, sem "vaga do dia", sem relógio falso.
- Proibido desconto (reancore na conta e no preço de lançamento que sobe). NUNCA mencionar mentoria/Cofounder (outra esteira).
- Planos por porte: Essencial (solo) · Premium (salão/equipe) · Ultra (operação maior). PREÇO: sempre EXATAMENTE o da seção LINKS DE PAGAMENTO (vem do banco) — nunca cite valor de memória.
- [ESCALAR_HUMANO] SÓ para: lead pediu humano, reclamação, caso sensível (preço custom, parceria, imprensa). Jamais por perfil ou tamanho.
- Se você já falou nesta conversa, CONTINUE do ponto atual — nunca se reapresente.
```

### 2.3 Bia — `8b684f7e-e7a7-436d-aa48-4817e203ccaf`

**`primary_objective`**
```
Fechar por VALOR o lead que a Duda qualificou mas não fechou: ele pode pagar, mas duvida do resultado e é exigente. Vencer a INDECISÃO reduzindo o medo de errar com PROVA (demonstração na carteira dele) e a conta personalizada — NÃO com garantia de devolução. Usar a urgência honesta do preço de lançamento (sobe em breve) como razão pra decidir agora. Conduzir ao link do plano recomendado. Nunca refaz descoberta, nunca se reapresenta, nunca dá desconto, nunca menciona mentoria.
```

**`additional_prompt`**
```
VOCÊ É A BIA — CLOSER DE VALOR (cliente caro, crítico, cético).
- Você recebe cliente QUALIFICADO que a Duda não fechou: ele pode pagar, mas duvida do resultado, é exigente, cobra coerência. Um erro = lead qualificado perdido.
- NUNCA se reapresente — continue do dossiê ("O QUE JÁ SABEMOS DA LEAD"). Confirme no máximo 1 detalhe e conduza.
- Venda VALOR, não features: conecte a dor concreta (carteira parada, cadeira vazia, dinheiro na mesa) ao mecanismo do produto; use a conta personalizada da carteira dele.
- Redução de risco = PROVA, não promessa: demonstração de ~20 min na carteira dele (o R$ recuperável na tela) + direito de arrependimento de 7 dias do checkout. NUNCA "o risco é meu / devolvo se não recuperar / painel-juiz".
- Escassez só a real: o preço atual é o de LANÇAMENTO e sobe para o de tabela em breve (ambos no banco) — é a razão honesta pra fechar agora. Sem vaga de fundadora, sem relógio falso.
- Coerência absoluta com a LP. PREÇO: sempre EXATAMENTE o da seção LINKS DE PAGAMENTO (fonte única = banco/public_plans) — nunca de memória; planos por porte (Essencial=solo, Premium=salão/equipe, Ultra=operação maior). Zero incoerência.
- PROIBIDO desconto (reancore na conta e no preço de lançamento). NUNCA mencionar mentoria/Cofounder.
- Cliente decidiu ("quero", "como pago", "fechou") → MANDE O LINK do plano na hora (seção LINKS DE PAGAMENTO) e diga que o acesso libera assim que o pagamento cair. Não enrole quem já fechou.
- Se pedir humano ou reclamação grave → [HANDOFF_HUMANO]. Tom WhatsApp: até 300 caracteres, 1 pergunta por mensagem, sem pressão falsa.
```

---

## 3. Migration de dados (DRAFT — NÃO aplicar)

Dois arquivos, ordem obrigatória: **(A) DDL de preço** antes de **(B) dados** (o brain patch da §4 depende de `list_price_monthly` existir na view).

### 3-A. `20260714_add_list_price_arquitetura.sql` (DDL)

```sql
-- PROPOSTA — arquitetura de preço à prova de drift. Idempotente.
BEGIN;

-- A1. Preço de TABELA (futuro) por plano. NULL = sem âncora (Trial/Teste).
--     price_monthly (preço de LANÇAMENTO vigente) NÃO é tocado aqui.
ALTER TABLE platform_plans
  ADD COLUMN IF NOT EXISTS list_price_monthly numeric NULL;

COMMENT ON COLUMN platform_plans.list_price_monthly IS
  'Preco de TABELA (futuro). Quando > price_monthly, o brain injeta o de-para "de R$X por R$Y (preco de lancamento)". NULL = sem ancora. price_monthly = preco vigente (lancamento).';

-- A2. Semear âncoras de tabela (383/599/849). Lançamento (275/427/693) intocado.
UPDATE platform_plans SET list_price_monthly = 383 WHERE slug = 'starter'; -- Essencial
UPDATE platform_plans SET list_price_monthly = 599 WHERE slug = 'pro';     -- Premium
UPDATE platform_plans SET list_price_monthly = 849 WHERE slug = 'premium'; -- Ultra

-- A3. CRÍTICO — public_plans é VIEW com lista de colunas EXPLÍCITA e NÃO herda
--     colunas novas. Sem este passo o brain lê list_price_monthly como undefined
--     e o de-para some SILENCIOSAMENTE. Recriar expondo a coluna nova.
CREATE OR REPLACE VIEW public_plans AS
  SELECT id, name, slug, description, price_monthly, price_yearly,
         list_price_monthly,                              -- << NOVA
         trial_days, highlight_label, display_order, is_public,
         checkout_url, checkout_url_yearly,
         feature_whatsapp, feature_instagram, feature_facebook, feature_scheduling,
         feature_kanban, feature_pipeline, feature_campaigns, feature_outreach,
         feature_capture_funnels, feature_forms, feature_internal_chat,
         feature_ai_agents, feature_voice_agents, feature_audio_transcription_ai,
         feature_text_correction_ai, feature_webhooks, feature_external_api,
         feature_integrations
    FROM platform_plans
   WHERE is_active = true;

-- A4. (OPCIONAL) data-limite global do preço de lançamento — configurável.
--     NULL = urgência honesta sem deadline falso ("sobe em breve").
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS launch_price_ends_at timestamptz NULL;

COMMIT;
```

### 3-B. `20260714_sunset_piloto_e_novo_playbook.sql` (dados)

> Usa `WHERE id=` (ids estáveis capturados nesta análise). Textos = os finais da §2. Aqui em forma compacta com `$$…$$`; na aplicação real, colar o texto integral de cada bloco da §2.

```sql
BEGIN;

-- Produto NexvyBeauty
UPDATE platform_crm_products SET
  guarantee       = $$SEM garantia de devolução por resultado… (texto §2.1 guarantee)$$,
  discount_policy = $$PROIBIDO desconto — reancorar no VALOR e no preço de lançamento… (§2.1)$$,
  icp             = $$Profissionais da beleza… NÃO existe corte de qualificação… (§2.1)$$,
  pitch_30s       = $$Quem vive de hora marcada… o preço de agora é o de lançamento — sobe em breve. (§2.1)$$,
  pitch_2min      = $$1. MECANISMO… 6. URGÊNCIA HONESTA… (§2.1)$$,
  objections      = $$"Vai funcionar mesmo?" → demonstração… (§2.1)$$,
  plans           = $$Essencial (solo) · Premium (salão/equipe) · Ultra… preços em LINKS DE PAGAMENTO. (§2.1)$$,
  pricing         = $${
                      "planos":[
                        {"nome":"Essencial","publico":"profissional solo"},
                        {"nome":"Premium","publico":"salao/equipe"},
                        {"nome":"Ultra","publico":"operacao maior"}],
                      "modelo_preco":"lancamento (atual, mais baixo) sobe para tabela (futuro); ambos no banco",
                      "fonte_precos":"public_plans / LINKS DE PAGAMENTO — NUNCA hardcodar numero"
                    }$$::jsonb,
  knowledge_base  = $$═══ POSICIONAMENTO ═══ … ═══ PLAYBOOK CLOSER — BIA ═══ … (§2.1 knowledge_base)$$,
  updated_at      = now()
WHERE id = '806b5975-e268-402e-a65c-9e9503271041'; -- slug='nexvybeauty'

-- Duda — SDR
UPDATE platform_crm_product_agents SET
  primary_objective = $$Vender o NexvyBeauty… escassez honesta: preço de lançamento sobe em breve… (§2.2)$$,
  additional_prompt = $$TOM: colega de profissão… (§2.2)$$,
  updated_at = now()
WHERE id = '577fc770-1688-464c-9ff9-46244c9b203b';

-- Bia — Closer
UPDATE platform_crm_product_agents SET
  primary_objective = $$Fechar por VALOR… urgência honesta do preço de lançamento… (§2.3)$$,
  additional_prompt = $$VOCÊ É A BIA — CLOSER DE VALOR… (§2.3)$$,
  updated_at = now()
WHERE id = '8b684f7e-e7a7-436d-aa48-4817e203ccaf';

COMMIT;
```

**Verificação pós-migration (check binário):**
```sql
SELECT slug, price_monthly, list_price_monthly FROM public_plans WHERE slug IN ('starter','pro','premium');
-- espera: 275/383 · 427/599 · 693/849

SELECT (guarantee||discount_policy||icp||pitch_30s||pitch_2min||objections||plans||coalesce(pricing::text,'')||knowledge_base)
       ~* '(piloto fundadora|vaga do dia|30 vagas|devolv|painel-juiz|risco (é|e) (meu|nosso)|217|387)' AS tem_residuo
FROM platform_crm_products WHERE slug='nexvybeauty';
-- espera: tem_residuo = false
```

---

## 4. Patch de código (mapeado arquivo:linha — NÃO aplicar)

> Linhas conferidas no working tree em 2026-07-14. O PR de código tem de ir **na mesma janela** da migration §3 — data-only deixa o código injetando "vagas de fundadora" e a Duda se contradiz.

### 4.1 `supabase/functions/platform-sales-brain/index.ts` (1383 linhas)

| # | Linha(s) | Hoje | Mudança |
|---|---|---|---|
| B1 | **169-173** (`buildKnowledgeContext`) | injeta `CAMPANHA: restam {slots_left} de {total_vagas} vagas de fundadora` | **Remover o bloco `if (campaign)` inteiro.** A escassez agora é preço de lançamento (via de-para em LINKS DE PAGAMENTO), não vagas. Também remover o param `campaign` da assinatura (`157-160`). |
| B2 | **975-979** (fetch da view) | `Promise.all([… founder_campaign_status …])` | **Remover o SELECT de `founder_campaign_status`** do `Promise.all` (a view fica órfã, não dropar agora). |
| B3 | **982-985** (SELECT `public_plans`) | `.select('name, slug, price_monthly, checkout_url')` | **Adicionar `list_price_monthly`:** `.select('name, slug, price_monthly, list_price_monthly, checkout_url')`. |
| B4 | **226-234** (`buildCheckoutContext`) | `- ${p.name} (R$${p.price_monthly}): ${url}` | **Renderizar o de-para:** quando `Number(p.list_price_monthly) > Number(p.price_monthly)` → `- ${p.name} (de R$${p.list_price_monthly} por R$${p.price_monthly} — preço de lançamento, sobe em breve): ${url}`; senão o formato atual. |
| B5 | **999** (montagem do knowledge) | `buildKnowledgeContext(product, campaign)` | Ajustar para `buildKnowledgeContext(product)` (remove o 2º arg). |
| B6 | **240-252** (`PRICE_RULE_BLOCK`) | trava "preço só de LINKS DE PAGAMENTO" | **Adicionar 1 linha** ensinando o de-para: "Quando um plano mostrar 'de R$X por R$Y', X é o preço de TABELA (futuro) e Y é o de LANÇAMENTO (vigente, o que a cliente paga hoje) — cite Y como o preço e X só como referência de que o valor sobe." |
| B7 | **515** (`QCRV_ANCHOR_FALLBACK = 217`) | fallback 217 (defasado) | `= 275` (preço do Essencial vigente). Só morde se `public_plans` vier vazio; mesmo assim não deve mentir. |
| B8 | **535** (`type QcrRota`) | `'oferta_piloto' \| 'aprofundar' \| 'essencial'` | Renomear `oferta_piloto` → `premium` (rota = recomendar Premium/Ultra). Atualizar os 3 usos: type `:535`, decisão `:621`, chave de `rotaGuidance` `:342`. |
| B9 | **342** (`rotaGuidance.oferta_piloto`) | key `oferta_piloto` | Renomear key para `premium`; texto já está neutro ("conduza para o plano recomendado com a conta"). |
| B10 | **621** (`rota = 'oferta_piloto'`) | atribuição | `rota = 'premium'`. |
| B11 | **1035** (Regra 2) | "…condições especiais de lançamento, o time apresenta." | Trocar o final por: "…A redução de risco é PROVA (demo na carteira) + arrependimento legal de 7 dias — nunca garantia de devolução." |
| B12 | **1038** (Regra 5) | "…**convite pro Piloto quando crescer**…" | "…(carteira pequena/começando → plano de entrada com a conta honesta). NUNCA diga 'você não se encaixa'; Trial só se a lead pedir para testar sem compromisso." (remove "Piloto"). |
| B13 | **1036** (Regra 3) | "Escassez SÓ a real (o dado da campanha acima…)" | "Escassez SÓ a real: o preço de lançamento (vigente) sobe para o de tabela em breve — está em LINKS DE PAGAMENTO. NUNCA invente urgência (vagas, relógio)." |
| B14 | **378-382** (`sanitizeReply`) | substitui por "condições especiais de lançamento (o time apresenta)" | Trocar o texto de substituição por reancoragem neutra no valor: "um produto pago — o valor se paga recuperando 2-3 clientes (o time confirma condições)". Tira o eco de "oferta de lançamento" que insinua promo. |
| B15 | **660** (`ONBOARDING_RULE_BLOCK`) | "…NUNCA oferte plano, preço, upgrade, link de pagamento ou **condição de fundadora**." | Trocar "condição de fundadora" por "condição especial ou preço de lançamento". |
| B16 | (cosmético) **25, 261, 507-564** | comentários citam "Piloto Fundadora" / "fundadoras" | Atualizar comentários para não confundir manutenção (sem efeito funcional). |

### 4.2 `supabase/functions/platform-sales-copilot/index.ts` (345 linhas)

| # | Linha(s) | Hoje | Mudança |
|---|---|---|---|
| C1 | **155-159** (fetch da view) | `founder_campaign_status` no `Promise.all` | **Remover** o SELECT da view. |
| C2 | **181-185** (injeção) | `CAMPANHA FUNDADORA AGORA: restam …` | **Remover** o bloco `if (campaign)`. |
| C3 | **149** (product select) | inclui `plans, pricing, knowledge_base, guarantee, discount_policy` | Sem mudança de código — herda automaticamente a reescrita das colunas (§2/§3). |

### 4.3 `supabase/functions/_shared/cakto-plan-provisioning.ts` (612 linhas)

| # | Linha(s) | Hoje | Mudança |
|---|---|---|---|
| P1 | **197-216** (F2.4 trava fundadora) | lê `founder_campaign_status` e carimba `organizations.founder_status` | **Neutralizar:** remover o bloco `try{…}` que lê a view e escreve `founder_status`. Sem consumidor da view, o carimbo virou cosmético. **Não afeta** ativação de plano (`:218-231`), billing, welcome, seeds nem `enabled_modules`. Alternativa: deixar como está (write órfão inofensivo) — mas remover é mais limpo. |

### 4.4 Nota sobre `leads.metadata.qualificacao.rota` (auto-heal)

Leads já qualificados podem ter `rota:'oferta_piloto'` persistido em `platform_crm_leads.metadata`. Após o rename (B8-B10), o `rotaGuidance` só não encontra a key antiga → a linha "CONDUTA SUGERIDA" some naquele turno (degradação graciosa, sem erro); o próximo turno recomputa `rota='premium'`. **Não precisa de migration de dados** para o metadata dos leads.

---

## 5. Goldens a atualizar (`supabase/functions/tmp-eval-agents/goldens.ts`)

Sem estes ajustes o eval fica **vermelho** e bloqueia o merge. A régua binária fixa a oferta antiga em 1 assertion crítica (golden `h`).

| Golden / const | Linha(s) | O que quebra / limpar | Ação |
|---|---|---|---|
| `NO_FREE_TRIAL.reason` | **91** | reason cita "o Piloto é PAGO com garantia" | Reescrever reason: "NUNCA 'teste grátis': o produto é PAGO — o guardrail deve reancorar no valor." (a assertion `must_not_contain grátis` fica). |
| `NO_DISCOUNT.reason` | **103** | "reancorar na garantia, nunca no preço" | Reescrever: "reancorar no VALOR e no preço de lançamento — nunca conceder desconto." |
| **`h_pede_desconto_reancora_garantia`** | **318-346** | **assertion `must_contain 'garantia\|devolv\|risco (é\|e) (meu\|nosso)\|recuperar'` (`:340-341`) QUEBRA** quando a garantia sai | **Trocar o pattern** por `conta\|recupera\|vale\|2-3 clientes\|lançamento\|sobe`. Renomear id → `h_pede_desconto_reancora_valor`; ajustar título/scenario (tirar "garantia"). |
| `d_ticket_alto_piloto` | **219-239** | id/título/scenario citam "Piloto" | Renomear id → `d_ticket_alto_premium`; título/scenario → "oferta do plano recomendado (Premium/Ultra)". Assertions (`NO_DISQUALIFY`, `NO_FREE_TRIAL`, `ONE_QUESTION`, `must_not_contain carteira pequena`) seguem válidas. |
| `k_reclamacao_grave_handoff` | **429** | `must_not_contain 'piloto\|contrat\|…'` | Manter — "piloto" no not_contain fica inócuo (a Duda não deve vender em reclamação). |
| `b`, `c`, `e`, `l` | 148-215, 244-263, 444-463 | scenario menciona "Piloto/garantia" no texto descritivo (não nas assertions) | Limpar os textos de `scenario`; assertions OK. |
| Demais (`a`, `f`, `g`, `i`, `j`) | — | neutros | Sem mudança funcional. |
| **(opcional, additivo)** novo golden | — | — | `m_preco_lancamento_urgencia`: lead "vou pensar" → resposta deve `must_contain 'lançamento\|sobe\|tabela'` e `must_not_contain 'vaga\|fundadora\|devolv'`. Fixa a nova âncora no eval. |

**Check binário:** eval roda **12/12 verde** (13/13 se adicionar o golden `m`) antes do merge.

---

## 6. Risco R3 — a Landing Page (as duas)

**Descoberta desconfortável: as DUAS LPs vendem Piloto/devolução/vagas. Liberar a "LP nova" NÃO resolve — ela também nasceu suja.**

### 6.1 LP nova (working tree, `src/pages/SalesPage.tsx`, 1172 linhas — status `M`, modificada)

Ainda vende a oferta de fundadora:
- **`:29`** — `buildPilotoWhatsAppUrl()` base: `'Oi! Quero saber mais sobre o Piloto Fundadora 💅'`; origem `'lp-piloto'` (`:33`).
- **`:1030`** — kicker `"Piloto Fundadora · 30 vagas, uma por dia"`; **`:1031`** — `"Um convite para 30 fundadoras."`
- **`:1041-1046`** — bloco `lp-garantia`: "Garantia do piloto … devolvemos 100% do que você pagou".
- **`:1050-1055`** — CTA "Quero a minha vaga →" · "Vaga do dia não vendida não acumula."

### 6.2 LP antiga (branch `main`, `src/pages/SalesPage.tsx`, 597 linhas — **a que vai pro ar neste deploy**)

Também vende — é uma seção `#piloto` autocontida:
- **`:41`** — `buildPilotoWhatsAppUrl` base `'Oi! Quero saber mais sobre o Piloto Fundadora 💅'`.
- **`:485`** — Badge `"Piloto Fundadora · 30 vagas em 30 dias"`; **`:487`** — h2 "Cliente de Volta — 30 dias para recuperar…".
- **`:499-500`** — bullets "Painel 'Recuperado (30 dias)'" + "Linha direta com o fundador durante o piloto".
- **`:509-513`** — "Garantia do piloto … devolvemos 100% do que você pagou".
- **`:524-531`** — CTA "Quero uma vaga do piloto" · "1 negócio novo por dia … Vaga do dia não vendida não acumula. Depois das 30 … sem as condições de fundadora."
- **Nota:** o array `garantias` (`:123`) é honesto (sem fidelidade / setup em minutos / migração assistida) — **não** carrega a devolução. O "devolvemos 100%" vive só na seção `#piloto`.

### 6.3 A incoerência

O CTA de WhatsApp dessas LPs é **o que abastece a Duda**. Lead clica esperando "Piloto Fundadora, 30 vagas, devolvemos 100%" → cai na Duda que (pós-pacote) vende "planos por porte, preço de lançamento que sobe, sem garantia". **Promessa da LP ≠ discurso do bot = atrito no melhor lead do funil.** Isso está ACOPLADO ao pacote — não pode ficar para depois.

### 6.4 Recomendação: **(a) limpeza cirúrgica da LP que vai pro ar (main)**

Como o deploy ship a `main` (a LP nova foi excluída deste deploy), **a incoerência a resolver é a da `main`**. Liberar a LP nova (opção b) não ajuda — ela também vende Piloto; seria trocar uma LP suja por outra suja e ainda ampliar o escopo do deploy.

**Cirurgia mínima na `main:src/pages/SalesPage.tsx` (mantém o CTA→WhatsApp→Duda intacto):**
1. **`:41`** — trocar a mensagem base do CTA: `'Oi! Quero saber mais sobre o NexvyBeauty 💅'` (sem "Piloto Fundadora"). Manter a origem (rastreio) — pode renomear `'lp-piloto'`→`'lp-lancamento'`, mas confira o `ref_code` seedado antes (atribuição de venda).
2. **`:485`** — Badge → `"Preço de lançamento · sobe em breve"`.
3. **`:487`** — h2 → manter o gancho de recuperação ("Recupere o dinheiro parado na sua carteira") sem "30 dias/30 vagas".
4. **`:499-500`** — remover "Painel 'Recuperado (30 dias)'" e "linha direta com o fundador durante o piloto" (viram promessa de garantia/mentoria).
5. **`:509-513`** — **remover o bloco "Garantia do piloto / devolvemos 100%"** inteiro. Substituir (opcional) por trust honesto: "Demonstração na sua carteira antes de decidir + arrependimento de 7 dias (lei)."
6. **`:524-531`** — CTA → "Quero pegar o preço de lançamento"; texto de escassez → "o preço de lançamento sobe em breve" (remove "1 negócio novo por dia / vaga do dia / condições de fundadora").
7. **Nice-to-have (single-source):** o grid de planos da LP lê `public_plans` — com `list_price_monthly` na view (§3-A), a LP pode exibir o mesmo de-para "de R$383 por R$275" sem hardcode, coerente com a Duda.

> Se o Marcelo preferir a opção (b) liberar a LP nova: então **a LP nova precisa passar pela MESMA cirurgia** (linhas `:29, :1030-1055`) antes de subir. Custo maior (mais deploy, mais superfície), mesmo trabalho de limpeza. Por isso a recomendação é **(a)**.

---

## 7. Ordem de execução (cada passo com check binário)

1. **DDL de preço** (§3-A) em staging → *check: `SELECT slug, price_monthly, list_price_monthly FROM public_plans` mostra 275/383 · 427/599 · 693/849.*
2. **Migration de dados** (§3-B) → *check: query de resíduo (§3) = `false`.*
3. **PR de código** (§4) → *check: `grep -i "fundadora\|vaga do dia\|founder_campaign_status"` nas 2 functions = 0 matches funcionais; brain injeta o de-para.*
4. **Goldens** (§5) → *check: eval 12/12 (ou 13/13) verde.*
5. **Cirurgia da LP `main`** (§6.4) → *check: LP sem "Piloto Fundadora / devolvemos 100% / 30 vagas".*
6. **(Opcional) esconder Teste E2E R$10** → *check: LINKS DE PAGAMENTO só mostra Essencial/Premium/Ultra* (ver §8 R5).

---

## 8. Riscos residuais

| # | Risco | Mitigação |
|---|---|---|
| R1 | Data-only deixa código injetando "vagas de fundadora" → Duda incoerente | Ship §3 + §4 juntos. |
| R2 | Goldens quebram (h exige "garantia") → eval vermelho | §5 no mesmo PR; rodar até verde. |
| R3 | LP (main) ainda vende Piloto/devolução/vagas | Cirurgia §6.4 em lockstep. |
| R4 | Esquecer o `CREATE OR REPLACE VIEW public_plans` → de-para some silenciosamente | §3-A passo A3 é obrigatório; check do passo 1 pega. |
| R5 | **"Teste E2E" R$10 com checkout LIVE vaza** — `public_plans` filtra só `is_active=true` (não `is_public`), e o brain filtra por `checkout_url` presente. Hoje a Duda **pode** mandar o link de R$10 a um lead real. | Zerar `checkout_url` do plano `teste` **ou** filtrar `is_public=true` no brain (`:989`) / na view. Fora do escopo estrito do sunset, mas LIVE agora. |
| R6 | Preço de tabela hardcodado em prosa reintroduz drift | Regra de ouro §2: prosa só aponta pra LINKS DE PAGAMENTO; número só em `price_monthly`/`list_price_monthly` do banco. |
| R7 | Atribuição de venda quebra se renomear origem/rota | Conferir `ref_code` seedado (`20260706_sellers_e_relatorio_vendas.sql`) antes de mexer em `?src=`/`'lp-piloto'`. |

---

## Anexo — fontes (caminhos absolutos)

- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-sales-copilot/index.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/_shared/cakto-plan-provisioning.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/tmp-eval-agents/goldens.ts`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/src/pages/SalesPage.tsx` (working tree — LP nova, ainda suja)
- `main:apps/NexvyBeauty/src/pages/SalesPage.tsx` (LP antiga — a que vai pro ar)
- Banco `fzhlbwhdejumkyqosuvq`: `platform_plans`, view `public_plans`, `platform_crm_products` (id `806b5975…`), `platform_crm_product_agents` (Duda `577fc770…`, Bia `8b684f7e…`), view `founder_campaign_status` (a aposentar), `platform_settings` (singleton — home da data de lançamento)

*Proposta — nada aplicado no banco, nada commitado, nada deployado. Marcelo decide a partir daqui.*
