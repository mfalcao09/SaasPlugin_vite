# HANDOFF — Controladora GO LIVE NexvyBeauty

> **De:** controladora `local_d4bae0c2-6fea-4e18-a2fc-9b60ea51a723` (encerrada por fim de contexto)
> **Para:** controladora nova
> **Data:** 2026-08-01, ~22h40 BRT
> **Objetivo original da sessão** (1º user message real, não do sumário de compactação): *"Pago, tudo certo! Check agora GO GO GO"* — verificar o provisionamento pós-compra. Evoluiu para controlar o go-live inteiro.

---

## 0. LEIA ISTO ANTES DE QUALQUER TOOL CALL

Você é a **controladora**. Seu trabalho **não é escrever código** — é:
1. **verificar** o que as sessões-filhas afirmam, medindo você mesma;
2. **ratificar ou corrigir** decisões que atravessam frentes;
3. **levar ao Marcelo** o que só ele decide, em pergunta fechada.

**A regra que mais importa:** *ratificação examina a PREMISSA, não só a lógica.* Ratifiquei três vezes um argumento excelente construído sobre um fato que ninguém tinha verificado (§5.2). Argumento bom sobre fato não verificado é o erro mais caro do dia — a qualidade do raciocínio silencia a dúvida sobre o dado.

---

## 1. AS TRÊS SESSÕES — protocolo de triangulação

> *"Qualquer comunicação deve ser triangulada."* — Marcelo, 2026-08-01

**Nenhuma mensagem 1:1.** Toda comunicação sai para os **outros dois** nós, mesmo quando interessa a só um.

| Nó | Frente | sessionId ROTEÁVEL | worktree |
|---|---|---|---|
| 1 | CUTOVER Studio Flor → tenant | `local_2e4d90d8-fa40-41d4-b38a-3405869f5214` | `friendly-colden-b66a94` |
| 2 | **CONTROLADORA** (você) | *(o seu)* | — |
| 3 | TRILHA S — Embedded Signup Meta | `local_a18c3c23-9105-4a16-bd3d-e36ab343b3ea` | `priceless-neumann-63c32d` |

**Apresente-se aos dois assim que assumir**, com o seu sessionId. Ferramenta: `mcp__ccd_session_mgmt__send_message`.

⚠️ **Regra dura, aprendida errando:** *id de sessão só entra em mapa depois de mensagem **entregue com sucesso** nele.* O nó 3 publicou o cliSessionId interno (`d110e542-…`), repassei sem testar, e a mensagem sumiria sem erro visível. Endereço não conferido é endereço que não existe.

---

## 2. GOVERNANÇA JÁ RATIFICADA (não reabrir)

### 2.1 Escrita destrutiva exige TRÊS coisas, cumulativas
1. arquivo/tag/backup **antes**, com parity check
2. as **duas outras pontas responderam** — não "foram avisadas"
3. autorização do Marcelo

**A autorização dele é necessária e NÃO suficiente.** Ele opera seis frentes e responde com o que tem na cabeça; o histórico está distribuído entre as sessões. Foi assim que 84.194 contatos da agenda pessoal dele quase viraram base de demo pública **com autorização dele**.

### 2.2 Exceção por IMINÊNCIA (refinamento do nó 1, adotado)
O eixo não é reversibilidade — é **iminência**. Ação reversível com relógio correndo pode ser executada com ciclo aberto, **desde que a demonstração de urgência venha junto**.
- ✅ desarmar canal com `health_alert_at` de hoje → executou sem esperar, correto
- ✅ não desabilitar crons sem gatilho (0 agendamentos, 0 clientes) → esperou, correto

### 2.3 Sequenciamento Trilha S ⟂ Cutover — RATIFICADO
A Trilha S roda em **paralelo** e **não** é pré-requisito do flip do número (Bloco 4). Gate externo (fila de review da Meta) não bloqueia passo interno irreversível. Dois caminhos de conexão (manual + self-service) vão coexistir — **intencional, não é dívida**.

