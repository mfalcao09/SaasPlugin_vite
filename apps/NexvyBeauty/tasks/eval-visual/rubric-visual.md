# rubric-visual.md — avaliação POR SCREENSHOT das telas do gestao.*

> 2026-07-05 · Braço EVAL-HARNESS-VISUAL. É a rubric do `TEMPLATE-UI-GESTAO-2026-07-05.md` (§4, gate ≥ 85, 6 critérios) **reescrita para o que dá pra ver num print** — o avaliador (LLM ou humano) olha `shots/<tela>-desktop.png` + `shots/<tela>-mobile.png` e pontua sem acesso ao código.
>
> Regra de ouro: **só conta o que a imagem prova.** Se um critério depende de interação (hover, drag) que o print não captura, marque `n/v` (não-verificável) e não penalize — anote no relatório. Nunca invente um estado que não está na tela.

---

## 0 · Como pontuar (o loop GAN visual)

1. Rode `node tasks/eval-visual/eval-visual.mjs` → gera os prints em `shots/`.
2. Para CADA tela, abra o par **desktop (1440) + mobile (390)**.
3. Rode o **checklist binário** (§1). Reprovou 1 item → tela fica em `BLOQUEADA`, score não conta, volta pro gerador.
4. Passou o checklist → pontue os **6 critérios** (§2), somando 0–100. Cite a evidência visual de cada nota ("KPIs alinhados no grid 4-col, delta verde visível" etc.).
5. **< 85 → itera** (máx 4 rodadas). Não bateu em 4 → registra EXCEÇÃO com motivo no tracker do template (§5.3), sem gambiarra.
6. Preenche o **template de veredito** (§3) e devolve.

Família de cada tela P1 (do template §5): Dashboard=F3 · Pipeline=F2 · Leads=F5 · Chat=F1 · Painel=F3 · Radar IA=F3 · Follow-Up=F5.

---

## 1 · Checklist binário pré-score (reprovou 1 ⇒ BLOQUEADA, nem pontua)

Tudo verificável a olho no print:

- [ ] **Marca correta** — a cor de AÇÃO/seleção é **azul Nexvy** (#0A52D1), não rosa Beauty (hue 330), não verde-lima Vendus (#84CC16). (O gestao.* é azul; rosa numa tela de gestão = reprova.)
  - ⚠️ **N/A quando os prints NÃO são de host `gestao.*`.** O tema azul só ativa quando `location.hostname` começa com `gestao.` (gate no `<script>` do `index.html`); contra `localhost`/IP a UI renderiza **rosa por artefato do harness**, não por defeito — **não reprove a tela por isso**, marque este item `n/v`. Nesses casos o `eval-visual.mjs` avisa no console e grava `shots/_AVISO-base-nao-gestao.md` junto dos prints. (Para avaliar marca de verdade, gere os prints contra `gestao.nexvy.tech`.)
- [ ] **Tema claro** — fundo claro (off-white/branco), não dark-first. (Guardrail: gestao é calibrado no claro.)
- [ ] **Sem tela crua** — não há JSON/erro React/tela branca/"Something went wrong"/placeholder Lorem. A tela renderizou conteúdo real ou um estado (vazio/skeleton) intencional.
- [ ] **Identidade de pessoa OK** — onde aparece contato de WhatsApp, NÃO aparece "~" cru nem string lixo; aparece nome OU telefone formatado `(11) 95502-1205`.
- [ ] **Mobile não quebra** — no print 390px nada corta na horizontal, nada vaza pra fora da viewport, texto não sobrepõe. Sidebar sumiu (virou menu/topbar), não empilhou por cima do conteúdo.
- [ ] **Sem scroll horizontal acidental** — no mobile, o conteúdo cabe na largura (kanban pode ter scroll-x INTENCIONAL; o resto não).

> Se um print veio como `*.FAIL.png`, a tela é automaticamente BLOQUEADA — o script não conseguiu nem chegar nela. Diagnostique pelo print de falha antes de pontuar.

---

## 2 · Os 6 critérios (0–100, gate ≥ 85)

Mesmos pesos do template §4. Abaixo, o que procurar EM CADA PRINT.

### Critério 1 — Hierarquia visual · **25 pts**
Uma ação primária clara, títulos na escala certa, anatomia fiel à família.

- **[8]** Existe **1 ação primária óbvia** (botão azul cheio: "Novo lead", "+", enviar) — e só uma dominante por tela. Se há 3 botões azuis competindo, perde.
- **[7]** **Título de página** claramente maior/mais pesado que o resto (`text-lg font-semibold` + subtítulo cinza). Hierarquia de leitura: título → seção → item → metadado, em tamanhos distintos.
- **[10]** **Anatomia da família bate** com o print esperado:
  - F1 (Chat): 3 zonas visíveis no desktop — lista à esquerda, conversa no centro, contexto à direita.
  - F2 (Pipeline): colunas kanban lado a lado, cada uma com header (dot colorido + nome + contador + soma R$).
  - F3 (Dashboard/Painel/Radar): grid de cards KPI no topo (valor grande `text-2xl`), depois charts/listas.
  - F5 (Leads/Follow-Up): toolbar (busca + filtro + "Novo") sobre uma tabela com header em maiúsculas cinza.

### Critério 2 — Densidade & usabilidade · **20 pts**
Densidade Vendus: compacto sem apertar, zero ar desperdiçado.

- **[8]** **Aproveitamento do espaço**: a tela usa a largura (1440) — não é uma coluna estreita perdida num mar de branco. Painéis preenchem, cards não ficam gigantes com 2 palavras dentro.
- **[7]** **Respiração correta**: apesar de denso, não está claustrofóbico — há padding consistente (`p-4`), itens de lista separados por linha fina, não colados.
- **[5]** **Affordances de produtividade visíveis** quando a família pede: campo de busca presente (F1/F5), `Ctrl+K`/placeholder de atalho, tabs-pílula com contador. (Atalho de teclado em si é `n/v` no print — conta a presença do campo.)

### Critério 3 — Affordance · **15 pts**
Toda ação descobrível; contadores sempre visíveis; nada de botão sumido.

- **[6]** **Contadores presentes mesmo quando 0** — badges/pílulas de aba mostram número (inclusive "0" em cinza), não somem.
- **[5]** **Ações visíveis** — botões-ícone têm forma clara (não são glifos soltos ambíguos); ação primária tem rótulo textual, não só ícone.
- **[4]** **Sem affordance escondida** — se a tela é um stub/feature futura, o BOTÃO ainda aparece (com aviso "em breve"), não um espaço vazio. (Tooltip/hover em si = `n/v` no print estático.)

### Critério 4 — Consistência de token · **15 pts**
Zero hex de marca fora do token; literais só os de significado.

- **[6]** **Azul só para marca/ação** — nenhum azul aleatório em texto comum; o azul aparece em CTA, seleção, foco, chart-1.
- **[5]** **Cores de significado corretas** (as únicas literais permitidas): WhatsApp=verde-esmeralda, Instagram=rosa-pink, quente=vermelho, morno=laranja, frio=azul-céu, sucesso=verde, alerta=amarelo. Um badge "WhatsApp" azul, ou temperatura com cor trocada, perde.
- **[4]** **Tipografia/radius consistentes** — fonte única (Inter), cantos arredondados uniformes (`rounded-lg` em cards, `rounded-full` em pills/avatares), sem mistura de estilos.

### Critério 5 — Estados · **15 pts**
Vazio/carregando/erro/sucesso completos e anatômicos.

- **[8]** **O estado atual do print está bem-resolvido**:
  - Com dados → densidade e alinhamento corretos (números `tabular-nums` alinhados à direita em colunas).
  - **Vazio** → ícone grande `opacity-30` + título + dica contextual + (quando cabe) CTA. NÃO uma tela branca muda.
  - **Carregando** → skeleton com a MESMA forma do conteúdo (blocos cinza no lugar de avatar+linhas), nunca spinner central perdido.
- **[7]** **Consistência do estado com a família** — lista vazia parece o empty-state padrão; kanban vazio mostra colunas com mini-empty, não some. (Erro/otimista podem ser `n/v` se o print não os capturou — anote, não penalize.)

### Critério 6 — Mobile + higiene · **10 pts**
<lg funcional; sem quebras; visual limpo.

- **[5]** **Mobile realmente adaptado** (print 390): não é o desktop encolhido — é reflow real (cards empilham em 1 coluna, tabela reduz a colunas essenciais, kanban vira scroll-x com snap). Topbar com título da tela + menu hambúrguer.
- **[3]** **Toque confortável** — alvos parecem ≥44px (botões não minúsculos), nada espremido demais para o dedo.
- **[2]** **Higiene visual** — alinhamento consistente, sem elemento cortado/sobreposto, sem texto estourando container em nenhuma das duas larguras.

---

## 3 · Template de veredito (preencher por tela)

```
### <Tela> (<família>) — <desktop.png> + <mobile.png>
Checklist binário: PASSOU | BLOQUEADA (item X falhou: ...)

| Critério              | Nota | Evidência no print |
|-----------------------|------|--------------------|
| 1 Hierarquia (25)     |      |                    |
| 2 Densidade (20)      |      |                    |
| 3 Affordance (15)     |      |                    |
| 4 Tokens (15)         |      |                    |
| 5 Estados (15)        |      |                    |
| 6 Mobile+higiene (10) |      |                    |
| TOTAL                 | /100 | gate ≥ 85          |

Veredito: APROVADA (≥85) | ITERAR (<85, rodada N/4) | EXCEÇÃO (4/4 sem bater)
n/v (não-verificável no print): [listar critérios/subitens que dependem de interação]
Top 3 correções para subir a nota:
1.
2.
3.
```

---

## 4 · Notas de honestidade do método

1. **[Certo]** Screenshot estático NÃO prova: hover, tooltip, drag do kanban, toast de erro/sucesso, atalho de teclado, foco. Esses viram `n/v` — a rubric não os penaliza no print, mas eles continuam no checklist do template (verificados na tela viva, não aqui).
2. **[Certo]** Este harness prova **o que renderizou**, não **se o dado está certo**. Um Dashboard lindo com número errado passa a rubric visual. Correção de dado é outro braço.
3. **[Provável]** Estado do print depende do tenant logado: se a base está vazia, você verá empty-states (ótimo p/ avaliar o critério 5 "vazio"); se cheia, avalia densidade com dados. Rodar nas duas situações dá cobertura melhor.
4. **Consistência com o template**: se a receita de uma família mudar após o loop, atualize o `TEMPLATE-UI-GESTAO` (`_v2`), não esta rubric por tela — esta só espelha os 6 critérios/pesos de lá.
