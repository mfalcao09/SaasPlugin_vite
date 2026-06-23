# VITRINE QUE VENDE — NexvyBeauty

> **Blueprint + Roadmap + Business Case** da camada de USABILIDADE + APRESENTAÇÃO que faz o motor já construído virar visível, fácil e vendável para a cabeleireira leiga.
>
> **Data:** 2026-06-23 · **Autor:** Cofundador C-level de Produto (discovery-architect) · **Premissa fixada (não relitigada):** nossa infra/backend é melhor que a do concorrente. O problema é só (1) usabilidade horrível e (2) não vende.
>
> **Critério de sucesso global (binário):** a cabeleireira abre e em <30s vê a IA trabalhando por ela; consegue operar cada função sem manual; o demo fecha venda.

---

## 0. A verdade desconfortável primeiro

O concorrente (BeautyFlow / cloud-beauty-ai) **não tem produto** — tem uma tela. Todo o CRM/Atendimento/Agentes dele está "EM BREVE". Ele tem UMA coisa que nós não temos: uma **Home que mostra R$ 18.400 recuperável e um botão de 1 clique**, com zero config. Isso é o jogo inteiro. Ele vende a *promessa do número*; nós escondemos o *motor que gera o número*.

E o pior: **nós já temos o motor que gera esse número exato.** O Radar IA (`opportunity-scan-run`) já roda SEM configuração, já classifica leads em HOT/WARM/COLD e **já calcula `potential_revenue`** (soma de `deal_value`). Está enterrado em `/admin → Automação & IA → Radar`, atrás de filtros e de um botão "Rodar Análise". Estamos sentados em cima da arma do concorrente, com a trava de segurança ligada.

**Conclusão:** a vitrine não é um projeto de backend. É um projeto de **embrulho**. O risco real não é "será que dá pra construir" — é "será que vamos continuar enterrando o que já funciona". A maior parte deste plano é UI, navegação, copy e empty-states-que-vendem. Quase nada é motor novo.

Onde eu **discordo de uma possível leitura sua:** a tentação vai ser "copiar a Home do BeautyFlow". Não copie a tela dele — **copie a psicologia dela** (número de dinheiro + 1 clique + zero config) e plugue no NOSSO motor real, que entrega o número de verdade em vez de vaporware. A vantagem não é estética; é que o botão dele não faz nada e o nosso dispara uma campanha real via WhatsApp Evolution.

---

## 1. PREMISSAS EXPLÍCITAS (Karpathy §8.1) — confirme ou ajuste

| # | Premissa que estou assumindo | Por quê | Se errada, muda... |
|---|------------------------------|---------|--------------------|
| P1 | **Persona-alvo = dona-operadora de salão pequeno** (1–5 profissionais), faz tudo sozinha, sem equipe de marketing, leiga em tech. | É quem o briefing descreve ("cabeleireira sem dev"). | Toda a copy e a profundidade do onboarding. |
| P2 | O **JTBD nº1 dela = "encher minha agenda / não perder cliente"** — não "gerenciar um CRM". Ela contrata a ferramenta pra ter mais cliente atendido, não pra ter dashboards. | É o resultado de negócio dela; CRM é meio. | O que a Home mostra primeiro. |
| P3 | O **momento de valor (AHA) = ver dinheiro recuperável + a IA já tendo escrito a mensagem** — sem ela configurar nada. | É exatamente o que o Radar IA já produz e o que o concorrente vende. | A arquitetura inteira da vitrine. |
| P4 | A **maioria entra por WhatsApp já em uso** — ela já conversa com cliente no zap; o moat Evolution conecta o que ela já faz. | Inbox Evolution é real e é o diferencial. | O passo 1 do onboarding (conectar WhatsApp primeiro). |
| P5 | **Trial existe e a conversão trial→pago é o gargalo** (não a aquisição de topo). Por isso o Monte Carlo otimiza `capture_rate`/conversão, não tráfego. | Tiers Trial/Starter/Pro/Enterprise já no DB; o produto "não vende" = não converte quem entra. | Onde investir esforço (ativação, não ads). |
| P6 | A **vitrine reusa 100% do motor existente** (Radar, Agentes, Campanhas, Cadências, Evolution, ERP, booking). Nada de backend novo na Onda 1–2. | Inventário confirma que tudo é real, não mock. | O roadmap (se algo for mock, vira onda extra). |

