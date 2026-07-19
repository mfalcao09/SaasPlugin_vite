# P10 — Handoff SDR: Duda → pagamento → Lia no MESMO thread de WhatsApp

**Blueprint de ativação em produção · 2026-07-15 · investigação read-only (nenhum código editado, nada deployado, nenhuma migration aplicada)**

Projeto Supabase: `fzhlbwhdejumkyqosuvq` · Repo: `apps/NexvyBeauty`

---

## TL;DR (a verdade desconfortável primeiro)

1. **O handoff NÃO está deployado — nem como código morto.** O bundle do `cakto-webhook` v35 em produção (deployado 2026-07-15T00:15 do worktree sunset) **não contém** `onboarding-handoff.ts`, nem `handoffConversationToOnboarding`, nem `ONBOARDING_HANDOFF_ENABLED` (verificado byte a byte via `get_edge_function`). O shared existe só no repo (origin/main, via PR #63).
2. **A topologia git é diferente do que se pensava:** a main LOCAL (7b446c7) divergiu da origin/main (f63219c) — o local NÃO contém #63 nem #65. O working tree uncommitted é diff contra essa base velha, por isso carrega tanto lixo pré-sunset. **O porte tem que nascer de `origin/main`, nunca da main local nem do working tree inteiro.**
3. **Bug P0 no matching, confirmado com dados de produção:** o webhook inbound grava `visitor_whatsapp`/`visitor_phone` como `+55...` (com `+`; `platform-meta-whatsapp-webhook/index.ts:185-186`), mas `phoneVariantsBR` gera variantes **só-dígitos** com match exato `.in.()` — as 3/3 conversas WhatsApp de produção têm `+`. **Como está, o match por telefone erra 100%** e só o fallback de e-mail salvaria o handoff. O fix é trivial e tem que entrar no PR do porte.
4. **O banco está 100% pronto** (migration `20260714_onboarding_fase_handoff.sql` aplicada e verificada): coluna, índice, 2 RPCs e a Lia seedada e ativa.
5. O que falta é pequeno e cirúrgico: **1 PR de porte (5 hunks + 1 fix), deploy de 3 edges, 1 secret, 2 smokes.** Meio dia a 1 dia com verificação honesta.

---

## 1) Estado real nas camadas

| Peça | origin/main (pós-#65, `f63219c`) | Deployado (prod) | Working tree local (uncommitted) | Banco (fzhlbwhdejumkyqosuvq) |
|---|---|---|---|---|
| `_shared/onboarding-handoff.ts` | ✅ existe (130 linhas, do PR #63) | ❌ **ausente do bundle** do cakto-webhook v35 (verificado) | ❌ **não existe** (base local é pré-#63) | n/a |
| Chamada do handoff no `_shared/cakto-plan-provisioning.ts` | ❌ não chama (idêntico ao sunset-wt, diff vazio) | ❌ não chama (v35 = origin/main) | ✅ chama (import :8 + call :581-598, gate `org_created` :569) | n/a |
| `platform-sales-brain` modo implantação | ❌ zero refs a onboarding (grep vazio) | ❌ idêntico à origin/main (diff = 0 linhas vs sunset-wt) | ✅ completo (:652-748 consts, :927-958 passo 7.5, :996-1001, :1029, :1040) | n/a |
| `platform-sales-copilot` | versão sunset | v27 = origin/main | ⚠️ diff = 100% lixo pré-sunset (founder view, "piloto") — **zero handoff** | n/a |
| `ONBOARDING_HANDOFF_ENABLED` | lido só em `onboarding-handoff.ts:37` | **não existe em nenhum bundle deployado** | lido no brain :933-934 (+ comments) | secret não setado (nada o lê hoje) |
| Coluna `platform_crm_conversations.provisioned_organization_id` | migration no repo (`migrations_platform_crm/20260714_onboarding_fase_handoff.sql`) | — | — | ✅ existe + índice parcial `idx_platform_crm_conversations_provisioned_org` |
| `onboarding_submissions.current_step`/`current_step_id` | migration no repo | — | — | ✅ existem (2 colunas) |
| RPCs `set_onboarding_step` / `set_onboarding_step_public` | migration no repo; frontend chama (`src/hooks/useImplantacao.ts:200-203`, no origin/main) | — | — | ✅ ambas existem |
| Agente "Lia · Implantação" | seed na migration | — | — | ✅ `927fe936-0965-4693-90be-5944e745359b`, `support`, `is_active=true`, `active_in_whatsapp=true`, product = nexvybeauty (`806b5975-…`) |
| Conversas com vínculo | — | — | — | 0 (nunca rodou — esperado) |
| Formato `visitor_whatsapp` em prod | — | — | — | ⚠️ **3/3 com `+` (E.164)** — quebra o match atual |

**Versões deployadas:** `cakto-webhook` v35, `platform-sales-brain` v30, `platform-sales-copilot` v27 (todos 2026-07-15T00:15, do sunset-wt). ⚠️ **`cakto-reprocess-order` v30 é de 2026-07-06** — também importa `cakto-plan-provisioning.ts` e está com bundle pré-tudo; entra na lista de redeploy.

### O que a origin/main JÁ resolve sozinha (pergunta b)

- `ONBOARDING_RULE_BLOCK` **não existe** na main. O brain pós-#65 não lê `provisioned_organization_id` em lugar nenhum.
- **A Lia JÁ entra no agentList**: a query (`main-brain:808-815`) filtra `product_id` + `is_active=true` + `active_in_whatsapp=true` — a Lia satisfaz os três. E o pin (`pickPersonaForConversation`, main-brain:284-294) respeita `current_agent_id`.
- ⚠️ **Porém, com o brain ATUAL, uma Lia pinada falaria como BIA**: `isSdrAgent` (:258-263) e `isCloserAgent` (:265-270) dão `false` pra ela → `personaIsSdr=false` → a regra 7 do prompt (main-brain:913) cai no ramo `VOCÊ É A BIA (closer de VALOR)`, com links de checkout no contexto. **Por isso a ordem de ativação importa: deploy do brain ANTES do secret.**

---

## 2) O DELTA exato a portar (e o que descartar)

**Estratégia:** branch a partir de **origin/main**. NÃO commitar o working tree (ele reverteria o #65: reintroduz `founder_status` no provisioning, o vocabulário "Piloto Fundadora", o QCRV antigo 217, `oferta_piloto`, e **desfaria o fix R5** — o filtro `is_public` que impede o plano "Teste E2E" R$10 de vazar como link ofertável). O copilot e o SalesPage.tsx uncommitted são 100% lixo pré-sunset: **descartar por inteiro**.

### 2.1 `_shared/cakto-plan-provisioning.ts` — 2 hunks (fonte: working tree :8 e :581-598)

**Hunk A — import** (origin/main após a linha 7, `normalizePhoneBR`):

```ts
import { handoffConversationToOnboarding } from './onboarding-handoff.ts';
```

**Hunk B — chamada** (origin/main, dentro do `if (planRes.org_created) {` da :553, logo após o `await sendWelcomeWhatsApp(...)` que termina na :564):

```ts
    // HANDOFF Duda→CS pós-compra (gated por ONBOARDING_HANDOFF_ENABLED, default
    // OFF): a conversa de VENDA da compradora passa pro agente de CS/implantação
    // e ganha o vínculo conversa↔org (provisioned_organization_id) que liga o
    // modo implantação do platform-sales-brain. Non-fatal por design (a função
    // nunca lança); try/catch de cinto-e-suspensório — jamais derruba quem pagou.
    try {
      const handoff = await handoffConversationToOnboarding(admin, {
        organizationId: planRes.organization_id,
        customerPhone: order.customer_phone ?? null,
        customerEmail: order.customer_email ?? null,
      });
      console.log('[cakto-provisioning] onboarding handoff:', JSON.stringify(handoff));
    } catch (e) {
      console.warn('[cakto-provisioning] onboarding handoff (non-fatal):', String(e).slice(0, 200));
    }
```

**❌ NÃO portar do working tree:** o hunk F2.4 `founder_status` (:196-215 do WT) — superseded pelo #65.

### 2.2 `platform-sales-brain/index.ts` — 4 hunks (fonte: working tree)

**Hunk C — bloco de consts do modo implantação** (WT :652-748 inteiro: comentário GATE DUPLO + `ONBOARDING_RULE_BLOCK` + `WIZARD_PAGES` [playbook das 9 páginas] + `buildOnboardingPhaseContext`). Inserir na origin/main entre a :654 (fim de `normalizeAreaAtendimento`) e a :656 (`Deno.serve`). É adição pura — aplica limpo.

**Hunk D — passo 7.5** (WT :927-958 inteiro: `onboardingActive`/`onboardingPhaseContext`/`onboardingFlagOn` + select de `provisioned_organization_id` + select de `onboarding_submissions` + chamada de `buildOnboardingPhaseContext`). Inserir na origin/main após o bloco PIN INICIAL (:832-839), antes da :841 (`// 8) CONHECIMENTO`). Adição pura — aplica limpo.

**Hunk E — supressão de checkout no modo implantação** (origin/main :872-874). Trocar:

```ts
    const knowledgeContext = buildKnowledgeContext(product)
      + buildCheckoutContext(plans, persona.name ?? 'duda')
      + (plans.length ? PRICE_RULE_BLOCK : '');
```

por:

```ts
    // MODO IMPLANTAÇÃO: SEM links de pagamento nem regra de preço — a cliente já
    // comprou; instruções de "mande o link" corromperiam o papel de CS. Com
    // onboardingActive=false (todo fluxo de venda), a expressão é IDÊNTICA à atual.
    const knowledgeContext = buildKnowledgeContext(product)
      + (onboardingActive ? '' : buildCheckoutContext(plans, persona.name ?? 'duda')
      + (plans.length ? PRICE_RULE_BLOCK : ''));
```

⚠️ **Manter `buildKnowledgeContext(product)` com 1 argumento** — a versão do WT passa `campaign` (founder view, morta no #65). Não portar o parâmetro.

**Hunk F — injeção no prompt** (2 micro-edits na origin/main):
- :902 — `${leadMemoryContext}${knowledgeContext}` → `${leadMemoryContext}${knowledgeContext}${onboardingPhaseContext}`
- :913 — envolver o ternário existente da regra 7: `${personaIsSdr ? \`7. CLIENTE DECIDIU…\` : \`7. VOCÊ É A BIA…\`}` → `${onboardingActive ? ONBOARDING_RULE_BLOCK : personaIsSdr ? \`7. CLIENTE DECIDIU…\` : \`7. VOCÊ É A BIA…\`}` — **preservando o texto sunset da main nos dois ramos** (o WT tem texto velho de Piloto nesses ramos; só o wrapper `onboardingActive ?` é portável).

**❌ NÃO portar do working tree (brain):** headers "funil de fundadoras", `campaign`/`founder_campaign_status` (hunks das :151-171 e :970-978 do WT), remoção do de-para `list_price_monthly`, remoção do filtro `is_public` (**desfaria o R5**), `oferta_piloto`/QcrRota, `QCRV_ANCHOR_FALLBACK=217` (main tem 275), sanitizeReply antigo, textos "piloto" na continuidade da closer.

### 2.3 `_shared/onboarding-handoff.ts` — 1 fix NOVO obrigatório (P0 do matching)

O arquivo do #63 está correto de arquitetura, mas o match por telefone **nunca casa** com o formato real do banco (`+E.164`). Fix mínimo no PR do porte (`onboarding-handoff.ts`, ~:66-73):

```ts
    const variants = phoneVariantsBR(args.customerPhone);
    if (variants.length) {
      // Os webhooks inbound/outbound gravam visitor_whatsapp/visitor_phone como
      // "+E.164" (platform-meta-whatsapp-webhook:185-186); phoneVariantsBR gera
      // só-dígitos. Cobrimos os dois formatos (match .in. é exato).
      const withPlus = variants.map((v) => `+${v}`);
      const list = [...variants, ...withPlus].join(',');
```

(o resto do bloco — `.or(\`visitor_whatsapp.in.(${list}),visitor_phone.in.(${list})\`)` — fica como está.)

**Opcional recomendado (1 linha, fecha 2 bordas de uma vez):** filtrar a busca de conversa pelo produto do agente — `.eq('product_id', csAgent.product_id)` no select de `platform_crm_conversations`. Garante que o handoff só pina conversas do produto da Lia (evita pin órfão em conversa de outro produto, onde a Lia não entraria no agentList do brain).

### 2.4 Fora do escopo do porte

`platform-sales-copilot/index.ts` (WT = só lixo pré-sunset), `SalesPage.tsx` (1.411 linhas de LP pré-sunset — o #65 deliberadamente deployou "sem cirurgia da LP"), `evolution-history-sync/` (untracked, outra frente).

---

## 3) Plano de ativação passo a passo (checks binários)

> Pré-condição já satisfeita: migration aplicada (colunas/RPCs/índice/Lia verificados hoje via SQL — seção 1).

**Passo 0 — Branch limpa**
`git fetch origin && git checkout -b feat/p10-handoff-duda-lia origin/main`
✔️ Check: `git log --oneline -1` == `f63219c` (ou mais novo da origin/main); `git status` limpo.

**Passo 1 — PR do porte** (hunks A-F + fix 2.3; NADA além)
✔️ Checks: `git diff origin/main --stat` toca SÓ `cakto-plan-provisioning.ts`, `platform-sales-brain/index.ts`, `onboarding-handoff.ts`; zero ocorrência ADITIVA de `founder_status`/`oferta_piloto`/`Piloto Fundadora` no diff; `grep "is_public" platform-sales-brain/index.ts` ainda presente (R5 preservado); `deno check` dos 2 entrypoints passa.

**Passo 2 — Merge + deploy de 3 edges** (nesta ordem, com flag ainda OFF)
`supabase functions deploy platform-sales-brain cakto-webhook cakto-reprocess-order --project-ref fzhlbwhdejumkyqosuvq`
✔️ Checks: `list_edge_functions` mostra brain > v30, cakto-webhook > v35, cakto-reprocess-order > v30, todos ACTIVE; bundle novo do cakto-webhook contém `onboarding-handoff.ts` (via `get_edge_function`); mandar 1 msg de venda no número oficial → Duda responde normal (flag OFF = comportamento byte-idêntico).

**Passo 3 — Secret (o interruptor)**
`supabase secrets set ONBOARDING_HANDOFF_ENABLED=true --project-ref fzhlbwhdejumkyqosuvq`
O secret é por projeto — cobre as 3 funções de uma vez. Pontos de leitura em runtime: (1) `onboarding-handoff.ts:37` (bundleado em `cakto-webhook` E `cakto-reprocess-order`), (2) brain passo 7.5. O que muda com `true`: o handoff executa de verdade no `org_created` (pina Lia + grava vínculo), e o brain passa a checar `provisioned_organization_id` a cada mensagem — conversa com vínculo entra em modo implantação (bloco FASE + regra 7 CS + sem links de pagamento); conversa sem vínculo: prompt byte-idêntico.
✔️ Check: `supabase secrets list` mostra a key.

**Passo 4 — Smoke 1: modo implantação do brain (sem pagamento)**
1. Do celular de teste, mandar msg ao número oficial (11 95213-9912) → conversa criada, Duda responde.
2. SQL (MCP): `UPDATE platform_crm_conversations SET current_agent_id='927fe936-0965-4693-90be-5944e745359b', provisioned_organization_id='<org de teste>' WHERE id='<conv_id>';` e opcionalmente `UPDATE onboarding_submissions SET current_step=3, current_step_id='servicos' WHERE organization_id='<org de teste>';`
3. Mandar: "oi, travei na tela de serviços, e agora?"
✔️ Checks binários: resposta chega no MESMO thread com tom CS (sem preço/link/plano); menciona a página 3 ("Serviços"); logs do brain SEM erro no passo 7.5; um "quanto custa o upgrade?" NÃO retorna link de checkout.
4. Cleanup: `UPDATE platform_crm_conversations SET current_agent_id=NULL, provisioned_organization_id=NULL WHERE id='<conv_id>';`

**Passo 5 — Smoke 2: E2E matching via webhook simulado (sem pagamento real)**
1. Obter o secret do webhook (tabela de credenciais Cakto da plataforma, via MCP) e o offer slug de um plano real mapeado (idealmente o "Teste E2E" R$10, que é `is_public=false` — não vaza pra venda).
2. `POST {SUPABASE_URL}/functions/v1/cakto-webhook?scope=platform&secret=<secret>` com payload sintético: `{"event":"purchase_approved","data":{"id":"P10-SMOKE-<ts>","status":"paid","paymentMethod":"pix","offer":{"slug":"<offer-slug>"},"customer":{"name":"Smoke P10","email":"<email teste>","phone":"<fone do celular de teste, o mesmo da conversa do smoke 1>"}}}` (conferir shape exato contra `mapCaktoOrderForUpsert`, `cakto-client.ts:312-343` — o parser lê `order.customer.phone/email`).
3. ✔️ Checks binários: HTTP 200; logs do cakto-webhook com `onboarding handoff: {"ok":true,...}` (e NÃO `skipped:conversation_not_found` — se vier skipped, o fix do `+` falhou); SQL: a conversa de teste tem `current_agent_id` = Lia e `provisioned_organization_id` = org nova; mandar msg → Lia dá boas-vindas de implantação.
4. ⚠️ Efeitos reais deste smoke: cria org + user admin + manda welcome WhatsApp pro fone de teste. Cleanup: deletar org criada (cascade), auth user do e-mail de teste, linha em `cakto_orders` (`cakto_id='P10-SMOKE-<ts>'`), e despinar a conversa.

**Passo 6 — Go-live real**
✔️ Check final: primeira venda real com conversa prévia → log `handoff ok:true` + Lia assume; venda real SEM conversa prévia → log `skipped:conversation_not_found` e provisioning intacto (NO-OP limpo).

**Kill switch:** `supabase secrets set ONBOARDING_HANDOFF_ENABLED=false`. ⚠️ Nuance: desligar a flag NÃO despina Lias já fixadas — o brain voltaria a tratá-las pelo ramo closer (regra 7 "VOCÊ É A BIA"). Ao desligar, rodar também: `UPDATE platform_crm_conversations SET current_agent_id=NULL WHERE current_agent_id='927fe936-…' AND provisioned_organization_id IS NOT NULL;`

---

## 4) Riscos + casos de borda do matching (e mitigação)

| # | Caso | O que acontece (código atual) | Severidade | Mitigação |
|---|---|---|---|---|
| 1 | **Formato `+E.164` no banco** | Match por fone erra 100% (3/3 conversas em prod têm `+`) | **P0** | Fix 2.3 (variantes com `+`) — obrigatório no PR |
| 2 | Pagou com fone ≠ WhatsApp da conversa | Fone falha → fallback e-mail (leads `ilike` + `visitor_email`) | Média | Fallback já cobre se o e-mail bate; senão vira NO-OP (risco 3) |
| 3 | Fone E e-mail divergentes (ou compra direta sem conversa) | `skipped: conversation_not_found` — **NO-OP limpo**, provisioning e welcome intactos (`onboarding-handoff.ts:104-107`) | Baixa (desejado) | Aceitar; follow-up futuro: casar lead por e-mail quando a cliente escrever depois |
| 4 | Duas conversas do mesmo número | `.order('last_message_at' desc).limit(1)` → a mais recente vence | Baixa | Comportamento correto por design |
| 5 | Conversa matched de OUTRO produto (ou `product_id` NULL) | Handoff pina a Lia, mas o brain filtra agentList por `product_id` da conversa → pin miss → fallback SDR daquele produto | Média | Opcional 2.3: filtrar conversa por `product_id = csAgent.product_id` no handoff |
| 6 | Deploy do brain DEPOIS da flag | Lia pinada com brain velho fala como **Bia closer com links de checkout** | **Alta se inverter a ordem** | Ordem do plano: deploy (passo 2) ANTES do secret (passo 3) |
| 7 | `cakto-reprocess-order` esquecido | Reprocesso manual de venda paga roda provisioning de 06/07 (sem handoff) | Média | Está na lista de deploy do passo 2 |
| 8 | Commitar o working tree como está | Reverte #65: reintroduz founder_status, Piloto, e **desfaz o R5** (Teste E2E R$10 vazaria como link ofertável) | **Alta** | Seção 2: porte cirúrgico a partir de origin/main |
| 9 | E-mail com caractere especial (`,` `(` `)`) no filtro `.or()` PostgREST | Filtro malformado → `convErr` logado → segue pro NO-OP | Baixa | Já é non-fatal; hardening opcional (quotar o valor) |
| 10 | Agente `support` `%implanta%` de outro produto criado no futuro | Lookup do CS não filtra produto; o mais antigo vence | Baixa hoje (só a Lia existe) | Nota de arquitetura; resolver quando houver 2º produto |
| 11 | Lia não fala proativamente | O handoff só PINA; a Lia responde à PRÓXIMA msg da cliente. As "boas-vindas" imediatas são o template `sendWelcomeWhatsApp` (provisioning :370), não a persona | Média (gap vs visão "Lia dá boas-vindas") | Consciente no design atual; follow-up: greeter proativo da Lia no mesmo thread (padrão `agent-handoff-greeter` do tenant) |
| 12 | Retry/renovação de webhook | Gate `org_created` (:553) — handoff só na 1ª ativação; reexecução não repina | OK | Idempotência já garantida |
| 13 | Payload Cakto sem fone (`customer.phone` null) | `phoneVariantsBR(null)` → `[]` → pula direto pro e-mail | OK | Coberto |

**O que o payload do Cakto traz** (`cakto-client.ts:330-332` do `mapCaktoOrderForUpsert`): `customer_name = customer.name`, `customer_email = customer.email`, `customer_phone = customer.phone` (com `customer = order.customer ?? order.user`). Nome/e-mail/fone conhecidos — é exatamente o trio que o handoff consome.

---

## 5) Estimativa honesta de esforço

| Etapa | Esforço | Observação |
|---|---|---|
| PR do porte (hunks A-F + fix 2.3 + `deno check`) | 2-3 h | Hunks C/D são adição pura; E/F exigem cuidado pra não arrastar texto pré-sunset; o fix do `+` é 5 linhas |
| Review do PR (diff ~150 linhas, 3 arquivos) | 30-45 min | Checklist: zero `founder_status`/`piloto` aditivo; `is_public` intacto |
| Deploy 3 edges + secret | 15 min | Ordem: edges → secret |
| Smoke 1 (brain) + Smoke 2 (webhook simulado) + cleanup | 1-2 h | O smoke 2 cria org/user reais — cleanup incluído no tempo |
| **Total** | **meio dia a 1 dia** | Com margem pra 1 iteração de ajuste no smoke |

Não é um projeto — é um porte de código que já existe e já foi pensado (gates duplos, non-fatal por design, seed determinístico). O único trabalho "novo" de verdade é o fix do `+` (achado desta investigação) e a disciplina de não deixar o lixo pré-sunset entrar junto.

---

*Fontes verificadas: git (origin/main f63219c, local 7b446c7, sunset-wt a7d3c5c), bundles deployados via MCP `get_edge_function`/`list_edge_functions`, banco via MCP `execute_sql` (colunas, RPCs, índice, agentes, formatos de telefone). Diffs completos em scratchpad `p10/`.*
