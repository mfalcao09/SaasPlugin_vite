# P2 — Blueprint dos 3 agentes-casca: Nina · Nexvy · Orquestrador

> **Data:** 2026-07-15 · **Escopo:** READ-ONLY + design (nenhum código/banco alterado)
> **Repo:** `apps/NexvyBeauty` · **Banco:** `fzhlbwhdejumkyqosuvq` (só leitura, MCP)
> **Roteador:** `supabase/functions/platform-sales-brain/index.ts`
> **Produto (plataforma):** `806b5975-e268-402e-a65c-9e9503271041`

---

## A verdade desconfortável primeiro

Dos 3 cascas, **2 não deveriam existir como "agente que conversa"** e 1 é papel real ainda não coberto:

- **Nexvy (Ativação)** é **redundante** com a Lia. E o gap do P10 que ela "resolveria" (boas-vindas proativas) **não é problema de persona — é problema de DISPARO**: nada na plataforma dispara mensagem proativa pós-compra hoje. Trocar a persona não conserta isso.
- **Orquestrador** **não é um bot** — é o dispatcher, e o dispatcher **já existe em código** (`pickPersonaForConversation`). Uma linha-persona chamada "Orquestrador Cliente-de-Volta" em `platform_crm_product_agents` é categoria errada — e o nome ainda **colide** com a feature de reativação REAL do produto-tenant (`organization_orchestrator_config`, outra tabela).
- **Nina (Retenção)** é o único papel novo e legítimo. Vale construir.

Recomendação-mãe: **não trate os 3 como "3 agentes a preencher".** Trate como **1 agente a construir (Nina)**, **1 gap de disparo a resolver (greeting da Lia)** e **2 linhas-casca a aposentar (Nexvy + Orquestrador)**.

---

## [Fact-Forcing Gate] — 4 fatos, verificados agora via DB + código

**Fato 1 — Os 3 cascas estão ATIVOS no WhatsApp com prompt-placeholder.**
Tabela `platform_crm_product_agents`, `primary_objective` = `"Atender o lead conforme o objetivo definido."` (44 chars genéricos), `additional_prompt` vazio, `tone_style=friendly`, criados 2026-07-04. Todos `is_active=true` **e `active_in_whatsapp=true`** → entram na `agentList` do brain.

**Fato 2 — O roteador é string-match por nome, com fallback não-determinístico.**
`platform-sales-brain/index.ts`: `isSdrAgent` (l.259-263, casa `sdr`/`qualifica`/`duda`), `isCloserAgent` (l.266-270, casa `closer`/`bia`), `pickSdrPersona` (l.273-276) = `agents.find(isSdrAgent) ?? agents[0]`. A query de agentes (l.898-905) **não tem `ORDER BY`** → `agents[0]` é a ordem que o Postgres devolver.

**Fato 3 — Hoje nenhum casca responde sozinho; o risco é latente.** Com a Duda ativa, `pickSdrPersona` sempre acha a Duda (match por nome, mesmo com `agent_type='custom'`) → `agents[0]` nunca dispara; `current_agent_id` só é escrito pela linha Duda→Bia (brain l.1234) e Duda→Lia (`onboarding-handoff.ts:120`). Nenhum caminho automático pina um casca. O risco abre se: (a) a Duda for desativada/renomeada → `agents[0]` cai em casca; (b) pin manual (`manual-outreach:296-317`, TransferConversationModal); (c) roteador futuro por `agent_type`.

**Fato 4 — "Resposta vazia" é premissa errada: seria voz genérica com nome de bastidor.** O `systemPrompt` (l.1021-1053) sempre injeta nome + REGRAS INVIOLÁVEIS hardcoded; `primary_objective`/`additional_prompt` são condicionais. Um casca pinado responderia como **vendedora genérica** assinando "Orquestrador Cliente-de-Volta" no número oficial — **pior que vazio**. O guard de l.912-916 (`skipped: no_active_persona`) só protege quando NÃO há persona alguma, não quando a persona tem prompt fraco.

---

## 1. Estado real dos 3 agentes + o bug

### Inventário completo (produto `806b5975…`, tabela `platform_crm_product_agents`)

