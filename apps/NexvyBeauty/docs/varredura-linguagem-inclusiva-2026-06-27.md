# Varredura de linguagem inclusiva — NexvyBeauty (UI multi-nicho)

> **Objetivo:** o sistema atende salão de cabelo **e também** lash designer, nail/manicure, sobrancelha e podologia. A UI não pode falar só com "cabeleireira" nem só com "salão". Esta é a **varredura minuciosa** (6 agentes, leitura integral de ~40 arquivos) com o mapa de terminologia + ocorrências user-facing.
> **Status:** proposta para aceite. **Nenhuma string trocada ainda.**
> **Data:** 2026-06-27 · **Fonte:** workflow `varredura-linguagem-inclusiva`.

---

## 0. TL;DR

- **~40 ocorrências de "salão"** user-facing **no app** (fora código: rotas `/salao`, ids `erp_salao`, `salon_name` não mudam) → trocar por **"negócio"**.
- **~11 ocorrências na landing de vendas** (`/vendas`) — decisão à parte (marketing).
- **~12 ocorrências de gênero feminino fixo** ("das clientes", "essa cliente", "sumidas", "deixa você linda") → masculino genérico ou neutro ("contato").
- **~15 exemplos 100% cabelo** (seeds/placeholders) → **diversificar** (incluir unha/lash/sobrancelha/podologia), não remover.
- **Ícone tesoura (Scissors)** em itens multi-nicho + **emoji 💁‍♀️** → neutralizar.
- **Não mexer:** Termos de Uso (`legalContent.ts` — escopo contratual, revisão jurídica), tagline "Beleza", template de quiz de nicho, falsos-positivos ("cheia" concorda com "agenda").

---

## 1. Mapa canônico (de → para)

| De | Para | Quando |
|---|---|---|
| **salão** (o negócio do usuário) | **negócio** | padrão institucional: "Seu salão hoje"→"Seu negócio hoje", "Painel do Salão"→"Painel do Negócio", "Gestão do Salão"→"Gestão do Negócio" |
| **salão** (tom quente, msg ao cliente) | **aqui / com a gente** | "aqui no salão"→"aqui" / "por aqui"; "no salão"→remover |
| **cabeleireira / dona do salão** | **profissional / você** | hoje só em **comentários** (não user-facing); regra fica pra copy futura |
| **as/suas clientes · essa cliente · sumidas/inativas/parada** | **os/seus clientes · esse cliente · sumidos/inativos** (ou neutro **"contato(s)"**) | masculino é o genérico em PT-BR; a base não é 100% feminina |
| **escova/corte/coloração/progressiva** (exemplos) | **mix de nichos** (+ unha/lash/sobrancelha/podologia) | exemplos não somem — só param de ser 100% cabelo |
| **ícone Scissors (tesoura)** | **Users / Sparkles / Award** | em itens multi-nicho (Serviços, Profissionais, Profissional destaque) |
| **💁‍♀️ (emoji mulher)** | **💁 / ✨ / 💕** | mensagens ao cliente não presumem profissional mulher |
| **deixa você linda** | **cuida de você** | adjetivo de gênero no pitch-exemplo |

---

## 2. "salão" → "negócio" — no APP (acionável, ~40)

> Em todas: a **rota/id** (`/salao`, `erp_salao`, `salon_name`) é **código → NÃO muda**. Só o texto visível.

