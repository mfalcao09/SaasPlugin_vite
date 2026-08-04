# PRD — BDR Camila (prospecção ativa, canal Evolution)

> **Data:** 2026-08-04 · **Sessão:** BDR (`3dcf130b`) · **Branch:** `feat/bdr-autonomo`
> **Estado do código:** nada implementado, nada deployado, nada escrito no banco.
> **Aprovação:** este documento é o que o Marcelo aprova. O GO para codar vem depois dele, não antes.
> **Antecessor:** `LDR-BDR-OUTBOUND-BLUEPRINT-2026-07-15.md` (investigação read-only; fatos de infra vencidos — a instância Evolution já existe e está conectada).

---

## 0. Filtro de prontidão

A pergunta que o Marcelo mandou aplicar antes de pedir GO:

| Pergunta dele | Resposta | Onde |
|---|---|---|
| Todas as frentes mapeadas? | Sim — 7 PRs nomeadas | §4 |
| Entregáveis mapeados? | Sim — um por PR | §4 |
| Dá para mensurar **o quê**? | Sim — entregável por PR | §4 |
| Dá para mensurar **como**? | Sim — check binário por PR | §4 |
| Dá para mensurar **quando**? | Sim — ordem e dependências | §5 |
| **Parâmetro de qualidade**? | Sim — critério de aceite por PR | §4 |

---

## 1. Escopo

A Camila é a **BDR de prospecção ativa** do NexvyBeauty. Fala por número próprio via Evolution (instância `prospeccao-ativa-camila`), abre conversa fria com donas de salão a partir do telefone público do perfil, conduz, demonstra, **fecha sozinha e manda o link de checkout**. Depois do pagamento entrega para a **Lia · Implantação**, no número oficial de Vendas.

**Não é escopo desta sessão:** qualquer decisão sobre SDR (Duda/Bia), o prompt da Duda, a unificação SDR/Closer, a reescrita da `knowledge_base` (escritora única é a controladora) e o agente de onboarding.

**Premissa fixada pelo Marcelo:** SDR e BDR compartilham o **mesmo cérebro** (`platform-sales-brain`) e a **mesma base de conhecimento** (`platform_crm_products.knowledge_base`). LDR entra depois, no mesmo. Não se constrói cérebro paralelo.

---

## 2. Estado medido

Base do plano — medido, não suposto.

| Item | Valor |
|---|---|
| Tabelas do cold outreach (4) | aplicadas |
| Cron `platform-cold-outreach-tick` | **ATIVO, 1×/min** |
| Campanhas | **zero** |
| Leads extraídos | 30.434 · 13.736 com telefone · 12.935 qualificados |
| Leads elegíveis a disparo | **3** (8 aprovados, 49 excluídos) |
| Conversas `whatsapp_evolution` | **0 — o caminho nunca rodou uma vez** |
| Leads com telefone no CRM | 8 · 6 com 12 dígitos · 2 com 13 |
| Duplicatas de lead hoje | 0 — por falta de volume, não por acerto |
| `model` dos agentes | NULL em 5 de 8, inclusive Bento(→Camila) e Lia |

---

## 3. Contrato compartilhado com a sessão SDR

**Byte-idêntico no PRD da controladora.** Fechado por medição cruzada: cada seção teve as duas sessões medindo, e cada furo foi achado pela outra.

### 3.1 Seção A — âncora de preço