| Agente | ID | agent_type | active_wa | primary_objective | additional_prompt | Situação |
|---|---|---|---|---|---|---|
| Duda — SDR Qualificadora | `577fc770-1688-464c-9ff9-46244c9b203b` | `custom` | ✅ | 630 chars | 1790 chars | ✅ pronta (SDR) |
| Bia — Closer | `8b684f7e-e7a7-436d-aa48-4817e203ccaf` | `closer` | ✅ | 481 chars | 1589 chars | ✅ pronta (closer) |
| Lia · Implantação | `927fe936-0965-4693-90be-5944e745359b` | `support` | ✅ | 238 chars | 1222 chars | ✅ pronta (CS/impl., pin P10) |
| **Nina — Sucesso, Suporte & Retenção** | `d925bb6e-a506-4644-9995-7a7529113a33` | `custom` | ✅ | **44 (placeholder)** | **0** | 🟡 casca |
| **Nexvy — Ativação Pós-Venda** | `48aa225c-a09f-4956-b5b7-a9826544eaea` | `custom` | ✅ | **44 (placeholder)** | **0** | 🟡 casca |
| **Orquestrador Cliente-de-Volta** | `d54ea78d-c0b0-4058-a51f-af38e442d53a` | `custom` | ✅ | **44 (placeholder)** | **0** | 🟡 casca |

### O bug, mecânica exata

O brain carrega TODOS os agentes `is_active + active_in_whatsapp` do produto — os 3 cascas incluídos. O que os impede de falar hoje é frágil e circunstancial:

1. **Fallback `agents[0]` (l.275):** `agents.find(isSdrAgent) ?? agents[0]`. Enquanto a Duda existir e casar `isSdrAgent`, o `?? agents[0]` está morto. Desative/renomeie a Duda e, **sem `ORDER BY` na query**, `agents[0]` vira roleta — pode ser Nina/Nexvy/Orquestrador.
2. **Pin por `current_agent_id` (l.289-291):** se algo escrever `current_agent_id = <casca>.id`, `pickPersonaForConversation` devolve o casca e **é ele quem fala**. Caminhos de escrita manual existem (`manual-outreach`, transferência no painel).
3. **Resultado:** no número **oficial de vendas**, um agente de retenção/ativação — ou o literal "Orquestrador Cliente-de-Volta" — responderia uma lead com objetivo nulo e voz genérica. Queima de marca, não erro silencioso.

**Conclusão:** o bug não está armado hoje, mas está **carregado**. `active_in_whatsapp=true` em casca sem prompt é uma arma engatilhada apontada pro número oficial.

---

## 2. Papel + prompt proposto (só do que faz sentido construir)

### 2.1 NINA — Sucesso, Suporte & Retenção ✅ CONSTRUIR

**Papel real:** cuida da cliente que **já usa** o produto — suporte contínuo do dia a dia + detecção de risco de churn + salvar a renovação. É a única das três que ocupa um espaço vazio de verdade (pós-implantação, a Lia entrega o espaço no ar e some; ninguém acompanha depois).

**`primary_objective` (proposto):**
> Cuidar da cliente que já usa o NexvyBeauty: tirar dúvida do dia a dia, destravar o que ela não conseguiu sozinha e, quando aparecer sinal de risco (sumiu, uso caiu, reclamou, renovação chegando), agir pra ela ficar. Objetivo: cliente ativa e renovando. A venda já aconteceu: PROIBIDO ofertar plano, preço, upgrade ou link. Sempre "seu espaço", nunca "salão". Cobrança/reembolso, bug que não resolvo ou pedido de humano → [ESCALAR_HUMANO].

**`additional_prompt` (proposto):**
> VOCE E A NINA — Sucesso e Retenção do NexvyBeauty. A cliente JA e usuaria; voce e quem cuida dela pra ela continuar e renovar.
>
> TOM: proxima e resolvedora, WhatsApp de verdade (ate 300 caracteres, no maximo 1 pergunta por mensagem, max 1 emoji). Micro-ack no que ela disse antes de agir.
>
> QUANDO VOCE ABRE (proativa): voce foi acionada por um SINAL (renovacao chegando, uso caiu, silencio, reclamacao). NAO comece com discurso — puxe pelo cuidado: pergunte como esta indo o espaco dela, ou ofereca ajuda no ponto exato do sinal. Uma mensagem curta e humana.
>
> REGRAS DURAS:
> - A venda ACABOU. PROIBIDO ofertar plano, preco, upgrade, link de pagamento ou fundadora. Retencao NAO e desconto: e resolver a dor e lembrar o valor que ela ja tem.
> - Linguagem NEUTRA: "seu espaco", nunca "salao".
> - UM passo por mensagem. Nada de textao.
> - Cobranca/reembolso, bug que voce nao resolve, cancelamento formal ou pedido de humano -> [ESCALAR_HUMANO].
> - Nunca invente funcionalidade nem prometa prazo fora do conhecimento do produto.
> - Se ela quiser sair, entenda o porque com calma (1 pergunta), resolva o que der, e so entao escale — nunca prometa reembolso/desconto por conta propria.

