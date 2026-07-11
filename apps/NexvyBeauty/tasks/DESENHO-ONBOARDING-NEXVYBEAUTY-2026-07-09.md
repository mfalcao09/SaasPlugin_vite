# DESENHO — Onboarding NexvyBeauty · "DECOLAGEM"
> **2026-07-09 · sessão 6cf2fc02 (Fable) · STATUS: 🟢 APROVADO PELO MARCELO 07-09 (decisões D-1..D-8 travadas nas recomendações) · execução: `PLANO-EXECUCAO-ONBOARDING-DECOLAGEM-2026-07-09.md`**
> Elemento-chave da operação. Costura, num fluxo único: **B3 (QR) + B4 (carteira) + F6 (ingestão 180d) + kit de agentes + billing**.
>
> **A estrela-guia (Marcelo, verbatim):** *"Finalizado esse processo de onboarding, ela vai ter o salão voando em piloto automático (se ela preencheu tudo). Essa deve ser a sensação do onboarding, mas não só a sensação, o resultado efetivo que ele deve entregar."*
>
> **Supersede:** DESENHO-ONBOARDING antigo (discovery compra→plataforma, caminho comercial-assistido) · wizard "des-Lovable" atual (reordenado por este desenho) · a proibição da Guarda #6 do arsenal ("raio-x pré-conexão é promessa inventada") **deixa de valer quando a Onda 3 entregar o mecanismo real** — até lá, segue valendo.
> **Governança anti-morte:** este doc tem dono, checks binários por onda e seção Review obrigatória (§14). Onda seguinte NÃO abre sem Review da anterior preenchido. Errata datada obrigatória se qualquer item for superado.

---

## 1. A TESE — por que este onboarding vende E retém

Todo SaaS demonstra com dado fake ("veja como ficaria"). **Nós demonstramos com o dinheiro real da dona:** o sistema lê o WhatsApp DELA e mostra *"você tem R$ X parados em clientes que sumiram"*. Não existe objeção "será que funciona pro meu caso" — **é o caso dela, na tela, em minutos**.

O mesmo mecanismo que vende (funil 2) é o que entrega valor no dia-0 (funil 1). Um motor só. A diferença entre os funis é **onde a linha do pagamento corta o fluxo** — nunca as ações.

**Narrativa de produto (a metáfora que embala tudo):** o onboarding se chama **Decolagem**. A dona faz o *checklist de pré-voo* (conectar, conferir, ligar a tripulação), os **agentes são a tripulação** (e ela dá nome a cada um), e o final é literal: *"Seu salão está no piloto automático."* A UI inteira do onboarding fala essa língua — progresso = altitude, checklist final = liberação de voo.

---

## 2. O MODELO — motor único, linha de pagamento móvel

```
AÇÕES (sempre as mesmas, nesta ordem):
S1 conectar-QR → S2 ler WhatsApp → S3 mostrar VALOR → S4 persistir carteira
→ S5 setup leve → S6 tripulação (agentes) → S7 decolagem (piloto automático)

FUNIL 1 — "Já decidi" (direto):
  💳 PAGAMENTO ─► S1 ─► S2 ─► S3 ─► S4 ─► S5 ─► S6 ─► S7

FUNIL 2 — "Quero ver" (demo-first: self-demo · reunião · guiada pela closer):
  S1 ─► S2(efêmero) ─► S3 ══ AHA = GATILHO DA VENDA ══► 💳 PAGAMENTO ─► S4 ─► S5 ─► S6 ─► S7
```

**Regras do motor (invariantes):**

| # | Invariante | Por quê |
|---|---|---|
| M1 | Cada step é **componível e idempotente** — mesmo código nos 2 funis; a posição do pagamento é parâmetro (`paywall_before: S1 \| S4`) | "mesmas ações, momento diferente" só é real se for UM código |
| M2 | Todo step tem **check binário** de saída (tabela §5) | anti-morte §8.3 |
| M3 | Modo `demo` = **efêmero**: agregados em memória, clientes NÃO persistidos, TTL curto | LGPD + "vê a base mas não salva como clientes de fato" (Marcelo) |
| M4 | **A conexão atravessa o pagamento** — quem pagou no funil 2 NUNCA re-escaneia; a instância do demo é promovida a instância do tenant | elegância; irritar quem acabou de pagar é imperdoável |
| M5 | Abandono em qualquer step → **retomada por link** (e-mail/WhatsApp com deep-link pro step exato) | funil vaza; o link cola de volta |
| M6 | Nada de formulário antes do valor. **Confirmar > criar** (templates semeados; ela ajusta) | atrito mata AHA |