> **As 3 que mais importam, verbatim:** (P3) o AHA é "dinheiro + mensagem pronta, zero config"; (P5) o gargalo é conversão de trial, não tráfego; (P6) é embrulho, não motor. Se qualquer uma dessas estiver errada, pare e me chame antes da Onda 1.

---

## 2. JOBS-TO-BE-DONE da cabeleireira (a régua de toda tela)

| Quando... | ela quer... | pra que... | a vitrine entrega via... |
|-----------|-------------|------------|--------------------------|
| Abre o app de manhã | ver se tem dinheiro escapando | não perder cliente parado | **Home de Valor** (Radar na cara) |
| Um cliente sumiu | reativá-lo sem pensar na mensagem | trazer de volta sem esforço | botão **[Reativar]** 1 clique (msg pronta) |
| Chega mensagem no zap | responder rápido e bem | não perder a venda por demora | **Inbox unificado** + IA Copiloto sugerindo |
| Quer atender mais | ter a IA puxando conversa sozinha | crescer sem contratar | **Agentes operando** (visível, não no admin) |
| Vai marcar horário | agenda que não dá conflito | dia organizado | **Agenda** (ERP Salão) |
| Quer que cliente marque sozinho | link que ela manda no zap/bio | menos ligação, mais booking | **Booking /s/:slug** |

A régra de ouro para revisar qualquer tela: **"isso ajuda a encher a agenda dela em menos de 3 cliques, ou é só um recurso que estamos exibindo?"**

---

# PARTE I — BLUEPRINT (arquitetura da vitrine)

## 3. O problema estrutural do as-is (mapeado no código)

O app tem **5 shells com navegações diferentes** (ModuleHub `/`, CRM `/crm`, ERP Salão `/salao`, Admin `/admin`, Super Admin). A mesma usuária precisa aprender 4 sidebars distintas. As funções de IA que vendem estão **enterradas a 3 cliques** dentro do Admin, num acordeão "Automação & IA", num shell que parece painel de TI.

**Profundidade atual das funções que deveriam ser a estrela:**

| Função (o motor que vende) | Onde está hoje | Cliques | Abre vazio? | Mostra dinheiro? |
|----------------------------|----------------|:------:|:-----------:|:----------------:|
| **Radar IA** (calcula receita recuperável) | `/admin?tab=...radar` | 3 | Não (carrega candidatos) | **SIM (já!)** mas escondido |
| Agentes IA | `/admin?tab=agents` | 3 | Sim | Não |
| Campanhas Inteligentes | `/admin?tab=campaigns` | 3 | Sim | Sim (relatório) |
| Cadências | `/admin?tab=cadences` ou `/crm?tab=cadence` | 2–3 | Sim | Não |
| IA Copiloto | `/crm?tab=ai` | 2 | Sim (genérico) | Não |
| Inbox WhatsApp (Evolution) | `/admin?tab=inbox` ou `/crm?tab=inbox` | 2 | Não | Não |
| Agenda / ERP Salão | `/salao/agenda` | 3 | Sim (crua) | Não |
| Booking público | `/s/:slug` | link | — | — |

**Diagnóstico em uma frase:** a função mais vendável do produto (Radar IA = dinheiro na frente) está a 3 cliques de profundidade, num shell de TI, atrás de um acordeão. **Está tudo construído e tudo escondido.**

## 4. A arquitetura da vitrine: UMA navegação, dinheiro na frente

### 4.1 Princípio: colapsar 5 shells em 1 "Cockpit"

