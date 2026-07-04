Análise cruzada concluída. Segue o relatório de auditoria.

---

# Auditoria de Consistência — Arsenal de Atendimento NexvyBeauty ("Cliente de Volta")

**Escopo:** 6 artefatos · **Data:** 2026-07-04 · **Método:** cruzamento par-a-par + checagem contra o motor real do contexto.

**Etiqueta de confiança:** as contradições de texto são **[Certo]** (citadas verbatim). As leituras de intenção ("isto queima fundadora") são **[Provável]**, porque dependem de um fato que o briefing não fixa: *as 30 vagas ainda estão abertas hoje?* Sinalizo onde isso muda o veredito.

---

## VEREDITO FINAL: **REPROVA** — 3 defeitos estruturais bloqueiam o deploy

Não é reprovação de tom nem de copy (o tom está excelente e consistente nos 6). É reprovação de **arquitetura do funil**: os dois artefatos de aquisição (`agente-sdr` e `agente-demo`) operam numa premissa oposta à dos quatro artefatos de orquestração. Se você subir os seis como estão, o agente que fecha a venda **não sabe reservar uma vaga de fundadora** — e o playbook mestre manda ele fazer exatamente isso. Um dos dois está errado. Detalho os 3 bloqueadores primeiro, depois as ressalvas menores.

---

## 🔴 BLOQUEADOR 1 — Contradição de arquitetura: `agente-demo` fecha a venda sozinho e IGNORA a reserva de vaga de fundadora que o playbook exige dele

Esta é a mais cara. Os artefatos se contradizem sobre **quem conduz o onboarding de uma fundadora e se o agente de venda pode fechar sozinho.**

**O que o `playbook-atendimento-automatizado` manda (Seção 1.4, "Regra de ouro operacional"):**
> "o agente pode **vender** uma vaga de fundadora (enquanto houver), mas **quem entrega a experiência de fundadora é humano**. O agente nunca 'finge' ser a linha direta do fundador."

E na tabela 4.1: `A1 Vendedora | vaga de fundadora reservada | **Handoff concierge** + A2 apoio`. O A1 do playbook, ao fechar fundadora, **reserva e dispara handoff humano**, não manda pro Cakto sozinho.

**O que o `qualificacao-e-roteamento` manda (R6, R14, e §6.3 A2):**
> R6: "Confirma disponibilidade REAL (30/30/1) + explica condições fundadora com honestidade" → e no prompt A2: "Se ela topar, RESERVE a vaga e marque handoff:founder (o setup concierge é humano). Não conduza o onboarding de fundadora sozinho."

**O que o `agente-demo-oferta` realmente faz — o problema:** este artefato **nunca reserva vaga, nunca faz handoff pra concierge, e conduz TODO fechamento sozinho até o link Cakto**, inclusive o "setup concierge", que ele promete agendar **ele mesmo**:

> Seção 2.8: "Assim que cair, me dá um 'ok' aqui que eu já reservo seu setup concierge — é quando eu (ou o time) configuro tudo com você, ao vivo, e a gente roda o Radar na sua carteira pela primeira vez juntas."

Repare no "**eu (ou o time) configuro tudo com você, ao vivo**". Isso é o agente de IA se colocando como quem entrega o **setup concierge da fundadora** — exatamente o que o playbook (1.4) e o roteamento (A2) **proíbem**: "quem entrega a experiência de fundadora é humano. O agente nunca finge ser a linha direta do fundador."

**Diagnóstico [Certo]:** `agente-demo-oferta` foi escrito para um mundo onde **a experiência de fundadora é automatizada** (o agente promete o concierge). Os outros quatro artefatos foram escritos para um mundo onde **fundadora = handoff humano obrigatório**. São incompatíveis. Um lead fundadora que passar pelo `agente-demo` recebe uma promessa ("eu configuro com você ao vivo") que a arquitetura do grupo diz que a IA não pode cumprir.

**Correção:** `agente-demo` precisa do mesmo galho que o A2 do roteamento tem: ao detectar vaga de fundadora disponível + intenção de fechar → **reservar e handoff:founder**, e o discurso de "eu configuro com você" vira "a gente reserva sua vaga e o [fundador] configura junto com você". Sem isso, o artefato mais importante do funil (o que fecha dinheiro) está fora de contrato.