---

## 3. FUNIL 1 — "Já decidi" (roteiro tela a tela)

| Cena | O que acontece | Copy de referência |
|---|---|---|
| 1. Checkout | Paga (hoje Cakto; futuro checkout próprio §6) | — |
| 2. Provisão (invisível, ✅ PROVADO 07-08) | Org nasce: slug, 10 serviços-template, 4 automações (off), agenda Radar, `founder_status`; e-mail de acesso + WhatsApp de boas-vindas | *"Seu salão já tem um lugar. Vamos fazer ele voar."* |
| 3. Primeiro acesso = **Decolagem, passo 1/4** | Tela única, UMA ação: o QR (instância Evolution criada on-the-fly p/ a org) + consentimento LGPD embutido + 2 campos mínimos (nome do salão, sub-vertical) | *"Conecte seu WhatsApp e descubra quanto dinheiro está parado na sua agenda."* |
| 4. Scan → sync | Barra de progresso honesta (chunks assíncronos, minutos) — enquanto isso, mini-tour de 3 cards do que vem aí | *"Lendo suas conversas dos últimos meses… montando sua carteira."* |
| 5. **AHA** | Home de Valor: **R$ X recuperável** + N clientes sumidos + Top-3 com mensagem pronta | *"Encontramos R$ 4.380 parados em 27 clientes que sumiram."* |
| 6. Primeira vitória | Botão **Reativar** (1 ou todos) → dispara pelo WhatsApp dela (recém-conectado) → "enviado ✓" | *"Pronto. As primeiras mensagens já foram. Agora vamos ligar o resto."* |
| 7. Setup leve (passo 2/4) | Confirma serviços (semeados) · horários · **"Você revende produtos?"** → SIM: orienta onde cadastrar / NÃO: segue | — |
| 8. Tripulação (passo 3/4) | **Galeria de agentes do salão** → escolhe → **dá nome** → ativa (respeitando `max_ai_agents` do plano) | *"Escolha quem vai atender por você. E dê um nome a ela."* |
| 9. Piloto automático (passo 4/4) | Liga as automações que quiser (aniversário, pacote vencendo, retorno…) — opt-in, ela JÁ viu funcionar | *"Checklist completo. Seu salão está voando."* |

## 4. FUNIL 2 — "Quero ver" (demo-first)

Variantes de entrada, mesmo miolo: **(a)** self-demo na LP ("Descubra quanto seu WhatsApp esconde") · **(b)** reunião/apresentação · **(c)** guiada pela closer (Bia/humana manda o link na conversa — o funil de venda existente desagua AQUI).

| Cena | O que acontece | Diferença vs funil 1 |
|---|---|---|
| 1. Convite | LP/closer oferece o teste com o WhatsApp REAL da pessoa | lead ainda NÃO é cliente |
| 2. **Consentimento explícito** (tela própria, não checkbox escondido) | "Autorizo a Nexvy a ler minhas conversas para calcular oportunidades. Nada é salvo se eu não assinar; tudo é apagado em X dias." + log do aceite | **trava LGPD dura** (§8) |
| 3. QR (demo-tenant efêmero) | Instância Evolution criada em pool de demo; scan | sem org paga |
| 4. Sync efêmero | Motor lê, calcula **agregados em memória**: nº contatos, nº sumidos, R$ estimado, 3 exemplos mascarados (ex.: "Cli•••a M. — sumida há 74 dias") | **nada de `clientes` persistido**; raw descartado pós-cálculo |
| 5. **AHA = pitch** | Mesma Home de Valor, com véu: números completos visíveis, ações bloqueadas | *"Isso é o que o piloto automático faria HOJE. Quer ligar?"* |
| 6. 💳 Checkout | CTA → paga (plano sugerido pelo tamanho da carteira — gancho natural de pricing) | o AHA vende |
| 7. **Promoção demo→live** | Org provisionada (fluxo provado) + **instância do demo REBATIZADA como instância do tenant** + recálculo agora PERSISTINDO carteira | **sem re-scan (M4)** |
| 8→ | Continua no funil 1, cena 6 (primeira vitória) em diante | convergência total |
| ✗ Não comprou | TTL: dados efêmeros apagados (agregados + qualquer raw), instância destruída, **log de exclusão** gravado; follow-up da closer usa SÓ o número agregado ("os R$ X continuam lá…") | direito ao esquecimento |

