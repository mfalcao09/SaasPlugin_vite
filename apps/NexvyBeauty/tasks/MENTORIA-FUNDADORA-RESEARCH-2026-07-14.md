# Pesquisa de Produto — Reformulação do Pacote Fundadora (Consultoria de Implantação + Mentoria de Gestão)

> **Gerado:** 2026-07-14 · pesquisa de mercado (sem código) · NexvyBeauty
> **Pergunta do dono:** reformular o "Pacote Fundadora" para consultoria de implantação + mentoria de gestão (6 semanas de operação assistida, agentes de IA e playbooks feitos por nós, 8 encontros semanais, ~50 vagas, 12× R$287 ≈ R$3.444). O que o mercado BR pratica, como estruturar, mecânicas de oferta, riscos e a matemática de entrega.
> **Contexto interno usado:** `SalesPage.tsx` (Piloto Fundadora atual = "Cliente de Volta 30 dias", 30 vagas, 1 negócio/dia, acompanhamento 1-a-1), `ImplantacaoWizard` (Fase A já portada), funil autopilot WhatsApp.

---

## 1. Sumário Executivo

1. **A verdade desconfortável primeiro: 50 vagas em formato 1-a-1 NÃO fecham a conta** — são ~900h de entrega (R$191/h implícito, preço de consultor Sebrae). Em coorte (grupo com trilhos + 1-a-1 pontual) a mesma receita sai por ~280h (~R$600/h) e a experiência até melhora (comunidade).
2. O formato que Marcelo desenhou **já é o padrão vencedor do nicho**: os principais programas BR de gestão de salão são 6–8 semanas, 6–8 encontros ao vivo em grupo, com suporte contínuo (Lívia Puerta: 8 encontros/2 meses; Laysa Strithorst: 6 semanas; Comunidade da Beleza: 8 encontros/2 meses).
3. **Preço R$3.444 está bem posicionado**: 2,3–2,6× acima das mentorias em grupo do nicho (R$1.299–R$1.497), mas 4× abaixo do high-ticket de estética (R$15.000) — justificável SÓ porque inclui o que ninguém entrega: implantação feita por nós + agentes de IA + software. Sem essa camada "done-for-you", o preço fica caro vs. concorrência.
4. **Whitespace real:** nenhum SaaS de beleza BR cobra implantação como produto (Trinks dá migração e onboarding grátis) e nenhuma mentora do nicho entrega software + IA. A combinação "nós operamos com você" é inédita no segmento.
5. Âncora de valor honesta: consultoria avulsa equivalente custaria R$8k–11k (Sebrae estima 60–80h de consultoria p/ ME/EPP a R$70–286/h; mentoria em grupo R$1.5k; setup de automação por agência R$2–5k).
6. Garantia recomendada: **dupla** — 7 dias incondicional (obrigação legal, CDC art. 49) + condicional de execução em 90 dias medida pelo painel ("R$ recuperado" ≥ investimento). Nunca anunciar como "resultado garantido" (CDC art. 37).
7. Escassez legítima existe e já é o discurso da casa: capacidade de implantação de 1–2 negócios/dia → 50 vagas = 2 turmas de 25, entrada escalonada. Não precisa inventar relógio.
8. Nome: **manter "Fundadora", abandonar "Pacote"** → "Programa Fundadora" (Turma 1). "Pacote" vende coisa; "Programa" vende jornada — e todo o nicho nomeia por método/jornada.
9. Risco jurídico é gerenciável mas real: obrigação de meio (não de resultado), art. 37/49 CDC, chargebacks de 12× em produto consumido em 8–10 semanas.
10. **Recomendação honesta de formato:** coorte de até 25 com trilhos semanais + 2 sessões 1-a-1 pontuais (diagnóstico e checkpoint) + implantação done-for-you semi-automatizada pelo próprio `ImplantacaoWizard`. Margem >80% com CS contratada; o founder entrega só os encontros.

---