Substituir o ModuleHub (grid de cards que obriga a escolher "para onde ir") por um **Cockpit** — um shell único com **uma sidebar de no máximo 7 itens em linguagem de salão**, que é a casa de tudo o que a cabeleireira faz. O Admin/Super-Admin continua existindo como "Configurações avançadas" (para você, não para ela), mas some da rota principal dela.

```
COCKPIT (shell único — substitui ModuleHub como home logada)
│
├─ 🏠 Início            → HOME DE VALOR (Radar na cara + ações 1 clique)   [a estrela]
├─ 💬 Conversas         → Inbox WhatsApp unificado (Evolution) + IA Copiloto
├─ 🤖 Minha IA          → Agentes operando (visível) + Campanhas + Cadências (renomeadas)
├─ 📅 Agenda            → ERP Salão (agenda, clientes, serviços, profissionais)
├─ 💰 Dinheiro          → Financeiro + resultado das campanhas + booking
├─ 🔗 Meu link          → Booking /s/:slug (compartilhar) + captação
└─ ⚙️  Ajustes          → o que hoje é Admin/Configurações (escondido, avançado)
```

Regra: **a cabeleireira nunca vê as palavras "módulo", "agente", "instância", "cérebro", "pipeline", "orquestrador"**. Vê "minha IA", "meu link", "conversas", "dinheiro".

### 4.2 A HOME DE VALOR (a tela que decide a venda)

Ao abrir o Cockpit, **antes de qualquer config**, dispara-se uma chamada ao Radar IA (`opportunity-scan-run`) com filtros default (zero config) e renderiza-se:

```
┌─────────────────────────────────────────────────────────────┐
│  Bom dia, Ana 👋   Sua IA trabalhou enquanto você dormia.    │
│                                                              │
│   💰  R$ 4.850  podem voltar pro seu caixa esta semana       │
│       7 clientes prontos pra reativar  ·  análise de agora   │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ 🔥 Quentes 3 │ │ 🟡 Mornos 4  │ │ ❄️ Frios 12  │         │
│  │ R$ 2.100     │ │ R$ 1.450     │ │ R$ 1.300     │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                              │
│  TOP 3 OPORTUNIDADES (mensagem já escrita pela IA):          │
│  • Júlia — sumiu há 32 dias · "Oi Júlia! Faz tempo..."       │
│        [ Disparar reativação ]  ← 1 clique, vai pelo zap     │
│  • Marcos — pediu orçamento e não voltou · "..."  [Disparar] │
│  • Bia — aniversário semana que vem · "..."       [Disparar] │
│                                                              │
│  [ Disparar campanha pra todos os 7 ]   [ Ver análise ]      │
└─────────────────────────────────────────────────────────────┘
```

Tudo isso já existe no backend: `opportunity_scan_items` traz `lead_snapshot`, `suggested_action`, `followup_message` e `potential_revenue`; o disparo usa `campaign-start` + `evolution-send`. **A vitrine é o componente de Home que consome o que o Radar já devolve.** O botão, ao contrário do concorrente, dispara uma campanha de verdade.

### 4.3 Estado vazio que JÁ vende (o truque do demo)

Hoje os empty-states são crus ("Nenhum agendamento cadastrado"). Na vitrine, **todo estado vazio é uma demonstração com dado-semente claramente rotulado "exemplo"**, com 1 CTA. Já existe `demo-seed.ts` (DEMO_DASHBOARD: R$ 18.750/mês, 214 clientes etc.) usado nas rotas `/demo` — **reusar esse seed dentro da conta logada** quando não há dados reais. A Home, no trial sem dados, mostra o Radar com 3 oportunidades-exemplo + selo "exemplo — conecte seu WhatsApp pra ver os seus de verdade". Isso transforma a tela vazia em vitrine viva.

### 4.4 Mapa anti-Frankenstein (origem → destino)