> **Nota de engenharia:** o brain HOJE só responde a inbound. A Nina proativa (abrir conversa por sinal) exige um **disparador novo** (ver Fase 1). O prompt acima já contempla o modo "abertura proativa" pra quando esse disparador existir.

### 2.2 Greeting proativo pós-compra — vai na LIA, não numa "Nexvy"

O gap do P10 (Lia só responde à próxima msg) some com um disparo proativo. A Lia **já tem no prompt** "Primeira fala: dê boas-vindas pela compra" — ela só nunca é acionada. Texto de abertura proativa (mesma voz da Lia, ≤300 chars/bolha):

> **Bolha 1:** "Oi {nome}! Que alegria te ver no NexvyBeauty 💚 Sou a Lia, vou te acompanhar na montagem do seu espaço."
> **Bolha 2:** "Seu acesso já está no seu e-mail. Quando abrir, me chama aqui que a gente monta tudo junto, um passo por vez. Bora?"

Isso é 1 disparador + a Lia — **não** um segundo agente. Ver Fase 2.

### 2.3 Nexvy e Orquestrador — sem prompt de conversa

Não escrevo prompt pra eles porque a recomendação é **não construí-los como personas** (ver §3). Se o Marcelo decidir o contrário, o texto de greeting acima é o que a "Nexvy-greeter" usaria — mas ele pertence à Lia.

---

## 3. Decisões de design que dependem do Marcelo (com recomendação)

### Decisão A — Nexvy: redundante, greeter ou trial?

| Opção | O que é | Implicação | Veredito |
|---|---|---|---|
| **(a) Redundante → aposentar** | A Lia cobre a ativação; Nexvy sai do ar | 1 persona a menos pra manter; gap do P10 resolvido via disparo na Lia | **✅ RECOMENDADO** |
| (b) Greeter proativo | Nexvy dá o "oi" e passa pra Lia | 2 agentes pra 1 job; e **não resolve** o gap (o gap é disparo, não persona) | ❌ |
| (c) Ativação de trial/self-service | Compra direta sem SDR | Papel legítimo, mas **não há fluxo de trial/self-service hoje** | ⏸️ reservar pro futuro |

**Recomendação:** (a). O gap do P10 é de disparo — resolve na Lia. Guarde o nome "Nexvy" pro dia que existir self-service/trial (opção c), aí sim é papel distinto.

### Decisão B — Nina: qual gatilho de saúde-de-conta?

Não há cron de saúde na plataforma hoje — precisa ser construído. Desenho proposto:

- **Motor:** `pg_cron` diário (ex.: 09:00) → função edge `nina-health-scan` que varre contas provisionadas e classifica sinais de risco.
- **Sinais (ordem de dor):** (1) **renovação em D-X** (ex.: D-7 do fim do ciclo); (2) **queda de uso** (sem login / sem agendamentos criados em N dias); (3) **silêncio** (X dias sem atividade); (4) **reclamação** (tag/escalada recente).
- **Ação:** pra cada conta em risco, abre/reusa a conversa da cliente, pina `current_agent_id = nina.id` e dispara **1 mensagem proativa** (mesma infra de disparo do greeting da Lia — construir uma vez, usar nas duas).
- **Onde plugar:** `pg_cron` (agenda) → edge (`nina-health-scan`) → disparador proativo compartilhado. **Não** webhook (webhook é reativo a inbound; saúde-de-conta é proativa por tempo).

**Recomendação:** começar SÓ com o sinal (1) renovação D-7 (o de maior ROI e menor ruído). Uso/silêncio/reclamação entram numa 2ª iteração, depois de medir falso-positivo.

> ⚠️ **Verificar antes de codar:** confirmar onde vive o ciclo/renovação de cada tenant (assinatura Cakto/`subscriptions`/`organizations`) e o sinal de "uso" (login/agendamentos). Não inferir a fonte — checar no schema. (Premissa explícita, §8.1 do CLAUDE.md.)

