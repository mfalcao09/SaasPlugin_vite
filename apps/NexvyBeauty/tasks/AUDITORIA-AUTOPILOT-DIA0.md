# Auditoria — NexvyBeauty 100% Autopilot Dia-0
> 5 agentes Opus (4 investigadores + auditor) · 2026-07-05 · verificado no código+banco

> **Correções factuais pós-auditoria (verificadas no banco):** (1) É UM Supabase (fzhlbwhdejumkyqosuvq), não dois — os 5 agentes vivem em platform_crm_product_agents, no MESMO banco de organizations; sem ponte cross-DB necessária. (2) Os 5 agentes já estão is_active=true + active_in_whatsapp=true. (3) Supervisor VAZIO: agent_specialists=0, agent_routing_rules=0 (sem handoff). (4) founder_status está no lugar certo (organizations) mas ninguém escreve/lê.

---

Tudo confirmado. Banco único (uma URL só, zero dblink/fdw), WhatsApp depende de `platform_settings` configurado. Escrevo o relatório definitivo.

# AUDITORIA — NexvyBeauty: publicar hoje? (relatório do auditor-chefe)

**Não publique hoje esperando "dia-0 autopilot".** O autopilot que você imagina — a dona compra e o sistema se monta sozinho, você só monitora — **não existe no código**. Três elos do setup pós-venda estão *ausentes* (não mal configurados: ausentes), e dois são fisicamente impossíveis de automatizar sem a dona agir uma vez. Se um pagamento cair hoje, a dona recebe um e-mail de acesso e entra numa **casa vazia**: sem WhatsApp, sem carteira, sem serviços, sem página pública de agendamento (nasce em 404), com todas as automações desligadas e o Radar sem nada para analisar.

A boa notícia: o **autopilot de VENDA** (agentes vendendo para captar as 30 fundadoras) e o **autopilot de OPERAÇÃO** (a dona usando sozinha) têm prontidões diferentes — e a venda está mais perto de viável que a operação. Você pode lançar uma **campanha de captação assistida** esta semana. O que você não pode é prometer setup mágico à fundadora.

Verifiquei os fatos centrais no código, não confiei só nos scouts: `founder_status` tem **zero leituras** em `src/` e `supabase/functions/`; `provisionFromOrder` **não insere** `evolution_instances`, `clientes`, `servico_catalogo`, `salon_automation_rules` nem `opportunity_scan_schedules`; e há **um único** Supabase (`fzhlbwhdejumkyqosuvq`, zero `dblink`/`postgres_fdw`). Os scouts estão corretos.

---

## PERGUNTA 1 — Onde `founder_status` deve morar?

**[Certo] Decisão: fica em `organizations` (onde já está). NÃO reverta a migration. Você não errou de lugar — errou de premissa sobre a arquitetura.**

Sua tese ("`founder_status` é status de tenant, gerido no gestao.*, logo está no banco errado") parte de um fato falso: **não existem dois bancos**. O que você chama de "Supabase do grupo" (`gestao.nexvy.tech`) é, neste código-fonte, o **schema `platform_crm_*` coabitando o mesmo Postgres** do app. `gestao.nexvy.tech` é um **host de edição** (confinamento por hostname em `publicUrl.ts`), não um banco separado. A migration `20260704_founder_fields.sql` pôs a coluna em `organizations` — que é exatamente onde o atributo pertence.

**Por que `organizations` é o lugar certo (e não `platform_crm_leads`):**

| Critério | Veredito |
|---|---|
| Quem é "fundadora"? | Um **salão provisionado e pago** = uma `organizations`. Um lead perdido não é fundador de nada. |
| De onde sai `slots_left`? | `30 − count(is_founder)` **sobre `organizations`**. Só faz sentido onde as orgs vivem. |
| A regra de desacoplamento | `platform_crm_leads` é **proibido por design** de ter `organization_id` (cabeçalho da migration L11-13). Pôr a verdade de fundadora lá violaria o próprio isolamento. |
| Quando a fundadora "nasce"? | No **webhook Cakto** que cria a org — não no CRM de venda. |