| Peça da vitrine | REUSA (origem no código) | É NOVO? |
|-----------------|---------------------------|--------|
| Home de Valor (Radar na cara) | `useOpportunityScans` + `opportunity-scan-run` + `opportunity_scan_items` | **Só o componente de Home** (consome o existente) |
| Botão "Disparar reativação" | `campaign-start` + `evolution-send` + `followup_message` | Não — fio entre existentes |
| Cockpit (nav única) | `UnifiedShell` + rotas existentes | Reconfiguração de nav (não motor) |
| Conversas | `SellerInbox`/`InboxManager` + `evolution-webhook` + `inbox-copilot` | Unificar 2 inboxes num só |
| Minha IA | `AgentsManager` + `CampaignsManager` + `CadencesManager` | Re-skin + estado "operando" + copy leiga |
| Agenda | `salao/*` + `demo-seed.ts` | Empty-state vendedor |
| Meu link | `PublicSalaoBooking` `/s/:slug` | Tela "compartilhe" + QR |
| Demo/seed na conta | `demo-seed.ts` (já existe) | Hook que injeta seed rotulado quando vazio |

**Risco Frankenstein controlado:** há HOJE dois Inbox (CRM `SellerInbox` e Admin `InboxManager`) e duas portas pra Cadência. A vitrine **escolhe uma de cada** e aposenta a duplicata da navegação da cabeleireira (a outra fica só no Admin avançado). Sem isso, a "nav única" vira nav-dupla disfarçada.

## 5. A vitrine FUNÇÃO POR FUNÇÃO (todas cobertas)

| Função | Momento de valor (o "AHA") | Estado vazio que vende | Microcopy de venda (troca o jargão) |
|--------|----------------------------|------------------------|-------------------------------------|
| **Home de Valor** | "tem R$ X esperando, a IA já escreveu a mensagem" | Radar com 3 exemplos rotulados + CTA conectar zap | "Sua IA trabalhou enquanto você dormia" |
| **Conversas** | responde em 1 clique com sugestão da IA | 3 conversas-exemplo + "conecte seu WhatsApp" | "Atendimento" → **"Conversas"**; "copiloto" → **"a IA te ajuda a responder"** |
| **Minha IA** | ver o agente "no ar" atendendo sozinho | card "Ligue sua IA" com preview da 1ª mensagem | "agente/orquestrador" → **"sua assistente"**; "cadência" → **"sequência de mensagens"**; "campanha" → **"convidar vários clientes de uma vez"** |
| **Agenda** | agenda do dia já populada (seed) | dia-exemplo cheio + "adicione seu 1º horário" | "Seu dia organizado, sem conflito de horário" |
| **Dinheiro** | ver quanto a IA trouxe de volta | gráfico-exemplo + "suas vendas aparecem aqui" | "Financeiro" → **"Dinheiro"**; mostra "recuperado pela IA: R$ X" |
| **Meu link** | copiar link e mandar no story/bio | preview da página de booking + botão copiar/QR | "seu link de agendamento — mande no Instagram" |
| **Onboarding** | em <3 min: zap conectado + IA ligada + 1 oportunidade real | — | foco em resultado, não em "cadastre" |

## 6. Onboarding enxuto (de 9 passos modais → 3 passos que entregam valor)

O onboarding atual tem 9 passos num modal escuro que rola dentro do dialog. **Cortar para 3 passos full-page, na ordem do valor**, com os demais virando "complete depois" não-bloqueantes:

1. **Conecte seu WhatsApp** (QR) — porque é o moat e a fonte do dado do Radar. (reusa passo 6 atual)
2. **Ligue sua IA** (1 pergunta: "o que você faz?" → preenche o agente via IA do site/texto). (reusa passos 5+7)
3. **Veja sua 1ª oportunidade** — roda o Radar e mostra 1 lead real (ou exemplo) com mensagem pronta → **fecha o onboarding com um AHA, não com um resumo de config.**

Profissionais/serviços/equipe (passos 3,4,8 atuais) viram tarefas opcionais no checklist da Home, preenchíveis depois. **Regra: nenhum passo que não termine em valor visível fica no caminho crítico.**

---

# PARTE II — ROADMAP (ondas por impacto-de-venda × esforço)

## 7. Visão das ondas