**Decisão embutida (D-1, recomendo assim):** no demo, o **disparo de reativação NÃO acontece** — mostrar o valor é grátis, ENTREGAR o valor é pago. O botão "Reativar" é o que ela compra.

---

## 5. OS STEPS EM CONTRATO (o motor, com checks binários)

| Step | Entrada | Saída | Check binário | Estado hoje |
|---|---|---|---|---|
| S0 Provisão | webhook pagamento | org operacional (slug+seeds+founder) | `/s/<slug>` 200 + 10 serv + 4 rules + 1 radar | ✅ **PROVADO** 07-08 |
| S1 QR | org (ou demo-tenant) | instância `connected` | `evolution_instances.status='connected'` | 🟡 instância existe; criação on-the-fly no onboarding NÃO |
| S2 Sync | conexão | msgs c/ `wa_timestamp` no banco (live) ou agregados (demo) | ≥1 chunk `MESSAGES_SET` processado + `min(wa_timestamp)` medido | ❌ ZERO backfill hoje (46 msgs, canal Meta) |
| S3 Valor | msgs/agregados | Home de Valor renderizada | card R$ X + top-3 visíveis < 5s pós-sync | ❌ (specs prontas: VITRINE/PLANO-V1, nunca construído) |
| S4 Carteira | pagamento confirmado | `clientes` derivados (dedupe+nome+última visita) | N clientes ≥ N contatos únicos com conversa | ❌ |
| S5 Setup | carteira | serviços confirmados + horários + revenda S/N | flags de conclusão gravadas | 🟡 wizard antigo cobre parte — REORDENAR (D-5) |
| S6 Tripulação | plano (quota) | ≥1 agente do KIT DO SALÃO ativo e NOMEADO | agente responde msg de teste no zap da org | ❌ kit não existe (personas atuais vendem SaaS) |
| S7 Piloto | tudo acima | automações ligadas (opt-in) | ≥1 automação `enabled=true` + checklist 7/7 verde | 🟡 automações semeadas off (por design) |
| S∞ Migração demo→live | demo + pagamento | instância promovida, carteira persistida | mesma conexão, zero re-scan | ❌ |

**Checklist "LIBERADO PARA VOO" (o critério de aceite da estrela-guia — a última tela):**
☐ WhatsApp conectado · ☐ Carteira montada (N clientes) · ☐ 1ª reativação disparada · ☐ Serviços confirmados · ☐ Revenda respondida · ☐ Tripulação nomeada e ativa · ☐ ≥1 automação ligada → **7/7 = "Seu salão está voando em piloto automático."** Se ela pulou algo, o checklist fica visível na home cobrando o item — *o onboarding nunca "termina incompleto em silêncio"*.

---

## 6. FASE 0 — pagamento, tenant, perfil (respostas do CÓDIGO, 07-09)

**Módulos & quotas (lido do código+banco, não de doc):** planos diferem por quota E feature — Essencial 217 (1 user/1 conexão/1 agente IA/2 profissionais/2k msgs/3k contatos) · Premium 387 (5/2/3/5/5k/15k + campanhas) · Ultra 687 (10/4/5/∞/10k/50k + voz + webhooks). **3 buracos achados:**
1. 🔴 **Fonte de verdade dupla de módulos:** o provisionamento **hardcoda** `['erp_salao','crm_vendas','atendimento']` ignorando `platform_plans.modules` (vazio no Essencial/Premium; Ultra promete `administracao` e não recebe). **Correção (D-2, recomendo): derivar `org.enabled_modules` do plano; hardcode vira fallback.**
2. 🔴 `feature_instagram=false` nos 3 planos — religar por plano quando IG/Messenger voltar (decisão de pricing D-8: IG em qual plano?).
3. 🟡 Enforcement das quotas numéricas: hooks existem (`usePlanGating`/`usePlanModules`/`useOrganizationPlan`); cobertura limite-a-limite não verificada — item de auditoria na Onda 1.