---

## 3. ESTADO DE PRODUÇÃO (verificado 2026-08-01)

| Item | Prova |
|---|---|
| **Demo** +55 11 95213-9912 → Mavi | conversa real 13:08, Sonnet 5 |
| **Vendas** +55 11 95502-1205 → Duda | conversa real 13:15 |
| **Instagram** `@nexvytech` | vinculado ao produto Vendas hoje (estava com `product_id` NULL — perdeu ≥1 DM em 12/07) |
| Template `boas_vindas_ativacao` [pt_BR] | APPROVED |
| Planos com checkout | 4 |
| Crons ativos | 31 |
| Alerta de venda no Telegram | armado (`cakto-webhook`, 6 pontos) |

**git:** `main == origin/main`. ⚠️ **A `main` avançou depois de mim** — último commit visto `dcb379f fix(netb2b): raiz do host de landing servia o index.html de beleza`. **Há sessão fora da tríade mergeando na main.** Confira antes de assumir estabilidade. Meu último merge foi `9e45785`.

**Deploy** — runbook em `infra/DEPLOY-NEXVYBEAUTY.md`:
```bash
ssh vps-hostinger
cd /opt/stacks/saasplugin-vite
git pull --ff-only origin main
./infra/deploy-vps.sh NexvyBeauty nexvy-beauty app.nexvybeauty.com.br
```
Só `DEPLOY-VERDE:` conta como sucesso. O script **builda do WORKING TREE**, não de checkout limpo.

⚠️ **Regressão que causei:** commitei um fix numa branch, dei `git checkout main` (o arquivo no disco **reverteu**), editei essa versão e deployei — **apagando o fix anterior de produção, sem erro nenhum**. Deploy sai da branch que contém o fix, e é conferido contra a função no ar (`get_edge_function` + grep).

⚠️ **Tag antes de mexer no VPS.** A produção rodava uma branch deletada do GitHub, 16 commits atrás. Realinhei com `git tag pre-deploy-20260801` + `checkout`/`branch -f` (não `reset --hard` — checkout se recusa a sobrescrever trabalho não commitado).

---

## 4. MESA DO MARCELO — em ordem de alavancagem

### 4.1 🔴 As três perguntas do App Review
`developers.facebook.com/apps/1289456453376034/app-review/`
> **(a)** O review enviado em **22/04/2026** está aprovado, rejeitado ou pendente? **Se rejeitado, qual o motivo da Meta?**
> **(b)** `whatsapp_business_management` e `whatsapp_business_messaging` estão em **Acesso Avançado** ou só Padrão?
> **(c)** Na config `1140027898257109`: **`gestao.nexvy.tech` está nos domínios autorizados?** (hoje: `nexvy.tech`, `intentusrealestate.com.br`, `ficcassilandia.com.br`)

⚠️ **NÃO virar o toggle de modo do app para "Live"** antes do Advanced Access aprovado. **Vendas e Demo estão nesse app.**

### 4.2 🟡 Decisões de produto
| Decisão | Recomendação conjunta |
|---|---|
| Flag `is_demo` que os 5 crons de salão respeitam | **flag na org**, não desabilitar as 4 regras — há 28 regras ativas em outras orgs e o universo cresce |
| Faxina da agenda da demo (TTL) | reaproveitar padrão do `demo-reaper` |
| Slug `meuteste1` (vaza em URL pública de booking) | renomear quebra links existentes — decisão dele |
| Desinscrever webhook no **servidor Evolution** | infra compartilhada, ninguém tem mapa do blast radius |

### 4.3 🟡 Sem dono
- **Fiscalização das 9 edge functions do Bloco 1** — a minha falhou (§7.3), precisa de contexto limpo
- **As 29 funções com `verify_jwt=false`** — contei, não auditei. Pergunta: *"quais autenticam por dentro?"*
- **Memo do padrão §6** — evidência com arquivo e linha nos reportes dos nós 1 e 3

---

## 5. AS DUAS FRENTES