| Arquivo:linha | Atual | Sugerido |
|---|---|---|
| `cockpit/Inicio.tsx:171` | "...vinculada a um **salão**..." | ...a um **negócio**... |
| `cockpit/Inicio.tsx:180` | "**Seu salão** hoje" (h1) | **Seu negócio** hoje |
| `cockpit/CaptacaoHub.tsx:36` | "...mais gente para o **seu salão**..." | ...para o **seu negócio**... |
| `cockpit/home/OpportunityCard.tsx:62` | "Quero isso no **meu salão**" | ...no **meu negócio** |
| `cockpit/DemoCockpitHome.tsx:73` | "Quero isso no **meu salão**" | ...no **meu negócio** |
| `cockpit/DemoCockpitHome.tsx:105` | "Ver o painel do **salão**" (texto do link) | ...do **negócio** |
| `cockpit/nav.tsx:57` | "Relatórios do **salão**" | Relatórios do **negócio** |
| `components/layout/UnifiedShell.tsx:65` | "Painel do **Salão**" | Painel do **Negócio** |
| `components/layout/Sidebar.tsx:199` | "ERP **Salão**" | ERP do **Negócio** / só "ERP" |
| `config/modules.ts:42` | "Gestão do **Salão**" (card módulo) | Gestão do **Negócio** |
| `config/modules.ts:45` | "...profissionais do **seu salão**." | ...do **seu negócio**. |
| `pages/salao/_shared.tsx:49,55` | título shell "Gestão do **Salão**" | Gestão do **Negócio** (sincronizar c/ modules) |
| `pages/salao/_shared.tsx:99` | "...usar a gestão do **salão**." | ...usar o sistema. |
| `pages/salao/Dashboard.tsx:157` | "Visão geral do **seu salão**" | ...do **seu negócio** |
| `pages/salao/ActivationChecklist.tsx:67,25` | "Ative **seu salão**" / "Quem atende no **salão**" | Ative **seu negócio** / no **seu negócio** |
| `pages/ModuleHub.tsx:27` | "O dia a dia do **seu salão**" | ...do **seu negócio** |
| **Onboarding** `GuidedOnboarding.tsx` 95,399,401,414,375,692 | "Seu salão" (stepper, título, saudação, placeholder, toast, DoneStep) | "Seu negócio" (6 strings) |
| `GuidedOnboarding.tsx:434,392` | slug placeholder "seu-salao" | "seu-negocio" |
| `components/onboarding/registry.tsx:43` | "Serviços do **salão**" (stepper) | Serviços do **negócio** |
| `components/onboarding/steps/SalaoProfissionaisStep.tsx:56` | "Quem atende no **seu salão**?" | ...no **seu negócio**? |
| `components/onboarding/steps/OficinaServicesStep.tsx:73,75` | "Serviços do **salão**" + desc "seu salão" | ...do **negócio** |
| `components/sales/LeadCaptureModal.tsx:112,144,191` | "...do **seu salão**" / "Instagram do **salão**" / "Nome do **salão**" | ...do **negócio** (3) |
| `components/lead/LeadDetailPage.tsx:164,174` | tooltips "cliente do **salão**" / "Agenda do **salão**" | ...do **seu negócio** / "Agenda" |
| `hooks/useLeadToCliente.ts:90` | toast "...cliente do **salão**." | ...cliente do **seu negócio**. |

### Mensagens WhatsApp ao cliente final (decisão à parte — §9)
`cockpit/levers.ts:135,138,140` · `cockpit/Automacoes.tsx:34` · `cockpit/AcoesClientes.tsx:228,229` — "aqui no salão" / "no salão" → "aqui" / "por aqui". São templates enviados às clientes do negócio.

---

## 3. Landing de vendas `/vendas` (SalesPage) — ~11 (decisão à parte)

Hero, "Como funciona", FAQ, pricing ("Para salões…"), `document.title`, badge, rodapé — todas "salão/salões" → "negócio(s)". **Pergunta:** a LP de marketing entra no escopo ou fica focada no nicho "salão"? (Ex.: o FAQ `:108` **já diversifica** — "barbearia, nail bar, clínica" — esse é defensável manter.)

---

## 4. Gênero feminino fixo → neutro (~12)

| Arquivo:linha | Atual | Sugerido |
|---|---|---|
| `cockpit/Inicio.tsx:382,426` | "das/suas **clientes**" (insights churn/RFM) | "dos/seus clientes" |
| `cockpit/AiGrowth.tsx:129,211` | "essa **cliente** / essas N" (botões) | "esse cliente / esses N" (ou "contato(s)") |
| `cockpit/AiGrowth.tsx:360` | "as **clientes** certas" | "os clientes certos" |
| `cockpit/levers.ts:209,213,216,362,383` | "**sumidas**", "**inativas**", "Nenhuma cliente **parada**", "**sumida**", "das **clientes**" | "sumidos", "inativos", "Nenhum cliente parado", "sumido", "dos clientes" |
| `hooks/useProductOnboarding.ts:30,52` | "**sua cliente**", "deixa você **linda**" | "seu cliente" / "cuida de você" |