| Onda | Tema | Impacto de venda | Esforço | Por que nessa ordem |
|:----:|------|:----------------:|:-------:|---------------------|
| **1** | **Dinheiro na frente** (Home de Valor + 1 clique) | 🟢🟢🟢 Altíssimo | 🟡 Médio-baixo | É o AHA, reusa Radar pronto, fecha demo |
| **2** | **Nav única (Cockpit) + onboarding 3 passos** | 🟢🟢🟢 Alto | 🟡 Médio | Sem isso, a leiga se perde depois do AHA |
| **3** | **Conversas + Minha IA visível** (re-skin + copy) | 🟢🟢 Alto | 🟡 Médio | Tira o motor do Admin, mostra IA operando |
| **4** | **Empty-states que vendem + seed na conta** | 🟢🟢 Médio-alto | 🟢 Baixo | Barato, eleva percepção em todas as telas |
| **5** | **Agenda/Salão + Meu link polidos** | 🟢 Médio | 🟡 Médio | Completa a casa; menos crítico pra 1ª venda |
| **6** | **Demo que se vende sozinho** (modo tour público) | 🟢🟢 Alto (GTM) | 🟡 Médio | Vira ativo de vendas/afiliados |

> **Sequência por dependência:** Onda 1 não depende de nada (Radar já existe). Onda 2 depende de decidir a nav (D2–D4 abaixo). Onda 3 depende da nav da Onda 2. Ondas 4–6 são paralelizáveis após a 2.

## 8. ONDA 1 detalhada — "Dinheiro na frente" (o caminho crítico)

**Objetivo:** ao abrir, em <30s a cabeleireira vê dinheiro recuperável + dispara reativação em 1 clique. **Sem novo backend.**

| # | Entrega | Reusa | Critério de sucesso (binário) |
|---|---------|-------|-------------------------------|
| 1.1 | Componente **HomeDeValor** que, no mount, chama `opportunity-scan-run` com filtros default | `useOpportunityScan`, `opportunity-scan-run` | Abrir a Home dispara 1 scan sem nenhum clique/config; resposta renderiza em <5s ou mostra skeleton→dado |
| 1.2 | **Card de receita** "R$ X recuperável esta semana" + 3 cards HOT/WARM/COLD com `potential_revenue` | `opportunity_scan_items.potential_revenue` | O valor exibido == soma de `deal_value` dos itens do scan (conferir 1 caso real) |
| 1.3 | **Top 3 oportunidades** com `followup_message` já preenchida | `opportunity_scan_items.followup_message` | Cada card mostra nome do lead + mensagem pronta vinda do item (não placeholder) |
| 1.4 | **Botão [Disparar reativação]** 1 clique → `campaign-start` (ou `evolution-send` direto) | `campaign-start`, `evolution-send` | Clicar dispara envio real via Evolution e some o card com toast "enviada"; logado em `campaigns`/conversa |
| 1.5 | **Estado de trial/sem-zap:** Home com 3 oportunidades-exemplo (seed) rotuladas "exemplo" + CTA "conectar WhatsApp" | `demo-seed.ts` | Conta nova sem WhatsApp mostra a Home cheia (exemplo), nunca tela vazia |
| 1.6 | **Roteamento:** `/` logado (não-admin) abre a HomeDeValor (não o grid de cards) | rotas App.tsx | Após login, 1ª tela é a HomeDeValor; screenshot prova |

**Definition of Done da Onda 1 (prova de funcionamento):** gravar um vídeo/screenshots de login → Home com número de R$ → clicar [Disparar] → mensagem chega num WhatsApp de teste. Se a mensagem não chega de verdade, a onda não está pronta (CLAUDE.md §4).

## 9. Riscos & mitigações