### 5.1 NÓ 1 — Cutover Studio Flor → tenant

**Problema:** "Studio Flor (Demonstração)" é PRODUTO do CRM de plataforma (`platform_crm_products`, slug `demo-studio-flor`, id `9cc5102e-20b4-4572-958e-76205174f98b`), com a Mavi em `platform_crm_product_agents` (id `630634f0-307c-4532-985c-5071549b67a0`). Isso impede replicar a Mavi para tenants.

**Decisão do Marcelo:** reaproveitar a org `meuteste1` (`5da38ea6-88fb-40cf-8ee0-096cd2c9dc32`) — *contra* a recomendação minha e do nó 1 de criar org limpa. Decidiu com o quadro completo na segunda vez.

| Bloco | Estado |
|---|---|
| 0 · mapeamento | ✅ |
| 2 · Studio Flor como tenant | ✅ 19 serviços (0 com preço zerado) · 3 profissionais com agenda · Mavi portada e **evoluída** · `business_hours` corrigido |
| 1 · porte Meta org-scoped | 🔄 3 migrations aplicadas · 9 functions portadas (8/8 com `authenticateTenant`+`assertOrgAccess`) · faltam 2 abas UI + resolvedor + deploy |
| 4 · flip do número | 🔒 **BLOQUEADO**: resolvedor unificado + decisão dos crons |
| 5 · preset = clone da demo | pendente |

**Verificado por mim:** clientes 84.194 == arquivo 84.194 (expurgo e restauração sem perda) · 19 serviços · 3 profissionais · prompt Mavi 3.813 chars · desvínculo da `evolution_instances` (0 na org, `organization_id` null).

**Tabelas de arquivo — NÃO DROPAR sem ordem do Marcelo:**
`_arquivo_clientes_meuteste1_20260801` (84.194) · `_arquivo_carteira_propostas_meuteste1_20260801` (8)

**A evolução da Mavi (formulação que vale guardar):** o prompt dela dizia "agendar (fictício)" não por escolha de produto, mas porque o `platform-sales-brain` tem **zero ferramentas** — era *limitação de infraestrutura virando texto*. No `webchat-bot` ela ganha 19 ferramentas reais; evoluir foi ensiná-la a **parar de fingir**.

⚠️ **Divergência deliberada, não regressão:** a Mavi de plataforma tem `can_transfer=false` e `handoff_triggers=[]`. O preset do tenant tem 4 triggers. O nó 1 **não degradou** para bater contagem. No Bloco 5 isso precisa de exceção explícita, senão a demo contamina todo tenant novo.

### 5.2 NÓ 3 — Trilha S (Embedded Signup)

**A premissa demolida** (achado em `ecossistema-monorepo/memory/project_nexvy_whatsapp_sandbox.md`, de 20/04):

| Item | Realidade |
|---|---|
| `config_id` | **`1140027898257109`** — existe desde abril |
| App Review | **ENVIADO em 22/04/2026**, "em análise", prazo 10 dias úteis |
| Business Verification | ✅ **aprovada 19/04** |
| App publicado | ✅ |

**Um prazo de 10 dias úteis está aberto há mais de três meses. Não é fila da Meta — é resultado que ninguém foi buscar.**

| Task | Estado |
|---|---|
| 1 · verificar resultado do review | 🔴 **HITL — única coisa que trava a trilha** |
| 2 · criar config FB Login | ✅ obsoleta (já existia) |
| 3 · contrato org-scoped | ✅ (entregue pelo nó 1) |
| 4 · edge `whatsapp-embedded-signup-exchange` | ✅ **construída**, `deno check` limpo |
| 5 · front `MetaEmbeddedSignupButton` | ✅ **construído**, tsc/eslint limpos |
| 6 · autorizar `gestao.nexvy.tech` | pendente |
| 7 · verificação E2E | pendente — bloqueada por 1, 6, merge do nó 1, env vars |

⚠️ **"Construído" ≠ "entregue".** Ela mesma diz: *"isto compila; não sei se funciona."* Não há prova E2E.