### Decisão C — Orquestrador: migrar o roteador agora ou depois?

**O que o "Orquestrador" realmente é:** o dispatcher que decide quem fala a cada turno. **Isso já existe** em `pickPersonaForConversation` (código), e o estado por conversa já vive em `current_agent_id` (a máquina de estados de fato). A linha-persona "Orquestrador Cliente-de-Volta" é uma categoria errada, e o nome **colide** com a feature de reativação do TENANT (`organization_orchestrator_config` + `orchestrator_state`, tabela `product_agents` — mundo diferente).

**Migração desenhada (nome→`agent_type`), se/quando valer:**
- **Alvo:** `agent_type ∈ {ldr, bdr, sdr, closer, activation, cs, retention, portfolio}`. Não há CHECK constraint em `agent_type` hoje (é varchar livre) — migrar é viável sem DDL de constraint.
- **Máquina de estados (`lead.stage → agente`):** `novo → sdr` (Duda) · `qualificado_cetico → closer` (Bia) · `comprou → cs` (Lia, via pin) · `ativo_em_risco → retention` (Nina).
- **Backfill:** Duda `custom→sdr`; Bia mantém `closer`; Lia `support→cs`; Nina→`retention`; Nexvy→`activation` (ou remover); Orquestrador→remover.
- **Troca no código:** `isSdrAgent` passa a `agent_type==='sdr'` (com fallback ao match-nome durante a transição); idem `isCloserAgent`. Pontos a tocar: `pickSdrPersona`, pin inicial (l.924), busca do closer no `[PASSAR_BIA]` (l.1109-1118).

**Esforço/risco:** médio. O match-por-nome está **espalhado** em 3-4 pontos e é comprovadamente frágil — a migração da Lia teve que **evitar a palavra "duda"** no texto porque `isSdrAgent` faz `hay.includes('duda')`. Trocar cedo demais, com só 3 agentes que conversam, é over-engineering.

**Recomendação:** **migrar DEPOIS**, atrelado à entrada da Nina (o 4º agente que conversa) — aí o número de personas justifica `agent_type` + estados, e há uma golden suite (`tmp-eval-agents`) pra provar paridade antes/depois. **Agora:** aposentar a linha-casca do Orquestrador; o pin (`current_agent_id`) já é o dispatcher.

---

## 4. Plano de construção em fases + check binário

| Fase | Entrega | Check binário (passou/falhou) |
|---|---|---|
| **0 — Ponte (HOJE)** | `active_in_whatsapp=false` nos 3 cascas | Query nos 3 IDs retorna `active_in_whatsapp=false`; a `agentList` do brain volta a ser exatamente `[Duda, Bia, Lia]` |
| **1 — Nina (persona + gatilho)** | Prompt da Nina + `pg_cron` diário + edge `nina-health-scan` + disparador proativo (sinal D-7) | Cron roda no horário; conta com renovação em D-7 recebe **1** msg proativa da Nina; `current_agent_id` da conversa = `nina.id`; sem D-7 → 0 msgs (sem falso-positivo) |
| **2 — Greeting proativo (Lia)** | Disparador proativo no `cakto-plan-provisioning` pós-handoff | Compra de teste → cliente recebe boas-vindas da Lia **sem** ter mandado nenhuma msg; conversa segue `bot_active` |
| **3 — Aposentar Nexvy + Orquestrador** | Decisão do Marcelo (§3-A e §3-C) aplicada | Linhas com `is_active=false` (ou renomeadas/removidas); roteador do brain **inalterado**; eval `tmp-eval-agents` verde |
| **4 — (Opcional) Roteador→`agent_type`** | Backfill `agent_type` + troca `isSdrAgent`/`isCloserAgent` + máquina de estados | Golden suite `tmp-eval-agents` verde **antes e depois**; Duda/Bia/Lia roteiam por `agent_type`, não por nome |

**Ordem de dependência:** Fase 0 é independente e imediata. Fase 1 e 2 compartilham o **disparador proativo** (construir uma vez). Fase 4 só depois de a Nina existir. Nada da Fase 1-4 abre sem Review da fase anterior (§14 CLAUDE.md).

---

## 5. Ação-ponte imediata pro bug (o que fazer HOJE)