| Risco | Prob. | Impacto | Mitigação |
|-------|:----:|:------:|-----------|
| Radar sem dados em conta nova → Home vazia mesmo com vitrine | Alta | Alto | Seed-exemplo rotulado (1.5) é parte da Onda 1, não opcional |
| `opportunity-scan-run` lento/custo por chamada a cada Home | Média | Médio | Cachear último scan (`opportunity_scan_schedules`/cron diário) e mostrar "análise de hoje"; só re-roda sob demanda |
| Disparo em massa vira spam / bloqueio do número | Média | Alto | Throttle no `campaign-dispatcher` (já existe), confirmação antes de "disparar pra todos", opt-out |
| Nav única quebra fluxos do Admin que você usa | Média | Médio | Admin avançado permanece intacto em `/admin`; Cockpit é camada nova, não remoção |
| Dois Inbox divergem (Frankenstein) | Média | Médio | Onda 3 escolhe UM inbox para a cabeleireira; o outro fica só no Admin |
| Copy "leiga" infantiliza usuária PRO | Baixa | Baixo | Teste com 3 cabeleireiras reais antes de cravar termos |

---

# PARTE III — BUSINESS CASE (Monte Carlo)

## 10. Método

Modelo `saas` do motor Monte Carlo, 30.000 simulações, seed fixa. `capture_rate` = funil completo (cabeleireira que entra em trial × converte em pagante) — **é a variável onde a vitrine atua** (packaging + usabilidade movem conversão, não tráfego). Horizonte: ano 1. Faixas estimadas (3 pontos) por julgamento; refinar com dados reais de trial assim que existirem.

## 11. Resultado: AS-IS vs COM VITRINE

| Métrica (ano 1) | AS-IS (P10 · P50 · P90) | COM VITRINE (P10 · P50 · P90) | Leitura |
|-----------------|:-----------------------:|:-----------------------------:|---------|
| **Clientes pagantes** | 24 · 48 · 91 | **46 · 90 · 163** | ~**+87%** na mediana |
| **ARR** | R$ 49k · **R$ 107k** · R$ 212k | R$ 96k · **R$ 199k** · R$ 386k | **+86%** na mediana de ARR |
| **MRR** | R$ 4,1k · 8,9k · 17,7k | R$ 8,0k · **16,6k** · 32,2k | quase dobra |
| **LTV/CAC** | 1,7 · 2,9 · 4,9 | 3,1 · **5,4** · 9,3 | sai de "no limite" para "saudável" |
| **Payback (meses)** | 1,8 · 3,0 · 4,6 | 1,5 · 2,5 · 3,9 | já era ótimo, melhora |
| **P(LTV/CAC ≥ 3)** | **46,2%** | **91,6%** | **a vitrine é o que torna o negócio defensável** |
| **P(payback ≤ 12m)** | 100% | 100% | unit economics nunca foi o problema |

## 12. A alavanca dominante (tornado)

Em ambos os cenários, as variáveis de maior correlação com o ARR são **`tam` e `capture_rate`** (ambas ~+0,62–0,65). `price_monthly` vem em terceiro (~+0,40). **`churn`, `cac` e `gross_margin` têm corr ≈ 0 — são ruído.**

**Tradução de decisão:**
- **Aja na conversão (`capture_rate`)**, não no preço, no CAC ou na retenção. A vitrine (Home de Valor + onboarding-AHA + nav única) ataca exatamente essa alavanca.
- **Pare de discutir churn/CAC/margem como prioridade** — o tornado diz que mexer neles quase não move o ARR no ano 1. O dinheiro está em fazer mais gente que entra virar pagante.
- `tam` empata como alavanca, mas é mais lento de mover (depende de aquisição); `capture_rate` é o que VOCÊ controla com produto esta semana.

## 13. Veredito

**Aposte na vitrine se** você acredita que conversão trial→pago hoje está baixa por usabilidade/packaging (P5) — e tudo no as-is confirma isso. O business case mostra: a vitrine **quase dobra o ARR mediano e leva a probabilidade de um negócio saudável (LTV/CAC≥3) de 46% para 92%**. **O risco mora em:** conta nova sem dados (mitigado por seed) e disparo virar spam (mitigado por throttle). **A alavanca é:** conversão — e a vitrine é, literalmente, a alavanca da conversão. Não é estética; é o motor de receita.