**Env vars faltando:** `VITE_META_WHATSAPP_APP_ID`, `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` (front) · `META_WHATSAPP_APP_ID`, `META_WHATSAPP_APP_SECRET` (secrets da edge).

**Roteiro dos 2 vídeos:** `~/Downloads/ROTEIRO-APP-REVIEW-TECH-PROVIDER-2026-08-01.md` (+ `.html`).
⚠️ Correção pendente: o `extras` do `FB.login` é `{ sessionInfoVersion: 3, version: 'v4' }`, **não** `{ setup: {} }`.

**Restrição dura:** o code do Embedded Signup **expira em 30 segundos**. Troca síncrona — sem fila, sem retry com backoff, sem job. Conexão parcial **não pode ser gravável**.

---

## 6. O PADRÃO DO DIA — "o símbolo da proteção sobrevive à proteção"

Cinco casos, autores diferentes, um dia:

| Caso | Parece | É |
|---|---|---|
| `webhook_subscribed = false` | desliga o webhook | espelho de config que mora em outro servidor — o `evolution-webhook` **não lê** esse campo |
| `if (organization_id && conn.org !== organization_id)` | autorização | consistência **opcional** — omita o campo e pula |
| `console.warn` no fallback do resolver | tratamento de erro | registro que ninguém lê de madrugada |
| `webhook_subscribed_at` preenchido | prova de webhook ativo | campo que **nada** escreve no fluxo WhatsApp |
| meu grep `auth=6` vs `escrita=214` | ordem de execução | linha do **import** vs. linha da escrita |

**A pergunta que caça todos:** *"o que acontece se eu simplesmente não mandar / não ler / não configurar / não medir o certo?"* Se a resposta for "passa", **não é proteção — é decoração.**

Passam em revisão porque *parecem* certos. É a forma familiar que silencia a dúvida.

---

## 7. CONHECIMENTO TÉCNICO CRÍTICO (não redescobrir)

### 7.1 A armadilha do app Meta compartilhado
Um App Meta tem **UMA callback URL por produto**. Vendas e Demo estão sob o mesmo `app_id 1289456453376034`. O webhook **precisa** rotear por `value.metadata.phone_number_id` do payload — **nunca** pelo id no path da URL. Rotear pelo path fazia mensagem da Demo ser gravada como Vendas e respondida pela persona errada, **por outro número**.

**Segunda metade do mesmo bug:** a conversa era indexada só por `visitor_id = wa:{telefone-de-quem-manda}`. A identidade correta é o **PAR (quem fala, por qual número NOSSO)**. Sem o filtro por `meta_connection_id`, quem escreve para a Demo reencontra a conversa de Vendas — e `product_id` nunca é sobrescrito em conversa existente, então a persona errada gruda.

### 7.2 Modo do app: o sinal que não distingue
Doc da Meta: *"Once your app switches to live mode, only permissions approved through App Review appear in the flow."*
**Vendas e Demo funcionando NÃO prova que o app está em Live** — System User tokens operam sobre assets do próprio BM mesmo em modo dev. É o sinal que qualquer um usaria para concluir "está tudo certo", e ele não discrimina os dois estados.

### 7.3 Resolvedor unificado — DESENHO APROVADO, não implementado
São **4 bifurcações** em `platform-meta-whatsapp-webhook` (em produção):
1. `resolveConnectionForValue` (121-161) → ler as duas tabelas, devolver `scope`
2. `processInboundMessage` (:605) → tenant grava em `leads` + `webchat_conversations`
3. health check (:618-623) → tabela conforme escopo
4. dispatch (:630) → tenant chama `webchat-bot`

**Regras aprovadas:**
- achou em AMBAS → **ERRO**. Preferência silenciosa aqui é vazamento cross-tenant com aparência de funcionamento.
- achou em NENHUMA → **grava em `whatsapp_meta_webhook_logs` com `processed=false`, responde 200, não despacha cérebro.** (Terceira via do nó 1 — melhor que o WARN que escrevi e que o erro seco.)
- **bifurcação inerte enquanto `whatsapp_meta_connections` estiver vazia** → deploy verificável **por não-mudança**.

