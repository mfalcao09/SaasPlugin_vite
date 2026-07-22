# DEFEITOS E INCONSISTÊNCIAS — achados na pesquisa do Playbook do Caminho Feliz
### Subproduto da varredura de 2026-07-21 · reporte para a controladora "NexvyBeauty: GO LIVE"

> **Origem:** durante a construção de [PLAYBOOK-CAMINHO-FELIZ-2026-07-21.md](PLAYBOOK-CAMINHO-FELIZ-2026-07-21.md) foi preciso ler o código de ponta a ponta e reconstruir o E2E real de 20–21/07/2026 no banco de produção. Estes são os defeitos que apareceram no caminho. **Nenhum deles entrou no playbook** — o playbook descreve o padrão, este arquivo descreve o desvio.
> **Projeto Supabase:** `fzhlbwhdejumkyqosuvq` (produção).
> **Caso de referência:** pedido `9ATLKTY` · org `5da38ea6-88fb-40cf-8ee0-096cd2c9dc32` (ESTESAAE / `meuteste1`) · comprador de teste `claudinho@nexvy.tech`.
> **Relação com a auditoria de prontidão:** [AUDITORIA-GO-LIVE-2026-07-21.md](AUDITORIA-GO-LIVE-2026-07-21.md) cobre segurança e prontidão (RLS, `anon`, lints). Este documento cobre **fluxo funcional**. Há uma sobreposição — [D0](#d0) — e ela é **confirmação independente**: cheguei ao mesmo achado por outro caminho, sem ter lido a auditoria antes.

## Índice por severidade

| ID | Defeito | Severidade | Verificado em produção? |
|---|---|---|:--:|
| [D0](#d0) | A carteira ingerida é **83,5% inútil**: 0 nomes reais, LIDs gravados como telefone | 🔴🔴 **Crítico — ativo central da oferta** | ✅ sim |
| [D1](#d1) | E-mail de boas-vindas **não foi entregue** no E2E canônico (loop de 409 até DLQ) | 🔴 Crítico | ✅ sim |
| [D2](#d2) | `cakto_orders.organization_id` fica **sempre NULL** — venda não se liga à empresa | 🟠 Alto | ✅ sim |
| [D3](#d3) | Gap de **28 min** entre pedido pago e criação da org, com e-mail já disparado | 🟠 Alto | ✅ sim (causa não determinada) |
| [D5](#d5) | Funil de anúncios: **zero eventos** em `ads_capi_events` — nada chega à Meta | 🟠 Alto | ✅ sim |
| [D4](#d4) | Nina (D-7) com flag desligada — cron roda como no-op | 🟡 Médio | ⚠️ só no código |
| [D6](#d6) | "9 passos" × "10 passos" — a dona lê os dois números | 🟡 Médio | ✅ sim |
| [D7](#d7) | Leads da LP (`sales_leads`) **não chegam** ao CRM da plataforma | 🟡 Médio | ✅ sim |
| [D8](#d8) | Webhook Cakto valida segredo por comparação de string, não HMAC | 🟡 Médio | ⚠️ só no código |
| [D9](#d9) | Estágios de pipeline do NexvyBeauty não versionados em migration | 🔵 Baixo | ✅ sim |
| [D10](#d10) | `upsert_clientes_whatsapp` sem índice UNIQUE de suporte | 🔵 Baixo | ⚠️ só no código |
| [D11](#d11) | `ONBOARDING_HANDOFF_ENABLED` com default OFF | 🔵 Baixo | ⚠️ só no código |
| [D12](#d12) | Comentário do seed de automações contradiz o código | ⚪ Trivial | ⚠️ só no código |
| [C1](#c1) | Correção factual: os preços do briefing estavam errados | ⚪ Nota | ✅ sim |

**Nota de honestidade sobre a coluna "verificado em produção":** ⚠️ significa que o defeito foi lido no **código** e não pôde ser confirmado no ambiente vivo — tipicamente porque depende de variável de ambiente do Supabase, que não é legível por SQL. Nesses casos o que está provado é o **comportamento padrão do código**, não o valor vigente em produção.

---

<a name="d0"></a>
## D0 — 🔴🔴 A carteira de 84.194 clientes é majoritariamente lixo

### O erro
A ingestão do histórico do WhatsApp grava **identificadores internos do WhatsApp (LIDs) como se fossem números de telefone**, e usa esse identificador como nome do contato. O resultado: dos 84.194 registros criados, **nenhum** tem nome real e apenas **13.885 (16,5%)** têm telefone discável no Brasil.

A carteira é o ativo central da oferta — o "Raio-X da sua carteira" é a prova que a Duda usa para vender, e a tela de sucesso do onboarding anuncia o número à dona como conquista. Hoje o número é grande e o conteúdo é vazio.

### Como achei
Este achado **não veio da minha varredura original** — eu havia escrito, no ELO 8 do playbook, a régua "84.194 clientes importadas em 2 min 27 s" como prova de excelência, medindo apenas **volume**.

Ao rodar a checagem obrigatória contra arquivos existentes antes de criar este documento, encontrei `AUDITORIA-GO-LIVE-2026-07-21.md`, que afirmava que a carteira era "0% nomeada, 16,5% discável". Como isso contradizia frontalmente o que eu havia escrito como padrão, fui ao banco desempatar em vez de assumir que um dos dois estava errado. **A auditoria estava certa e a minha régua estava errada.**

### Evidência

```sql
select
 count(*)                                                          total,
 count(*) filter (where nome ~ '^[0-9()+\s-]+$')                   nome_so_digitos,
 count(*) filter (where nome !~ '^[0-9()+\s-]+$')                  nome_real,
 count(*) filter (where nome = telefone)                           nome_igual_telefone,
 count(*) filter (where telefone_normalizado ~ '^55[1-9][0-9]{9,10}$') tel_discavel_br
from clientes where organization_id='5da38ea6-88fb-40cf-8ee0-096cd2c9dc32';
```

| métrica | valor | % |
|---|---:|---:|
| total | 84.194 | 100% |
| nome só de dígitos/símbolos | **84.194** | **100%** |
| **nome real** | **0** | **0%** |
| nome idêntico ao telefone | 8.436 | 10,0% |
| **telefone discável BR** | **13.885** | **16,5%** |
| **telefone NÃO discável** | **70.309** | **83,5%** |

Amostra dos nomes gravados:

```
169148747407495
170823851733148
170823851733148
169148747407495
551123739016
```

Os três primeiros têm **15 dígitos** — é o formato de LID do WhatsApp, não de telefone. O último (`551123739016`, 12 dígitos) é um telefone fixo de São Paulo que passou.

### Causa provável
No sincronizador (`supabase/functions/evolution-history-sync/index.ts`), a função `resolvePhone()` tenta resolver um `@lid` para telefone real varrendo os campos alternativos (`remoteJidAlt`, `senderPn`, `participantPn`, `participantAlt`, `phoneNumber`, `pn`, `jid`, `number`, `id`). Quando **nenhum** resolve, o `@lid` **não é descartado** — o identificador segue adiante como se fosse o telefone.

Daí em diante o dano se consuma em cascata:
1. `normalize_phone_br` não rejeita a string de 15 dígitos;
2. na RPC `upsert_clientes_whatsapp`, o INSERT usa `nome = coalesce(nome, tel_norm)` — sem `pushName` disponível, **o LID vira o nome**;
3. o registro entra com `status='ativo'` e `tags=['whatsapp']`, indistinguível de um contato legítimo.

A regra que existe para proteger o nome curado (nunca sobrescrever nome real por algo que "pareça telefone") funciona na direção certa, mas nunca é acionada porque não há nome real para proteger.

### Impacto
- **Comercial:** o Raio-X entregue à lead na conversa de venda é montado sobre essa base. Uma carteira 83,5% não-discável não sustenta a promessa de "trazer suas clientes de volta".
- **Operacional:** as 4 automações do salão (aniversário, pacote, lembrete 24 h, retorno de inativo) disparam sobre `clientes`. A guarda "telefone ausente ou ambíguo → pula" evita o envio errado, mas significa que a régua roda sobre 16,5% da base.
- **De confiança:** a tela final do onboarding anuncia *"84.194 clientes já importadas pra sua carteira"*. A dona abre a carteira e encontra uma lista de números sem nome.
- **Na régua do playbook:** corrigi o ELO 8 para que a prova exija **qualidade**, não só volume. A régua anterior teria certificado como excelente exatamente este resultado.

### Onde olhar
`supabase/functions/evolution-history-sync/index.ts` — `resolvePhone()` e os contadores de descarte (`dropped_lid`, `dropped_grupo`, `dropped_vazio`, que já existem no log e teriam denunciado isso) · `supabase/migrations_salao/20260714_f6_carteira_whatsapp.sql` — a RPC e o fallback `nome = coalesce(nome, tel_norm)`.

### Lição de método
Contagem não é qualidade. Toda régua de "importou N registros" precisa vir acompanhada de "…dos quais M são utilizáveis, pelo critério X". Foi a checagem contra o trabalho de outra sessão que pegou o erro — não a minha própria varredura.

---

<a name="d1"></a>
## D1 — 🔴 O e-mail de boas-vindas não foi entregue no E2E canônico

### O erro
O e-mail `welcome-admin-access` entra num **loop de rejeição por idempotência** no provedor (Resend) e nunca é entregue. Na janela do E2E de referência, **nenhum** e-mail saiu: 15 falhas, 3 mortos na fila (DLQ) e 3 presos em `pending` — zero `sent`.

A tela `/bem-vindo` promete à compradora, textualmente, que o link chega *"por estes dois canais"* (WhatsApp e e-mail). Neste percurso, **só o WhatsApp entregou**. Quem não usa o WhatsApp da compra fica sem acesso nenhum.

### Como achei
Ao levantar a prova do ELO 4 do playbook ("o e-mail saiu?"), consultei `email_send_log` do comprador de teste esperando ver um `sent`. Vi uma pilha de `failed` com a mesma mensagem de erro repetida.

### Evidência

```sql
select created_at::date, status, count(*)
from email_send_log where recipient_email='claudinho@nexvy.tech'
group by 1,2 order by 1,2;
```

| dia | status | qtd |
|---|---|---|
| 2026-07-19 | pending | 6 |
| 2026-07-19 | **sent** | **6** |
| 2026-07-20 | dlq | 2 |
| 2026-07-20 | failed | 10 |
| 2026-07-20 | pending | 5 |
| 2026-07-20 | sent | 3 |
| 2026-07-21 | dlq | 3 |
| 2026-07-21 | failed | 15 |
| 2026-07-21 | pending | 3 |

**Na janela do E2E canônico (a partir de 2026-07-21T01:39Z, o pagamento): 15 `failed` · 3 `dlq` · 3 `pending` · `sent` = 0.**

O erro, idêntico em todas as falhas:

```
Resend 409: {"statusCode":409,"name":"invalid_idempotent_request",
"message":"This idempotency key has been used with this HTTP method and endpoint
within the last 24 hours, but the request body was modified and doesn't match
the original request."}
```

O padrão de retentativa revela a mecânica — **5 mensagens distintas com exatamente 7 tentativas cada**, uma por minuto, ao longo de ~6 minutos, terminando em DLQ:

```sql
select message_id, count(*) tentativas, min(created_at), max(created_at)
from email_send_log where recipient_email='claudinho@nexvy.tech'
group by 1 having count(*)>1 order by 2 desc;
```

| message_id (prefixo) | tentativas | primeiro | último |
|---|:--:|---|---|
| `efd949f9` | **7** | 2026-07-21T02:08:39Z | 2026-07-21T02:14:00Z |
| `4d5387e3` | **7** | 2026-07-21T01:40:06Z | 2026-07-21T01:46:00Z |
| `5751b457` | **7** | 2026-07-21T01:42:22Z | 2026-07-21T01:48:00Z |
| `34854c19` | **7** | 2026-07-20T18:46:10Z | 2026-07-20T18:52:00Z |
| `c2667dc1` | **7** | 2026-07-20T02:43:09Z | 2026-07-20T02:49:01Z |

Os que entregaram (`sent`) têm 2 tentativas — `pending` seguido de sucesso. Os que falham têm 7 e morrem.

### Causa provável
A chave de idempotência é **estável por usuário**: `welcome-admin-<userId>`, montada em `supabase/functions/_shared/cakto-plan-provisioning.ts` (bloco `ensureAdminUser`) e propagada ao Resend como header `Idempotency-Key` por `process-email-queue`.

Mas o **corpo do e-mail muda** entre provisionamentos, porque o link de implantação carrega um token novo a cada ativação. O Resend guarda a chave por 24 h e rejeita com 409 qualquer reenvio cujo corpo não seja idêntico ao primeiro. Resultado: o segundo e-mail do mesmo usuário dentro de 24 h **nunca entrega**, e a fila insiste 7 vezes antes de desistir.

Isso explica por que 19/07 entregou (primeira vez de cada chave) e 20–21/07 não.

### Impacto
- Promessa explícita da tela pós-checkout quebrada.
- Em teste E2E repetido — que é exatamente o que se faz antes de um go-live — o e-mail **sempre** falha a partir da segunda rodada do mesmo comprador, o que faz o defeito se disfarçar de "coisa de teste".
- Uma compradora real que compre, cancele e recompre no mesmo dia não recebe o segundo e-mail.

### Onde olhar
`supabase/functions/_shared/cakto-plan-provisioning.ts` (montagem do `idempotencyKey`) · `supabase/functions/send-transactional-email/index.ts` (enfileiramento) · `supabase/functions/process-email-queue/index.ts` (repasse do header ao Resend).

---

<a name="d2"></a>
## D2 — 🟠 A venda nunca se liga à empresa que ela criou

### O erro
`cakto_orders.organization_id` permanece **NULL** mesmo depois de o provisionamento ter criado a organização com sucesso. Não é caso isolado: **2 de 2** (100%) dos pedidos pagos de escopo plataforma estão sem vínculo.

### Como achei
Ao escrever a consulta de sanidade do ELO 12 do playbook — *"toda venda paga virou empresa?"* — tentei o join óbvio `cakto_orders → organizations` por `organization_id` e ele voltou vazio, apesar de a org existir. Tive que reescrever a consulta para conciliar por `customer_email`.

### Evidência

```sql
select cakto_ref_id, organization_id, status, paid_at, created_at, updated_at
from cakto_orders where cakto_ref_id='9ATLKTY';
```

| ref | organization_id | status | paid_at | created_at | updated_at |
|---|---|---|---|---|---|
| 9ATLKTY | **null** | paid | 2026-07-21T01:39:16Z | 2026-07-21T01:40:00Z | 2026-07-21T01:56:03Z |

E a organização que esse pedido gerou **existe**:

```sql
select id, created_at from organizations
where id='5da38ea6-88fb-40cf-8ee0-096cd2c9dc32';
-- 5da38ea6-88fb-40cf-8ee0-096cd2c9dc32 | 2026-07-21T02:08:37Z
```

Abrangência:

```sql
select count(*) filter (where organization_id is null) sem_vinculo, count(*) total
from cakto_orders where scope='platform' and status in ('paid','approved');
-- sem_vinculo = 2 | total = 2
```

### Causa
No escopo `platform`, `organization_id` nasce NULL por desenho — é o que permite o índice `UNIQUE NULLS NOT DISTINCT` funcionar como chave de idempotência do pedido. O provisionamento cria a organização **depois**, mas **não escreve o id de volta no pedido**.

### Impacto
O alerta mais importante da plataforma — *"venda paga sem acesso"* — não pode ser calculado por join. A conciliação depende de `customer_email` bater exatamente entre as duas tabelas, o que é frágil (maiúsculas, e-mail alternativo no checkout, compra em nome de terceiro). É justamente o cenário que o alerta existe para pegar.

### Onde olhar
`supabase/functions/_shared/cakto-plan-provisioning.ts` — ao fim de `provisionPlatformPlan`, quando a org é criada ou promovida.

---

<a name="d3"></a>
## D3 — 🟠 Gap de 28 minutos entre o pedido pago e a organização

### O erro
No E2E de referência, o provisionamento aparentemente **rodou três vezes**: duas que dispararam e-mail mas não deixaram organização, e uma terceira que criou a organização de fato — 28 minutos depois do pagamento. A causa das duas primeiras não terem concluído não foi determinada.

### Como achei
Ao montar o cronômetro-mestre do playbook (§0.3), a linha do tempo não fechou. O e-mail de boas-vindas é disparado **de dentro** de `ensureAdminUser`, que só roda dentro de `provisionFromOrder` — logo, se há e-mail às 01:40:06, houve provisionamento às 01:40. Mas a organização só existe a partir de 02:08:37.

### Evidência — linha do tempo reconstruída

| Marco | Horário (UTC) | Fonte |
|---|---|---|
| Pagamento confirmado | 01:39:16 | `cakto_orders.paid_at` |
| Pedido registrado | 01:40:00 | `cakto_orders.created_at` |
| **1º e-mail enfileirado** | **01:40:06** | `email_send_log` · message_id `4d5387e3` |
| **2º e-mail enfileirado** | **01:42:22** | `email_send_log` · message_id `5751b457` |
| Pedido atualizado | 01:56:03 | `cakto_orders.updated_at` |
| **Organização criada** | **02:08:37** | `organizations.created_at` |
| **3º e-mail enfileirado** | **02:08:39** | `email_send_log` · message_id `efd949f9` |

Três disparos de e-mail para o mesmo comprador em ~28 minutos indicam três execuções de provisionamento, das quais só a última deixou organização.

### O que ainda falta para fechar
Não consultei os logs de edge function do período (`get_logs`, serviço `edge-function`, janela 01:39–02:09Z de 21/07). É a próxima peça de investigação, e é ela que dirá se houve erro, retentativa da Cakto ou reprocessamento manual.

### Impacto
A régua "provisionamento em menos de 2 segundos" que consta do playbook mede da **criação da organização** em diante — o trecho que consegui provar (1,5 s). O trecho "webhook recebido → organização criada" **não está provado** e, neste caso, levou 28 minutos. Antes do go-live isso precisa ser explicado: é a diferença entre "a compradora recebe o link em 2 minutos" e "a compradora espera meia hora sem saber o que aconteceu".

---

<a name="d5"></a>
## D5 — 🟠 O funil de anúncios não emite nada — nem em modo seco

### O erro
A tabela `ads_capi_events` está **vazia**. Nenhum evento de conversão foi registrado — nem os `dry_run` que o modo desligado deveria gravar.

### Como achei
Ao escrever a prova do ELO 2 do playbook ("os eventos de conversão saíram, na ordem?"), consultei a tabela esperando ao menos linhas em `dry_run`, já que o dispatcher grava mesmo com o envio desligado. Voltou zero.

### Evidência

```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_name='ads_capi_events';   -- 1 (a tabela existe)

select count(*) from ads_capi_events;                            -- 0
select status, count(*) from ads_capi_events group by 1;         -- nenhuma linha
```

### Leitura
A tabela existe (a migration foi aplicada), mas nada nunca a alimentou. Duas hipóteses, não excludentes:
1. o dispatcher `platform-capi-send` nunca foi acionado (falta o cron ou o gatilho);
2. não houve tráfego real de anúncio ainda, e portanto nenhum evento de jornada elegível.

A segunda é razoável — mas então o funil **nunca foi exercitado de ponta a ponta**, nem em seco, e não há prova de que funcione quando o tráfego chegar.

### Impacto
Todo o ELO 2 do playbook descreve os 5 eventos (`LeadSubmitted → QualifiedLead → ViewContent → InitiateCheckout → Purchase`) como comportamento esperado. Hoje não há uma única linha demonstrando isso acontecer. Ligar tráfego pago sem esse caminho provado significa otimizar às cegas.

### Onde olhar
`supabase/functions/platform-capi-send/index.ts` (gate `CAPI_ENABLED` + token + dataset + WABA) · `supabase/functions/_shared/capi-payload.ts` (mapa jornada→evento) · migration `20260716_ads_attribution_capi_ctwa.sql`.

---

<a name="d4"></a>
## D4 — 🟡 A Nina roda como no-op

### O erro
`nina-health-scan` tem um portão logo na entrada: se `NINA_HEALTH_SCAN_ENABLED` não for exatamente `'true'`, a função retorna `{skipped:'flag_off'}` **antes de qualquer efeito**. O cron diário continua disparando — e não faz nada.

### Como achei
Lendo `supabase/functions/nina-health-scan/index.ts` para escrever o ELO 11 do playbook. O portão está antes de qualquer leitura de dados.

### Evidência
- **Código:** `supabase/functions/nina-health-scan/index.ts:134` — gate `NINA_HEALTH_SCAN_ENABLED !== 'true'` → retorno imediato.
- **Cron ativo:** `supabase/migrations_platform_crm/20260715_nina_health_scan_cron.sql:21` — `nina-health-scan-daily`, `0 12 * * *`.
- **Documentação interna:** `tasks/NINA-D7-ATIVACAO-BLUEPRINT-2026-07-15.md` registra que o bloqueio para ligar a flag **não é o D-7 em si**, e sim o modo retenção não estar no cérebro de produção.

⚠️ **Não verificado em produção** — o valor da variável de ambiente não é legível por SQL. O que está provado é o comportamento padrão do código.

### Achado adicional na mesma função
A âncora temporal é `dias desde plan_activated_at % 30`, o que pressupõe ciclo mensal. **Em plano anual a conta quebra**: a assinante seria abordada 12 vezes por ano como se estivesse sempre a 7 dias de renovar. O próprio blueprint recomenda persistir `next_payment_date`/`recurrence_period` do payload da Cakto em vez do módulo fixo.

### Impacto
A seção "Nina — o toque de D-7" do playbook descreve comportamento **projetado**, não vigente.

---

<a name="d6"></a>
## D6 — 🟡 "9 passos" e "10 passos" convivem, e a dona lê os dois

### O erro
A tela pós-checkout `/bem-vindo` diz *"9 passos rápidos, e salva sozinho"*. A terceira bolha da Lia, no WhatsApp, diz *"são 10 passos rapidinhos"*. A mesma pessoa recebe os dois na mesma janela de minutos.

O número correto pelo link público é **10** (o passo de criação de senha só existe quando não há sessão). No fluxo já logado dentro do app são **9**.

### Como achei
Transcrevendo os textos literais para os ELOs 3 e 5 do playbook. Ao comparar o texto da tela com o texto gravado no banco, os números não bateram.

### Evidência

**No banco** — as duas gerações de bolha, lado a lado:

```sql
select created_at, metadata->>'onboarding_org_id' org, left(content,52)
from platform_crm_messages
where metadata->>'proactive_greeting'='lia' and content like '%passos rapidinhos%'
order by created_at;
```

| quando | onboarding_org_id | texto |
|---|---|---|
| 2026-07-20T18:46:03Z | **null** (geração antiga) | "Funciona assim: são **9** passos rapidinhos (seu espaço," |
| 2026-07-21T02:08:41Z | `5da38ea6…` (E2E canônico) | "Funciona assim: são **10** passos rapidinhos (seu espaço" |

A bolha da Lia **já foi corrigida** para 10. A tela não.

**No código:** `src/pages/OnboardingWelcome.tsx`, array `comoFunciona` — o título do primeiro item ainda é `'9 passos rápidos, e salva sozinho'`.

### Impacto
Atrito de confiança no momento mais sensível do funil — logo depois de a pessoa pagar. É a correção mais barata desta lista.

---

<a name="d7"></a>
## D7 — 🟡 Lead da landing page não chega ao CRM

### O erro
O formulário público da LP grava em `sales_leads`. **Nenhuma outra função lê essa tabela.** Não existe ponte para `platform_crm_leads`, que é onde a Duda e o pipeline vivem. Quem preenche o formulário da LP não entra no funil.

### Como achei
Mapeando as entradas de lead para o ELO 2 do playbook. Ao listar as quatro portas (CTWA, LP, Instagram, webchat), notei que três gravam em `platform_crm_leads` e uma grava noutra tabela. Procurei o consumidor de `sales_leads` e não encontrei.

### Evidência
- **Escrita:** `supabase/functions/capture-lead/index.ts` grava em `sales_leads` com `contact_name`, `email`, `whatsapp`, `segment='salao'`, `status='novo'`, `lead_channel`, `ref_code`, `affiliate_id`, UTMs, `fbc`/`fbp`, `referrer_url`, `landing_page`.
- **Leitura:** busca por `sales_leads` nas edge functions não retorna nenhum consumidor além da própria escrita.
- **Volume atual em produção:** `select count(*) from sales_leads;` → **1**.
- **Confirmação indireta:** `wipe-demo-org` lista `sales_leads` entre as tabelas **preservadas** na faxina da demo — ou seja, é tratada como registro de lead, mas segue órfã do CRM.

O volume 1 explica por que isso não doeu ainda: a LP praticamente não recebeu tráfego. Vai doer no dia em que receber.

### Impacto
Se a LP virar a rota primária do funil pago — que é a decisão registrada —, cada lead capturada ali fica invisível para a Duda, para o pipeline e para os eventos de conversão.

---

<a name="d8"></a>
## D8 — 🟡 O webhook da Cakto valida segredo por comparação de string

### O erro
A autenticação do webhook de vendas é `credencial.webhook_secret !== secretParam` — comparação direta de string, **não HMAC** do corpo. E se `webhook_secret` estiver nulo ou vazio no banco, **não há validação nenhuma**.

Como comparação: os webhooks da Meta no mesmo repositório validam corretamente `X-Hub-Signature-256` (HMAC sobre o corpo cru) antes de qualquer processamento. O da Cakto é o elo mais fraco — e é o que movimenta dinheiro.

### Como achei
Escrevendo a "portaria" do ELO 4 do playbook — quis descrever exatamente o que impede uma chamada forjada de provisionar uma conta.

### Evidência
- **Código:** `supabase/functions/cakto-webhook/index.ts:39` — comparação simples; o segredo vem por query string (`?secret=`) ou header `x-cakto-secret`.
- **Contraste:** `supabase/functions/platform-meta-whatsapp-webhook/index.ts:474-494` — HMAC sobre o corpo cru, rejeita com 401 antes de tudo.
- **Configuração:** `supabase/config.toml:155` — `[functions.cakto-webhook] verify_jwt = false` (público por desenho, o que é correto; toda a defesa depende do segredo).

⚠️ **Não verifiquei em produção** se algum registro de `cakto_credentials` tem `webhook_secret` nulo ou vazio — vale a checagem.

### Impacto
Segredo em query string vaza em log de proxy, histórico de navegador e cabeçalho referer. E a ausência de HMAC significa que, com o segredo em mãos, qualquer corpo pode ser forjado — inclusive um pedido "pago" que provisiona uma conta gratuita.

---

<a name="d9"></a>
## D9 — 🔵 Estágios de pipeline do NexvyBeauty não estão versionados

### O erro
Os 6 estágios do funil do NexvyBeauty existem **apenas no banco de produção**. Não há migration que os crie. A única lista versionada é a do produto Cofounder.

### Como achei
Ao descrever os estágios no ELO 2 do playbook, procurei o seed em `supabase/migrations_platform_crm/` e só encontrei o do Cofounder. Fui ao banco confirmar o que existe de fato.

### Evidência — **e uma suspeita que se provou falsa**

À primeira consulta, os 12 estágios pareciam ter `order_index` duplicado (dois com ordem 0, dois com 1…), o que sugeriria um bug sério: lead entrando no funil errado, já que o código escolhe o primeiro estágio por `order_index`.

**Verifiquei antes de reportar, e não é o caso.** A tabela tem `product_id` e os dois conjuntos estão corretamente segregados:

```sql
select name, order_index, product_id, is_won, is_lost
from platform_crm_pipeline_stages order by product_id, order_index;
```

| produto | estágios (ordem 0→5) |
|---|---|
| `806b5975…` (NexvyBeauty) | Novo · Contatado · Demo agendada · Proposta · **Ganho** (won) · **Perdido** (lost) |
| `e2e1e85d…` (Cofounder) | Interessada · Assinou o SaaS · Vaga reservada · Em mentoria · **Concluída** (won) · **Perdida** (lost) |

**Não há ambiguidade de funil.** O que resta é apenas risco de deriva.

### Impacto
Baixo hoje, mas real: um `db reset` ou a criação de um ambiente novo nasce sem o funil do produto principal. E qualquer renomeação feita pela interface é invisível ao versionamento.

---

<a name="d10"></a>
## D10 — 🔵 A carteira não tem índice único de suporte

### O erro
A função `upsert_clientes_whatsapp` trata `(organization_id, telefone_normalizado)` como chave de deduplicação, mas o índice correspondente **não é UNIQUE** — é `idx_clientes_org_tel_norm`, não-único de propósito. A idempotência vem de uma trava por organização mais a sequência "atualiza, e só insere se não atualizou nada".

### Como achei
Escrevendo o ELO 8 do playbook (regra de escrita na carteira), fui à migration confirmar qual era a chave de conflito — e não encontrei `ON CONFLICT`, o que me levou à mecânica alternativa.

### Evidência
`supabase/migrations_salao/20260714_f6_carteira_whatsapp.sql` — a função é `security definer`, abre `pg_advisory_xact_lock`, faz UPDATE e só insere quando `row_count = 0`; o índice declarado nas linhas ~96-97 é não-único, com a justificativa registrada em comentário nas linhas ~18-23.

### Impacto
Funciona — a ingestão de 84.194 registros em 2 min 27 s prova que aguenta volume. Mas a garantia é aplicacional, não do banco: um segundo caminho de escrita que não passe por essa função pode duplicar contatos sem que nada o impeça. Havendo duplicatas pré-existentes, o UPDATE atinge todas as linhas de uma vez.

---

<a name="d11"></a>
## D11 — 🔵 O handoff da Lia depende de uma flag com default desligado

### O erro
`ONBOARDING_HANDOFF_ENABLED` precisa valer exatamente `'true'`. Qualquer outro valor — inclusive a ausência da variável — faz o handoff retornar `{ok:false, skipped:'flag_off'}`, e o provisionamento cai no WhatsApp genérico de boas-vindas.

### Como achei
Lendo `supabase/functions/_shared/onboarding-handoff.ts` para o ELO 5 do playbook.

### Evidência
- **Código:** `onboarding-handoff.ts:237-238` — gate com default desligado.
- **Contraprova de que está ligado hoje:** o E2E de 21/07 **entregou as 4 bolhas da Lia** com `onboarding_org_id` carimbado (verificado em `platform_crm_messages`). Logo, a variável está setada em produção **agora**.

### Impacto
Baixo, mas silencioso: um redeploy ou a recriação de um ambiente sem a variável derruba o elo mais visível do onboarding — e a degradação é elegante demais para chamar atenção (a compradora recebe *uma* mensagem genérica em vez de quatro com o link). Só se descobre pela ausência de reclamação.

---

<a name="d12"></a>
## D12 — ⚪ Comentário contradiz o código no seed de automações

### O erro
O bloco que semeia as 4 automações do salão tem comentário dizendo que elas nascem **desligadas**. O código grava `enabled: true`.

### Como achei
Ao contar os seeds para o ELO 4 do playbook, o comentário e o valor discordaram — fui ao banco desempatar.

### Evidência
- **Código:** `supabase/functions/_shared/cakto-plan-provisioning.ts`, bloco `seedSalonDataForNewOrg` — comentário desatualizado, `enabled: true` no upsert.
- **Banco (quem venceu):** as 4 regras da org do E2E estão com `enabled = true`.

### Impacto
Nenhum em runtime. Mas é exatamente o tipo de comentário que induz a próxima pessoa a "corrigir" o código na direção errada.

---

<a name="c1"></a>
## C1 — ⚪ Correção factual ao briefing

O briefing desta tarefa citava os planos como **217 / 387 / 687**. Os valores reais, lidos de `public_plans` em produção:

| Plano | Slug | Mensal | Anual | Preço de tabela |
|---|---|---|---|---|
| Essencial | `starter` | **R$ 275** | R$ 2.750 | R$ 450 |
| Premium | `pro` | **R$ 427** | R$ 4.270 | R$ 720 |
| Ultra | `premium` | **R$ 693** | R$ 6.930 | R$ 1.190 |

O playbook usa os valores corretos. Fica o registro para que o número errado não se propague a partir do briefing.

**Armadilha relacionada, já tratada no playbook:** os nomes colidem entre a vitrine e o banco — o card "Premium" da LP é o slug `pro`, e o card "Ultra" é o slug `premium`. Casar por nome pega o plano errado; o casamento correto é por slug.

---

# Ordem de ataque sugerida

| # | Item | Por quê |
|---|---|---|
| 1 | **D0** — descartar LID não resolvido na ingestão | é o ativo central da oferta; hoje 83,5% da carteira é inútil e a dona vê o número grande na tela de sucesso |
| 2 | **D3** — investigar os logs de edge de 01:39–02:09Z | é o único cuja causa é desconhecida, e governa o tempo do elo mais crítico |
| 3 | **D1** — idempotência do e-mail | promessa quebrada com a compradora, e se disfarça de "coisa de teste" |
| 4 | **D2** — gravar `organization_id` no pedido | destrava o alerta de "venda paga sem acesso" |
| 5 | **D6** — trocar 9 por 10 em `OnboardingWelcome.tsx` | correção de um caractere, atrito imediato |
| 6 | **D5** — exercitar o funil CAPI ao menos em dry-run | pré-requisito para ligar tráfego pago |
| 7 | **D8** — HMAC no webhook da Cakto | elo mais fraco no caminho do dinheiro |
| 8 | **D7** — ponte `sales_leads` → CRM | vira urgente no dia em que a LP receber tráfego |
| 9 | D4, D9, D10, D11, D12 | dívida conhecida, sem sangramento imediato |

---

*Levantado em 2026-07-21 durante a construção do Playbook do Caminho Feliz. Toda evidência marcada como verificada foi consultada no banco de produção `fzhlbwhdejumkyqosuvq` nesta data. Onde a verificação só foi possível no código, está explicitamente marcado. D0 é confirmação independente de um achado que a bateria `go-live-readiness` já havia registrado.*