A tensão na sua frase é real mas se resolve assim: **um flag em cada camada, com semânticas diferentes** — não "sync entre dois bancos".
- `platform_crm_leads.metadata.founder_candidate = true` → **candidata** (pré-venda, o Orquestrador de venda prioriza warm-intro). A coluna `metadata jsonb` já existe.
- `organizations.founder_status = 'is_founder'` → **fundadora confirmada** (pós-provisionamento). Fonte da verdade.

**O que fazer com a migration "errada": mantê-la. Ela está certa e é inerte.** 1 coluna nullable + 1 view read-only, sem trigger/constraint/RLS. Reverter = zero ganho, perde trabalho validado. O problema real não é *onde* a coluna está — é que **ninguém a escreve e ninguém a lê**:

1. **Falta ESCRITA:** `provisionPlatformPlan()` cria a org mas nunca seta `founder_status`. Adicionar: ao criar a org, se `founder_campaign_status.slots_left > 0` e for pré-venda de fundadora → `founder_status='is_founder'`.
2. **Falta LEITURA:** nenhuma automação bifurca "concierge humano vs autopilot" com base nela. O ponto natural é **no fim do `provisionFromOrder`** — um `SELECT founder_status` trivial (mesma conexão) decide qual trilha disparar.

**Seu passo 3 ("ponte entre os 2 bancos p/ Orquestrador ler founder_status") é DESNECESSÁRIO e nasce do mesmo erro:** não há 2 bancos, e o "Orquestrador" que precisa ler não é o de venda (`platform-mia`, que por design só toca `platform_crm_*`), é o de **provisionamento** (`cakto-*`), que já roda no mesmo Postgres que `organizations`. Delete esse passo.

---

## PERGUNTA 2 — Os 6 passos bastam? Não. Lista completa e corrigida.

**[Certo] Seus 6 passos cobrem ~40% e têm um erro conceitual grave: 4 dos 6 são sobre o autopilot de VENDA (agentes), e você quase não tocou no autopilot de OPERAÇÃO (o setup da dona) — que é justamente onde está o buraco maior e o requisito que você declarou ("ninguém configura na unha").**

Legenda severidade: **BLOQUEIA** = sem isso a promessa falha no dia-0. **DEGRADA** = funciona, mas a experiência/valor cai.

### BLOCO A — AUTOPILOT DE VENDA (agentes captando as 30 fundadoras)

| # | Item | Estado | O que falta | Sev |
|---|---|---|---|---|
| A1 | Motor de resposta **inbound no WhatsApp de vendas** | **FALTA** | `platform-evolution-webhook` só trata ciclo de conexão (QR/CONNECTION). `MESSAGES_UPSERT` é `// TODO(inbox)` — **mensagem que chega no zap de vendas cai no vazio e retorna 200**. Precisa construir o motor de ingestão inteiro. | **BLOQUEIA** |
| A2 | Os 5 agentes ricos **de fato respondem** | **FALTA** | Descasamento de tabela: Duda/Bia/Nina/etc. vivem em `platform_crm_product_agents` (81 colunas), mas **nenhum motor lê essa tabela**. O runtime só consome `platform_crm_agent_configs` (persona crua: nome+prompt). Os agentes que você criou na UI **não são a persona que responde**. | **BLOQUEIA** |
| A3 | **Roteamento** SDR→Closer→Suporte | **FALTA** | Handoff entre agentes não existe em runtime. `stripFakeHandoffTags` **remove** tags de handoff (não executa transferência). O matcher (`agent-matcher.ts`) existe mas aponta para tabelas tenant, não plataforma. | **BLOQUEIA** p/ esteira; DEGRADA se 1 agente único |
| A4 | **Supervisor** (Especialistas + Regras) | **FALTA** | É stub em memória (`let SPECIALISTS=[]`) — some ao recarregar a página. A edge `agent-supervisor` lê tabelas tenant sem twin na plataforma. Seu passo 2 assume que isso persiste. Não persiste. | **BLOQUEIA** o passo 2 |
| A5 | "Gerar com IA" no editor de agente | **FALTA** | Stub — toast "em breve", retorna `null`. Você configura os agentes na mão mesmo. | DEGRADA (só afeta você, não a venda) |
| A6 | **Número de WhatsApp de vendas** provisionado | **FALTA** | Zero número de vendas no código. `product_agents=0`, nenhum seed. **A LP não tem para onde mandar o lead.** Depende de `platform_settings.evolution_go_url` + escanear QR de um chip de vendas. | **BLOQUEIA** |
| A7 | LP + checkout Cakto (3 planos) | **PARCIAL** | LP existe (`SalesPage.tsx`). Mas `cakto-sync-offer` **tem que rodar antes** para mapear `platform_plans.cakto_offer_slug`; senão o webhook cai em `skipped: plan not found` e **o pagante paga e não é provisionado, em silêncio**. | **BLOQUEIA** se slugs não cadastrados |
| A8 | Webchat no site | **PRONTO** | Único canal com IA viva hoje (`platform-webchat-bot`). Seleção "primeiro agente ativo", sem roteamento, mas responde. | — |