> **Honestidade do modelo:** P(ARR ≥ R$ 500k) é ~3% mesmo com vitrine — meio-milhão de ARR ano 1 é cenário de cauda com este TAM/preço. A vitrine não promete escala de foguete no ano 1; promete **transformar um negócio no limite (46% de chance de ser saudável) num negócio robusto (92%)**. Para passar de R$ 500k, a alavanca seguinte é `tam` (aquisição) — assunto da Onda 6 (GTM) e de pricing, não desta vitrine.

---

## 14. GTM: como o demo se vende sozinho (Onda 6)

A Home de Valor **é** o pitch. Um modo "tour" público (estende `/demo`) que mostra a HomeDeValor com seed-exemplo + 1 clique simulado = uma cabeleireira entende o produto em 30s sem login. Esse mesmo asset vira: vídeo de Instagram, página de vendas (`/vendas` já existe), e material de afiliado. **Loop de growth:** booking `/s/:slug` carrega marca "feito com NexvyBeauty" → cada cliente que agenda vê o produto → cabeleireira indica cabeleireira. Loops compõem; funis esgotam.

---

## 15. Handoff

Com este plano aprovado (e as decisões §16 cravadas), o próximo passo é handoff para **SPDD** — spec por módulo, começando pela **Onda 1 / HomeDeValor**, com os critérios binários da §8 virando os testes de aceitação. Nada de código de produção antes disso.

---

## 16. As 8–12 decisões de maior alavancagem (crave estas, Marcelo)

1. **Confirma o AHA (P3)?** A Home abre rodando o Radar e mostrando R$ recuperável + mensagem pronta — esse é o "dinheiro na frente". Sim/ajusta?
2. **Cockpit substitui o ModuleHub como home da cabeleireira?** (Admin continua existindo só pra você.) Ou você quer manter o grid de cards?
3. **Os 7 itens da nav única** (Início/Conversas/Minha IA/Agenda/Dinheiro/Meu link/Ajustes) — aprova essa taxonomia em linguagem de salão, ou quer outra divisão?
4. **Inbox: qual fica?** Hoje há `SellerInbox` (CRM) e `InboxManager` (Admin). Pra cabeleireira, escolhemos UM. Qual é a base — CRM ou Admin?
5. **Onboarding 3 passos** (WhatsApp → Ligue a IA → Veja 1 oportunidade), o resto vira opcional. Aprova cortar de 9 → 3?
6. **Radar na Home: cacheado (1 scan/dia via cron) ou ao vivo a cada abertura?** Cache é mais barato e estável; ao vivo é mais "mágico" mas custa por chamada. Minha recomendação: **cache diário + botão "atualizar agora"**.
7. **Disparo de reativação:** 1 clique já envia, ou pede confirmação? Para "disparar pra todos", recomendo confirmação (anti-spam). Concorda?
8. **Vocabulário leigo:** aprova trocar agente→"sua assistente", cadência→"sequência de mensagens", campanha→"convidar vários clientes", financeiro→"dinheiro"? Ou tem termos que a sua base já usa e prefere manter?
9. **Seed-exemplo na conta nova:** topa mostrar dados-exemplo rotulados "exemplo" na conta logada vazia (não só em `/demo`)? É o que faz a tela vazia vender.
10. **Trial→pago é mesmo o gargalo (P5)?** Você tem número real de quantos % dos trials viram pagantes hoje? Esse dado recalibra o Monte Carlo de estimativa para realidade.
11. **Persona (P1):** o alvo da vitrine é a dona-operadora de salão pequeno, ou você quer mirar também salões médios com recepcionista (muda profundidade da UX)?
12. **Escopo da Onda 1:** topa que a 1ª entrega seja SÓ a HomeDeValor + 1 clique (sem mexer na nav ainda), pra ter o AHA no ar rápido e medir conversão antes de reestruturar tudo?

> Responda pelo menos 1, 2, 4, 6, 10 — essas cinco destravam o início da Onda 1 e calibram o business case. As outras podem ser cravadas na transição pra Onda 2.