```
FATO MEDIDO (2 medições independentes)
  public_plans.list_price_monthly EXISTE, preenchido, já lido em runtime
  Essencial 275→450 (+64%) · Premium 427→720 (+69%) · Ultra 693→1190 (+72%)
  Trial e Teste E2E: NULL — correto, não são públicos

FORMA
  "Este preço vale enquanto X" — X verificável PELA LEAD, não por nós
  a âncora exige os dois lados: o preço de hoje E o de tabela

MOMENTO (mesma regra, gatilho por funil)
  a âncora só existe DEPOIS de a lead ter um número DELA
  BDR: depois do Raio-X
  SDR: depois de carteira OU ticket, ou depois do Raio-X

DECISÃO DO MARCELO (2026-08-04)
  NÃO EXISTE DATA DE SUBIDA.

CONSEQUÊNCIA — regra final
  âncora TEMPORAL            ❌ NÃO USAR, em nenhuma das duas agentes
                                sem data, "vai subir" é a escassez falsa que a base proíbe
  delta como PREÇO COMPARADO ✅ "o plano custa 450, hoje sai por 275"
                                fato do PRESENTE, verificável na página de preços
                                não promete nada sobre o futuro → não pode ser desmentido
  campo price_anchor_until   ❌ FORA DE ESCOPO — sem data, não há o que guardar

SE UM DIA EXISTIR DATA
  a regra volta com price_anchor_until em CONFIG (nunca em prosa — prosa apodrece
  e vira mentira verificável), default silencioso, e a obrigação de CUMPRIR:
  âncora não cumprida queima a credibilidade da próxima frase.
```

### 3.2 Seção C — identidade de lead

```
MODELO (já existe, nunca exercitado)
  platform_crm_conversations.lead_id é FK → N conversas : 1 lead é NATIVO
  "duplicado no atendimento, unificado no CRM" = o esquema atual
  max conversas por lead hoje: 1 — o padrão nunca engatou

RESOLUÇÃO (escrita — 3 webhooks, toda mensagem)
  telefone SOZINHO, via helper único de _shared/ que cobre
  DDI · 9º dígito · E O PREFIXO "+"
  ⚠️ DUAS CONVENÇÕES coexistem, e as duas são legítimas:
       lado PLATAFORMA  platform_crm_leads.phone e
                        platform_crm_conversations.visitor_phone guardam "+E.164"
                        medido: 8/8 com "+" (6 de 12 dígitos, 2 de 13, 1 sem DDI 55)
       lado TENANT/PROVEDOR  dígitos puros (JID da Evolution, API do provedor)
     phoneVariantsBR() devolve SÓ DÍGITOS (_shared/phone.ts:30,33) —
     CORRETA para o lado tenant/provedor, INSUFICIENTE para o lado plataforma.
     Usada crua num ponto de resolução de PLATAFORMA, casa ZERO linhas.
  ⚠️ O lado plataforma não tem adaptador: 4 chamadores escreveram o mesmo
     ajuste por conta própria (meta-whatsapp-send:112 ·
     start-whatsapp-conversation:106 · _shared/whatsapp-connection:182 ·
     _shared/onboarding-handoff:279). Nenhum lugar onde a regra viva.
  MIGRAM para o helper: os 4 acima + os 3 pontos de resolução abaixo.
  NÃO MIGRAM (convenção dígitos, corretos como estão):
     platform-check-whatsapp-number:51 · evolution-webhook:1138 (TENANT)
     ⚠️ evolution-webhook ≠ platform-evolution-webhook — os dois existem.
  → o helper encapsula as DUAS coisas: variantes do lado plataforma
    (dígitos + "+") e desreferência de merged_into.
    NENHUM ponto de resolução de plataforma chama phoneVariantsBR direto.
  o resolvedor SEMPRE desreferencia merged_into e devolve o CANÔNICO
  ↳ um ponto de controle cobre todo caminho automatizado
  ↳ quem não sabe que merge existe fica correto de graça
  pontos: platform-evolution-webhook:329 · platform-meta-whatsapp-webhook:388
          cakto-webhook resolveOrCreateLead:356

LEITURA (display — caminho humano)
  view platform_crm_leads_ativos = WHERE merged_into IS NULL
  migração incremental dos 41 pontos; NÃO-MIGRADO É SEGURO (vê a tabela, mostra 1 a mais)

MERGE (remediação — evento raro)
  gatilho    ≥2 sinais concordantes (núcleo BR + email, OU núcleo BR + org)
  canônico   vence o MAIS ANTIGO (histórico e vínculos)
  reaponta   as 20 TABELAS — deals e payment_links são os CRÍTICOS
  cadeia     achata no ato: reaponta também quem já apontava pro perdedor
             ↳ cadeia nunca passa de 1 salto; desreferenciador fica trivial
  descarte   NUNCA deletar — merged_into preserva auditoria

INVARIANTE
  ensureLead que falha NÃO devolve null e segue.
  Ou repete, ou marca a conversa como precisando de vínculo, ou alerta.
  Prova: 4 conversas órfãs no canal oficial, todas COM telefone,
         uma com 56 mensagens — o caminho de falha degrada por SEMANAS em silêncio.
```

