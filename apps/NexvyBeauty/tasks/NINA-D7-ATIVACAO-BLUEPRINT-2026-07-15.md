# Blueprint — Fechar o GATE de ativação da Nina (retenção D-7)

**Produto:** NexvyBeauty · **Banco:** `fzhlbwhdejumkyqosuvq` · **Data:** 2026-07-15
**Escopo:** READ-ONLY (investigação; nenhum código/banco alterado)
**Modo:** conselheiro — verdade desconfortável primeiro, rótulos de confiança, sem bajulação.

---

## 0. Fact-Forcing Gate — os 4 fatos, reverificados AGORA (com evidência)

> A tarefa pedia "validar o gatilho" partindo da premissa de que **só falta o D-7**.
> **[Certo] Essa premissa está errada — e essa é a verdade desconfortável.** O gatilho da Nina depende de DOIS pré-requisitos, não um. O D-7 é o segundo. O primeiro — **o modo retenção no brain de produção** — **NÃO está em prod**. Ligar a flag hoje faria a Nina *vender* para quem já comprou. Detalhe abaixo (Fato 4).

Cada fato foi reexecutado contra o banco/edge vivos nesta sessão:

### FATO 1 — Âncora D-7: só existe `plan_activated_at`; a data-verdade de renovação existe mas não está em coluna consultável
`information_schema` de `public.organizations` → as ÚNICAS colunas de plano são:
`cakto_customer_email`, `cakto_subscription_id`, `plan_activated_at`, `plan_id`, `plan_status`.
**Não existe** `renewal_date`, `current_period_end`, `dia_vencimento`, `cycle` nem `next_billing`. O aviso do executor do P2 ("colunas de renovação não versionadas / drift") **confirma-se: elas nunca existiram**. A data real de renovação **existe** — mas só dentro de `cakto_orders.raw_payload->subscription->next_payment_date` (com `recurrence_period`) — nunca promovida a coluna.

### FATO 2 — `nina-health-scan` está COMPLETO (não é stub), DEPLOYADO e inerte
`list_edge_functions` → `nina-health-scan`: **status=ACTIVE, version=1**. `cron.job` #24 `nina-health-scan-daily` `0 12 * * *` **active=true**. O código computa D-7 real, resolve a conversa, pina a Nina, insere a bolha e envia via WhatsApp Cloud — tudo atrás do gate `NINA_HEALTH_SCAN_ENABLED != 'true'` → `{skipped:'flag_off'}`. **O cron roda todo dia como no-op.**

### FATO 3 — Sinais de churn: a v1 NÃO detecta churn; é um timer de renovação
O scan aciona só por **tempo** (posição no ciclo). Não lê silêncio, queda de uso nem reclamação. Os dados p/ churn existem (`platform_crm_conversations.last_message_at`, `.status`, `.unread_count_agents`; `agendamentos`/`booking_*`; `platform_crm_journey_events`, `post_sale_event_logs`) — **mas nenhum é usado**.

### FATO 4 — Pin + retenção: o backfill está aplicado, mas o BRAIN DEPLOYADO NÃO tem o modo retenção
- Backfill **aplicado em prod**: `platform_crm_product_agents` → Nina `d925bb6e…` = **`agent_type='retention'`**, `is_active=true`, `active_in_whatsapp=true` (Duda=`sdr`, Bia=`closer`, Lia=`support`). ✅
- **`get_edge_function('platform-sales-brain')` (v33, atualizado hoje):** grep do código deployado → **`RETENTION_RULE_BLOCK`: NÃO · `isRetentionAgent`: NÃO · `retentionActive`: NÃO · import `agent-routing`: NÃO · ainda tem `?? agents[0]`.** ✅ tem só o modo *implantação* (Lia).
- Conclusão factual: **PR-B (modo retenção) NÃO está em produção.** PR-A (284e7d2) e PR-B (2eeaff5) **não estão na `main`** — o deploy aqui é manual e desacoplado do merge, então "em prod" ≠ "na main". O backfill `retention` está aplicado mas **inerte**: o brain de prod não ramifica por ele.