**Billing — decisão do Marcelo: O CONTROLE É NOSSO.** Alvo: `checkout.nexvybeauty.com.br` — checkout nosso, processador plugável (Cakto hoje = só motor; amanhã troca-se o motor sem tocar o produto). Implicações:
- **Pergunta-gate (D-6):** a Cakto expõe API de cobrança recorrente iniciada por nós (cartão tokenizado, charge on-demand)? Se **não** (provável — ela é checkout-link-first), o motor futuro é gateway de verdade (Pagar.me/Asaas/Stripe) — e isso é literalmente o **NexvyPayments (P5)** com o Beauty de cliente nº1.
- **Não bloqueia o piloto:** Cakto atual funciona e está provada. Checkout próprio = **Onda 4**, migração a frio.
- **Dunning (buraco real):** renovação falhou → hoje NADA acontece. Definir: retry → aviso → grace (`grace_period_days` existe no schema e ninguém lê) → suspensão. Onda 4.
- **Perfil pessoal:** com checkout nosso, NÓS coletamos (nome, e-mail, WhatsApp, CPF, nome do salão, sub-vertical, cidade) e passamos ao processador só o que ele precisa pra finalizar. Até lá: Cakto entrega nome/e-mail/fone; **nome do salão + sub-vertical** são pedidos na tela do QR (2 campos, junto do consentimento — o mínimo pro agente falar direito).

---

## 7. KIT DE AGENTES DO SALÃO (novo — a "tripulação")

As agentes atuais (Duda/Bia/Nexvy/Nina) **vendem o SaaS**. O kit do salão é outra espécie: **atende o cliente DO salão, no WhatsApp DO salão**. Reusa o motor F2 (provado); muda persona, objetivo e guardrails.

| Agente (nome default — ela renomeia) | Papel | Gatilhos |
|---|---|---|
| **Recepcionista** ("Lia") | responde dúvida de serviço/preço/horário **lendo o catálogo real**; agenda (booking já provado); confirma véspera | msg inbound; agendamento_24h |
| **Reativadora** ("Vera") | traz de volta quem sumiu — executa as campanhas do Radar; segue o funil de reativação | retorno_inativo; disparo manual da Home de Valor |
| **Cuidadora** ("Bela") | pós-atendimento ("como ficou?"), aniversário, pacote vencendo | aniversario; pacote_vencendo; atendimento concluído |
| **Vendedora de pacotes** ("Mel") — v2 | oferta upgrade/pacote pra cliente frequente | recorrência detectada |

**Regras do kit:** (1) galeria com preview de conversa-exemplo; ativar = 1 clique → template instancia config na org → **ao vivo no WhatsApp dela na hora**; (2) **ela nomeia** — o nome entra no system prompt e na assinatura (*"Aqui é a Vera, do Espaço Bella 💕"*) — pessoalidade = vínculo; (3) guardrails duros: preço/serviço SÓ do catálogo (nunca inventa), escala pra dona em pedido-humano/reclamação — a doutrina "nunca rejeita venda" adaptada: **nunca perde cliente**; (4) quota `max_ai_agents` decide quantos ela ativa — **gancho de upgrade natural** (*"quer a Bela também? O Premium libera 3 tripulantes"*); (5) evals mínimos por agente antes do template entrar na galeria (5-10 goldens, mesmo rito da Fábrica).

---

## 8. LGPD & COMPLIANCE (o funil 2 é o crítico)