## 2. Benchmarks Encontrados (mercado BR, beleza/serviços locais)

### 2.1 Mentorias de gestão para salão de beleza (concorrência direta)

| Programa | Estrutura | Formato | Preço | Garantia | Fonte |
|---|---|---|---|---|---|
| **Mentoria Salão de Sucesso** (Laysa Strithorst) | 6 semanas · 1 sessão individual + 5 em grupo (~2h, Google Meet) · tira-dúvidas contínuo | Grupo | **R$1.497** (de R$1.997) ou 12× R$154,82 | 7 dias incondicional | [laysastrithorst.com](https://www.laysastrithorst.com/mentoriasalaodesucesso2) |
| **Mentoria Gestor Beauty** (Lívia Puerta) | 2 meses · **8 encontros ao vivo semanais** (segundas 19h) · plano de ação em Trello · suporte seg–sex · gravações por 1 ano | Grupo | **R$1.299** ou 12× R$129,90 | não divulgada | [liviapuerta.com](https://liviapuerta.com/) |
| **Bianca Belchior** | Desafio de 5 semanas + **12 meses** de acompanhamento (2 mentorias/mês) · grupo WhatsApp · ferramentas vitalícias | Grupo híbrido | sob contato (high ticket via formulário) | 15 dias | [biancabelchior.com.br](https://biancabelchior.com.br/) |
| **Mentoria Novo Olhar / Método 360º** (Comunidade da Beleza) | 2 meses · **8 encontros ao vivo** p/ implantação do método · apostilas PDF + planilhas | Grupo, personalizado | sob contato | n/d | [comunidadedabeleza.com.br](https://comunidadedabeleza.com.br/) |
| **Mentoria 30 Dias** (Laysa Strithorst) | 30 dias · 4 semanas/4 pontos do salão · acompanhamento total | Individual | sob contato | n/d | [laysastrithorst.com/mentoria30dias](https://www.laysastrithorst.com/mentoria30dias) |
| **Hair Mentoring** (Superprof) | por hora, personalizada | Individual | **R$130/h** | — | [superprof.com.br](https://www.superprof.com.br/hair-mentoring-uma-mentoria-personalizada-para-todos-profissionais-beleza.html) |

### 2.2 Segmento vizinho: clínicas de estética (teto de preço do mercado)

| Programa | Estrutura | Preço | Fonte |
|---|---|---|---|
| **Mentoria G.E.T.I — Gestão Estética** | 3 meses de acompanhamento | **R$5.000/mês (R$15.000 total)** | [groupessencial.com.br](https://groupessencial.com.br/cursos-e-treinamentos/mentoria-geti-de-gestao/) |
| **Clínicas de Elite** / Daniela Fidellis / Olive | consultoria/mentoria p/ clínicas, 90 dias típico | sob contato (high ticket) | [clinicasdeelite.com](https://www.clinicasdeelite.com/) · [danielafidellis.com.br](https://www.danielafidellis.com.br/consultoria-para-clinicas-de-estetica/) |
| **AMHT** (mulher empreendedora, genérica) | 6 meses · 12 mentorias quinzenais em grupo | **R$2.500** ou 12× R$258,56 | [portalvf.com.br/amht](https://portalvf.com.br/amht/) |

### 2.3 Consultoria "avulsa" (material da âncora de valor)

- Valor-hora de consultoria empresarial BR (2024–2025): **R$70–200/h**, chegando a **R$286,50/h** (Sebrae). Projeto típico de 40h ≈ **R$5.600**. Sebrae estima **60h para ME e 80h para EPP** para "um bom trabalho" → R$4.2k–R$11.4k. Fontes: [RDD10+](https://www.robertodiasduarte.com.br/analise-do-valor-hora-em-consultorias-no-brasil-2024-2025-2/), [Tabela Sebrae-SP](https://contato.sebraesp.com.br/wp-content/uploads/TabelaValores.pdf).
- Sebrae tem programas setoriais de gestão p/ beleza (Inova Beleza Gestores RJ, Solução Setorial SP) — concorrente institucional barato, porém sem implantação de software nem IA. Fontes: [Sebrae SP](https://sebrae.com.br/sites/PortalSebrae/ufs/sp/programas/programa-solucao-setorial-para-salao-de-beleza,fc2649b99534c610VgnVCM1000004c00210aRCRD), [Sebrae RJ](https://sebraerj.com.br/projeto-inova-beleza-gestores).

### 2.4 SaaS de beleza: implantação NÃO é produto (whitespace)

- **Trinks**: sem taxa de adesão, migração de dados assistida **grátis**, onboarding personalizado incluso. Fonte: [negocios.trinks.com/planos](https://negocios.trinks.com/planos/). Mesmo padrão no restante da categoria.
- Implicação: ninguém no SaaS beleza BR monetiza implantação + acompanhamento como programa. A NexvyBeauty pode ser a primeira a vender **"nós implantamos e operamos com você"** — e a literatura de SaaS sustenta o motivo estratégico: onboarding estruturado/high-touch reduz churn em **até 50% no primeiro trimestre** (Totango, via [Baita](https://baita.ac/insights/como-reduzir-churn-em-saas-b2b-br-mo95mtux)); ~30% dos cancelamentos vêm de falha de comunicação, não de produto (ProfitWell, via [Administradores](https://www.administradores.com.br/artigos/retencao-de-clientes-em-saas-do-onboarding-a-renovacao-como-evitar-churn-em-produtos-recorrentes)).

### 2.5 Padrões extraídos (o que "todo mundo" faz)

- **Duração:** 5–8 semanas de programa intensivo; os melhores estendem convivência (comunidade/alumni) por meses.
- **Cadência:** 1 encontro/semana ao vivo, ~2h, Google Meet, com gravação.
- **Grupo é o padrão; 1-a-1 é upsell** ou sessão pontual dentro do grupo (Laysa: 1 individual + 5 grupo).
- **Entregáveis típicos:** planilhas financeiras, plano de ação (Trello), apostilas, aulas gravadas, grupo de WhatsApp, especialista convidada (ex.: contadora).
- **Currículo canônico do nicho:** posicionamento/encantamento → administração e Lei do Salão-Parceiro → custos/financeiro → equipe → vendas/precificação → marketing/Instagram. (Quase idêntico ao rascunho do Marcelo — o mercado valida o currículo proposto.)
- **Garantias:** 7–15 dias incondicional. Ninguém do nicho usa garantia condicionada a execução — espaço para diferenciar com risco-reverso mais agressivo (viável porque temos o painel para medir).
- **Escassez:** "vagas limitadas para manter acompanhamento de qualidade" — a mesma lógica que o Piloto Fundadora já usa (1 negócio/dia).

---

## 3. Estrutura Recomendada da Nossa Mentoria

### 3.1 Arquitetura geral (dupla trilha, 8 semanas)

- **Trilha A — "Feito por nós" (implantação, semanas 0–6):** setup completo do NexvyBeauty (serviços, agenda, equipe), migração de dados da ferramenta anterior, configuração dos agentes de IA do tenant (recepção/agendamento/reativação), playbooks e templates de WhatsApp, página pública de agendamento, campanha Cliente de Volta rodando até o fim da semana 2. Executada por CS/implantador com o `ImplantacaoWizard` (semi-automatizada) — **não consome hora de mentor**.
- **Trilha B — "Feito junto" (mentoria, semanas 1–8):** 8 encontros semanais em grupo (90–120min, ao vivo, gravados) + 2 sessões 1-a-1 pontuais de 30min (diagnóstico na semana 1; checkpoint na semana 5) + grupo de WhatsApp da turma com plantão de dúvidas.

### 3.2 Currículo semana a semana (validado contra os benchmarks)

| Sem. | Encontro | Tema | Entregável da semana | "Feito por nós" em paralelo |
|---|---|---|---|---|
| 1 | E1 | **Diagnóstico e fundação** — números atuais, metas dos 90 dias, leitura do painel | Ficha de diagnóstico + meta assinada | Setup do sistema + migração de dados |
| 2 | E2 | **Posicionamento e preço** — proposta de valor, tabela de preços, combos | Nova tabela de preços publicada | Agentes de IA configurados + booking público no ar |
| 3 | E3 | **Agenda cheia (captação)** — booking online, Google Perfil, parcerias locais | Meta de agendamentos online/semana | Campanha de captação ativada |
| 4 | E4 | **Reativação e carteira** — Cliente de Volta, segmentação da base, régua de retorno | Campanha de reativação rodando; 1º "R$ recuperado" no painel | Playbook Cliente de Volta operado por nós |
| 5 | E5 | **Gestão financeira** — fluxo de caixa, pró-labore, comissões, Lei do Salão-Parceiro | Fechamento mensal no painel + 1-a-1 checkpoint | Relatórios financeiros configurados |
| 6 | E6 | **Equipe e processos** — playbooks de atendimento, agenda da equipe, metas individuais | Playbook de processos do salão | Handoff: dona assume a operação (fim da operação assistida) |
| 7 | E7 | **Marketing local e Instagram** — conteúdo, prova social, campanhas de WhatsApp | Calendário de conteúdo 30 dias | Templates de campanha entregues |
| 8 | E8 | **Plano de crescimento 90 dias + formatura** — leitura final do painel, plano assinado, próximos passos | Plano de 90 dias + certificado + case | Relatório de resultados do programa (R$ recuperado, ocupação, novos clientes) |

> Nota: os 6 temas centrais (posicionamento, financeiro, equipe, vendas, marketing, administração) são exatamente os que Laysa, Lívia e o Método 360º cobrem — o nosso diferencial não é o currículo, é o painel + a operação assistida + IA. O currículo serve de trilho; o painel serve de prova.

### 3.3 Critérios de conclusão/sucesso mensuráveis (o que o painel prova)

- **R$ recuperado** pela campanha Cliente de Volta (métrica-âncora — já é a promessa do Piloto).
- Nº de **agendamentos online** no período (antes = 0 para a maioria).
- **Taxa de ocupação da agenda** (semana 1 vs. semana 8).
- **% da base reativada** (clientes >60 dias sem visita que voltaram).
- Presença: ≥6 dos 8 encontros + implantação concluída (define "concluiu o programa" para fins de garantia condicional).

---

## 4. Oferta (âncora, garantia, escassez, nome)

### 4.1 Âncora de valor (soma honesta, sem inflar)

| Componente | Se comprado avulso | Referência |
|---|---|---|
| Consultoria de implantação/gestão (~30–40h de trabalho nosso) | R$4.000–5.600 | Sebrae/consultor R$70–200/h |
| Mentoria de gestão em grupo, 8 encontros | R$1.300–1.500 | Lívia Puerta, Laysa Strithorst |
| Setup de automação WhatsApp + agentes de IA por agência | R$2.000–5.000 + mensalidade | mercado de agências de automação |
| Playbooks, templates e planilhas do nicho | R$500–1.000 | bônus típicos do mercado |
| **Total âncora** | **R$7.800–13.100** | — |
| **Programa Fundadora** | **12× R$287 (R$3.444)** | ~60% abaixo da âncora |

A âncora é defensável porque cada linha tem preço público de mercado. Evitar âncoras infladas tipo "valor real R$30.000" — o público desse nicho já viu esse truque e o CDC pune oferta enganosa.

### 4.2 Garantia (dupla, com régua no painel)

1. **Incondicional — 7 dias** (obrigatória por lei em venda online, CDC art. 49; Laysa usa 7d, Bianca 15d). Dar com destaque, não esconder.
2. **Condicional de execução — 90 dias:** "Complete a implantação, participe de pelo menos 6 dos 8 encontros e mantenha a campanha Cliente de Volta ativa. Se em 90 dias o seu painel não mostrar em R$ recuperado + agendamentos gerados pelo menos o valor do seu investimento, devolvemos 100%." Mecânica consagrada em infoprodutos BR (Erico Rocha relata taxa de acionamento ~zero em 2.000 vendas; Hormozi documenta 2–4× de conversão com risco-reverso — fontes: [ericorocha.com.br](https://www.ericorocha.com.br/tudo-o-que-voce-precisa-saber-sobre-garantia/), 100M Offers). **Diferencial nosso: a régua é o painel do produto — auditável, sem discussão.**
3. **Nunca** redigir como promessa de ganho ("você VAI recuperar R$X") — isso é publicidade enganosa (CDC art. 37). Garantia é cláusula de reversão de risco no contrato/checkout, não headline do anúncio.

### 4.3 Escassez legítima

- Racional real: implantação done-for-you comporta **1–2 negócios/dia** (mesmo discurso do Piloto atual: "entra no máximo 1 negócio novo por dia — limite real do acompanhamento").
- Estrutura recomendada: **2 turmas de 25** (ou 3 de 15–17), entrada escalonada; "vaga não vendida não acumula" já é a linguagem da LP atual — manter.
- 50 vagas de uma vez, todas simultâneas, quebraria a capacidade e desmentiria a escassez. Turma numerada (Turma 1, Turma 2) resolve e cria ciclo de lançamento.

### 4.4 Nome

- **Manter "Fundadora"**: tem equity com o Piloto atual, conversa com o público (donas), e nenhuma concorrente usa — Laysa/Lívia/360º nomeiam por método. "Condições de fundadora" já está no copy do produto (trial, LP).
- **Abandonar "Pacote"**: pacote = coisa entregue; o novo produto é jornada. Recomendação: **"Programa Fundadora — Turma 1"** (sobrenome descritivo: *implantação + mentoria de gestão em 8 semanas*).
- Alternativas se quiser testar: "Mentoria Fundadora", "Fundadoras 50", "Método Fundadora". Evitar prometer resultado no nome ("Salão Lucrativo em 8 Semanas" = risco CDC + já saturado no nicho).
- Bônus de "fundadora" que reforça o nome: preço da mensalidade SaaS travado vitalício/24 meses para quem é da Turma 1 — âncora de retenção pós-programa.

---

## 5. Matemática de Entrega (horas × ticket × 50 vagas)

**Receita:** 50 × R$3.444 = **R$172.200** brutos. Líquido pós-taxas de checkout/parcelamento 12× com antecipação (Cakto, ~10–13%): **~R$150–155k**.

### Cenário A — 1-a-1 puro (como o Piloto atual) → NÃO FECHA

| Item | Por cliente | × 50 |
|---|---|---|
| 8 encontros 1h + preparação | 12h | 600h |
| Setup/implantação + migração | 4h | 200h |
| Suporte assíncrono | 2h | 100h |
| **Total** | **18h** | **900h** |

- R$3.444 ÷ 18h = **R$191/h brutos** (~R$165 líquidos) — tarifa de consultor Sebrae, não de founder de SaaS pré-lançamento.
- 900h = **30 semanas** a 30h/semana de founder. Com entrada escalonada de 1/dia, a fila dura ~5 meses de carga contínua. Mata as outras frentes.

### Cenário B — coorte em grupo + 1-a-1 pontual (RECOMENDADO)

| Item | Cálculo | Horas |
|---|---|---|
| Encontros em grupo (2 turmas × 8 × 2h) | 32h + 16h preparação (compartilhada) | 48h |
| 1-a-1 pontual (2 × 30min × 50) | diagnóstico + checkpoint | 50h |
| Implantação done-for-you | 3h/cliente com `ImplantacaoWizard` (cai p/ ~1,5h conforme automatiza) | 150h → 75h |
| Suporte grupo WhatsApp | ~4h/semana × 10 semanas | 40h |
| **Total** | | **~288h (213h automatizado)** |

- R$172.200 ÷ 288h = **~R$600/h** implícitos (R$808/h no cenário automatizado).
- Se uma CS/implantadora contratada (R$50–80/h) entrega implantação + suporte (~190–240h), o custo direto fica em **R$12–19k** → **margem direta >80%**, e o founder entrega apenas os 16 encontros de grupo + revisões.
- **Efeito colateral estratégico:** as 50 fundadoras saem com o SaaS implantado e hábito formado → a mentoria é um onboarding pago que financia o CAC e derruba o churn da recorrência (benchmark: onboarding estruturado reduz churn em até 50% no 1º trimestre).

### Sensibilidade

- Vender só 25 vagas: R$86k brutos; cenário B escala para baixo (~170h) e continua saudável. Cenário A continua ruim (450h).
- O breakeven psicológico correto não é "quantas vagas" e sim "quantas horas de founder por real" — no B, cada hora de Marcelo rende 4–5× mais que no A.

---

## 6. Riscos e Armadilhas

1. **CDC art. 37 (publicidade enganosa):** promessa de resultado como argumento central de venda sem base verificável = repercussão civil e até criminal; nicho de mentoria já está no radar (casos no Reclame Aqui; artigos jurídicos recentes). Mentoria é **obrigação de meio, não de resultado** — copy deve prometer o processo e a estrutura, e usar resultados como *casos reais documentados* (com autorização), nunca como garantia de ganho. Fontes: [muitainformacao.com.br](https://muitainformacao.com.br/artigos/a-industria-da-promessa-de-riqueza-na-internet-quando-cursos-e-mentorias-vendem-prosperidade-quem-responde-juridicamente/), [advbox](https://advbox.com.br/blog/consumidor-cdc-publicidade-enganosa/).
2. **CDC art. 49:** os 7 dias de arrependimento em venda online são **incondicionais e irrenunciáveis** — a garantia condicional só pode existir como camada ADICIONAL, nunca substituindo os 7 dias.
3. **Chargeback/inadimplência do 12×:** produto consumido em 8–10 semanas, pago em 12 meses. Mitigar: contrato de prestação de serviço assinado no onboarding, registro de presença/entrega (gravações, checklist de implantação assinado), antecipação de recebíveis no PSP e cláusula de vencimento antecipado em caso de cancelamento da assinatura do cartão.
4. **Churn cliff pós-semana 8:** benchmark do nicho mitiga estendendo convivência (Bianca: 12 meses de acompanhamento; comunidades). Recomendação: alumni com 1 encontro mensal coletivo + preço fundadora travado na mensalidade + metas de 90 dias que "puxam" o uso do painel para além do programa.
5. **Credibilidade de nicho:** as mentoras concorrentes são mulheres ex-donas de salão com prova social forte (250+ salões, 26 anos de mercado). Marcelo é tech/founder. Posicionar como **"implantação + gestão orientada a dados"** (o que elas não têm) e considerar co-facilitação com especialista do nicho (ex.: contadora convidada, como Laysa faz; ou uma dona de salão case como madrinha da turma).
6. **Canibalização/transição do Piloto:** a promessa atual ("Cliente de Volta — 30 dias", 30 vagas, garantia) precisa de sunset explícito na LP e no funil autopilot (Duda/Bia citam a oferta antiga) — senão o lead recebe duas ofertas conflitantes.
7. **Capacidade emocional da turma:** grupo de 25 donas no WhatsApp gera volume de dúvidas operacionais do software; sem uma CS dedicada, isso vaza para o founder e vira o gargalo invisível.

---

## 7. Três Decisões que Só o Marcelo Pode Tomar

1. **Formato e tamanho de turma:** coorte de 25 com trilhos + 1-a-1 pontual (recomendado) vs. 1-a-1 escalonado (900h). Define margem, agenda do founder e experiência da cliente. A recomendação técnica está dada; a decisão é de agenda e de posicionamento.
2. **Quem é o rosto dos 8 encontros:** Marcelo entrega sozinho (autoridade tech, gap de nicho), contrata/associa uma mentora-parceira do segmento (credibilidade, custo ou revenue-share), ou modelo misto (Marcelo = dados/IA/gestão; convidadas = beleza). Nenhuma pesquisa substitui essa escolha — é de marca pessoal.
3. **O que os 12× R$287 compram:** (a) só o programa, com SaaS cobrado à parte desde o mês 1; (b) programa + 12 meses de SaaS inclusos (bundle), com recorrência começando no mês 13 a preço fundadora. A opção (b) é mais vendável e trava 12 meses de uso, mas embute o "segundo churn" no mês 13 e muda o reconhecimento de receita/comissionamento no PSP. Decisão de estrutura de oferta e de caixa.

---

## Fontes principais

- [Laysa Strithorst — Mentoria Salão de Sucesso](https://www.laysastrithorst.com/mentoriasalaodesucesso2) · [Mentoria 30 Dias](https://www.laysastrithorst.com/mentoria30dias)
- [Lívia Puerta — Mentoria Gestor Beauty](https://liviapuerta.com/)
- [Bianca Belchior](https://biancabelchior.com.br/)
- [Comunidade da Beleza — Método 360º](https://comunidadedabeleza.com.br/)
- [Group Essencial — Mentoria G.E.T.I](https://groupessencial.com.br/cursos-e-treinamentos/mentoria-geti-de-gestao/)
- [Clínicas de Elite](https://www.clinicasdeelite.com/) · [Daniela Fidellis](https://www.danielafidellis.com.br/consultoria-para-clinicas-de-estetica/)
- [AMHT — Aceleração Mulher High Ticket](https://portalvf.com.br/amht/)
- [Sebrae SP — Solução Setorial Salão de Beleza](https://sebrae.com.br/sites/PortalSebrae/ufs/sp/programas/programa-solucao-setorial-para-salao-de-beleza,fc2649b99534c610VgnVCM1000004c00210aRCRD) · [Sebrae RJ — Inova Beleza Gestores](https://sebraerj.com.br/projeto-inova-beleza-gestores) · [Tabela de Valores Sebrae-SP](https://contato.sebraesp.com.br/wp-content/uploads/TabelaValores.pdf)
- [RDD10+ — Valor-hora de consultorias no Brasil 2024-2025](https://www.robertodiasduarte.com.br/analise-do-valor-hora-em-consultorias-no-brasil-2024-2025-2/)
- [Trinks — Planos (migração/onboarding grátis)](https://negocios.trinks.com/planos/)
- [Baita — Churn SaaS B2B (Totango: onboarding reduz churn até 50%)](https://baita.ac/insights/como-reduzir-churn-em-saas-b2b-br-mo95mtux) · [Administradores — retenção em SaaS](https://www.administradores.com.br/artigos/retencao-de-clientes-em-saas-do-onboarding-a-renovacao-como-evitar-churn-em-produtos-recorrentes)
- [Erico Rocha — garantias em infoprodutos](https://www.ericorocha.com.br/tudo-o-que-voce-precisa-saber-sobre-garantia/)
- [Muita Informação — responsabilidade jurídica de mentorias com promessa de riqueza](https://muitainformacao.com.br/artigos/a-industria-da-promessa-de-riqueza-na-internet-quando-cursos-e-mentorias-vendem-prosperidade-quem-responde-juridicamente/) · [Advbox — CDC e publicidade enganosa](https://advbox.com.br/blog/consumidor-cdc-publicidade-enganosa/)

---

*Relatório de pesquisa — não commitado por instrução. Par: `MENTORIA-FUNDADORA-RESEARCH-2026-07-14.html` (mesmo conteúdo, tema dark).*