**Divisão:** `platform-evolution-webhook` é meu. `platform-meta-whatsapp-webhook`, `cakto-webhook`, a view e a migração dos 41 pontos de leitura são da controladora.

---

## 4. As PRs

### PR-BDR-1 — Opt-out vivo

**Problema:** a action `on-inbound` do `platform-cold-outreach` está implementada e testada, e **nenhum código a invoca**. Opt-out (`SAIR`/`PARE`) não funciona.

**Entregável:** o `platform-evolution-webhook` invoca `on-inbound` ao receber mensagem, **antes** de qualquer outra coisa. O cérebro só roda se o `on-inbound` não silenciou.

**Check binário:**
- `PARE` → linha em `platform_crm_lead_optout` **e** fila do lead sai de `sent`
- `PARE` → **nenhuma** resposta enviada
- `oi` → fluxo segue normal

**Qualidade:** opt-out processado no mesmo ciclo da mensagem; zero resposta após opt-out, sob qualquer ordem de chegada.

**Por que é a primeira:** disparar com resposta automática e sem opt-out funcionando é a pior combinação possível. Não depende de nada.

### PR-BDR-2 — Resolução de identidade no canal Evolution

**Problema:** `platform-evolution-webhook:329` casa lead por duas formas (`dígitos`, `+dígitos`). O 9º dígito de celular BR fura o casamento e cria lead duplicado.

**Entregável:** `phoneVariantsBR` no ponto de resolução + desreferência de `merged_into`.

**Check binário:**
- lead gravado como `+551199998888`, mensagem chega como `5511999998888` → **mesma linha**, zero lead novo
- lead com `merged_into` preenchido → resolvedor devolve o **canônico**

**Qualidade:** zero criação de lead para pessoa já existente, em qualquer combinação de DDI / 9º dígito / `+`.

### PR-BDR-3 — `ensureLead` não falha calado

**Problema:** o `catch` é `non-fatal`, devolve `null`, a conversa segue órfã. No canal oficial isso já produziu 4 conversas invisíveis no CRM — todas **com** telefone, uma com **56 mensagens**. O caminho de falha degrada por semanas em silêncio.

**Entregável:** falha de resolução não produz conversa órfã silenciosa — repete, marca a conversa como precisando de vínculo, ou alerta.

**Check binário:**
- forçar falha → conversa **não** fica com `lead_id NULL` sem sinal
- conversas Evolution órfãs após um ciclo de teste: **0**

**Qualidade:** nenhum caminho de falha termina em silêncio.

### PR-BDR-4 — Cérebro agnóstico de canal

**Problema:** quatro portões impedem a Camila de responder — nenhum invocador do brain a partir do webhook Evolution · gate `channel='whatsapp'` · gate `status='bot_active'` (`platform-sales-brain:1029`) · envio hard-wired em Graph (`:190`, `:205`, `:226`, `:1809`).

**Entregável:** gates viram lista; envio vira `deliver()` roteando por `conversation.channel`; o webhook invoca o brain; conversa Evolution nasce `bot_active`.

**Check binário:**
- **não-regressão:** conversa do canal oficial responde exatamente como antes — caminho `channel==='whatsapp'` **byte-idêntico**
- conversa `whatsapp_evolution` deixa de retornar `skipped:'bot_not_active'`
- bolha sai pela Evolution com `delivery_status='sent'` e **zero** chamada a `graph.facebook`

**Qualidade:** o canal que fatura hoje não muda de comportamento. Isso é critério de aceite, não observação.

**Dependência:** ⚠️ **SDR estabilizado.** O arquivo está atendendo lead real agora e a controladora tem urgência que eu não tenho, por decisão do Marcelo. Não encosto antes do aviso dela.

**Coordenadas:** minhas regiões (`:190/:205/:226/:1029/:1809`) não intersectam as dela (~`:1666-1731` anti-repetição, ~`:1480-1530` temperatura). Anunciar antes + `merge origin/main` antes.