| Regra | Implementação |
|---|---|
| Consentimento explícito pré-scan | tela própria + texto claro + `consent_log` (quem, quando, IP, versão do termo) — nos 2 funis |
| Demo = efêmero | agregados em memória/edge-cache com **TTL (D-3: 7 dias)**; raw de mensagens descartado pós-cálculo; clientes NÃO persistidos; exemplos exibidos mascarados |
| Não converteu | apagar agregados + destruir instância + **log de exclusão** (prova de compliance); follow-up da closer guarda só o número agregado |
| Papéis | dona = controladora dos dados dos clientes dela; Nexvy = operadora → **DPA** (aditivo aos termos, aceito no checkout) |
| Direito de exclusão | cliente final pede → dona apaga no CRM → cascata (RLS org-scoped já existe) |
| Dados sensíveis em conversas | ingestão guarda o MÍNIMO p/ derivar carteira (contato, timestamps, última visita); conteúdo integral NÃO vira feature no MVP — reduz superfície |

---

## 9. RISCOS TÉCNICOS & PLANOS B (sem romantismo)

| Risco | Realidade | Plano B |
|---|---|---|
| **180d não garantido** | WhatsApp decide a profundidade ("most recent"); relatos variam de semanas a ~1 ano | **G0 (gate):** medir `min(wa_timestamp)` em 3-5 números reais (`syncFullHistory:true` + browser Desktop). Copy NUNCA promete "180 dias" — promete *"seus últimos meses de conversa"*. Se raso: carteira nasce do que veio + cresce com o tempo-real + **import CSV/contatos** como reforço (D-7) |
| Sync assíncrono (minutos) | chunks `MESSAGES_SET`; `isLatest` é buggy | progresso honesto + timeout 2-5min + **AHA parcial** ("já achamos R$ X… e ainda estamos lendo") — o número SUBINDO ao vivo é teatro a nosso favor |
| Baileys não-oficial (risco ban) | conta da dona pode ser banida — risco real de reputação | rampa de volume (warm-up) nas automações; opção Cloud API oficial p/ quem quiser blindagem (candidata a diferencial Ultra); transparência no TOS |
| Celular primário offline no sync | histórico não vem | detecção + copy: *"deixe o celular conectado à internet durante a leitura"* |
| Promoção demo→live | rebatizar instância sem derrubar a sessão Baileys | **spike técnico** logo no início da Onda 3 (renomear vs re-parear é O risco) |
| Pool de demo lotado/abuso | instâncias efêmeras custam recurso | pool com N slots + fila + rate-limit por IP/telefone |

---

## 10. MAPA DE REUSO (construir em cima, não do zero)

| Peça | Status | Papel no desenho |
|---|---|---|
| Provisionamento pós-pagamento (S0) | ✅ PROVADO E2E 07-08 | fundação intocada |
| `evolution_instances` + QR na UI | ✅ existe (1 connected) | S1 reusa; falta criação on-the-fly por org |
| `wa_timestamp` capturado em metadata | ✅ | S2 mede profundidade de graça |
| Motor F2 (brain) + humanização parcial | ✅ provado (Duda respondeu sozinha) | S6 reusa o runtime; troca personas |
| Personas do arsenal (formato/specs) | ✅ escritas | molde do formato; conteúdo NOVO p/ kit salão |
| Booking público (3 edges + dispatcher WhatsApp) | ✅ deployado | Recepcionista agenda com isso |
| Radar + automações semeadas | ✅ (rodam a vazio) | ganham matéria-prima no S4 |
| Home de Valor / "R$ recuperável" | ❌ (specs completas: VITRINE/PLANO-V1) | S3 — construir sobre spec existente |
| Ingestão/backfill (F6) | ❌ zero | S2/S4 — núcleo novo |
| Demo-tenant efêmero + promoção | ❌ | Onda 3 |
| Kit agentes salão + galeria + nomeação | ❌ | Onda 2 |
| Checkout próprio + dunning | ❌ | Onda 4 |

---

## 11. ONDAS DE CONSTRUÇÃO (thin slices; onda N+1 só abre com Review da N)

**G0 — GATE DE ABERTURA (antes de tudo):** PoC de profundidade do history-sync — 3-5 números reais, `syncFullHistory:true`, medir `min(wa_timestamp)` e volume. *Bloqueado em: número do salão-teste do Marcelo + local da instância Evolution (VPS?).*
→ **check:** tabela número×dias×msgs publicada; copy ("últimos meses") ratificada.