### BLOCO B — AUTOPILOT DE OPERAÇÃO (o setup da dona — o buraco que seus 6 passos ignoraram)

| # | Item | Estado | O que falta | Sev |
|---|---|---|---|---|
| B1 | Org + plano + admin + e-mail de acesso | **PRONTO** | `provisionFromOrder` faz isso automático no pagamento aprovado. | — |
| B2 | **Slug da org** (página pública de agendamento) | **FALTA** | Org é criada **sem slug** e não há trigger de geração → `salao-public-bootstrap` retorna **404**. A página pública da fundadora **nasce quebrada**. Correção trivial (gerar slug no INSERT), mas hoje não existe. | **BLOQUEIA** |
| B3 | **Conexão do WhatsApp da DONA (scan do QR)** | **IMPOSSÍVEL automatizar** | Baileys/Evolution exige o **aparelho físico da dona** escanear o QR. Nenhum código resolve isso. O máximo automatizável: criar a `evolution_instances` no provisioning + mandar deep-link direto pra tela do QR no e-mail. **O scan é irredutivelmente humano.** | **BLOQUEIA** o "sem ninguém na unha" — é teto físico |
| B4 | **Importar carteira de clientes** | **FALTA (sem origem definida)** | Não existe função de import de `clientes`. `catalog-import-csv` importa **produtos**, não clientes de salão. Pior: **a origem dos dados não está definida em lugar nenhum** — de onde vem a carteira? Planilha? Sistema antigo? Isso precisa ser **especificado antes** de virar automação. | **BLOQUEIA** o valor (ver B7/B8) |
| B5 | Cadastrar **serviços/profissionais** | **FALTA** | Zero seed no provisioning. Fácil de resolver: inserir um **catálogo-template** de salão (serviços comuns) + 1 profissional placeholder → a dona só ajusta. | DEGRADA (fácil) |
| B6 | **Ligar automações** de salão | **PARCIAL** | `salon_automation_rules` **nascem `enabled=false`** — a dona liga cada uma na mão. Contradiz "automações ligadas sozinhas". Mudar default ou inserir as 4 regras já ligadas. **Mas só envia se houver WhatsApp conectado (gated por B3).** | DEGRADA (fácil, mas gated) |
| B7 | **Radar IA no dia-0** | **FALTA + FURO CONCEITUAL** | Dois problemas: (a) sem `opportunity_scan_schedules` seedado, o Radar nunca roda; (b) **mesmo rodando, cliente nova tem 0 conversas/0 clientes → Radar roda a vazio.** "Cliente sumido" não existe sem carteira/histórico. **A promessa "primeiro Radar automático" produz relatório vazio no dia-0.** Isso é físico, não bug. | DEGRADA grave (mata a demo de valor) |
| B8 | Automações de salão gerarem valor | **FALTA valor no dia-0** | `salon-automation-run` lê `clientes`/`agendamentos`/`pacote_clientes` — **todas vazias** numa cliente nova. Aniversário, pacote vencendo, retorno inativo: todos retornam 0 até a carteira existir. | DEGRADA (mesma raiz de B4) |

