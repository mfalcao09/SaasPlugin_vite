# Plano Criativo — Anúncios Meta · NexvyBeauty

> **Data:** 2026-07-19 · **Tipo:** PLANO (nenhuma peça gerada antes da aprovação)
> **Conta Meta:** `2065596784169872` (NEXVY BEAUTY) · business NEXVY `1331611869008138` · BRL · ACTIVE
> **Par:** `PLANO-CRIATIVOS-META-2026-07-19.html`
> **Escopo:** sessão de criativo. Nenhum arquivo de aplicação tocado.

---

## 0. Decisões já tomadas pelo Marcelo

| # | Decisão | Consequência |
|---|---|---|
| 1 | **3 criativos idênticos nos dois lados** do teste | 9 peças (3 conceitos × 3 formatos) |
| 2 | **Verba R$ 150–400/dia** | ~R$ 33/criativo/dia; leitura de topo de funil em 7 dias |
| 3 | **Identidade = paleta da LP** + assinatura Nexvy discreta | Motivo declarado: *"ainda estou definindo a logo do nexvy beauty"* → usar **wordmark tipográfico**, não marca gráfica |
| 4 | **Sem gastar crédito de IA** | Os 3 conceitos em HTML→PNG. C3 refeito (era fotográfico) |

---

## 1. Inventário de ferramentas — verificado por chamada real

| Ferramenta | Status | Evidência |
|---|---|---|
| Suíte criativa / Magnific | ✅ conectada | `account_balance` → plano `magnific` Premium+, **45.000 créditos** |
| Modelos de imagem | ✅ 4 | `gpt-2` (tipografia/layout) · **Nano Banana Pro** (fidelidade de marca) · **Recraft V4.1** (fotorrealismo, 14s) · Nano Banana 2 Flash |
| Canva | ✅ conectado | `list-brand-kits` → 1 brand kit |
| Figma | ✅ carregado | schemas disponíveis; não exercitado |
| **Meta Ads MCP** | ✅ habilitado | `ads_get_ad_accounts` → NEXVY BEAUTY `ACTIVE`, `is_ads_mcp_enabled: true`, `is_queryable: true`, com forma de pagamento |
| Públicos-alvo | ✅ ativos | `Semelhante (BR, 1%) - …sem value` → **1,2–1,4 mi** · `…comvalue` → **1,3–1,5 mi**; ambos `ACTIVE` |
| Pipeline HTML→PNG | ✅ validado | Chrome headless 2× + Lanczos → `1080x1080`, `1080x1350`, `1080x1920` conferidos no ImageMagick |
| Fontes da LP | ✅ nativas macOS | Didot, Bodoni MT, Snell Roundhand, SF Pro — renderizam sem download |

> ⚠️ **Créditos:** a API avisa que o modo ilimitado **não está ativo nesta sessão** — geração de IA consumiria créditos. Por decisão do Marcelo, **nenhuma geração de IA neste ciclo**.

---

## 2. Público — perfil medido, não suposto

- Dona de salão / nail / lash / cabeleireira / esteticista / podóloga / barbeira — **profissional que atende com a própria mão**
- **Mediana de 1.961 seguidores** (faixa 100–20k). Perfis >20k excluídos de propósito (educadora/rede/fornecedor)
- SP 1.610 · MG 560 · RJ 549 · RS 338 · SC 335 · BA 330 · PR 289 · PE 276
- ~50% com endereço físico na bio · ~40% com site · 2–3 serviços anunciados
- **Não são infoprodutoras nem fornecedoras** — filtradas fora

**Implicação criativa:** falar com a dona do salão de bairro. Linguagem de agenda vazia, cliente que some, WhatsApp bagunçado. Nunca linguagem de "escala", "funil", "SaaS".

---

## 3. Ângulo estratégico — de onde vem a força

Do doc da oferta (`OFERTA-IRRESISTIVEL-NEXVYBEAUTY-2026-07-16.md`, §2/BLOCO B):

- A **Probabilidade Percebida está em 9/10** — patamar que quase ninguém alcança — porque o **Raio-X mostra o dinheiro real dela antes de pagar**
- O doc critica a oferta atual por **"liderar com a âncora fraca e esconder a de 10x"**
- Âncora forte: a perda dela, **~R$ 2.760/mês ≈ R$ 33.120/ano**