**Recomendação: kill-switch, não prompt.** Dar prompt agora comprometeria com um design ainda não decidido (Nexvy/Orquestrador podem ser aposentados). Tirar do WhatsApp é reversível, não bloqueia nada (os cascas não fazem nada hoje) e **desarma** o `agents[0]`/pin.

SQL proposto (a executar pelo Marcelo — este doc é READ-ONLY):

```sql
-- Desarma os 3 cascas no número oficial até serem construídos/aposentados.
update platform_crm_product_agents
set active_in_whatsapp = false, updated_at = now()
where id in (
  'd925bb6e-a506-4644-9995-7a7529113a33',  -- Nina
  '48aa225c-a09f-4956-b5b7-a9826544eaea',  -- Nexvy
  'd54ea78d-c0b0-4058-a51f-af38e442d53a'   -- Orquestrador
);
```

**Check binário:** após o update, a query de agentes do brain (`is_active AND active_in_whatsapp`, produto `806b5975…`) retorna exatamente 3 linhas: Duda, Bia, Lia.

**Poderia algum casca responder vazio HOJE?** Não automaticamente — a Duda intercepta o `isSdrAgent` e nada pina os cascas. Mas o risco está carregado (Duda desativada → `agents[0]` roleta; pin manual). A ponte remove o risco em 1 comando, sem efeito colateral.

---

## Review

- **Investigação (prova):** 5 queries no banco `fzhlbwhdejumkyqosuvq` (inventário, colunas, constraints, prompts) + leitura de `platform-sales-brain/index.ts` (1382 linhas), `_shared/onboarding-handoff.ts`, `platform-meta-whatsapp-webhook/index.ts`, e grep dos escritores de `current_agent_id`. IDs e linhas citados são reais.
- **Correções de premissa do briefing:** (1) "prompt=0" → na verdade `primary_objective`=44 chars placeholder + `additional_prompt`=0; (2) "resposta vazia" → seria voz genérica com nome de bastidor (pior que vazio); (3) "main-brain:271" → o fallback real é `platform-sales-brain/index.ts:275`; (4) o gap do P10 é de **disparo proativo**, não de persona.
- **Fronteira confirmada:** Orquestrador de reativação REAL vive no mundo TENANT (`product_agents` + `organization_orchestrator_config`), não em `platform_crm_product_agents`. O casca homônimo é outra coisa.
- **Pendências pro Marcelo:** Decisão A (Nexvy: aposentar ✅) · Decisão B (Nina: gatilho D-7 primeiro) · Decisão C (Orquestrador: migrar depois, aposentar linha agora) · executar o SQL-ponte da §5.

---

## Execução (2026-07-15) — código 100% pronto, 2 PRs cortados

> Sessão de EXECUÇÃO (não a de blueprint). Decisões do Marcelo aplicadas: Nina CONSTRUIR · Nexvy APOSENTAR (Lia proativa) · Orquestrador/roteador MIGRAR AGORA. Base dos PRs = `origin/main` (`4aa1b06`, já com o handoff P10). Supabase MCP não estava conectado nesta sessão → migrations aguardam o MCP do Marcelo.

### Regra de fronteira que definiu os 2 PRs
**PR-A nunca toca `platform-sales-brain/index.ts`** (o motor da Duda LIVE) → baixo risco. **PR-B concentra TODA mudança no brain** → alto blast-radius, aguarda GO. Descoberta que forçou isso: se o `nina-health-scan` pina a Nina e a cliente responde, o brain HOJE a trata como **Bia/closer** (branch `else` da regra 7) e injeta links de pagamento — violando a regra-mãe da Nina. Logo a Nina precisa de um **modo retenção no brain** (PR-B), e o health-scan nasce **gated OFF** pra não abrir janela de risco antes disso.

### 2 decisões de engenharia (declaradas, dentro do escopo)
- **E1 — "não desativar cascas" = segurança pela LÓGICA:** a defesa-mãe é `pickSdrPersona: ?? agents[0]` → `?? null`. Com isso, mesmo os 3 cascas ativos no WhatsApp, nenhum abre conversa (sem SDR → guard `no_active_persona`). Nenhum `is_active`/`active_in_whatsapp` foi tocado. "Aposentar Nexvy" = aposentar o PAPEL (Lia faz o greeting; Nexvy sem prompt).
- **E2 — greeting da Lia SUBSTITUI o welcome genérico** (não soma): senão a compradora recebe boas-vindas em dobro. Com `ONBOARDING_HANDOFF_ENABLED` OFF (produção hoje) → comportamento idêntico ao atual.

