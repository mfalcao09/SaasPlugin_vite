# Roadmap Consolidado — Vitrine que Vende + Port + IA segregada
**Data:** 2026-06-23 · **Status:** plano aprovado-em-partes, pré-execução
**Consolida:** PLANO-PORT-CBA (ondas 0–6) + VITRINE-QUE-VENDE + MAPEAMENTO-IA (Cockpit/Admin/Super-admin) + decisões cravadas pelo Marcelo.

---

## 0. PREMISSA GLOBAL (inegociável, vale para TODA onda)
> **NADA QUEBRADO + TUDO OPERANTE.**
> Nenhuma rota órfã, nenhum import morto, nenhuma tela sem-saída, nenhuma feature desconectada. Cada onda só é "feita" com **teste E2E real** provando o fluxo ponta-a-ponta no ambiente (não build verde, não "deveria funcionar"). Toda remoção/fusão é precedida de **inventário de callers** e seguida de **redirect de todas as rotas antigas**. Git guarda rollback; deploy só com prova (curl/screenshot do bundle servido).

**Definition of Done por onda (checklist):**
- [ ] `npm run build` verde (gate real; `tsc -b` é vermelho por design).
- [ ] Nenhuma rota antiga retorna 404/tela-morta — todas resolvem pro novo destino.
- [ ] Nenhum componente removido ainda referenciado (grep limpo).
- [ ] E2E: percorri o fluxo logado e provei (screenshot/curl) que opera.
- [ ] Deploy provado (string nova no bundle servido + rota responde).

---

## 1. COMO O NOVO PLANO CONVERSA COM AS ONDAS ANTERIORES
A virada do Marcelo nesta sessão **muda a prioridade**: o PLANO-PORT antigo era *"portar mais capacidade do CBA"*; a diretriz nova é *"fazer a capacidade que já temos VENDER e ser USÁVEL"*. Logo, as ondas não-executadas (4–6) **são rebaixadas** — seus pedaços de valor são **absorvidos** pela vitrine; o resto **estaciona**.

| Onda antiga | Destino no plano consolidado |
|---|---|
| **0** Fundação (tokens/config) | ✅ Concluída — base de tudo. |
| **1** Shell coeso (UnifiedShell/PageHeader) | ✅ Concluída — **vira a casca onde o Cockpit nasce.** |
| **2** Booking público + Pacotes | ✅ Concluída — **o `/salao/Agenda` + `agendamentos` daqui é a agenda canônica** (portal + agente). |
| **3** web-push/PWA/gate | 🟡 **ESTACIONA.** Fundação feita; resto é *nicety* de plataforma, não alavanca de venda. Pluga no V5 se/quando fizer sentido. Não conflita com a vitrine. |
| **4** CRM depth: scoring + higiene + **oportunidades** | 🔪 **ABSORVIDA PARCIAL.** "Oportunidades" = o Radar (`opportunity-scan-run`) = **a Home de Valor (V1)**. Scoring/higiene = capacidade pura → **despriorizado** (não vende sozinho). |
| **5** IA knowledge: KB + copiloto MIA | ♻️ **REENQUADRADA.** Copiloto/IA **já existe**. Não é "construir KB nova" — é **tornar a IA VISÍVEL** no Cockpit › "Minha IA" (V2). |
| **6** Paridade automação/omni/analytics | 🅿️ **ESTACIONA.** Paridade-por-paridade não vende. Só os bits que melhoram a experiência visível entram, sob demanda. |

**Resumo honesto:** das 3 ondas grandes que faltavam (4/5/6), **nenhuma é construída como estava planejada.** A 4 vira a Home de Valor, a 5 vira visibilidade da IA, a 6 estaciona. O foco inteiro migra de *capacidade* → *vitrine + usabilidade*.

---

## 2. ROADMAP CONSOLIDADO (V0 → V5)
Ordem por: destravar primeiro (higiene/canônicos), depois o AHA, depois visibilidade, depois polimento.

### V0 — Higiene + Canônicos (fundação da vitrine, NADA pode quebrar)
**Objetivo:** acabar com a duplicação (2 sistemas de uso paralelos) e o código morto ANTES de montar a nav nova — senão o Cockpit vira "2 portas pra mesma sala".
- **V0.1 — Deletar CalendarManager → `/salao/Agenda` herda TUDO** *(diretriz do dono)*. Passos:
  1. **Inventário** de CalendarManager (422 linhas): sub-componentes (`AgendaCalendarView` month/week/day/list, `GoogleCalendarConnect`, `BookingsManager`, `EventTypesManager`, `AvailabilityManager`), tabelas que lê (NÃO é `agendamentos` — confirmar quais), e **callers** (`Admin.tsx` case `'calendar'`, `admin/booking/BookingManager.tsx`).
  2. **Portar pra `/salao/Agenda`** toda feature que falta (Google Calendar connect, tipos de evento, disponibilidade, multi-view, gestão de bookings) — herdar, não reinventar.
  3. **Unificar disponibilidade**: hoje há `salao-availability` (meu, portal) + `booking-availability` (agente/CRM) → **uma fonte só**, pra portal + agente + UI lerem a MESMA agenda.
  4. **Redirect de TODAS as rotas/tabs** de CalendarManager → `/salao/Agenda` (Admin tab `calendar` + `BookingManager`).
  5. **Deletar** CalendarManager + sub-componentes órfãos.
  - **DoD E2E:** toda rota que abria CalendarManager agora abre `/salao/Agenda` operante; criar evento/disponibilidade/Google-sync funciona; booking público e agente caem na mesma agenda; build verde, grep de `CalendarManager` vazio.