**Tradução:** o anúncio não vende software. Mostra o dinheiro dela e promete o número antes do pagamento. É o único ângulo incopiável.

### Correção de rumo aplicada (§8.1 do doc da oferta)

**"Cliente de Volta" foi rebaixado** de nome-mãe para **mecanismo**. Nome-mãe = **"Agenda Cheia"**. Razão: Raio-X volta vazio em histórico raso → liderar com recuperação auto-seleciona contra a iniciante.

Como o lookalike é **frio e de maturidade mista**, os criativos lideram **Agenda Cheia** — alinhado ao H1 real da LP: *"Agenda cheia, sem gastar com anúncio — com quem já é sua cliente."*

---

## 4. Restrições duras (violá-las quebra a marca ou a regra do Marcelo)

| Restrição | Origem |
|---|---|
| ❌ **Nenhum preço na peça** — preço vem de `public_plans` em runtime; imagem estática não tem runtime | doc da oferta :6, :186 |
| ❌ **Nada de "X vagas"** — escassez só temporal-honesta ("preço de lançamento sobe pra tabela") | doc :161 — descrito como linha dura |
| ❌ Proibidas: *"resultado garantido"*, *"devolvo se não recuperar"*, *"risco é nosso"*, *"painel-juiz"* | doc :146 |
| ❌ Cortadas: *"até 70%"*, *"180 dias"* | doc :97 |
| ❌ Sem rosto de pessoa real sem base | instrução do Marcelo |
| ⚠️ **Sem marca gráfica** — logo NexvyBeauty ainda em definição → wordmark tipográfico | decisão do Marcelo nesta sessão |

> **Pendência que é decisão do Marcelo (não bloqueia o criativo):** a LP mantém *"Programa Cofounder — 50 vagas"* (`ClientesDeVoltaLandingPage.tsx:1646`, com `TODO(P7)` no próprio arquivo), em conflito com a regra acima. Não será usado em criativo.

---

## 5. Sistema visual — extraído literalmente da LP

Fonte: `apps/NexvyBeauty/src/pages/clientes-de-volta-lp.css`

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#faf7f2` | fundo creme |
| `--ink` | `#2a2124` | texto |
| `--muted` | `#7d6d71` | texto secundário |
| **`--rose`** | **`#c54b60`** | **cor de destaque / CTA** |
| `--rose-2` | `#d9718a` | rosé claro |
| `--wine` | `#7c0f24` | extremo escuro do gradiente |
| `--terra` | `#f2dfd5` | faixa suave |
| `--card` / `--paper` | `#ffffff` / `#fffdf8` | cartões |
| `--line` | `#e5d9d0` | divisores |
| `--band-bg` | `#4a0d1c` | faixa escura (base do C3) |

- **CTA:** `linear-gradient(135deg, #7c0f24, #c54b60)`, raio 12px, sombra `0 14px 30px -12px #c54b60`
- **Serifada** (H1/H2/números): `"Didot","Bodoni MT","Playfair Display","Georgia",serif` — **weight 400**
- **Script** (nichos): `"Snell Roundhand","Savoye LET","Brush Script MT",cursive`
- **Corpo:** `-apple-system,"SF Pro Text",…` — 16px / line-height 1.65
- Grão de ruído SVG `opacity .028` sobre a página inteira — replicar para continuidade

---

## 6. Os 3 conceitos

Cada conceito usa uma **família visual distinta** de propósito: o Meta penaliza conjuntos homogêneos no agrupamento por Entity-ID, e diversidade criativa é sinal de ranqueamento.

### C1 — `NB-C1-RaioX` · "A gente não te promete. A gente te mostra."

| | |
|---|---|
| **Ângulo** | Aversão à perda + prova antes do pagamento |
| **Objeção que mata** | *"não sei quantas sumiram nem quanto vale"* |
| **Família visual** | Claro + dado. Fundo creme `#faf7f2`, cartão branco, serifada grande |
| **Headline** | **"A gente não te promete. A gente te mostra."** (doc :135) |
| **Apoio** | "8 clientes suas sumiram há mais de 45 dias." · lista com iniciais + valores · "Impacto estimado · +R$ 2.800" |
| **CTA** | **"Quero ver o meu número"** (CTA real da LP, :657) |
| **Por que HTML** | O número **é** o anúncio; modelo de imagem erra dígito |

