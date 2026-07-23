# Plano de Lançamento NexvyBeauty — 23/07/2026

**Contexto:** Marcelo precisa de caixa urgente. Este plano otimiza **menor caminho até o
primeiro real**, não qualidade de engenharia. Substitui o `PLACAR-GO-LIVE-2026-07-22_v3`,
cujo veredito ("faltam credenciais do Meta") está **incorreto**.

**Origem:** auditoria de 9 elos da cadeia venda→operação + 3 análises comerciais
(40 subagentes, 4,3M tokens). **22 dos 40 agentes falharam por erro de rede**, e o que mais
falhou foi a contraprova adversarial — por isso cada achado abaixo carrega sua procedência.

---

## Legenda de confiança

| Marca | Significado |
|---|---|
| ✅ **verificado por mim** | conferi pessoalmente no banco de produção ou no navegador |
| 🔬 **contraprova** | passou por ataque adversarial de 2-3 ângulos independentes |
| ⚠️ **fonte única** | um investigador, **sem** contraprova (a rede derrubou) — indício forte, confirmar antes de agir |

---

## Veredito

**O que separa você do primeiro real não são meses de engenharia.** São ~1 dia de código,
~1h no painel da Cakto, e uma decisão de escopo.

E duas conclusões minhas anteriores estavam **erradas — as duas a seu favor**:

### Correção 1 — o agente funciona ✅

Eu disse "43.858 mensagens de cliente vs 5 do agente". A métrica era falsa: 43.814 são
**histórico importado**. Tráfego ao vivo foram **44 mensagens**:

- 35 em conversas silenciadas pelo gate (`human_active`)
- 8 numa org com **zero** agentes configurados
- **1 elegível — e o agente respondeu**, em 25s, com entrega confirmada no WhatsApp
  (`external_id: 3EB0065E7B20844D26D843`)

O agente não falhou 43 mil vezes. Foi exposto uma vez e acertou. **O problema é gate e
seed, não qualidade de IA** — e isso encurta o lançamento.