---

## 5. Exemplos 100% cabelo → diversificar (~15) — NÃO remover

Seeds/placeholders que hoje são quase só hair. Manter realismo, mas representar todos os nichos:
- `cockpit/home/seedOpportunities.ts:18,28,40` (3 msgs followup: escova/corte+barba/salão)
- `cockpit/AiGrowth.tsx:482,530,548,566` (DEMO: Coloração/Progressiva/Hidratação)
- `cockpit/AcoesClientes.tsx:228,229,251` (DEMO seeds)
- `cockpit/MetaMes.tsx:237` ("(cabelo)")
- `cockpit/Relatorios.tsx:673,682,716` (DEMO: 5–8 de cabelo, pouco unha/lash)
- `components/onboarding/steps/OficinaServicesStep.tsx:17,33` (**catálogo-semente: 8/10 cabelo** + pré-marcados) — **alta visibilidade no onboarding**
- `hooks/useProductOnboarding.ts:33,42` (placeholders do wizard)
- `pages/salao/Servicos.tsx:203` ("Ex: Corte feminino") · `pages/salao/Financeiro.tsx:734` ("coloração (Maria)")
- `components/sales/LeadCaptureModal.tsx:145,192` ("@seusalao", "Salão da Bella")

**Sugestão de nichos pra incluir:** Alongamento de cílios / Lash lifting · Esmaltação em gel · Design/micropigmentação de sobrancelha · Spa dos pés / Podologia · Limpeza de pele.

---

## 6. Ícones + emojis (visual)
- **Scissors (tesoura)** em itens multi-nicho: `cockpit/nav.tsx:47` (Serviços), `UnifiedShell.tsx:67` (Profissionais), `Sidebar.tsx:200`, `cockpit/Inicio.tsx:613` (Profissional destaque) → trocar por neutro (Users / Sparkles / Award).
- **Emoji 💁‍♀️**: `cockpit/levers.ts` (upsell), `cockpit/segments.ts:283`, `cockpit/AcoesClientes.tsx:251` → 💁 / ✨.

---

## 7. NÃO mexer (avaliado e descartado)
- `config/brand.ts:48` tagline **"Beleza com gestão inteligente"** — inclusivo, é o setor amplo. Manter.
- `pages/legal/legalContent.ts` **"salões de beleza"** — texto **jurídico** (define o objeto do contrato). **Revisão jurídica antes de generalizar.** Recomendação: manter.
- `data/quizTemplates.ts:656` "Quiz Salão de Cabelo" — **template de nicho intencional** (catálogo). Manter.
- `cockpit/Inicio.tsx:530` "...mais **cheia**" — concorda com "a agenda", **não** é gênero do usuário. Falso-positivo.
- Vários "cabeleireira" em **comentários de código** e `bgHint`/`objective` não-renderizados — não user-facing.

---

## 8. O ponto de cascata — `config/brand.ts`

Existe `BRAND_CONFIG.sector = { noun: 'salão', verb: 'gerir seu salão', clientNoun: 'cliente' }` — **fonte única** desenhada pra copy de setor, mas **os consumidores ainda não leem dela** (strings estão hardcoded). **Recomendo:** (a) corrigir `sector.noun`→"negócio" agora, e (b) num passo futuro, ligar as telas a esse config pra que trocar 1 linha mude tudo. Por ora, a troca é string-a-string (§2–§6).

---

## 9. Decisões em aberto (preciso de você antes de aplicar)

1. **Termo canônico:** "**negócio**" (institucional) ou "**espaço**" (mais quente), ou híbrido (negócio nos títulos, espaço nas msgs ao cliente)?
2. **Escopo:** só o **app logado**, ou inclui a **landing /vendas** (§3) e as **mensagens WhatsApp ao cliente** (§2 final)?
3. **Além de "salão", aplico também:** gênero feminino→neutro (§4)? ícones tesoura→neutro (§6)? diversificar exemplos (§5)? emojis femininos→neutro (§6)?
4. **Termos de Uso (§7):** confirmo **manter** (revisão jurídica), certo?

_Quando você fechar essas 4, eu aplico em lote (com build + deploy + prova no Chrome real), sem tocar em rota/id/código._