### PR-A — `feat/p2-nina-lia-greeting` → **PR #67** (deployável)
| Item | Entrega | Estado |
|---|---|---|
| A1 | `20260715_nina_retencao_prompt.sql` — prompt da Nina (primary_objective + additional_prompt) | ✅ código; ⏳ aplicar via MCP |
| A2 | Edge `nina-health-scan` (gated `NINA_HEALTH_SCAN_ENABLED`=OFF): D-7 → pina Nina → 1 abertura | ✅ **deployada + smoke** (retorna `flag_off`) |
| A3 | `20260715_nina_health_scan_cron.sql` — pg_cron 09:00 BRT → edge (no-op com flag OFF) | ✅ código; ⏳ aplicar via MCP |
| A4 | Greeting proativo da Lia (`onboarding-handoff.ts` + `cakto-plan-provisioning.ts`) | ✅ código; deploy junto do flip P10 |
| A5 | Nexvy aposentado (papel) | ✅ |
| — | config.toml `verify_jwt=false` p/ a edge | ✅ deployado |

`deno check` limpo em todos. **⚠️ Âncora do D-7 a confirmar** (blueprint §Decisão B): as colunas de renovação de `organizations` não estão versionadas (drift); modelei `dias_desde(plan_activated_at) mod ciclo == ciclo−lead` (env 30/7), isolado em `computeRenewalPosition()`. Confirmar o billing real da Cakto antes de ligar a flag.

### PR-B — `feat/p2-roteador-agent-type` → **PR #68** (⛔ aguarda GO)
| Item | Entrega | Estado |
|---|---|---|
| B1 | `isSdrAgent`/`isCloserAgent`/`isRetentionAgent` por `agent_type` + fallback nome | ✅ |
| B2 | `pickSdrPersona: ?? null` (mata a roleta `agents[0]`) | ✅ |
| B3 | Modo retenção no brain (`retentionActive`: sem links/preço + `RETENTION_RULE_BLOCK` + neutraliza "VENDAS") | ✅ |
| B4 | `20260715_agent_type_backfill.sql` (Duda→sdr, Nina→retention; idempotente) | ✅ código; ⏳ validar+aplicar via MCP com GO |
| B5 | Extração p/ `_shared/agent-routing.ts` + `agent-routing.test.ts` | ✅ **`deno test` 6/6 verde** |

Prova de segurança (smoke, sem deploy): Duda roteia pré/pós-backfill; **NENHUM casca abre** — nem com os 3 ativos; pin respeitado; Nina só por pin. Integração pós-deploy: `tmp-eval-agents` (gate 90%).

### Ordem de ativação (dependência)
1. **Validar `agent_type` real** (query no header do backfill) → aplicar backfill + deploy do brain (PR-B, **com GO**).
2. Rodar `tmp-eval-agents` (paridade Duda/Bia).
3. Aplicar migrations do PR-A (prompt Nina + cron) via MCP; deploy `cakto-webhook`+`cakto-reprocess-order` (greeting).
4. **Só então** ligar `NINA_HEALTH_SCAN_ENABLED=true` (a Nina passa a ser conduzida em modo retenção) — e, quando quiser, `ONBOARDING_HANDOFF_ENABLED=true` (greeting da Lia + handoff P10).

### Comandos de deploy pendentes (precisam do MCP/credencial do Marcelo)
```
# Migrations (via MCP apply_migration — migrations_platform_crm/ ficam FORA do db push):
#   20260715_nina_retencao_prompt.sql        (PR-A)
#   20260715_nina_health_scan_cron.sql       (PR-A)
#   20260715_agent_type_backfill.sql         (PR-B — validar agent_type real ANTES; com GO)
# Edges (CLI, já autenticado):
supabase functions deploy cakto-webhook --project-ref fzhlbwhdejumkyqosuvq          # PR-A (greeting, junto do flip P10)
supabase functions deploy cakto-reprocess-order --project-ref fzhlbwhdejumkyqosuvq  # PR-A
supabase functions deploy platform-sales-brain --project-ref fzhlbwhdejumkyqosuvq   # PR-B (com GO)
```