**Tradução do risco:** se `NINA_HEALTH_SCAN_ENABLED=true` hoje → a Nina é pinada → a cliente responde → o brain v33 não reconhece `retention`, cai no galho genérico, injeta `buildCheckoutContext` (links de pagamento) e assume "atendente de VENDAS". A Nina **ofertaria plano/preço a quem já é cliente** — violando a regra-mãe dela. É exatamente o cenário que o cabeçalho do PR-A manda evitar.

---

## 1. A RESPOSTA do D-7 (âncora recomendada + SQL exato)

### 1.1 O que dá pra afirmar
**[Certo]** Dá para computar "faltam 7 dias pra renovar" — com duas âncoras possíveis, uma frágil e uma correta:

| Âncora | Fonte | Confiabilidade | Custo |
|---|---|---|---|
| **(A) `plan_activated_at mod 30 == 23`** (o que o scan faz hoje) | `organizations.plan_activated_at` | **Média** — exata SÓ para planos mensais de 30 dias | zero (já codado) |
| **(B) `next_payment_date - 7 dias`** | `cakto_orders.raw_payload->subscription->next_payment_date` | **Alta** — data-verdade da Cakto; imune a ciclo/anual/dunning | exige persistir a coluna + trocar `computeRenewalPosition` |

### 1.2 Por que (A) funciona — e onde quebra
**[Certo]** A Cakto usa **período fixo de 30 dias** (`recurrence_period: 30`; no payload de teste `paid_at 2026-07-11 → next_payment_date 2026-08-10` = +30d exatos, não mês-calendário). E `cakto-plan-provisioning.ts:209` grava `plan_activated_at = now()` em **todo** webhook pago (`status ∈ {paid,approved}`), inclusive renovação (a org é achada por `cakto_customer_email` e o bloco "2) Ativa plano" roda mesmo p/ org existente). Logo, para um plano mensal, `plan_activated_at` sempre cai num limite de período real, e `mod 30 == 23` acerta 7 dias antes de cada renovação **sem depender de nada externo**.

**[Certo] Onde quebra (riscos concretos):**
1. **Planos anuais.** `platform_plans` tem `price_monthly` **e** `price_yearly`. Se qualquer oferta ativa for anual, `recurrence_period=365`, mas o env `NINA_RENEWAL_CYCLE_DAYS` é global (default 30) → o scan dispararia ~12x/ano errado.
2. **`plan_activated_at` de seed manual.** A única org hoje ("Studio Bella (Teste)", ativada 2026-06-18) não veio da Cakto (`cakto_subscription_id` NULO). Para orgs semeadas à mão, o `mod 30` é uma âncora arbitrária, não um limite de cobrança.
3. **Dunning/retry.** A assinatura de teste tem `max_retries:3, retry_interval:1`. Renovação atrasada re-ancora `plan_activated_at` na data do pagamento tardio; a próxima renovação real (`next_payment_date`) fica defasada — drift de alguns dias.

### 1.3 Recomendação
**[Provável] Âncora recomendada: (B), antes da base crescer.** Persistir `next_payment_date` + `recurrence_period` no provisionamento (o dado **já chega** no `raw_payload`) e computar D-7 = `next_payment_date::date - current_date = 7`. Elimina o palpite de ciclo, resolve anual e dunning de graça. É a versão "sênior aprovaria".

**[Certo] Para ligar JÁ (v1 pragmática):** (A) é **defensável** — desde que **(i)** todas as ofertas NexvyBeauty ativas sejam mensais-30 **e (ii)** a base real ainda seja ~0 (é: 1 org, de teste). Hoje o scan alcança **0 contas** (a única org está em `days_since=27`, `27 % 30 = 27 ≠ 23`). O risco de ligar a flag *pela ótica do D-7* é nulo agora; o risco real é o Fato 4 (brain).

### 1.4 SQL exato

**(A) — verificação do modelo atual (quem o scan pegaria hoje):**
```sql
select o.id, o.name, o.plan_activated_at,
       floor(extract(epoch from (now() - o.plan_activated_at))/86400)::int            as days_since,
       floor(extract(epoch from (now() - o.plan_activated_at))/86400)::int % 30       as cycle_pos
from public.organizations o
where o.plan_status = 'active'
  and o.plan_activated_at is not null
  and floor(extract(epoch from (now() - o.plan_activated_at))/86400)::int % 30 = 30 - 7;  -- targetPos=23
-- Resultado hoje (2026-07-15): 0 linhas.
```