**ONDA 1 — Golden path do funil 1 (pago→voando):** criação on-the-fly da instância no 1º acesso + tela QR c/ consentimento + 2 campos de perfil + pipeline S2 live (chunks→banco) + derivação S4 (dedupe→`clientes`) + Home de Valor S3 + disparo (reusa reativação) + correção D-2 (módulos do plano) + auditoria de enforcement de quotas.
→ **check:** 1 org de teste real sai do pagamento ao disparo da 1ª reativação **sem toque nosso**, carteira ≥ N contatos, checklist ≥5/7.

**ONDA 2 — Setup leve + Tripulação:** reordenar wizard antigo (QR-first, D-5) + pergunta de revenda + galeria do kit (v1: Recepcionista + Reativadora) + nomeação + evals mínimos + gating por plano.
→ **check:** agente nomeado responde no WhatsApp da org de teste; eval ≥90%; Essencial trava no 2º agente (gating provado).

**ONDA 3 — Funil 2 (demo como arma):** spike da promoção demo→live PRIMEIRO + demo-tenant efêmero + consentimento/log + agregados em memória + Home de Valor com véu + checkout handoff + TTL/exclusão + rate-limit do pool.
→ **check:** 1 demo completa → pagamento → org nasce com a MESMA conexão; 1 demo abandonada → dados zerados no TTL com log de exclusão.

**ONDA 4 — Billing nosso:** resposta D-6 (API Cakto?) → arquitetura `checkout.nexvybeauty.com.br` (processador plugável / ponte NexvyPayments) + dunning (retry→aviso→grace→suspensão lendo `grace_period_days`).
→ **check:** 1 assinatura ponta-a-ponta no checkout próprio em staging + 1 falha de renovação percorrendo o dunning inteiro.

---

## 12. DECISÕES PENDENTES DO MARCELO

| # | Decisão | Recomendação |
|---|---|---|
| D-1 | Demo dispara reativação antes de pagar? | **Não** — ver é grátis, ENTREGAR é pago; o botão Reativar é o produto |
| D-2 | Fonte de verdade de módulos = `plan.modules`? | **Sim** (mata o hardcode; corrige o Ultra que promete `administracao` e não recebe) |
| D-3 | TTL dos dados de demo | **7 dias** |
| D-4 | Kit v1: quais agentes + nomes default | **Recepcionista ("Lia") + Reativadora ("Vera")**; Cuidadora na v1.1 |
| D-5 | Wizard antigo (des-Lovable) | **Absorver**: vira o S5, reordenado QR-first; jamais dois onboardings |
| D-6 | Cakto tem API de charge on-demand? (pesquisar) | se não → gateway via **NexvyPayments** (Beauty = cliente nº1 do trilho próprio) |
| D-7 | Import CSV/contatos | **Sempre visível** como reforço da carteira (não só fallback de sync raso) |
| D-8 | IG em qual plano (`feature_instagram`, hoje false nos 3) | sugerir Premium+ |

## 13. MÉTRICAS DO ONBOARDING (o funil de ativação vira dashboard)

`scan_rate` (QR exibido→conectado) · `sync_depth_mediana` (dias reais de histórico) · `time_to_aha` (scan→R$ na tela) · `aha_to_payment` (funil 2) · `disparo_d0` (% que reativa no 1º dia) · `tripulacao_ativada` (% com ≥1 agente nomeado) · `checklist_7de7` (% voando) · `D7_ainda_voando` (retenção real). Base: view `pilot_activation_funnel` (existe) + eventos novos por step.

## 14. REVIEW (anti-morte — preencher a cada onda, NUNCA deixar vazio)

- [ ] G0: __________ (data · prova · decisão de copy)
- [ ] Onda 1: __________
- [ ] Onda 2: __________
- [ ] Onda 3: __________
- [ ] Onda 4: __________

---
*Par canônico: DESENHO-ONBOARDING-NEXVYBEAUTY-2026-07-09.html · Fontes: conversa Marcelo 07-08/09 (funis, QR-gatilho, controle de billing, kit nomeável, estrela-guia) · LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08 · código main `cab7c7d` + banco fzhlbwhdejumkyqosuvq (planos/quotas lidos 07-09) · pesquisa history-sync 07-08.*