### C2 — `NB-C2-Conversa` · "Nada sai sem você aprovar."

| | |
|---|---|
| **Ângulo** | Prova de mecânica |
| **Objeção que mata** | *"minhas clientes vão achar robô"* (objeção #2 do doc) |
| **Família visual** | Interface de conversa. Bolhas de WhatsApp sobre creme |
| **Headline** | **"Nada sai sem você aprovar — no seu tom, com o nome dela."** (doc :246) |
| **Apoio** | Diálogo real da LP: mensagem → *"Aiii verdade!! Tem horário quinta de manhã? 😅"* → *"Agendado ✨"* → `+R$ 180 recuperados` |
| **CTA** | **"Quero meu Raio-X grátis"** (CTA real da LP, :408) |
| **Por que HTML** | Texto de conversa precisa ser legível em 100% |

### C3 — `NB-C3-Editorial` · "Agenda cheia começa pelas clientes que você já tem."

| | |
|---|---|
| **Ângulo** | Identidade + custo de inação, pela linguagem do nicho |
| **Objeção que mata** | *"tá caro"* — responde com o custo de **não** fazer |
| **Família visual** | **Escuro + tipografia pura.** Fundo vinho `#4a0d1c`, zero interface |
| **Headline** | Script Snell: *"Manutenções perdidas."* → serifada Didot: **"Agenda cheia começa pelas clientes que você já tem."** (doc :379) |
| **Apoio** | Linha fina: "Sem gastar com anúncio. Em 5 minutos por dia." |
| **CTA** | **"Quero ver o meu número"** |
| **Variação de nicho** | A linha script é trocável por qualquer um dos 10 nichos da LP (*"Retoques esquecidos."*, *"Design de 30 dias que vira 60."*, *"Escovas que não voltaram."*) — banco pronto para a Fase 2 sem novo design |

---

## 7. Formatos

**9 peças** = 3 conceitos × 3 formatos.

| Formato | Uso | Observação de composição |
|---|---|---|
| `1080×1080` | Feed quadrado | Mensagem centrada |
| `1080×1350` | Feed vertical | Maior alcance no Instagram; headline ocupa o terço superior |
| `1080×1920` | Stories / Reels | **Topo 250px e base ~420px são zona morta** (perfil e área de CTA/sticker). Núcleo da mensagem na faixa central |

Não é reenquadramento automático: cada formato tem hierarquia própria.

---

## 8. Estrutura do teste

**Mecanismo:** Teste A/B nativo do Meta (`ads_experiment_abtest_create_test`) — divide por sorteio **sem sobreposição entre células**, resolvendo a contaminação de leilão que dois conjuntos concorrentes sofreriam.

- **Célula A** → `Semelhante (BR, 1%) - nexvybeauty-lookalike_v2-sem value` (1,2–1,4 mi)
- **Célula B** → `Semelhante (BR, 1%) - nexvybeauty-lookalike_v2-comvalue` (1,3–1,5 mi)
- **Mesmos 3 anúncios, mesmos nomes** nos dois lados: `NB-C1-RaioX` · `NB-C2-Conversa` · `NB-C3-Editorial`
- **Criativo Dinâmico DESLIGADO** — senão o Meta recombina de forma diferente em cada célula e os lados deixam de ser comparáveis
- Leitura de **público** = soma das 3 peças por célula · leitura de **criativo** = mesmo nome cruzado entre células

### Critério binário de sucesso (§8.3)

| Resultado em 7 dias | Conclusão | Ação |
|---|---|---|
| Uma célula com CTR de saída **≥30% superior** | Público é alavanca | Fixa o vencedor; Fase 2 testa criativo nele |
| Diferença **<30%** | Público **não** é alavanca | Fase 2 = teste de criativo no público maior |

**Calibragem honesta:** a R$ 200/dia ÷ 2 células ÷ 3 peças ≈ R$ 33/peça/dia. Em 7 dias isso lê **CTR e retenção de atenção** com confiança — **não** lê conversão com significância. Decidir por topo de funil nesta fase.

---

## 9. Critérios de aceite das peças

Cada peça só é considerada pronta se:

1. `magick identify` confirma a dimensão exata (`1080x1080` / `1080x1350` / `1080x1920`)
2. Nenhum preço de plano aparece na imagem
3. Nenhuma palavra da lista de proibições (§4)
4. Paleta bate com os tokens da LP (§5)
5. No `1080×1920`, nada essencial nos 250px do topo nem nos 420px da base
6. Texto legível a 100% de zoom em tela de celular

---

## 10. Próximos passos

1. ☐ **Aprovação deste plano pelo Marcelo**
2. ☐ Construir os 3 conceitos em HTML (1 arquivo por conceito/formato)
3. ☐ Renderizar as 9 peças e validar contra §9
4. ☐ Entregar contact sheet para revisão visual
5. ☐ Só com o "sobe": criar o Teste A/B e os anúncios via Meta Ads MCP

---

## Review — execução concluída em 2026-07-19

**Entregue:** 9 peças + contact sheet, em `~/Downloads/nexvybeauty-criativos-2026-07-19/`
- `src/` — 3 HTML (fonte da verdade; formato via `?f=`)
- `png/` — 9 PNG nas dimensões exatas
- `render.sh` — harness de regeneração
- `contact-sheet.png` — folha de contato 3×3

### Critérios de aceite (§9) — verificados por execução

| # | Critério | Resultado |
|---|---|---|
| 1 | Dimensão exata | ✅ 9/9 conferidas no `magick identify` |
| 2 | Sem preço de plano | ✅ grep de 13 valores (lançamento, tabela, anuais, Cofounder) → zero |
| 3 | Sem palavras proibidas | ✅ grep de 7 termos (§4) → zero |
| 4 | Paleta da LP | ⚠️ 16/19 cores são token literal; 3 derivadas (`#6b4a50`, `#e2ccd2`, `#c9a3ad`) |
| 5 | Zona morta no 1080×1920 | ✅ `padding 300px topo / 460px base` nos 3 conceitos |
| 6 | Legibilidade | ✅ revisão visual peça a peça |

**Valores exibidos:** apenas `R$ 90`, `R$ 150`, `R$ 180`, `R$ 2.800` — todos mockup já público da LP.

### Defeitos encontrados e corrigidos no processo

| Defeito | Onde | Correção |
|---|---|---|
| `"promete."` órfão na 3ª linha | C1 · 1350 e 1920 | Headline travada em 74px (maior corpo que cabe em 1 linha nos 904px úteis) |
| `"tem."` órfão na 3ª linha | C3 · 1350 e 1920 | Headline de 76px → 70px |
| Rodapé `+R$ 180` cortado | C2 · 1080 | Aperto de corpo/padding só no quadrado |
| Wordmark encostando na sombra do botão | C1 e C2 · 1080 | `padding-bottom: 150px` reservando a faixa do wordmark |
| Texto de apoio ilegível | C3 | `--muted` clareado de `#c9a3ad` → `#e2ccd2` |

Nenhum foi detectado por `identify` — todos só apareceram na revisão visual. O `identify` prova dimensão, não prova design.

### Decisão de arquitetura

3 arquivos HTML em vez de 9: o formato vem da query (`?f=1350`) e a hierarquia troca via `[data-f]` no CSS. Regra aplicada em todos: **altura extra vira respiro (margem), nunca corpo maior de headline** — foi o aumento por formato que gerou as duas órfãs.

**Consequência prática:** trocar uma headline é 1 edição, não 9. E quando a logo do NexvyBeauty existir, as 9 peças são regeradas com um laço.

### Fechamento — 2026-07-19, fim do ciclo

| Item | Estado |
|---|---|
| ✅ **Logo NexvyBeauty** | Resolvido. Marca refinada (2 passadas sobre a v3-01) e aplicada nas 9 peças. Versão **chapada**, não 3D: a ~52px num canvas de 1080 o logo sai a ~18px no celular, faixa em que a 3D perde a gota. Assinatura = monograma **+ nome escrito** (monograma sozinho não identifica um público frio) |
| ✅ **Trava de copy** | C3 passou a exibir **"Manutenções que sumiram."**, redação idêntica à da LP corrigida |
| ✅ **CTA divergente** | Decisão do Marcelo: **espelho + canônico no texto**. As peças mantêm os CTAs reais da LP; a frase canônica da Oferta entra como texto primário do anúncio, na alçada da sessão de ads |
| ☐ `"50 vagas"` do Cofounder | Segue vivo na LP — decisão do Marcelo, fora da alçada de criativo |
| ☐ Subir no Meta | Alçada da sessão de gestão de ads. Campanha e células A/B prontas e pausadas |

### Dois defeitos que só a verificação pegou

**1. Refino por IA devolvendo a entrada.** Na 1ª rodada de logo, 2 das 4 saídas eram cópia da referência, não refino — RMSE de 0,020 e 0,037 contra 0,167 e 0,166 das reais. Em miniatura eu havia pré-selecionado justamente uma das cópias. **`magick compare -metric RMSE entrada.png saida.png` antes de julgar de olho** virou etapa obrigatória.

**2. Fallback estático furando a trava de copy.** O C3 monta a linha de nicho por JS a partir de um array, mas o `<div>` tinha um texto de fallback ainda com a palavra vetada. Se o script não rodasse antes do screenshot, era o fallback que iria para o PNG. **Em template com fallback, a trava vale para o fallback também.**

Correlato: o primeiro grep de conformidade acusou falha que era **do teste**, não do arquivo — a palavra sobrevivia dentro de um comentário meu, e o filtro de exclusão não pegava linha de continuação. Em vez de refinar o filtro, tirei a palavra do comentário. **Check que só passa por filtro artesanal é frágil.**

### Armadilha de upload

A pasta `png/` também contém `LOGO-MAGNIFIC-vetor.png`, `LOGO-MAGNIFIC-vetor-v2.png` e `LOGO-NVB-exploracao.png`, deixados pela rodada de logo. **Só os `NB-*.png` são criativos** — arrastar a pasta inteira sobe 3 folhas de estudo como anúncio.

---

# Review — Ciclo 2 · lote benchmark · 2026-08-01

> **Entrega:** 3 peças (`NB-D1/D2/D3`) em **story `1080×1920`** — ver **§18, correção de formato** — em `~/Downloads/nexvybeauty-criativos-benchmark-2026-08-01/` + seção comparativa na LP + copy dos 3 anúncios.
> **Não substitui** o lote de 19/07 (`NB-C1/C2/C3`), que segue válido — é uma família paralela, de ângulo de mercado.

## 12 · A auditoria que derrubou 2 dos 3 conceitos

O ciclo começou com 3 conceitos prontos, vindos de um benchmark de 23 empresas. Antes de desenhar, reconferi cada número na fonte. **Dois não resistiram.**

| Dado recebido | Verificado em 01/08/2026 | Veredito |
|---|---|---|
| Trinks R$ 76 (1-2 prof.) | R$ 76 | ✅ confere |
| Trinks esconde preço de 3+ prof. | 3-4, 5-10, 11-20, 21+ → **todas "sob consulta"** | ✅ confere |
| AppBarber R$ 79,90 → R$ 219,90 | idêntico | ✅ confere |
| Zenvia Specialist R$ 600 / 500 interações | R$ 600, **10 usuários**, 500 Interactionz | ✅ confere |
| **Botconversa PRO+IA+API R$ 299** | **R$ 199/mês** (R$ 189 no anual) | ❌ **erra R$ 100** |
| **ChatGuru R$ 692 (1 usuário) + R$ 500 de setup** | **"a partir de R$ 347"**, **setup GRÁTIS**, sob orçamento | ❌ **erra nos dois** |
| Huggy R$ 239 / 729 / 989-1.239 | `/precos/` → HTTP 404 | ⚠️ **não verificado** |

**Consequência do erro do Botconversa:** a conta que dava o argumento central — *"R$ 76 + R$ 299 = R$ 375 contra R$ 275, 27% mais barato"* — na verdade é **R$ 76 + R$ 199 = R$ 275**. Empate exato com o Essencial. O conceito nº 1 não era vencedor: era neutro.

**Consequência do erro do ChatGuru:** o conceito nº 2 pedia publicar *"ChatGuru cobra R$ 500 de setup"* com o nome da empresa na LP. O ChatGuru **anuncia setup gratuito como benefício**. Seria afirmação comprovadamente falsa sobre concorrente nomeado.

> **Lição durável — benchmark herdado é insumo, não fato.** O relatório de origem trazia URL para as 8 plataformas de *gestão de salão*, mas **nenhuma URL para as 5 de IA/WhatsApp** — e foi exatamente nesse subconjunto sem fonte que os dois erros estavam. **Assimetria de rastreabilidade dentro de um mesmo relatório é o sinal de onde auditar primeiro.** O próprio relatório continha a contradição: numa passagem dizia que "ChatGuru só publica a estrutura, sem preço" e noutra afirmava R$ 692.

## 13 · Os 3 conceitos que foram ao ar (decisão do Marcelo, 01/08)

| ID | Conceito | Apoio factual | Família visual |
|---|---|---|---|
| `NB-D1-PrecoOculto` | **"O preço que não te mostram"** | Tabela pública com 1 faixa precificada e 4 "sob consulta" | Claro + tabela |
| `NB-D2-IASemPreco` | **"IA de salão não tem preço público"** | Nenhum concorrente publica preço de IA | Escuro vinho + selos |
| `NB-D3-SoBeleza` | **"Só falamos beleza"** | Nenhum número — argumento de vocabulário | Claro + duas colunas tipográficas |

**Duas decisões do Marcelo moldaram a copy:**

1. **Nome de concorrente: só na LP, nunca no criativo.** O PNG estático não carrega rodapé com data e link de fonte — e é a data que torna a comparação defensável. As peças usam categoria ("plataforma de gestão para salões"); a LP nomeia, com data e link.
2. **Preço nosso fora do PNG.** Só o preço deles entra. Efeito colateral valioso: **as 9 peças não expiram** quando o preço de lançamento subir para a tabela — problema que o §4 deste plano já antecipava.

## 14 · Copy dos anúncios

Sem nome de concorrente (decisão 1 acima). Nenhum termo da lista de proibições do §4.

### D1 · O preço que não te mostram
- **Título:** Até 2 profissionais, o preço está na tela
- **CTA (botão Meta):** Saiba mais · **CTA na peça:** "Quero ver o meu número"
- **Texto primário:**
> Já tentou descobrir quanto custa um sistema de gestão pro seu salão, quando você tem equipe?
>
> Até 2 profissionais, o preço está lá, na página. A partir de 3 — que é onde está a maioria dos salões com equipe — vira "sob consulta". Nas quatro faixas seguintes, todas.
>
> Aqui os três planos estão publicados. Sempre estiveram. Com os agentes de IA já inclusos, do primeiro ao último.
>
> A gente não te promete, te mostra: antes de pagar um centavo, você recebe o Raio-X da sua carteira — quantas clientes sumiram e quanto dá pra recuperar em 30 dias, com a sua base.

### D2 · IA de salão não tem preço público
- **Título:** Todo mundo anuncia IA. Ninguém anuncia o preço.
- **CTA (botão Meta):** Enviar mensagem · **CTA na peça:** "Quero meu Raio-X grátis"
- **Texto primário:**
> Faça o teste: procure quanto custa a IA de atendimento nas plataformas de gestão para salão.
>
> Numa é "add-on", sem valor na página. Noutra, só entra no plano mais caro. Numa terceira, "fale com um consultor". No levantamento de jul/ago de 2026, não existe âncora pública de quanto custa IA de recepção para salão no Brasil.
>
> Aqui a IA vem de série. Do plano de entrada ao último, no preço que está na página — sem add-on e sem taxa de instalação.
>
> E antes de assinar você recebe o Raio-X da sua carteira: quantas clientes sumiram e quanto dá pra recuperar em 30 dias.

### D3 · Só falamos beleza
- **Título:** A IA genérica atende pet shop, imobiliária e clínica
- **CTA (botão Meta):** Saiba mais · **CTA na peça:** "Quero ver o meu número"
- **Texto primário:**
> Com o mesmo robô.
>
> Ela entende "agendamento", "lead", "protocolo", "ticket". Não entende retoque de 21 dias, manutenção do volume, cabine, comissão da profissional — nem que "a escova não durou" é uma reclamação que precisa de resposta hoje.
>
> Aqui a gente só fala beleza. E faz o que nenhuma delas faz: acha as clientes que sumiram na sua carteira do WhatsApp e escreve a mensagem de volta, no seu tom. Você só aprova.
>
> Antes de pagar, você vê o número: quantas sumiram e quanto dá pra recuperar em 30 dias.

## 15 · Seção comparativa na LP

`ClientesDeVoltaLandingPage.tsx` — componente `Comparativo()`, inserido **entre `<Planos />` e `<ChamadaPosPlanos />`**: a objeção "tá caro" nasce ao ver o preço, e é ali que a conta responde.

- **Nomeia com data e link** os 5 concorrentes que eu verifiquei pessoalmente. Huggy, Avec, Belasis, Gendo, Booksy e Simples Agenda **ficaram fora** — não os reconferi nesta rodada, e a regra é não publicar nome sem fonte própria.
- **Apresenta o empate como empate.** O bloco de destaque diz `R$ 76 + R$ 199 = R$ 275/mês` e argumenta pela **unificação** (uma assinatura, não duas) e pela **transparência** — não por um desconto inexistente.
- **Zero preço nosso hardcoded.** Segue a regra já documentada em `PlanoPreco` (*"Preço e checkout SÓ do banco"*): a linha do NexvyBeauty na tabela diz "os três planos, na página" e aponta para os cards acima.
- CSS anexado ao fim de `clientes-de-volta-lp.css` sob o prefixo `.bench*`, 100% por token — acompanha o dark mode sem regra própria.

## 16 · Verificação executada

| Critério | Resultado |
|---|---|
| Dimensão exata das 9 peças | ✅ `magick identify` 9/9 |
| Sem preço **nosso** no PNG | ✅ grep de 6 valores (lançamento + tabela) → zero |
| Sem termo da lista do §4 | ✅ grep de 7 termos → zero |
| Sem nome de concorrente no criativo | ✅ grep de 13 marcas → zero |
| Número de terceiro sempre acompanhado de data | ✅ 3/3 peças |
| Zona morta no 1080×1920 | ✅ padding 300 topo / 460 base |
| Revisão visual peça a peça | ✅ 9/9 |
| `typecheck` da LP | ✅ **32 erros = baseline**, zero nos arquivos tocados |
| LP renderizada (desktop) | ✅ 6 linhas, 5 links de fonte, sem overflow |
| LP dark mode | ✅ tokens flipam; contraste do texto secundário **5,7:1** (AA) |
| LP mobile 375px | ✅ tabela vira lista, coluna de ressalva sobrevive, zero overflow |

### Três defeitos que só a revisão visual pegou

**1 · `flex-shrink` amputando o argumento (D1 · 1080).** O `.card` era item de um flex column de altura fixa; com o conteúdo excedendo, o navegador **encolheu o item** e o `overflow:hidden` dele comeu a última faixa e a tarja de fecho inteira. O `identify` dava 1080×1080 e passava. Corrigido com `flex-shrink:0` — assim o excesso **vaza visivelmente** em vez de amputar em silêncio — mais redução de corpo/padding só no 1080.

**2 · Linha de fonte atropelando a marca (D2 · 1080).** A soma dos blocos estourava ~95px e o rodapé de fonte caía por cima do logo. Corrigido encurtando a linha de fonte para **uma linha nos três formatos**, preservando a data.

**3 · Tabela não-contígua (D1 · 1350).** Escondi a faixa do *meio* (11-20) em vez da última, e a tabela saltava de "5 a 10" para "21 ou mais" — parecendo erro de dado. **Regra:** a sequência exibida tem de ser sempre contígua a partir da primeira; oculte só pelo fim.

> Nenhum dos três apareceu em `identify` nem em grep. Confirma a lição do ciclo 1: **`identify` prova dimensão, não prova design.**

## 17 · Aberto

| Item | Estado |
|---|---|
| ☐ Huggy, Avec, Belasis, Gendo, Booksy, Simples Agenda | Não reconferidos nesta rodada — fora da LP até terem fonte própria |
| ☐ Subir no Meta | **Nada foi publicado e nenhuma verba foi gasta.** Alçada do Marcelo |
| ☐ `"50 vagas"` do Cofounder | Segue vivo na LP — decisão do Marcelo, fora da alçada de criativo |
| ☐ Revalidar preços | Reconferir **cada linha** na fonte e mover `BENCH_CONSULTA` junto. Data velha com número novo é pior do que não ter tabela |

## 18 · Correção de formato — story, não feed (2026-08-01)

Decisão do Marcelo: **o lote benchmark sai em story, não em feed.** Entrega passa de 9 peças (3 conceitos × 3 formatos) para **3 peças em `1080×1920`**.

### Por que não foi só filtrar 3 PNGs

O 1920 existia, mas tinha sido desenhado **feed-first**: o §7 do ciclo 1 fixou *"altura extra vira respiro, nunca corpo maior de headline"* — regra correta quando o formato-mãe é feed e a peça compete dentro de uma coluna estreita. Consequência: no `1920`, D1 e D2 **mantinham o corpo do 1080** e toda a altura extra virava margem. Só o D3 subia a headline.

**A conta que mudou a decisão:** um story `1080×1920` preenche a tela inteira de um telefone de ~390pt — escala ≈ **0,36**. Uma headline de 64px chega ao olho como **~23px**: legível, mas não comanda. A 80px chega como ~29px, patamar de manchete. A regra do ciclo 1 foi **revogada apenas no bloco `data-f="1920"`**; nos blocos `1080`/`1350` ela segue valendo, e os dois formatos de feed continuam renderizáveis do mesmo fonte se a decisão voltar atrás.

### Escala aplicada

| Peça | headline antes → depois | resto |
|---|---|---|
| D1 | 64px → **80px** | tabela +18%, CTA 26→30px, fonte 19→21px |
| D2 | 70px → **76px** (teto de largura, ver abaixo) | chips 29→33px, fecho 32→36px |
| D3 | 64px → **76px** | colunas 23/27 → 27/32px |

Padding do `.stage` de `300/460` para `270/440` — dentro da zona morta declarada no §7 (250 topo / ~420 base) e devolvendo 50px de área útil.

### O defeito que a escala maior revelou

**A trava anti-órfã do ciclo 1 cobria só metade do problema.** O `<span class="l">` em bloco decide **onde** quebrar *entre* linhas — mas não impede o navegador de quebrar **dentro** de uma linha quando o corpo cresce e o texto deixa de caber na largura útil. Ao subir o D2 para 86px, `"Todo mundo anuncia IA."` (22 caracteres) passou a pedir ~1.002px contra 896px disponíveis e **`IA.` caiu sozinha na segunda linha** — exatamente a órfã que a trava existia para prevenir.

Duas correções:
1. **`white-space:nowrap` nas linhas do `h1`**, nos três conceitos. Agora corpo grande demais **vaza pela lateral** (defeito visível) em vez de reflowar em silêncio — mesmo princípio do `flex-shrink:0` da §16.
2. **D2 travado em 76px**, que é o teto real da largura para a linha mais longa. Não é preferência estética: é aritmética de caixa.

O D1 também estourava ~74px de altura e a linha de fonte voltou a cair sobre a marca; resolvido apertando paddings da tabela e margens, **sem** remover faixa — o dek promete "as quatro faixas seguintes", então esconder uma quebraria a copy.

### Zona morta — medida, não presumida

| Faixa | O que é | Desvio-padrão medido |
|---|---|---|
| 250px do topo | foto de perfil / nome | 0,006 – 0,030 → **vazia** |
| **250px reais do fundo** | barra "Enviar mensagem" do IG | **0,007 – 0,014 → vazia** |
| 1500–1670 | folga nominal de 420px do §7 | 0,070 – 0,076 → só a assinatura |
| faixa central | referência de "tem conteúdo" | 0,095 – 0,114 |

**Nada da mensagem é coberto pela UI.** A assinatura ocupa a folga nominal do §7 mas fica **acima** da barra real do Instagram — decisão consciente, registrada aqui em vez de escondida atrás de um "passou".

### Armadilha de upload (de novo)

Os 6 PNGs de feed foram movidos para **`_feed-nao-usar/`**, fora de `png/`. A pasta `png/` agora contém **exatamente 3 arquivos**, todos story. Mesma classe de armadilha que o ciclo 1 registrou — a diferença é que desta vez o arquivo indevido saiu da pasta em vez de ganhar um aviso no texto.