**(B) — âncora recomendada, lendo a data-verdade já existente (hoje só no raw_payload; org-link ainda ausente):**
```sql
-- Quando next_payment_date for persistido (ex.: organizations.next_renewal_at):
--   select id, name from public.organizations
--   where plan_status='active' and (next_renewal_at::date - current_date) = 7;

-- Enquanto não persistido, a fonte crua (por org, último pedido):
select distinct on (co.organization_id)
       co.organization_id,
       (co.raw_payload->'subscription'->>'next_payment_date')::timestamptz as next_payment_date,
       (co.raw_payload->'subscription'->>'recurrence_period')              as recurrence_period
from public.cakto_orders co
where co.scope = 'organization'
  and co.raw_payload->'subscription' is not null
order by co.organization_id, co.paid_at desc;
-- Hoje: 0 linhas úteis (o único pedido é scope='platform', organization_id NULL, dado de teste).
```

---

## 2. `nina-health-scan`: o que já faz vs. o que falta codar

### 2.1 O que já faz (completo, deployado, gated)
Fluxo real em `supabase/functions/nina-health-scan/index.ts` (lido do commit PR-A `284e7d2`; deployado como v1 ACTIVE):
1. **Gate**: `NINA_HEALTH_SCAN_ENABLED != 'true'` → `{skipped:'flag_off'}`. Auth service-role **ou** `x-brain-secret` (timing-safe).
2. **D-7**: `computeRenewalPosition = daysSince(plan_activated_at) % CYCLE`; alvo = `CYCLE - LEAD` (30-7 = 23). `CYCLE`/`LEAD` por env (`NINA_RENEWAL_CYCLE_DAYS`/`NINA_RENEWAL_LEAD_DAYS`).
3. **Alvos**: `organizations` com `plan_status='active'` e `plan_activated_at not null`, filtradas em JS pela posição no ciclo.
4. **Conversa**: preferência pelo vínculo do handoff (`platform_crm_conversations.provisioned_organization_id`); fallback por `cakto_customer_email` → `platform_crm_leads` → conversa.
5. **Idempotência**: não reaborda se a Nina já falou (`metadata->>proactive_outreach='nina'`) nos últimos `CYCLE-LEAD` dias (≤ 1 abordagem/ciclo).
6. **Pin + disparo**: `update conversations set current_agent_id = nina.id`; insere a bolha (`sender_type='bot'`, `metadata.proactive_outreach='nina'`, `signal='renewal_d_minus_lead'`); envia por WhatsApp Cloud (conexão `active` resolvida uma vez). Persiste ANTES de entregar. Non-fatal por conta (um erro não derruba a varredura).

### 2.2 O que FALTA (ordenado por bloqueio)
| # | Falta | Bloqueia ligar? | Onde |
|---|---|---|---|
| F1 | **Brain com modo retenção em prod** (Fato 4) | **SIM — bloqueio duro** | `platform-sales-brain` (PR-B) |
| F2 | **Confirmar âncora**: todas as ofertas mensais-30 **ou** migrar p/ `next_payment_date` | SIM (correção) | `computeRenewalPosition` / provisionamento |
| F3 | **Excluir orgs de teste/comp** do alvo (ver §6-D4) | SIM (evita falso-positivo já hoje) | filtro em `organizations` |
| F4 | **Populações reais**: `cakto_customer_email` e `provisioned_organization_id` preenchidos no provisionamento/handoff | Verificar (a resolução de conversa depende disso) | provisionamento + onboarding-handoff |
| F5 | Sinais de churn (silêncio/uso) além do timer | Não (melhoria) | §3 |
| F6 | Hardening do fallback por e-mail (`.or()` sem escaping de vírgula/parêntese) | Não (baixo risco) | scan §3 |

**[Certo] Não é stub.** O que "falta" não é código do scan — é a **precondição de prod (brain)** e a **decisão de âncora**.

---

## 3. Sinais de churn viáveis com o dado real

A v1 é um **timer de renovação**, não um detector de churn. Com o dado que EXISTE dá para evoluir:

| Sinal | Dado real disponível | Como | Confiança |
|---|---|---|---|
| **Silêncio** | `platform_crm_conversations.last_message_at`, `.status` | dias desde a última msg > limiar | **Alta** — coluna existe e é mantida |
| **Fila parada** | `platform_crm_conversations.unread_count_agents` | salão não responde os próprios clientes | Média |
| **Queda de uso** | `agendamentos`, `booking_requests`, `platform_crm_booking_*` | volume/tendência de agendamentos por org caindo = salão largando o produto | **Alta** (é o coração do ERP salão) |
| **Jornada** | `platform_crm_journey_events`, `post_sale_event_logs` | eventos de ativação/pós-venda ausentes | Média |
| **Reclamação** | `platform_crm_messages` + `analyze-conversation`/`evaluate-conversation` | sentimento/intenção negativa nas mensagens | Média (depende do pipeline de análise já existente) |

**[Provável] Recomendação:** v1 sai com o **timer D-7** (é o gatilho proativo mínimo). "Uso caindo" (agendamentos) e "silêncio" (last_message_at) são os dois sinais de maior ROI para a v2 — ambos com dado maduro. Não bloqueiam o lançamento.

---

## 4. Como a Nina é PINADA e conecta ao modo retenção (#68)

**Cadeia projetada (quando PR-B estiver em prod):**
```
nina-health-scan  →  UPDATE conversations SET current_agent_id = nina.id   (PIN determinístico)
platform-sales-brain:
   pickPersonaForConversation(agents, current_agent_id)  →  devolve a Nina (pinada)
   retentionActive = isRetentionAgent(persona)           →  TRUE (agent_type='retention' | nome '%nina%')
   ⇒ remove buildCheckoutContext (SEM links/preço)
   ⇒ troca a regra 7 por RETENTION_RULE_BLOCK ("já comprou; NUNCA oferte; cuidar e reancorar no valor")
   ⇒ systemPrompt: "do time de Sucesso, Suporte e Retenção" (não "atendente de VENDAS")
```
`isRetentionAgent` (em `_shared/agent-routing.ts`) casa por `agent_type='retention'` (primário) **ou** nome `%nina%/%retenç%` (fallback de transição). O backfill já pôs Nina=`retention`, então casaria pelos dois.

**[Certo] O elo quebrado:** essa cadeia **não fecha em prod hoje** — o brain v33 não tem `isRetentionAgent`/`RETENTION_RULE_BLOCK` (Fato 4). O pin funcionaria (o scan seta `current_agent_id`), mas o brain trataria a Nina como vendedora. **O PIN sem o modo retenção é pior que nada** — é o vetor exato do risco.

---

## 5. A ORDEM exata pra ligar a flag com segurança

> Cada passo tem um **check binário**. Não avança sem o verde.

```
0. [JÁ FEITO] edge nina-health-scan deployada gated  →  POST retorna {skipped:'flag_off'}          ✅
0. [JÁ FEITO] cron nina-health-scan-daily ativo       →  cron.job #24 active=true                    ✅
0. [JÁ FEITO] backfill agent_type                      →  Nina.agent_type='retention'                 ✅  (mas inerte s/ brain)

1. DEPLOYAR PR-B (modo retenção no brain) em produção
   check: get_edge_function('platform-sales-brain') contém RETENTION_RULE_BLOCK E isRetentionAgent
          E NÃO contém "?? agents[0]"                                                                 ☐ HOJE: FALHA (v33)

2. CONFIRMAR a âncora D-7 contra o billing real
   check-a: nenhuma oferta NexvyBeauty ativa é anual (só price_monthly em uso)  — OU
   check-b: computeRenewalPosition migrado p/ next_payment_date (recomendado)                        ☐

3. EXCLUIR alvos indevidos (teste/complimentary/interno)
   check: a query do §1.4-A não retorna "Studio Bella (Teste)" nem subs is_complimentary            ☐

4. SMOKE controlado com a flag AINDA OFF
   check: invocar nina-health-scan manualmente e conferir `due`/`reached` = esperado (hoje due=0)     ☐

5. SÓ ENTÃO: NINA_HEALTH_SCAN_ENABLED = true
   check: 1ª coorte real de renovação recebe exatamente 1 bolha da Nina; conversa fica pinada;
          resposta da cliente entra em MODO RETENÇÃO (sem link/preço)                                 ☐
```

**A trava é o Passo 1.** Passos 2–4 são baratos. O Passo 1 é o que a premissa da tarefa presumia pronto e **não está**.

---

## 6. Decisões pro Marcelo