### PR-BDR-5 — Camila (persona)

**Problema:** a Camila não existe no banco. O que existe é `Bento · Prospecção` (`68aeece9-26f2-4f7b-a595-a6ea5e8acfa7`), de escopo **oposto** — não vende e faz handoff para a Duda.

**Entregável:** sobrescrever o Bento transformando-o em Camila (mesmo id, sem segundo `prospector`); matar `handoffToDuda` (`platform-cold-outreach:487/:499`); definir `model` (hoje NULL).

**Conteúdo da persona:** voz, cadência de 3 mensagens, 7 proibições, esqueleto de objeção em 5 tempos e a frase fixa do "vc é robô?" — em `memory/project_camila_bdr_spec_2026-08-03.md`.

**Check binário:**
- `pickProspectorPersona` retorna **Camila**
- **exatamente um** agente ativo satisfaz `isProspectorAgent` — **não** "um com `agent_type='prospector'`". São predicados diferentes: a função casa por `agent_type` **OU** por substring `prospector|prospec|bdr|outbound` em `agent_type + name` (`persona.ts:24-28`). Medido hoje: só o Bento casa, sem falso-positivo
- `model` **não** é NULL
- nenhum `[HANDOFF:sdr]` no fluxo do motor

**Qualidade:** responde ao "vc é robô?" com a frase fixa, sempre a mesma. Nenhuma abertura contém link (`containsLink()` prova).

**Nota:** `handoffToDuda` é código morto — 0 conversas Evolution, 0 leads recebidos pela Duda por ali. Medido pelas duas sessões.

### PR-BDR-6 — Travessia para o onboarding

**Problema:** a lead paga conversando com a Camila num número, e o onboarding chega de **outro**. Sem aviso prévio é o formato exato do golpe que ela teme, segundos depois de pagar.

**Entregável:** a Camila anuncia a troca **antes** do fechamento, nomeando o número; encerra a própria conversa com "continuo à disposição"; consome o sinal de pagamento.

**Coordenadas fixadas pelo Marcelo:** Lia · Implantação · WhatsApp API - Vendas **+55 11 95502-1205** · `phone_number_id 1239336002593934` · `connection_id 1f7ca6e3-a846-493d-908e-b6d74ccf8c84` · template `boas_vindas_ativacao`.

**Check binário:**
- a última mensagem antes do checkout **nomeia** o +55 11 95502-1205
- pagamento confirmado → conversa da Camila encerra e não responde mais
- a Lia assume com o **mesmo `lead_id`** (depende de PR-BDR-2)

**Dependência:** contrato do sinal de pagamento (`cakto_orders` + `organizations.plan_status`), entregue pela controladora.

**Fronteira:** checkout enviado e não pago continua sendo da Camila, não do onboarding.

### PR-BDR-7 — Ramo Evolution no inbox manual (baixa prioridade)

**Problema:** o botão *Iniciar Conversa* oferece a instância `prospeccao-ativa-camila`, e `platform-start-whatsapp-conversation` só resolve `platform_crm_whatsapp_meta_connections` → 404 `connection_not_found`.

**Entregável:** ramo Evolution delegando para `platform-evolution-send`, criando conversa `channel='whatsapp_evolution'`.

**Check binário:** *Iniciar Conversa* na instância → **200**, conversa aparece no inbox.

**Por que é última:** **não bloqueia a Camila** — o motor chama `platform-evolution-send` direto (`platform-cold-outreach:383`). Destrava o teste manual humano, não o disparo.

### PR-BDR-8 — Rajada e corrida no canal Evolution

**Problema:** o guarda `superseded` do `platform-sales-brain` (`:1118`) está **aninhado dentro de `if (ageMs < DEBOUNCE_MS)`** (`:1104`). Qualquer invocação cujo gatilho tenha mais de 12s **pula o `sleep`, o reload e o guarda inteiro** — transcrição, download de mídia, retry, cold start e fila entram todos por baixo. O `sleep` (`:1106`) não coalesce a rajada: ele **alinha** as invocações no mesmo instante de leitura, e nenhuma vê a escrita da outra.