⚠️ **Armadilha que passei e precisa ser tratada:** a idempotência por `wamid` (`uq_platform_crm_messages_wamid`) existe **só em `platform_crm_messages`**. Se o ramo tenant gravar em `webchat_messages`, não tem essa proteção — e o Meta re-entrega em qualquer resposta ≠ 200. Resultado: mensagem duplicada na conversa do salão.

### 7.4 Porte tem DUAS origens (achado do nó 1)
```
auth no Vendus:     2/9 funções
auth na plataforma: 8/9 funções
```
A plataforma **endureceu** o que o Vendus tinha aberto. Portar "1:1" entregaria `meta-whatsapp-send` — que dispara mensagem — **sem auth**, aceitando a anon key pública. **Reintroduzir vulnerabilidade por fidelidade a um porte.** Desenho correto: org-scoping do Vendus, auth da plataforma.

### 7.5 Modelo de LLM por agente (implementado hoje)
- coluna `model` em `platform_crm_product_agents` e `product_agents` (nullable = herda)
- precedência plataforma: `persona.model` > env > `DEFAULT_MODEL`
- precedência tenant: `agente.model` > `org_ai_routing.model` > `preferredModel` > default
- painel: `gestão → ERP → Modelos de IA`
- `AI_GATEWAY_URL = https://openrouter.ai/api/v1` (confirmado comparando hash com o digest do `secrets list`, sem ler o segredo)
- Mavi e Bia em `anthropic/claude-sonnet-5`

### 7.6 Gotchas menores
- `npm run typecheck` é `tsc -b` incremental e **devolve 0 falso**. Use `npx tsc -b --force`. **Baseline = 32 erros.**
- `evolution_instances.webhook_subscribed` **não é lido** pelo `evolution-webhook`. `is_default` **é** (8×), protege só a saída.
- SSH Hostinger **tarpita** após ~6 conexões seguidas. Agrupe num `ssh 'bash -s' <<EOF`.
- `metadata._desarmado_em` / `._desvinculado_em` guardam estado anterior para reversão exata.
- Popover dentro de Sheet (Radix Dialog) **não rola no toque** — `react-remove-scroll` bloqueia fora da subárvore. Solução: `portal={false}` no `PopoverContent`.

---

## 8. MEUS TRÊS ERROS DE INSTRUMENTAÇÃO

1. **Browser headless que não rola.** Concluí três vezes que a âncora `#planos` estava quebrada, medindo num viewport de altura 0 e depois num browser que não rola nem com `window.scrollTo`. O Marcelo disse "funcionou no celular" e derrubou tudo. **Calibre o instrumento antes de medir o objeto.**
2. **Li `webhook_subscribed_at` como prova** sem verificar quem escreve o campo. Ninguém escreve, no fluxo WhatsApp.
3. **Fiscalização que comparou import com escrita.** Daria verde de qualquer jeito. **Recusei o aval** em vez de reportar verde falso — verde falso é pior que fiscalização não feita.

**A regra:** antes de afirmar, pergunte *"o que exatamente eu medi, e isso é o que eu disse que era?"*

---

## 9. PRIMEIRAS AÇÕES SUGERIDAS

1. **Apresente-se aos dois nós** (§1) e confirme entrega das mensagens.
2. **Confira o estado da `main`** — avançou por sessão fora da tríade.
3. **Leve as três perguntas do App Review ao Marcelo** (§4.1) — maior alavancagem disponível.
4. **Assuma a fiscalização das 9 edge functions** (§4.3) — está entre o trabalho pronto e o merge. Meça **call site**, não import.
5. **Não escreva código.** Verifique, ratifique, decida o que atravessa frentes.

---

*Escrito no fim do contexto útil da controladora anterior. Tudo aqui foi medido, ou está explicitamente marcado como não medido.*