- **V0.2 — Canônico Conversas/Pipeline/Leads:** marcar `SellerInbox` + `LeadsKanban` (lado-CRM) como deprecated; `InboxManager` e `KanbanBoard+LeadsManager` (lado-Admin) são os canônicos. Não duplicar.
- **V0.3 — Untangle do código morto (verificado):** remover as 6 páginas `/oficina/*` + rotas + módulo "ERP Oficina" no `config/modules.ts`/ModuleHub; **MANTER `OficinaServicesStep`** (reusado pelo onboarding do salão — renomear depois); resolver `AdminDashboard.tsx` (é referenciado por `Admin.tsx` → verificar se é dup de `OperationCenter` antes de mexer); mover `/demo/*` pra marketing.
  - **DoD E2E:** app sobe sem as rotas mortas; nada que era usado quebrou; build verde.

### V1 — Cockpit + Home de Valor *(o AHA + a nav única — escolha do dono: juntos)*
**Objetivo:** a cabeleireira loga e em <30s vê a IA trabalhando por ela, numa nav única que ela entende.
- **V1.1 — Shell do Cockpit:** nav única de **7 itens em linguagem de salão** (Início "Meu Dia" · Conversas · Meus Clientes · Atrair Clientes · Minha IA · Minha Agenda · Meu Faturamento) substitui o ModuleHub como home. Admin colapsa num item só (Gestão+Configurações). Super-admin isolado (só assinatura).
- **V1.2 — "Início" = Home de Valor:** abre rodando o Radar (`opportunity-scan-run`, **ao vivo** — escolha do dono) → card **"R$ X recuperável esta semana"** + top-3 oportunidades com mensagem WhatsApp pronta + **[Disparar reativação]** que envia **de verdade via Evolution**, **com confirmação antes do envio em massa** (escolha do dono).
  - **DoD E2E:** logo como admin 1º acesso → vejo 7 itens (sem Admin misturado) + dinheiro na frente; disparo uma reativação-teste que **chega num zap real**; build verde + deploy provado.

### V2 — Conversas + Minha IA visíveis (tirar do Admin)
**Objetivo:** a IA que já temos sai do porão técnico e fica na cara.
- **V2.1 — Conversas:** promover `InboxManager` pra fora do Admin como "Conversas" canônico + **plugar nele tudo que o backend já tem** (o motor bom) que hoje não aparece no front.
- **V2.2 — Minha IA:** Cockpit › "Minha IA" mostra **agentes ATIVOS operando + supervisão** + campanhas + cadências + copiloto — visível, não enterrado. Editor pesado de agente abre como sub-tela.
  - **DoD E2E:** Conversas e Minha IA operáveis no Cockpit, fluxo real testado; build verde.

### V3 — Onboarding fluido (9 passos modais → enxuto in-shell)
**Objetivo:** primeiro acesso vira AHA, não fricção.
- Trocar o modal de 9 passos + interstitial por wizard **in-shell** enxuto, absorvendo a fluidez do CBA (stepper com checkmarks, preview de slug `/s/{slug}` ao vivo, defaults, "Pular" por passo, card-resumo) **preservando os campos ricos do NX** (logo upload, paleta). Fim no AHA (cai na Home de Valor).
  - **DoD E2E:** 1º acesso → wizard claro in-shell; cria salão + cai na Home de Valor; gating não reaparece.

### V4 — Estados vazios que vendem + Captação/Agenda/Salão/Meu link polidos
**Objetivo:** nenhuma tela abre vazia ou sem-saída; tudo "mostra valor" mesmo sem dado.
- Empty-states com dado-semente rotulado "exemplo" (reusa `demo-seed.ts`); Captação, Agenda (já canônica), Salão (ERP), "Meu link" (booking público) polidos dentro do Cockpit.
  - **DoD E2E:** abrir cada item do Cockpit com conta nova → nunca vazio/morto; build verde.

### V5 — Demo que se vende sozinho (GTM) + parking lot
**Objetivo:** o demo fecha a venda sozinho.
- Tour público / demo sellable que mostra a IA achando dinheiro.
- **Parking lot** (sob demanda, não bloqueia venda): web-push (old Onda 3), paridade fina (old Onda 6), scoring/higiene de CRM (old Onda 4).
  - **DoD E2E:** prospect abre o demo e vê a IA trabalhando sem login.

---

## 3. SEQUÊNCIA + DEPENDÊNCIAS
`V0 (higiene/canônicos) → V1 (Cockpit+Home) → V2 (Conversas+IA) → V3 (onboarding) → V4 (empty-states) → V5 (demo)`
**V0 é bloqueante** (sem resolver as duplicatas, o Cockpit nasce torto). V1 entrega o valor visível mais cedo. V2-V4 são polimento de visibilidade/usabilidade. V5 é GTM.

**Esforço relativo:** V0 médio-alto (consolidação cuidadosa), V1 médio (reusa Radar pronto), V2 médio, V3 médio, V4 baixo, V5 médio.

---

## 4. NÚMEROS (do business case, MC 30k sims)
ARR ano-1: R$107k → **R$199k (+86%)** mediano com a vitrine · P(LTV/CAC≥3): **46%→92%** · alavanca dominante = conversão (onde a vitrine atua) + TAM; churn/CAC/margem = ruído no ano-1 · teto honesto: P(ARR≥500k)~3% (a vitrine tira do fio da navalha, não promete foguete).

---

## 5. PRÓXIMO PASSO
Aprovado este roadmap, começo por **V0.1 (deletar CalendarManager com inventário + herança em `/salao/Agenda`)** — porque é o maior risco de quebra e destrava a agenda única (portal + agente). Só toco código com seu OK neste roadmap.