### BLOCO C — MONITORAMENTO (você "só monitora" — mas hoje não há o que monitorar)

| # | Item | Estado | O que falta | Sev |
|---|---|---|---|---|
| C1 | **Alerta quando o provisioning falha** | **FALTA** | Todos os erros são `console.error`. Nenhuma notificação a você. Falha pagamento→provisão fica **invisível até a dona reclamar**. Seu requisito "eu só monitoro" exige que exista o alerta. | **BLOQUEIA** o modelo de monitoramento |
| C2 | Painel de ativação (funil conectou→disparou→retornou) | **PARCIAL** | View `pilot_activation_funnel` existe (`20260704_pilot_funnel.sql`). Mas mostra zeros no dia-0 até dados fluírem. | DEGRADA |
| C3 | Painel "Recuperado" (garantia 30 dias) | **PARCIAL** | Depende de conversas + orders + tags acumulados em 30 dias. **No dia-0 mostra zero** — a narrativa da garantia não tem substrato inicial (é intrínseco, não bug). | DEGRADA |
| C4 | Watcher de queda de sessão WhatsApp | **FALTA** | Se o WhatsApp desloga o aparelho (comum em Baileys), o bot **silencia sem avisar** — exige QR novo = humano de novo. | DEGRADA grave |

### O que seus 6 passos ESQUECERAM (resumo cru)
1. **Todo o Bloco B** — você planejou a venda, quase não planejou o setup da dona, que é o "dia-0 autopilot" que você *definiu*.
2. **O furo do Radar/automações** (B7/B8): cliente nova não tem histórico → o produto **parece morto** no primeiro login, mesmo tudo "funcionando".
3. **A origem da carteira** (B4): não está definida. É a pergunta que trava tudo.
4. **O motor inbound de vendas** (A1) e o **descasamento de tabela dos agentes** (A2): seu passo 1 ("ativar 5 agentes") assume que ligar `is_active` faz o agente responder. **Não faz.**
5. **O número de vendas** (A6) e o **alerta de falha** (C1): pré-requisitos do seu próprio modelo ("eu monitoro").
6. **O slug** (B2): detalhe de 1 linha que quebra a página pública inteira.

---

## PERGUNTA 3 — Veredito: dá pra 100% autopilot no dia-0?

**[Certo] Não. 100% autopilot no dia-0 é impossível — e a impossibilidade tem duas naturezas distintas, que você precisa separar para decidir bem:**

**Barreira física (nenhum código resolve, nem com tempo):**
- **QR do WhatsApp da dona** (B3): o aparelho dela tem que escanear. Ponto.
- **Carteira digital** (B4): se a dona não tem os dados em lugar importável, não há de onde puxar. E salão pequeno frequentemente tem a carteira "na cabeça" ou num caderno.
- **Radar/automações valerem no dia-0** (B7/B8): sem histórico, não há "cliente sumido" para recuperar. O valor é intrínseco ao *tempo de uso*, não ao setup.

**Barreira de engenharia (resolvível, mas não está pronto):** todo o resto — slug, seed de serviços, automações ligadas, motor inbound, ponte de agentes, alerta de falha.

### Nível REALISTA de automação viável — separando os dois autopilots

**AUTOPILOT DE VENDA — viável ~1-2 semanas, NÃO hoje.**
Hoje só o webchat responde. Para captar 30 fundadoras via WhatsApp você precisa de A1+A2+A6 (motor inbound + ponte de agentes + número de vendas) — os três **faltam por completo**. Realista: uma **campanha de captação assistida** onde o webchat qualifica e **você fecha as fundadoras à mão** (são 30 — é humanamente viável e até desejável: fundadora merece toque humano). Isso você pode ligar esta semana. WhatsApp-vendas 100% autônomo: depois que A1/A2 forem construídos.