---

## 🔴 BLOQUEADOR 2 — `agente-sdr` e `agente-demo` presumem que a oferta de fundadora JÁ ACABOU — eles nunca oferecem, reservam ou sequer explicam a vaga como disponível

Consequência direta do B1, mas merece bloqueador próprio porque é o oposto do que o briefing descreve.

O contexto diz, no presente: *"30 vagas em 30 dias, teto de 1 onboarding/dia"* — a oferta de fundadora **está rolando**. Mas os dois artefatos de aquisição tratam o lead novo **sempre como pós-31º**:

- **`agente-sdr`** (system prompt, "A OFERTA DE ENTRADA"): "Você PODE mencionar que 'tem uma condição de fundadora rolando, com poucas vagas' pra criar contexto. Você NÃO detalha preço, NÃO promete vaga, NÃO fecha." — ok, ele é SDR, não fecha mesmo. Aceitável para o papel dele.

- **`agente-demo`** é o problema real. Ele fecha vendas e **em nenhum lugar do roteiro de fechamento (Seção 2.7, 2.8) ele apresenta a oferta fundadora como caminho.** O fechamento dele é genérico: garantia → preço → "quer a vaga de hoje?". A menção a "condições de fundadora" na 2.7 aparece como se fossem **um dado ambiental**, não uma oferta que ele está fazendo AGORA àquele lead:
  > 2.7: "as condições de fundadora (preço travado pra sempre + linha direta comigo + eu configurando com você na mão) são pras 30 primeiras."

  Ele **descreve** a fundadora, mas **nunca roda a árvore de decisão** (`founder_slots_left > 0` → OFERECE) que o playbook e o roteamento tornam obrigatória. Ele não tem o campo de estado, não tem o galho, não reserva.

**Diagnóstico [Provável]:** se as 30 vagas estão abertas hoje (o que o briefing afirma), `agente-sdr` + `agente-demo` estão **desperdiçando as fundadoras** — o ativo mais valioso da operação (Hormozi: escassez real) — porque tratam todo lead como se o piloto já tivesse fechado. O `playbook` (13.2) e o `qualificacao` (Seção 1) dizem em letras garrafais que essa vaga é o coração do sistema. Os dois agentes que efetivamente falam com o lead ignoram.

**Por que "Provável" e não "Certo":** *se* a intenção do autor for "estes dois artefatos são a esteira 100% automatizada do 31º em diante, e as 30 fundadoras são vendidas à mão pelo fundador", então não há bug — há só uma **lacuna de escopo não declarada** (ver Lacuna 1). Mas nesse caso o `agente-demo` está mentindo ao prometer o "eu configuro com você" (B1), porque isso É a experiência de fundadora. De um jeito ou de outro, `agente-demo` está quebrado. Preciso que você confirme: **`agente-demo` atende leads que podem virar fundadoras, ou só pós-31º?**

---

## 🔴 BLOQUEADOR 3 — Feature inventada: `agente-demo` promete um "raio-x da carteira antes de pagar" que o motor não entrega e que os outros artefatos explicitamente proíbem

O `playbook` levanta essa bandeira vermelha por conta própria (Etapa 3, "NOTA DE HONESTIDADE"):
> "só prometa um 'raio-x da carteira antes de pagar' se isso EXISTIR como processo (concierge da fundadora, ou trial). Se não puder entregar o raio-x pré-pagamento pra lead not_founder, demonstre em palavras + trial R$0, não invente uma prova que você não vai entregar."

