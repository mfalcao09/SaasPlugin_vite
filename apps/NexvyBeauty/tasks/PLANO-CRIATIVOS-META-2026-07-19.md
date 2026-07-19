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

### Pendente (não bloqueia a subida)

- ☐ Logo NexvyBeauty — hoje é wordmark tipográfico
- ☐ `"50 vagas"` do Cofounder ainda vivo na LP (decisão do Marcelo)
- ☐ Criar o Teste A/B e os anúncios via Meta Ads MCP — **só sob comando explícito**