Das 5 mensagens `sender_type='bot'`, **3 são avisos de sistema** ("Conversa reaberta por
Marcelo Falcão"). E as 37.271 mensagens `sender_type='agent'` **não são a IA — são você**
("Amém pastor", "Estou trabalhando nele, tentando resolver o bug"). Qualquer métrica lida
desse campo é ficção.

### Correção 2 — você não tem case ✅

Eu disse que a vitrine funcionava com 39 agendamentos. **Ambos errados.** No banco:
38 `interno` (37 nasceram num **único insert de seed, no mesmo microssegundo**) e **1**
`publico`, chamado `Cliente E2E Webchat` com profissional `TESTE 123`.

**Não cite "39 agendamentos" em material comercial.** É exposição.

---

## JÁ CORRIGIDO nesta sessão ✅

| Item | O que era | Prova |
|---|---|---|
| **Crash fatal da vitrine** | `organizations.address` é `jsonb`, o tipo dizia `string`. Renderizado cru em JSX → React error #31 → **tela de erro em 100% dos slugs**. O `tsc` passava verde porque a mentira estava na *declaração*, não no uso | `npm run build` verde + página aberta ao vivo: console limpo, endereço `Rua das Flores, 123 · Centro · Sorocaba/SP · 18000-000`, wizard de 5 passos com dados reais |

Arquivos: `src/lib/formatAddress.ts` (novo), `src/pages/PublicSalaoBooking.tsx`,
`src/pages/PublicSalaoPacotes.tsx`.

**Pendente: deploy.** Sem deploy, produção segue quebrada.

---

## BLOCO 0 — Hoje, sem código (~1h) — **só você pode fazer**

| # | Ação | Por quê | Teste binário |
|---|---|---|---|
| 1 | **Cakto: conferir webhook nos 3 produtos reais** ✅ | Só existem **2 pedidos** no banco inteiro, e **nenhum** dos 3 planos reais. Se o webhook só está no produto de teste, a venda de R$275 é paga e **nada acontece** — falha silenciosa total | Painel mostra `cakto-webhook?scope=platform` em `f23d881f` (Essencial), `2714084a` (Premium), `e77c9869` (Ultra) |
| 2 | **Cakto: conferir trial das 3 ofertas** ⚠️ | `platform_plans.trial_days=7`, mas o payload REAL da Cakto trouxe `trial_days:30`. Nossa tabela **não é autoritativa**. Com trial, **venda desta semana = R$0 nesta semana** — exatamente o problema que você está resolvendo | Você sabe a data exata em que o primeiro real cai na conta |
| 3 | **Desligar `feature_voice_agents` do Ultra** ✅ | O plano de R$693 vende "Agentes de voz". `grep voice` nas edge functions = **0 arquivos**. Motivo objetivo de estorno | Bullet some de `/vendas` |
| 4 | **Esconder o toggle de ciclo anual** ⚠️ | `PlanSelector.tsx:109` aponta para 3 slugs que **não existem** em `platform_plans` | `grep` no bundle não acha `q5afnju`, `33j56km`, `gthb5ic` |

---

## BLOCO 1 — Amanhã (~6h) — destravar o dinheiro

| # | Ação | Arquivo | Teste binário |
|---|---|---|---|
| 5 | **Deploy da vitrine corrigida** | já pronto | `https://app.nexvybeauty.com.br/s/<slug>` renderiza, console limpo, no celular |
| 6 | **Alerta no DLQ** ⚠️ — 7 e-mails de acesso morreram em fila e **ninguém soube** | `process-email-queue/index.ts:109-131` | e-mail forçado a falhar 5x gera alerta no Telegram |
| 7 | **Separar erro fatal de não-fatal no provisionamento** ⚠️ — hoje qualquer erro em `errors[]` (até `billing:`) faz early-return e **o usuário admin nunca é criado**: org com plano ativo, sem dono | `_shared/cakto-plan-provisioning.ts:647` | falha de `billing_history` e ainda assim nasce `profiles` + `user_roles='admin'` |
| 8 | **TTL do link de implantação: 72h → 14-30 dias** ⚠️ — quem compra sexta e senta terça fica trancado fora do que pagou | `_shared/onboarding-handoff.ts:74` | `expires_at - created_at >= 14 dias` |
| 9 | **A COMPRA DE TESTE — o teste-mãe** 🔬 | — | ver abaixo |

### O teste-mãe (item 9)

Comprar Essencial em `pay.cakto.com.br/3dydcfk` com cupom 100% e **e-mail nunca usado**.
Só passa se os **6** forem verdadeiros em até 2 minutos:

1. `cakto_orders` tem linha `status='paid'`, `cakto_offer_slug='3dydcfk'`
2. `organizations` com `slug NOT NULL`, `plan_status='active'`, `plan_id` do Essencial
3. seeds presentes: 10 serviços, 4 automações, 1 radar
4. `email_send_log` = **`sent`** com `/implantacao/` no payload (**não** `dlq`)
5. `onboarding_submissions` com linha nova **na mesma rodada** e `cakto_orders.updated_at`
   bumpado no mesmo minuto — isto prova que foi o **webhook**, não reprocesso manual
6. abrir o link do e-mail, definir senha, entrar no painel

**Falhou qualquer um → não anuncie.**

> O item 5 existe porque foi exatamente essa checagem cruzada que faltou e produziu o falso
> "E2E provada" do dia 21. A prova anterior era a costura de **duas execuções diferentes**
> apresentadas como um fluxo contínuo.

---

## BLOCO 2 — Dia 3 (~6h) — o produto não nascer mudo

| # | Ação | Por quê |
|---|---|---|
| 10 | **Semear `profissionais` + `product_agents` no provisionamento** ⚠️ | Sem profissional, o agente perde a tool de agendar. Sem agente, conversa nasce `waiting_human` e o bot nunca é chamado. **Contraexemplo vivo: `Studio Bella` tem 0 agentes e 8 mensagens sem resposta** |
| 11 | **Gravar jornada do profissional no `apply-onboarding`** ⚠️ | Wizard grava horários em `business_hours`; disponibilidade lê `profissionais.hora_inicio/fim`, que fica **NULL** → fallback 09-18h, **7 dias, incluindo domingo**. Isso é a dona ligando pra desmarcar cliente |
| 12 | **Seed de catálogo com preço real** ✅ | 9 de 10 serviços com `preco_base=0`; o prompt renderiza "R$ 0.00" pra cliente. **Visível na vitrine agora**: 4 serviços com `—` e "Corte feminino"/"Corte Feminino" duplicados |
| 13 | **Faturamento do Início: trocar a fonte** ⚠️ | Lê `lancamentos`, que **nada preenche automaticamente**. Dona marca 12 atendimentos, vê "Ticket médio R$80" e "Faturamento R$0" no card ao lado |
| 14 | **`guided_onboarding_completed_at` no set-password** ⚠️ | Já aconteceu: 30 min de loop com a única compradora de teste, caindo no wizard de novo |
| 15 | **Consertar insert de `notifications` + redeploy** ⚠️ | Insere coluna `organization_id` que **não existe** → erro engolido por catch mudo. `notifications` = **0 linhas no banco inteiro, desde sempre** |

---

## BLOCO 3 — Dia 4-5 (~8h) — o WhatsApp parar de morrer calado

16. **Reconectar o QR e medir.** A única instância caiu **25 min após parear** e está fora há 2 dias.
17. **`evolution-reconcile-status` + cron */5.** Nenhum dos 28 crons compara o banco com o estado real do Evolution. E `webhook_subscribed:true` é gravado **incondicionalmente** — se o registro falhar, o salão fica mudo **com semáforo verde**.
18. **Alerta para a DONA, não só pra você.** Se ela pular o QR, `evolution_instances` fica com 0 linhas → o banner não aparece e o health-alert não vê nada. Salão "ativo", 0 conexão, 0 alarme, 7 dias passando.
19. **Fallback quando o bot falha.** Hoje `if (!botRes.ok)` só faz `console.error`: a cliente escreve, nada volta, ninguém sabe.

---

## BLOCO 4 — Dia 6-7 — provar o que você ainda não pode prometer

20. **Destravar a carteira.** ✅ 347 conversas importadas nasceram `human_active` (código meu), e o webhook **nunca promove** `human_active → bot_active`. A base mais valiosa da dona é exatamente a que o agente jamais atende. Corrigir import + backfill + promoção.
21. **E2E do agendamento pelo agente.** ⚠️ `agent_tool_executions` e `agent_action_logs` têm **0 linhas**. A tool `schedule_meeting` está deployada e nunca executou. **Enquanto essa tabela estiver em 0, o agente autônomo não entra em material de venda.**
22. **Instrumentar automações.** ⚠️ 27-46 execuções `succeeded` e `salon_automation_log` com **0 linhas** — quarta aparição do padrão "contador zerado com cara de sucesso".

---

## O que você PODE prometer hoje sem mentir

- **"Conecto seu WhatsApp, leio seu histórico inteiro e te devolvo três listas: quem é cliente de verdade, quem sumiu e dá pra trazer de volta, e quem é ruído."** Lastro real: 81.216 mensagens importadas, 84.205 contatos triados com **100%** de motivo preenchido.
- **"Você vê o porquê de cada classificação"** — evidência por contato na tela `/clientes`, com botões "É cliente" / "É pessoal".
- **"A importação não depende do WhatsApp ficar ligado pra sempre"** — a carga é puxada, repetível e reversível.
- **"Sua página de agendamento online, com QR pro balcão"** — **após o deploy do item 5**. O motor está provado: bootstrap 200, 18 horários reais, anti-double-booking com índice único.
- **"Painel honesto: agenda, clientes, conversas, catálogo, relatórios."** Nenhuma tela placeholder nas 32 rotas, estado vazio decente em todas. É o achado mais tranquilizador da auditoria.
- **"Quando o agente autônomo entrar, você não paga a mais."**

## O que você NÃO pode prometer

- ❌ **"Agente de IA que atende sozinho no WhatsApp"** — 2 mensagens de IA em toda a história do banco
- ❌ **"A IA agenda sozinha"** — 0 agendamentos por agente; `agent_tool_executions` = 0
- ❌ **"Lembrete 24h / aniversário / recupero inativo automático"** — `salon_automation_log` = 0
- ❌ **"Confirmação automática no WhatsApp"** — `notifications` = 0 desde sempre
- ❌ **"Agentes de voz"** (Ultra) — zero runtime
- ❌ **"Score de cliente"** — `client_score` NULL em 100% das 84.205 linhas
- ❌ **"Campanhas / disparo em massa"** — `campaigns` = 0
- ❌ **"Já temos salões usando"** — 2 orgs, ambas de teste
- ⚠️ **"A IA analisou seus 84 mil contatos"** — ela leu **346**. Diga *"triei 84 mil e a IA leu as conversas que existiam"*: continua impressionante e não te expõe

---

## Estratégia recomendada

**Vender escopo menor verdadeiro, com a Recepcionista IA declarada como beta assistida.**

1. **"Raio-X da Carteira" — avulso, PIX à vista, entrega em 48h.** É o instrumento de caixa
   **desta semana**. Motivo decisivo: se houver trial de 30 dias nas ofertas reais,
   **nenhuma assinatura vendida hoje vira dinheiro hoje**. O avulso contorna isso, entrega
   em 48h e tem superfície de reembolso quase nula.
2. **Assinatura Essencial R$275/mês**, com o Raio-X incluso como ativação.

**Não derrube o preço.** O problema não é R$275 — é a **promessa**. Com o Raio-X entregue no
dia 1 + agenda + inbox com histórico sincronizado, R$275 não compete com agenda genérica.
Descer preço é fácil; subir depois que o agente entrar é caro.

**Por que não vender o completo e entregar na mão (concierge):** é a única opção que vende
exatamente a promessa que você tem 2 mensagens de prova para sustentar. O trial dá à dona
uma janela pra descobrir que é você digitando **antes da primeira cobrança** — reembolso sem
nem ter havido receita. E não escala: no terceiro cliente você para de vender pra atender.

**Por que não consertar o agente primeiro:** não porque ele esteja morto — ele funcionou. Mas
o que falta é **tempo de campo incompressível** somado a 4 defeitos estruturais independentes
e a uma instância que caiu 25 min depois de parear. São 3-5 dias com risco não-limitado e
**R$0 de caixa no período**. Faça isso **depois, financiado pelos 3 primeiros pagantes**,
usados como campo de prova declarado.

### Venda só o Essencial nesta primeira leva ⚠️

`enabled_modules` é **hardcoded** `['erp_salao','crm_vendas','atendimento']` para os três
planos (`cakto-plan-provisioning.ts:292`). O Ultra de R$693 provisiona **exatamente os mesmos
módulos** do Essencial de R$275. Vender Ultra hoje = motivo direto de reembolso.

---

## Não fazer — higiene ⚠️

A org `ESTESAAE` contém **84.194 contatos e 43.814 mensagens do seu WhatsApp pessoal real**,
163 classificados como conversa pessoal, com trechos identificáveis gravados em `sinais_wa`.
Há também CPF de comprador em texto plano em `cakto_orders.raw_payload`.

**Nenhuma demo, screenshot, vídeo ou print de venda pode usar essa org.** Decidir o expurgo
antes do lançamento.

---

## Pode esperar (mas não além do dia 30 do primeiro cliente)

- **Cobrança recorrente inteira** ⚠️ — não existe branch de renovação nem de falha de pagamento; a revogação por cancelamento **se auto-desfaz 20 linhas depois no mesmo request**; não há enforcement server-side de `plan_status`. Quem cancela **continua usando de graça**. Em 7 dias ninguém cancela — no dia 30, sim.
- **Quotas de plano** — `max_professionals` não é aplicado; 5 das 7 quotas em `/plano` são decorativas. Custa upsell, não gera reembolso.
- **Gating de feature só no React, com fail-open declarado** — nenhuma edge function checa feature.
- **Segurança do `evolution-webhook`** — `verify_jwt=false` e gate B3 em log-only. O flip depende do probe, que segue com 0 linhas enquanto a instância estiver desconectada.

---

## Onde a investigação me corrigiu

1. **`compra` rebaixado de "provado" para "não provado"** 🔬 (2 ângulos, 2 refutações). O binário hoje no ar (`cakto-webhook` v58, deploy 22/07) **nunca processou uma entrega real da Cakto** — o último pedido do banco é de 21/07 01:56, em código anterior.
2. **A vitrine parecia "funciona, sem tração" e estava com crash fatal** — mas o conserto era **uma linha**. Achado que mais acelera o lançamento.
3. **O denominador "43.858 vs 5" era falso como métrica de fracasso** — o agente foi exposto a 1 mensagem e acertou.
4. **`limites_plano` reclassificado** de "bloqueia semana 1" para "pode esperar", exceto o bullet de voz do Ultra, que **subiu** para "bloqueia a venda".

---

## Ressalva de método

**22 dos 40 subagentes falharam por erro de rede**, e a maioria das falhas foi na contraprova
adversarial. Os achados marcados ⚠️ chegaram **sem** o ataque que os validaria. São indícios
fortes de investigadores com acesso ao código e ao banco — mas **confirme antes de agir** nos
que custam caro. Os marcados ✅ eu verifiquei pessoalmente.

> **Ausência de erro não é prova de progresso.** Este projeto já foi mordido quatro vezes
> pelo mesmo padrão: contador zerado com aparência de sucesso.