**AUTOPILOT DE OPERAÇÃO — o teto realista é "onboarding guiado", não "autopilot".**
Mesmo com todo o Bloco B de engenharia pronto, o **máximo fisicamente possível** é:
- Provisionamento cria org **com slug**, seeda **catálogo-template de serviços**, cria a `evolution_instances` e **liga as automações** (B1/B2/B5/B6 — tudo resolvível).
- E-mail de boas-vindas com **um deep-link único**: "clique aqui → escaneie este QR com seu WhatsApp → pronto". **Um gesto da dona**, não configuração.
- Carteira: **só se houver origem** (planilha/export). Sem isso, a base fica vazia e o Radar não tem o que fazer — por isso B4 é a decisão que trava tudo.

Isso não é "autopilot" no sentido literal — é **"1 clique + 1 scan"**. É o mais perto do seu sonho que a física permite. Chame isso de **"setup de 90 segundos"**, não de "zero-touch".

### Recomendação do conselheiro

**Não publique hoje prometendo autopilot.** Sequência que eu faria:

1. **Esta semana (venda assistida):** cadastre os slugs Cakto (A7), ligue C1 (alerta de falha — senão você não "monitora", você fica cego), e capte as 30 fundadoras via webchat + fechamento humano. As 30 são poucas o bastante para você dar o toque humano que a própria migration chama de "trilha humana das fundadoras". `founder_status` justamente marca isso.
2. **Antes de escalar além das fundadoras (engenharia de operação):** B2 (slug), B5 (seed serviços), B6 (automações ligadas), e o e-mail com deep-link+QR. Aí a dona tem "1 clique + 1 scan".
3. **Decisão que bloqueia B4/B7/B8 — responda antes de codar:** **de onde vem a carteira da dona?** Enquanto isso não tiver resposta, Radar e automações são teatro no dia-0. Essa é a pergunta mais importante deste relatório, e nenhum código a responde por você.
4. **Só depois (venda autônoma):** A1+A2 (motor inbound + ponte de agentes) para o WhatsApp de vendas rodar sem você.

**A pergunta-filtro honesta:** você quer vender *a promessa* de autopilot, ou entregar autopilot? Se é entregar, o gargalo não é código — é a **carteira da dona** e o **scan do QR**, e nenhum dos dois some com mais engenharia. Desenhe a oferta em cima de "setup de 90 segundos + concierge de fundadora", não de "zero-touch mágico" — essa segunda promessa você não consegue cumprir, e a fundadora vai perceber no primeiro login numa casa vazia.

---
**Arquivos load-bearing (todos absolutos):**
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/migrations_salao/20260704_founder_fields.sql` — coluna+view inertes (mantê-las)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/_shared/cakto-plan-provisioning.ts` — `provisionFromOrder`/`provisionPlatformPlan`/`ensureAdminUser`: ponto de escrita+leitura de `founder_status` e de todos os seeds faltantes (B2/B5/B6/B7)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/cakto-webhook/index.ts:165` — gate `scope=platform`; sem alerta de falha (C1)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/salao-public-bootstrap/index.ts:24` — 404 sem slug (B2)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-evolution-webhook/index.ts` — `MESSAGES_UPSERT` = TODO (A1)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/platform-webchat-bot/index.ts` — único runtime IA vivo (A8); lê `platform_crm_agent_configs`, não `product_agents` (A2)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/evolution-proxy/index.ts:18-31,~697` — QR humano (B3), pré-req `evolution_go_url`
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/salon-automation-run/index.ts` — regras `enabled=false`, lê tabelas vazias (B6/B8)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/supabase/functions/opportunity-scan-run/index.ts` — Radar sem histórico (B7)
- `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/.env` + `supabase/config.toml` — banco único `fzhlbwhdejumkyqosuvq` (derruba a premissa dos 2 bancos e o passo 3)