- **D1 — Âncora D-7 (a decisão técnica central).** [Provável] Recomendo **persistir `next_payment_date`/`recurrence_period` no provisionamento** (dado já chega no `raw_payload`) e computar `D-7 = next_payment_date - 7`. Alternativa de curto prazo: manter `mod 30`, mas **só** se você confirmar que **nenhuma oferta ativa é anual**. Qual caminho?
- **D2 — Ordem inegociável.** [Certo] O brain do PR-B **precisa ir a prod ANTES** de qualquer `NINA_HEALTH_SCAN_ENABLED=true`. A nota de inventário dizia "PR-B GO DADO / enfileirado" — o **código deployado (v33) contradiz**: não está lá. Confirmar/refazer o deploy do PR-B é o próximo ato real.
- **D3 — Escopo da v1.** [Provável] Ligar a Nina só como **timer D-7** (sem sinais de churn) é aceitável para o MVP. Silêncio (`last_message_at`) e queda de uso (`agendamentos`) entram na v2. Concorda em cortar aqui?
- **D4 — Alvo do scan.** [Certo] O scan mira `plan_status='active'` sem excluir **orgs de teste** ("Studio Bella (Teste)") nem **assinaturas `is_complimentary`**. Hoje, com a flag ligada, ele mandaria mensagem de renovação pra uma org que **não paga**. Precisa de um filtro de exclusão antes de ligar.
- **D5 — Dependências de dado do handoff.** [Palpite] A resolução de conversa depende de `provisioned_organization_id` (link do handoff) **ou** `cakto_customer_email`. Na única org ambos são NULOS. Validar que o **provisionamento real** popula `cakto_customer_email` e que o **onboarding-handoff** seta `provisioned_organization_id` — senão o scan acha D-7 mas não encontra a conversa (`skipped_no_conversation`).
- **D6 — Hardening menor.** [Palpite] Escapar vírgula/parêntese no `.or()` do fallback por e-mail do scan. Baixo risco (e-mails validados a montante); registrar como dívida, não bloqueio.

---

## Apêndice — evidências e IDs (para a próxima sessão)

- **Projeto:** `fzhlbwhdejumkyqosuvq` · **Produto:** slug `nexvybeauty`, id `806b5975-e268-402e-a65c-9e9503271041`
- **Agentes (prod):** Nina `d925bb6e-a506-4644-9995-7a7529113a33` `retention` · Duda `577fc770-…` `sdr` · Bia `8b684f7e-…` `closer` · Lia `927fe936-…` `support` (todos `is_active` + `active_in_whatsapp`)
- **Única org:** `2c88a73e-23ab-4247-8aa9-7c86ed249140` "Studio Bella (Teste)", `plan_status=active`, `plan_activated_at=2026-06-18`, `cakto_subscription_id=NULL`, `cakto_customer_email=NULL`
- **`subscriptions`** (1 linha, org acima): `premium/active/monthly`, `current_period_end=2026-07-18`, **`is_complimentary=true`**; **nenhuma edge escreve nessa tabela** — só telas super-admin (`SubscriptionsManager.tsx:151` faz `now()+30d` manual)
- **`cakto_orders`** (1 linha, teste): `scope=platform`, `organization_id=NULL`, `provider=cakto`, `raw_payload->subscription`: `next_payment_date=2026-08-10`, `recurrence_period=30`, `current_period=1`, `status=active`
- **Edges (prod):** `nina-health-scan` ACTIVE v1 (gated) · `platform-sales-brain` ACTIVE **v33 sem modo retenção** · `cron.job #24 nina-health-scan-daily 0 12 * * * active`
- **Git:** PR-A `284e7d2` (nina-health-scan) e PR-B `2eeaff5` (brain retenção) **não estão na `main`**; deploy é manual (desacoplado do merge)
- **Arquivos-chave:** `supabase/functions/nina-health-scan/index.ts` (`computeRenewalPosition`, PR-A) · `_shared/agent-routing.ts` (`isRetentionAgent`) · `_shared/cakto-plan-provisioning.ts:209` (`plan_activated_at=now()`) · `platform-sales-brain/index.ts` (galho `retentionActive`, PR-B) · `migrations_platform_crm/20260715_nina_health_scan_cron.sql` (cron) · `20260715_agent_type_backfill.sql`