E o `qualificacao-e-roteamento` crava como LEI (Guarda #6):
> "Antes de a dona conectar o WhatsApp, o Radar é PROMESSA DE MECANISMO, não número. Proibido 'seu Radar já achou R$ X'."

**O que `agente-demo` faz:** o system prompt dele manda liderar pelo Radar mostrando o número — e o roteiro trata o valor recuperável como algo que ela vê **na conversa de venda**, antes de conectar. O fecho da Seção 2.6 e as objeções da 3.1 ("o Radar mostra na tela QUEM sumiu da SUA carteira e QUANTO vale") sugerem prova pré-pagamento. Ele não tem a NOTA DE HONESTIDADE que o playbook exige, nem a Guarda #6. **Risco concreto:** o agente promete "te mostro seu número", o lead paga esperando ver a carteira dele varrida antes, e não vê — porque o Radar só roda após conectar o WhatsApp (que é passo de onboarding, `agente-onboarding` degrau 4).

**Nuance justa:** `agente-demo` até tem a demo `/demo/cockpit` "com dados de mentira" (2.5), o que é honesto. O problema é que ele **oscila** entre "demo com dado fake" (honesto) e "o Radar mostra a SUA carteira" (promessa não-entregável pré-pagamento) sem a trava que os outros dois têm. Precisa herdar a Guarda #6 e a NOTA DE HONESTIDADE, verbatim.

---

## 🟡 RESSALVA 4 — Divergência de fato: quantos usuários no Premium? "5 usuários" (todos) vs. o `agente-suporte` que sugere ambiguidade

Contradição factual menor, mas é o tipo que mina confiança quando o cliente compara.

Todos os artefatos dizem Premium = **5 usuários, 2 conexões, 3 agentes IA**. Consistente. **Não há divergência aqui** — retiro qualquer alarme. Confirmei os seis: batem. ✅

*(Deixei esta entrada para registrar que verifiquei os números de plano em todos os seis e eles são consistentes: Trial R$0 · Essencial R$217 · Premium R$387 · Ultra R$687. Nenhum artefato inventa preço.)*

---

## 🟡 RESSALVA 5 — Feature borderline: `agente-onboarding` promete "importar contatos do celular" — o motor descrito não lista isso

O `agente-onboarding` (Passo 2 / Mensagem 0.5) oferece:
> "1️⃣ Importar do celular — o sistema puxa seus contatos e você marca quem é cliente."

O briefing do motor lista: Radar, reativação 1-clique, 4 automações, agenda + link `/s/<slug>`, painel Recuperado. **Importação de contatos do dispositivo não está no motor descrito.** Pode existir no produto real (é plausível — o Radar precisa de carteira pra varrer), mas **nenhum outro artefato menciona importação de contatos**, e o próprio `agente-onboarding` tem uma regra que proíbe inventar: "NÃO prometa: integração com Instagram, ... Se ela pedir algo que não existe, diga a verdade."

**[Provável] violação da própria regra do artefato.** Ou (a) importação existe e deveria estar no briefing/motor canônico, ou (b) não existe e o degrau 2 promete algo não-entregável — o que trava o onboarding no gargalo #2. Precisa confirmar contra o produto. Baixa severidade porque é interno (pós-venda), não vende nada falso, mas é exatamente o tipo de "feature assumida" que o playbook combate.

---

## 🟡 RESSALVA 6 — Inconsistência de nomes dos agentes entre os dois artefatos de orquestração

`playbook` e `qualificacao-e-roteamento` são ambos "o cérebro que amarra os agentes", mas **nomeiam os agentes de forma diferente e incompatível:**

| Papel | `playbook` | `qualificacao-e-roteamento` |
|---|---|---|
| Roteador de entrada | **A0 Porteiro** | **A0 Recepção/Triagem** |
| Vendas | **A1 Vendedora** (faz tudo: qualifica→demo→oferta→checkout) | **A1 Dor** + **A2 Oferta** + **A3 Objeções** + **A4 Onboarding** (venda fatiada em 4) |
| Onboarding pós-venda | **A2 Onboarding** | *(é o A4 do outro!)* |
| Retenção | **A3 Guardiã** | *(não tem número — é papel de outro arsenal)* |
| Suporte | **A4 Suporte** | *(idem)* |

Os rótulos **A1–A4 significam coisas diferentes nos dois documentos.** No `playbook`, A2 = Onboarding. No `qualificacao`, A2 = Oferta/Fechamento. Se um operador ler os dois (e o próprio `qualificacao` diz "conversa com o CRM multiproduto"), a colisão de nomenclatura vira bug de implementação: "configura o A2" é ambíguo.

**[Certo].** Não é contradição de regra de negócio — as regras duras batem entre os dois. É **dívida de nomenclatura** que vai custar caro no deploy. Recomendo: um dos dois adota o esquema do outro, ou criam prefixos distintos (ex.: playbook usa `P-A2`, roteamento usa `Q-A2`). Sozinho não reprova; somado ao B1/B2 reforça que **os dois "cérebros" não foram reconciliados entre si.**

---

## ✅ O QUE PASSOU (para você não retrabalhar o que está bom)

Verifiquei e **estão consistentes nos seis**:

1. **"Nunca desconto"** — impecável. Todos os seis reancoram em valor + garantia, oferecem Trial R$0 como "prova, não desconto", e recusam desconto com a mesma lógica ("o preço travado de fundadora é o presente; baratear seria injusto com você depois"). Zero violação. O `qualificacao` até formaliza como Guarda #2 com checklist pré-envio.
2. **Garantia god-mode** — 30 dias corridos a partir do setup, painel Recuperado > mensalidade ou 100% de volta. Redação consistente. `agente-demo` (Seção 0) explicitamente proíbe inflar ("'devolvo em dobro' é proibido"). Bom.
3. **Ordem de fechamento GARANTIA → PREÇO → VAGA** — `agente-demo` e `qualificacao` (A2) concordam e justificam igual. Coerente.
4. **Regra da fundadora pós-31º** — `agente-onboarding` (público explícito: não-fundadoras) e `agente-suporte` (§2.10) tratam impecavelmente o caso "cliente comum pede condição de fundadora" → honestidade, sem inventar vaga, sem desconto. O `playbook` (1.3, "A TRAVA") e o `qualificacao` (Guarda #4) blindam isso com árvore de decisão + campo de estado. **Esta é a parte mais forte do arsenal.**
5. **Escalada pra humano** — gatilhos consistentes (pediu humano, reembolso/garantia, raiva, feature inexistente, loop). `agente-suporte`, `playbook` (Seção 6) e `qualificacao` alinhados.
6. **Anti-alucinação de features** — os quatro artefatos de orquestração/pós-venda listam o motor real e proíbem inventar. Só os dois de aquisição escorregam (B3, R5).

---

## LACUNAS DO FUNIL (nenhum artefato cobre)

**Lacuna 1 — [Certo] A ponte SDR→Demo não existe fisicamente entre os artefatos de aquisição.** O `agente-sdr` emite `ROUTE: DEMO | vertical=... | carteira=... | dor=...`. O `agente-demo` diz que "recebe o lead JÁ QUALIFICADO" com esse contexto. Mas **nenhum dos dois define o mecanismo de passagem** (é o mesmo agente trocando de chapéu? dois agentes com transferência de estado? o `playbook`/`qualificacao` assumem squad; os dois artefatos standalone assumem esteira solta). O `playbook` tenta cobrir com a tabela 4.1, mas usa a nomenclatura A1-única (Ressalva 6), então não encaixa com o SDR/Demo standalone que são **dois** agentes. **A costura entre os dois artefatos de venda está no ar.**

**Lacuna 2 — [Certo] Ninguém cobre o lead que some ENTRE a demo e o checkout sem ter clicado no link.** O `agente-demo` (2.9) cobre "não agora" (disse não). O `playbook` (9.2) cobre "abandono de checkout" (clicou, não pagou). Mas o buraco entre "viu a demo, disse que ia pensar, sumiu, **nunca clicou em nada**" — o follow-up desse estado não tem dono claro. `agente-demo` 2.9 exige que ela tenha dito "não"; se ela só evaporou, cai num limbo.

**Lacuna 3 — [Provável] Transição onboarding→retenção tem dois donos que não se conhecem.** `agente-onboarding` (público: não-fundadoras) termina a ativação e diz "te mando um resumo daqui a uns dias". `agente-suporte-retencao` (público: clientes ativos) assume o cliente ativo. Mas o `agente-onboarding` **nunca faz handoff explícito** para o `agente-suporte` — ele mesmo agenda o "dia 7" (Mensagem 7A). Enquanto isso o `playbook` diz que dia 7 é da **A3 Guardiã**, um agente diferente. **Quem manda a mensagem de dia 7: o onboarding ou a retenção?** Os dois reivindicam. Sobreposição = risco de dupla mensagem, ou de nenhuma.

**Lacuna 4 — [Certo] Fundadora que chega via `agente-sdr`/`agente-demo` não é detectada.** Os dois artefatos de aquisição **não têm o campo `founder_status`** que o `playbook` (5.1) e o `qualificacao` (Guarda #4) tornam a fonte-da-verdade. Sem esse campo injetado, o `agente-sdr`/`agente-demo` **não conseguem saber** se o lead na frente deles já é fundadora (ex.: uma fundadora que voltou a escrever). Eles vão tratá-la como lead novo. O `playbook` cobre isso no A0 Porteiro, mas os artefatos standalone não recebem o Porteiro. Lacuna de infraestrutura de estado.

**Lacuna 5 — [Provável] "Cliente sumida" tem dois sentidos e nenhum artefato faz a ponte para o não-técnico.** O `qualificacao` (Seção 0) brilhantemente separa "Radar do Produto (a cliente final da dona)" de "Score do Lead (a dona)". Mas **só o `qualificacao` faz essa distinção.** Os outros cinco usam "HOT/WARM/COLD" e "cliente sumida" sem essa blindagem. O `agente-suporte` fala "cliente sumida" como automação (a cliente final) e "gatilho de churn" (a dona sumindo do produto) na mesma seção 3 — um operador desatento pode confundir. Risco baixo, mas o conceito só está protegido em 1 dos 6.

---

## RESUMO EXECUTIVO

| # | Achado | Tipo | Severidade | Artefato(s) |
|---|---|---|---|---|
| B1 | `agente-demo` promete entregar o setup concierge ("eu configuro com você ao vivo") — proibido: concierge de fundadora é humano | Contradição arquitetural | 🔴 Bloqueia | agente-demo vs. playbook 1.4 + qualificacao A2 |
| B2 | `agente-sdr`/`agente-demo` tratam todo lead como pós-31º; nunca oferecem/reservam vaga de fundadora | Premissa oposta ao briefing | 🔴 Bloqueia | agente-sdr, agente-demo vs. contexto + playbook 13.2 |
| B3 | `agente-demo` sugere "raio-x da carteira" pré-pagamento; motor não entrega; viola Guarda #6 | Feature inventada | 🔴 Bloqueia | agente-demo vs. playbook Etapa 3 + qualificacao Guarda #6 |
| R5 | `agente-onboarding` promete "importar contatos do celular" — não está no motor | Feature borderline | 🟡 Ressalva | agente-onboarding |
| R6 | A1–A4 significam papéis diferentes nos dois "cérebros" | Dívida de nomenclatura | 🟡 Ressalva | playbook vs. qualificacao |
| L1 | Costura física SDR→Demo indefinida | Lacuna de funil | 🟡 | aquisição |
| L2 | Lead que some pós-demo sem clicar não tem follow-up | Lacuna de funil | 🟡 | demo + playbook |
| L3 | Dia 7: onboarding e retenção ambos reivindicam | Sobreposição | 🟡 | onboarding vs. suporte |
| L4 | `founder_status` não chega ao SDR/Demo | Lacuna de estado | 🟡 | aquisição |
| L5 | Distinção "Radar do produto vs. dona" só existe em 1 de 6 | Risco conceitual | 🟢 | 5 artefatos |

**A pergunta que decide se isto vira APROVADO COM RESSALVAS ou continua REPROVA:** *os artefatos `agente-sdr` e `agente-demo` atendem leads que podem virar fundadoras (as 30 vagas estão abertas), ou são exclusivamente a esteira pós-31º?*

- Se **atendem fundadoras potenciais** → REPROVA confirmada (B1+B2+B3 são reais e graves; os dois artefatos foram escritos contra a arquitetura do grupo).
- Se são **só pós-31º** → B2 vira Lacuna de escopo (falta declarar isso no topo dos dois artefatos), mas **B1 e B3 continuam bloqueando** (o `agente-demo` não pode prometer o concierge que é da fundadora, nem o raio-x pré-pagamento) → ainda **REPROVA**, só que com 2 bloqueadores em vez de 3.

Em ambos os cenários o `agente-demo-oferta` é o artefato que precisa voltar pra prancheta. Os outros cinco vão com ajustes.

---

**Arquivos:** todos os artefatos vieram inline no prompt; não há paths de arquivo para referenciar. Nenhum arquivo foi escrito no disco durante esta auditoria.