Efeito observado no canal oficial em 03/08: 7 bolhas em 39s, duas saudações, pergunta final duplicada com diferença de uma vírgula.

**Por que é pré-condição do BDR, não risco herdado:** no inbound a rajada veio de texto+áudio, que é ocasional. No frio ela é o **caso modal** — quem recebe "oi" de número desconhecido responde 2-3 vezes em segundos ("quem é?", "como conseguiu meu número?"). *(Inferência, não medida: há zero conversas Evolution.)*

**Entregável:** consumir a correção da controladora (fila no banco + reivindicação) e provar o comportamento no canal Evolution.

**Check binário:**
- duas inbound em <12s **com atraso artificial no insert da segunda** → **UMA** resposta, não duas
- o claim da correção **não vive dentro de nenhum `if` de latência** — verificado por leitura do diff, não por teste
- ordenação da reivindicação usa estado posterior ao insert, **nunca `created_at`**

**Qualidade:** duas mensagens rápidas exercitam justamente o caminho que o guarda já cobre — teste que passa e não prova nada. **O critério é o insert atrasado.**

**Dependência:** PR-2b da controladora (a correção mora no arquivo dela).

---

## 5. Ordem, dependências e gates

```
PR-1  opt-out            ── sem dependência ── PRIMEIRA (segurança antes de qualquer envio)
PR-2  resolução          ── sem dependência
PR-3  ensureLead         ── depende de PR-2 (mesmo arquivo, mesma função)
PR-4  cérebro por canal  ── ⛔ BLOQUEADA até a controladora estabilizar o SDR
PR-5  persona Camila     ── depende de PR-4 (sem cérebro respondendo, persona não exercita)
PR-6  travessia          ── depende de PR-2 (lead_id único) + contrato Cakto
PR-7  inbox manual       ── independente, baixa prioridade
PR-8  rajada e corrida   ── depende da PR-2b da controladora (correção no arquivo dela)
                            ⚠️ altera o critério da PR-4: a não-regressão mede contra
                            o comportamento CORRIGIDO, não contra o de hoje —
                            o canal que fatura já tem a corrida dentro
```

**Nota sobre a PR-4:** o critério original *"o canal oficial responde exatamente como antes"* carimbaria a corrida como linha de base. Depois da PR-2b da controladora, a referência passa a ser o comportamento corrigido.

### Gates de operação (não são código)

| Gate | Regra | Dono |
|---|---|---|
| **G — nenhum lead real** | nenhum disparo a lead real antes de um ciclo completo (disparo → resposta → opt-out) provado com número nosso. **Vale só para outbound** — o inbound está vivo por decisão do Marcelo | eu |
| **Duplo gate do motor** | `campaign.dry_run` default `true` + env `COLD_OUTREACH_ENABLED`. Nada dispara sem os dois | Marcelo |
| **Aprovação de leads** | 3 elegíveis hoje; `approved_by` é ato humano. Não auto-aprovo em lote | Marcelo |
| **Disparo em massa** | sem fecho. Desaconselhado: audiência provavelmente inservível (navegador embutido do WhatsApp), entrega morre antes dos 10k, e o custo real é o **domínio**, não o número | Marcelo |

---

## 6. Fora do PRD, registrado

- **Teste de 200 contatos** com critério binário de leitura da WCA — audiência dedicada por `utm_source`, domínio descartável, `R = A/S` com piso `S ≥ 30`. Desenhado, não executado. Operação, não código.
- **`model` NULL na Lia** — ela recebe a cliente logo após o pagamento rodando em modelo indefinido. É da controladora; registrado porque afeta a travessia do PR-BDR-6.

---

## 7. O que depende do Marcelo

1. **O GO para codar**, com este escopo
2. **Aprovação de leads** e **disparo de 10k** — travam operação, não código

**Respondido:** a data de subida do preço **não existe** → §3.1 fechada, âncora temporal proibida nas duas agentes.

---

*Seções A e C fechadas por medição cruzada com a sessão Controladora GO-LIVE. Cada furo foi achado pela outra sessão; nenhum por auto-revisão.*
