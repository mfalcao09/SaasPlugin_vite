# PLAYBOOK DO CAMINHO FELIZ — NexvyBeauty
### O parâmetro de excelência: o que TEM que acontecer, em quanto tempo, e como se prova

> **Data:** 2026-07-21 · **Escopo:** ponta a ponta — do anúncio à operação diária da dona e à operação da plataforma.
> **O que este documento é:** a régua. Descreve o comportamento esperado de cada elo do sistema em regime de excelência.
> **O que este documento não é:** backlog, diagnóstico ou lista de pendências. Aqui só existe o padrão a ser atingido e mantido.
> **Como usar:** cada elo tem **GATILHO → O QUE O SISTEMA FAZ → EM QUANTO TEMPO → COMO SE PROVA → PRÓXIMO ESTADO**. Se um elo não produz a prova descrita, ele não está no padrão.

---

## 0. Como ler este playbook

### 0.1 Os dois níveis do produto

O NexvyBeauty é um sistema de dois andares, e **nunca se deve confundi-los**:

| Nível | Quem opera | Quem é atendido | Prefixo no código |
|---|---|---|---|
| **Plataforma** | Nexvy (super_admin) | a dona do salão, como *nossa* cliente | `platform_*` (tabelas), `platform-*` (edge functions) |
| **Tenant** | a dona do salão | as clientes do salão | tabelas sem prefixo (`clientes`, `agendamentos`, `products`…) |

A agente **Duda** vende no nível plataforma. A agente **Lia** faz a implantação no nível plataforma. A **EquipIA** (Recepcionista virtual, Assistente de reativação, Consultora de serviços) atende no nível tenant.

### 0.2 O caso de referência

Todos os tempos e ordens de grandeza deste playbook vêm de um percurso real, completo, registrado no banco de produção em **20–21/07/2026**:

| Coordenada | Valor |
|---|---|
| Pedido (Cakto) | `cakto_orders.cakto_ref_id = '9ATLKTY'` — PIX, pago 20/07 22:39 BRT |
| Organização nascida | `organizations.id = 5da38ea6-88fb-40cf-8ee0-096cd2c9dc32` (ESTESAAE, slug `meuteste1`) |
| Conversa do handoff | `platform_crm_messages.conversation_id = aeb0fce6-4130-4eab-aaa0-b8c2ec590e1a` |
| Wizard | `onboarding_submissions.id = 4320c867-34b6-4a6c-bf9e-2afc76ec188f` |
| Instância WhatsApp | `evolution_instances.name = 'meuteste1-sal-o1'` |
| Carteira importada | **84.194** clientes, **76.028** com data de última interação, histórico desde **17/06/2025** |

Quando este documento diz "em segundos" ou "em ~3 minutos", é isso que está sendo medido.

### 0.3 O cronômetro-mestre (do pagamento à carteira montada)

| Marco | Horário (UTC) | Δ do marco anterior |
|---|---|---|
| Pagamento confirmado na Cakto | 01:39:16 | — |
| Pedido registrado em `cakto_orders` | 01:40:00 | **44 s** |
| E-mail de boas-vindas enfileirado | 01:40:06 | 6 s |
| Organização criada | 02:08:37,95 | — |
| Link de implantação criado | 02:08:38,06 | **0,1 s** |
| 10 serviços semeados | 02:08:39,20 | 1,1 s |
| 4 automações semeadas | 02:08:39,24 | 0,04 s |
| Radar Automático semeado | 02:08:39,26 | 0,02 s |
| 1ª bolha da Lia no WhatsApp | 02:08:39,43 | **1,5 s desde a criação da org** |
| 4ª (última) bolha da Lia | 02:08:42,28 | 2,85 s para as 4 bolhas |
| Wizard enviado pela dona (`submitted`) | 02:20:33,22 | **~12 min de preenchimento** |
| Wizard aplicado (`applied`) | 02:20:35,64 | **2,4 s** |
| Senha criada / primeiro login | 02:30:25,47 | — |
| Instância WhatsApp criada | 03:03:33,54 | — |
| QR gerado | 03:03:38,48 | **4,9 s** |
| WhatsApp conectado | 03:03:54,52 | **16 s após o QR** |
| 1º cliente na carteira | 03:04:06,86 | **12 s após conectar** |
| Último cliente (ingestão concluída) | 03:06:34,07 | **2 min 27 s** |

**Régua de excelência derivada:** do pagamento ao link na mão da dona, **menos de 2 minutos**. Do QR escaneado à carteira montada, **menos de 3 minutos** para uma base de ~84 mil contatos.

### 0.4 Legenda de prova

Toda prova neste documento é de um destes quatro tipos:

- 🗄️ **Registro** — uma linha que nasce ou muda no banco.
- 💬 **Mensagem** — uma bolha que chega no WhatsApp ou um e-mail que entra na caixa.
- 🖥️ **Tela** — algo que a pessoa vê mudar.
- 📋 **Log/alerta** — uma entrada de log da edge function ou um alerta no Telegram.

---

# ELO 1 — ATRAÇÃO

**Objetivo do elo:** transformar impressão de anúncio em conversa iniciada, sem perder a origem.

## 1.1 A vitrine

| Superfície | Rota | O que é |
|---|---|---|
| Landing page de vendas | `/vendas` | Página "Clientes de Volta" — a página primária do funil pago |
| Demonstração navegável | `/demo` → `/demo/cockpit` | Ambiente público de demonstração (cockpit, salão, agenda, relatórios, oportunidades, automações, saúde da base, meta do mês) |
| Formulário público | `/f/:slug` | Captação por formulário (ex.: `/f/interesse-cofounder`) |
| Chat público | `/c/:slug` | Captação por conversa |
| Quiz público | `/q/:slug` | Captação por quiz |
| Agendamento público do salão | `/s/:slug` | Vitrine do tenant (não é funil da plataforma) |

## 1.2 O que a lead vê na LP

- **Preço**: renderizado a partir da view `public_plans`, em tempo de execução. Nenhum preço vive escrito na página.
  O casamento card→plano é **por slug**, nunca por nome: `essencial→starter`, `premium→pro`, `ultra→premium`. (Os nomes colidem entre a vitrine e o banco; o slug é a chave correta.)
- **Dois caminhos de saída**:
  1. **"Assinar agora"** → `public_plans.checkout_url` do plano escolhido, com o rastreio anexado.
  2. **"Falar com a gente" / "Quero o Raio-X"** → WhatsApp comercial `https://wa.me/5511955021205`, com a mensagem já escrita:
     > "Oi! Vim pela página e quero o Raio-X da minha carteira."
- **Regra de degradação**: sem `checkout_url` publicado, o botão do card vira "Falar com a gente" e leva ao WhatsApp. **O CTA nunca quebra.**
- **Entrar** → `https://app.nexvybeauty.com.br` · **Instagram** → `@nexvytech` · **Cofounder** → formulário `/f/interesse-cofounder`.

## 1.3 O que é registrado

| O quê | Onde | Detalhe |
|---|---|---|
| Origem da visita | cookie 1st-party `nxv_track` | `ref`, `utm_source/medium/campaign/term/content`, `src`, `sck`, `fbc`, `fbp`, `referrer_url`, `landing_page` |
| Política do cookie | 30 dias, `SameSite=Lax`, domínio registrável (vale em `app.` e `www.`) | UTM/`ref` são **last-touch**; `landing_page`/`referrer_url` são **first-touch**; nunca sobrescreve com vazio |
| Repasse ao checkout | querystring do `checkout_url` | anexado **sem sobrescrever** o que a URL já traz |
| Eventos de Pixel | `fbq('track', …)` | `Lead` nos CTAs de WhatsApp (`raiox_hero`, `raiox_secao`, `pos_planos`) · `InitiateCheckout` no clique de assinatura · `Contact` quando o card cai no WhatsApp |

**⏱️ Em quanto tempo:** captura no carregamento da página — imperceptível.

**✅ Como se prova:**
- 🖥️ Abrir `/vendas?utm_source=teste&ref=x` e conferir o cookie `nxv_track` com esses valores.
- 🖥️ Clicar em "Assinar agora" e conferir que a URL da Cakto carrega `utm_source=teste&ref=x`.
- 🗄️ Depois da compra: `cakto_orders.raw_payload` traz os UTMs, e `cakto_orders.seller_ref` traz o canal resolvido.

**➡️ Próximo estado esperado:** ou uma conversa no WhatsApp comercial (ELO 2), ou um checkout aberto (ELO 3).

---

# ELO 2 — A CONVERSA DE VENDA (DUDA)

**Objetivo do elo:** transformar uma mensagem no WhatsApp da Nexvy em venda, sem rejeitar ninguém, sem inventar preço e sem prometer o que não se cumpre.

## 2.1 GATILHO

Mensagem chega no número de vendas da Nexvy (WhatsApp Cloud API), vinda de: anúncio com clique-para-WhatsApp (CTWA), CTA da LP, Instagram, ou contato espontâneo.

**Portaria do webhook:** a assinatura `X-Hub-Signature-256` é validada **sobre o corpo cru** antes de qualquer processamento. Assinatura inválida → `401`, nada acontece. Cada mensagem é idempotente pelo `wamid`.

## 2.2 O que nasce quando a lead escreve

| Registro | Valores esperados |
|---|---|
| `platform_crm_conversations` | `visitor_id='wa:<dígitos>'`, `channel='whatsapp'`, `status='bot_active'`, `needs_human=false`, `visitor_phone`/`visitor_whatsapp` em `+E.164`, `meta_connection_id`, `product_id` herdado da conexão |
| `platform_crm_leads` | dedupe por telefone; `source='whatsapp'`, `lead_channel='whatsapp'`, `product_id` só no primeiro registro |
| `platform_crm_messages` | `direction='inbound'`, `sender_type='visitor'`, `metadata{wamid, channel:'whatsapp_cloud', connection_id, from, phone_number_id, wa_timestamp, wa_type, referral?}` |
| Pipeline | o lead entra automaticamente no **primeiro estágio** por ordem, e a mudança fica registrada em `platform_crm_lead_stage_history` |

**Conversa fechada é reaberta como `bot_active`** — nunca se cria uma segunda conversa para o mesmo número.

## 2.3 Atribuição de anúncio (CTWA) — a regra de ouro

Se a mensagem traz `referral` com `ctwa_clid` **ou** `source_id`, três coisas acontecem:

1. **Marcação de origem no lead — só se ainda não houver origem** (`utm_source` nulo). É deliberadamente **first-touch**: um segundo clique noutro anúncio não reescreve a origem da lead.
   `source='ctwa'` · `utm_source='meta'` · `utm_medium='ctwa'` · `utm_campaign=<ad_id>` · `utm_content=<source_type>` · `utm_term=<ctwa_clid>` · `metadata.referral` e `metadata.ctwa_clid`.
2. **Linha em `ads_attribution`** com `ctwa_clid`, `source_id`, `source_type`, `source_url`, `headline`, `body`, `media_type`, `ctwa_channel='whatsapp'` e o payload cru — com dedupe.
3. **Evento de jornada** `meta_ctwa_received`.

## 2.4 Os eventos de conversão devolvidos à Meta

O funil devolve à Meta **exatamente 5** nomes de evento — não há outros:

| Momento no funil | Evento de jornada | `event_name` na Meta |
|---|---|---|
| 1ª mensagem com referral de anúncio | `meta_ctwa_received` | **LeadSubmitted** |
| Lead esquenta (temperatura vira `warm`/`hot`) | `temperature_changed` | **QualifiedLead** |
| Raio-X / demonstração entregue | `demo_completed` | **ViewContent** |
| Checkout gerado | `checkout_created` | **InitiateCheckout** |
| Venda concluída | `sale_completed` / `pix_paid` | **Purchase** |

Cada envio carrega `action_source='business_messaging'`, `messaging_channel='whatsapp'`, o `ctwa_clid` no `user_data`, valor em BRL quando houver, e um `event_id` determinístico (`<evento>.<id da jornada>`) — é ele que faz a **deduplicação com o Pixel do navegador**, para que uma conversão não seja contada duas vezes.

## 2.5 Quem é a Duda

| Dimensão | Padrão |
|---|---|
| **Objetivo declarado** | vender o NexvyBeauty ajudando cada profissional da beleza a escolher o plano certo — **nunca rejeitar venda, nunca decidir "apta/inapta": pagou, é cliente** |
| **Tom** | colega de profissão que entende do setor: calorosa, direta, WhatsApp de verdade — até ~300 caracteres, **1 pergunta por mensagem**, no máximo 1 emoji, um reconhecimento genuíno antes de perguntar, zero jargão de vendas |
| **Forma da resposta** | no máximo 4 bolhas de ~160 caracteres, sem markdown, com "digitando…" real e pausa proporcional ao tamanho |
| **O que ela nunca faz** | dar desconto · oferecer garantia de devolução · mencionar mentoria ou Cofounder · citar preço de memória |
| **Como reduz o risco da compra** | com **prova** (o Raio-X) e o direito de arrependimento de 7 dias — não com garantia de performance |
| **Escassez que ela pode usar** | apenas a verdadeira: o preço de lançamento sobe para o preço de tabela |

**A primeira mensagem não é um texto fixo** — mas para lead vinda de anúncio a abertura é obrigatória em três partes: reconhecer que ela veio do anúncio do Raio-X, prometer mostrá-lo no número real dela em ~2 minutos, e **já fazer a primeira pergunta de qualificação**. Abertura genérica ("como posso te ajudar?") não é o padrão.

## 2.6 Como ela qualifica

Escada de **no máximo 3 respostas**, nesta ordem de interesse:

1. espaço próprio ou autônoma;
2. quantas cadeiras / profissionais;
3. usa sistema ou agenda hoje;
4. quantas clientes na base e quantas sumiram.

**Proibido perguntar** tempo de atuação e clientes acumulados. Depois da 2ª ou 3ª resposta ela **para de perguntar e dispara o Raio-X**.

**A pontuação é determinística, não é opinião do modelo.** O potencial de recuperação é calculado como `nº de clientes × ticket médio × 0,35`, e comparado com o preço do plano de entrada (buscado de `public_plans`). Somam-se quatro dimensões — potencial (0-50), tempo (0-20), recorrência por sub-vertical (0-15) e dor (0-15) — e o resultado define a **rota da oferta**:

| Pontuação | Rota | Significado |
|---|---|---|
| ≥ 70 | `premium` | apresenta o plano superior |
| 40–69, ou dados provisórios | `aprofundar` | investiga mais antes de ofertar |
| < 40 | `essencial` | apresenta o plano de entrada |

**A rota escolhe a oferta — nunca rejeita a lead.** O que ela já respondeu fica na memória do lead, para que a Duda não repergunte.

## 2.7 O Raio-X — a prova que substitui a promessa

Quando a Duda decide provar em vez de argumentar, o sistema cria uma **demonstração real no número da própria lead** e devolve o link na mesma resposta: `https://app.nexvybeauty.com.br/implantacao/<token>`.

Regra de enquadramento: o Raio-X **não é reunião nem agendamento** — é entrega imediata. Se a criação falhar, a Duda responde com um fallback caloroso e a Nexvy é alertada.

## 2.8 Preço e checkout

| Regra | Padrão |
|---|---|
| Origem do preço | `public_plans` em tempo de execução, filtrado por ter `checkout_url` **e** ser público — planos internos e de teste nunca aparecem |
| Como o preço é dito | *"de R$ X por R$ Y — preço de lançamento, sobe em breve"*, sempre que houver preço de tabela maior |
| Se a lead pergunta o preço | responde **na mesma mensagem**. Adiar é permitido **uma única vez** |
| Quando ela decide | *"quero contratar" / "como pago" / "manda o link"* → a Duda **entrega a URL exata do checkout na resposta**. Responder sem o link não é o padrão |
| Atribuição de venda | cada link sai com `?src=<vendedora>`, e é isso que faz o `seller_ref` chegar em `cakto_orders` |

## 2.9 Passagem de bastão

**Duas coisas diferentes, que não devem ser confundidas:**

| Movimento | Quando | Efeito |
|---|---|---|
| **Duda → Bia (closer)** — interno, continua com IA | pontuação ≥ 70 **e** lead hesitante/cética | troca a agente da conversa; o status **permanece `bot_active`**. Sem closer ativo, a Duda mantém a conversa |
| **Escalada para humano** | reclamação grave, pedido explícito de humano, ou caso sensível (preço fora de tabela, parceria, imprensa) | a última bolha vira *"Vou te conectar com nosso time pra achar o melhor caminho pra você 💚"*; a conversa vai a `status='waiting_human'` + `needs_human=true` e entra na fila do inbox para distribuição |

**Nunca se escala por perfil ou tamanho de carteira.** Lead pequena não é motivo de escalada — é motivo de rota `essencial`.

## 2.10 Follow-up — a régua de silêncio

Se a lead para de responder depois de uma mensagem da Duda, o sistema cutuca em **quatro tempos**:

| Toque | Silêncio acumulado | Intenção |
|---|---|---|
| 1º | **8 min** | toque leve, com uma pergunta de retomada |
| 2º | **20 min** | pergunta de valor, eventualmente propondo retomar depois |
| 3º | **25 min** | mais incisivo |
| 4º | **35 min** | despedida cordial, **sem pergunta** |

**Qualquer resposta da lead zera a régua.** O sistema apenas *sinaliza* o momento — o texto é sempre gerado pela Duda dentro do repertório daquele estágio, nunca um texto fixo repetido. Frases-clichê são proibidas por regra ("me conta aí", "faz sentido para você?", "agora é sua vez de falar").

**Aviso de janela:** uma cortesia única às **23 h** desde a última mensagem *dela* — e a mensagem nunca menciona "Meta", "WhatsApp Business" ou "janela de 24 horas". Só a resposta dela renova a janela; mensagens nossas não.

## 2.11 EM QUANTO TEMPO

| Trecho | Padrão |
|---|---|
| Mensagem recebida → resposta da Duda | segundos, com pausa proporcional deliberada (simula digitação humana) |
| Qualificação completa | **no máximo 3 respostas** da lead |
| Da qualificação ao Raio-X entregue | mesma conversa, sem agendamento |

## 2.12 COMO SE PROVA

```sql
-- A conversa nasceu e está com a IA
select visitor_id, channel, status, needs_human, current_agent_id, meta_connection_id, product_id
from platform_crm_conversations where visitor_phone = '+55<DDD><numero>';

-- A origem do anúncio foi capturada (first-touch)
select source, utm_source, utm_medium, utm_campaign, utm_content, utm_term
from platform_crm_leads where phone_normalized = '55<DDD><numero>';

select ctwa_clid, source_id, source_type, headline, ctwa_channel, created_at
from ads_attribution where lead_id = '<lead_id>';

-- Os eventos de conversão saíram, na ordem
select event_name, status, created_at from ads_capi_events order by created_at;
```

Esperado: conversa `bot_active`; lead com `utm_medium='ctwa'`; uma linha de atribuição por lead; e a sequência de eventos **LeadSubmitted → QualifiedLead → ViewContent → InitiateCheckout → Purchase** conforme a lead avança.

**➡️ Próximo estado esperado:** ela abre o checkout (ELO 3).

---

# ELO 3 — CHECKOUT

**Objetivo do elo:** converter intenção em pedido pago, com o plano correto e a origem preservada.

## 3.1 O catálogo (fonte única: `public_plans`)

| Plano | Slug no banco | Mensal | Anual | Preço de tabela | Rótulo |
|---|---|---|---|---|---|
| **Essencial** | `starter` | R$ 275 | R$ 2.750 | R$ 450 | — |
| **Premium** | `pro` | R$ 427 | R$ 4.270 | R$ 720 | *Mais escolhido* |
| **Ultra** | `premium` | R$ 693 | R$ 6.930 | R$ 1.190 | — |

Todos com `trial_days = 7`.

**O que cada plano promete (descrição publicada):**
- Essencial — *"Recepcionista de IA + agenda + CRM. Para quem está começando."*
- Premium — *"Atende, qualifica e reativa cliente sozinho. Para quem tem equipe e quer crescer."*
- Ultra — *"Operação multi-unidade com IA de voz e integrações. Para redes."*

**O que muda entre eles:**

| Recurso | Essencial | Premium | Ultra |
|---|:--:|:--:|:--:|
| WhatsApp · agenda · pipeline · kanban · formulários · agentes de IA | ✅ | ✅ | ✅ |
| Correção de texto por IA · transcrição de áudio | ✅ | ✅ | ✅ |
| Campanhas · disparo ativo · funis de captação | — | ✅ | ✅ |
| Webhooks · API externa · integrações · agentes de voz | — | — | ✅ |

**Regra inegociável de preço:** o preço exibido em qualquer superfície (LP, e-mail, fala da Duda) vem de `public_plans` em tempo de execução.

**Limites por plano** vivem em `platform_plans` e podem ser sobrescritos por organização; a resolução final é feita pela função `get_organization_effective_limits`, na precedência **override da org → plano → padrão do sistema**: `max_users`, `max_connections` (instâncias de WhatsApp), `max_sectors`, `max_products`, `max_contacts`, `max_messages_month`, `max_ai_tokens_month`, `max_ai_agents`.

## 3.2 O que a compradora vê ao pagar

Pagamento aprovado → a Cakto redireciona para **`/bem-vindo`**. A tela é pública (ela ainda não tem sessão) e aceita, opcionalmente, `?nome=`, `?email=`, `?plano=`.

O que a tela diz, e **só** isso:

1. **Confirmação** — *"Seu pagamento foi confirmado — plano X e sua conta já está criada. Agora falta só um passo: montar o seu espaço."*
2. **Onde está o link dela** — *"O link para montar seu espaço já foi enviado. Ele é pessoal e chega por estes dois canais — por segurança, não conseguimos mostrá-lo aqui nesta tela."*
   - **WhatsApp** (marcado como *mais rápido*): *"A Lia manda o link na mesma conversa em que você falou com a gente."*
   - **E-mail**: *"Enviamos para <e-mail> o mesmo link, junto com os seus dados de acesso."*
3. **Quando você abrir o link** — expectativa honesta: passos rápidos que salvam sozinho; o QR do WhatsApp no fim (com o aviso de abrir no computador ou noutro celular); e a Lia acompanhando pelo WhatsApp durante toda a montagem.
4. **Se não chegou** — orienta a abrir a conversa do WhatsApp e a checar a aba de promoções do e-mail.

**Por que a tela não mostra o link:** o token é um segredo gerado servidor-a-servidor; só o `sha256` fica no banco. Uma tela pública que buscasse o link por e-mail entregaria a conta a quem soubesse o e-mail da compradora.

**⏱️ Em quanto tempo:** redirecionamento imediato à aprovação.

**➡️ Próximo estado esperado:** o webhook da Cakto chega e o provisionamento roda (ELO 4).

---

# ELO 4 — PROVISIONAMENTO

**Objetivo do elo:** transformar um pedido pago numa empresa viva — com plano, dona, catálogo, automações e link de implantação — sem intervenção humana.

## 4.1 GATILHO

A Cakto chama `cakto-webhook` com `?scope=platform&secret=…` (ou header `x-cakto-secret`).

**Portaria — o que tem que acontecer antes de qualquer coisa:**

| Verificação | Comportamento esperado |
|---|---|
| Credencial existe para o `scope` | senão, `404 credentials not found` |
| Segredo confere com `cakto_credentials.webhook_secret` | senão, `401 invalid secret` + 📋 Telegram **"🚨 Cakto webhook: assinatura inválida"** com o e-mail do comprador |
| Payload tem `order.id` | senão, `400 invalid payload` |

## 4.2 O QUE O SISTEMA FAZ — na ordem

**Passo 1 — Registra o pedido.**
Upsert em `cakto_orders` com chave de idempotência **`(scope, organization_id, cakto_id)`**, sob índice `UNIQUE NULLS NOT DISTINCT` — para que reentregas no escopo plataforma (onde `organization_id` é nulo) **atualizem a mesma linha** em vez de duplicar.

Grava: `status`, `amount`, `base_amount`, `discount`, `payment_method`, `coupon_code`, dados da compradora (`customer_name/email/phone/document`), `product_cakto_id`, `product_name`, `paid_at`, `items[]` normalizados (papéis `main`/`orderbump`/`upsell`/`downsell`), `cakto_offer_slug` (último segmento da URL de checkout), `seller_ref`, `affiliate_id` e o `raw_payload` inteiro.

**Passo 2 — Resolve o plano.**
Ordem de resolução em `platform_plans`:
1. `cakto_offer_slug` igual ao slug da oferta paga *(preferencial)*;
2. `cakto_product_id` igual ao produto da Cakto.

Não resolveu → 📋 Telegram **"🚨 Cakto: PLANO NÃO ENCONTRADO (venda paga sem acesso)"**. No padrão de excelência esse alerta nunca dispara, porque `cakto-sync-offer` mantém `platform_plans.cakto_offer_slug` casado com a oferta ativa da Cakto.

**Passo 3 — Confere o valor pago.**
Sem cupom e com valor abaixo do preço do plano (tolerância R$ 0,50) → 📋 Telegram **"⚠️ Cakto: PREÇO DEFASADO / underpay"**. O acesso é concedido mesmo assim; o alerta existe para que a Nexvy aja sobre o link de oferta antigo.

**Passo 4 — Encontra ou cria a empresa.**
1. Procura `organizations` por `cakto_customer_email`.
2. Não achou: procura organização em `plan_status='demo'` pelo e-mail e, em seguida, pelo telefone normalizado. Achou → **promove no lugar**, preservando tudo que ela já montou durante a demonstração.
3. Ainda não achou → cria: `name` = nome da compradora (ou o e-mail), `email`, `cakto_customer_email`, `status='active'`, `slug`.

**Regra do slug:** nome normalizado (sem acentos, minúsculo, não-alfanumérico vira hífen), cortado em 48 caracteres; vazio vira `salao`. Colisão resolve com sufixo `-2`, `-3`… e, em último caso, sufixo aleatório. Organização pré-existente sem slug recebe o slug por retroalimentação.

**Passo 5 — Ativa o plano.** Em `organizations`:

| Campo | Valor |
|---|---|
| `plan_id` | o plano resolvido |
| `plan_status` | `active` |
| `plan_activated_at` | agora |
| `cakto_subscription_id` | `cakto_ref_id` (ou `cakto_id`) |
| `enabled_modules` | `['erp_salao', 'crm_vendas', 'atendimento']` |
| `demo_expires_at` | `null` — a demonstração deixa de expirar |

**Passo 6 — Lança o financeiro.** Linha em `billing_history`, idempotente por `metadata->>cakto_id`: `amount`, `status='paid'`, `description = "Plano <nome> — Cakto"`, `payment_date`, `metadata.source='cakto'`.

**Passo 7 — Cria o link de implantação.** *(só na 1ª ativação — organização criada ou demonstração promovida)*
Linha em `onboarding_submissions`: `mode='link'`, `status='draft'`, `payload={}`, `token_hash` = sha256 do token, `expires_at` = **agora + 72 h**.
O token são 32 bytes aleatórios em base64url; **só o hash é persistido**. Por isso o link é gerado **uma única vez** e o *mesmo* link vai por e-mail e por WhatsApp.

> **URL final:** `https://app.nexvybeauty.com.br/implantacao/<token>`

**Passo 8 — Garante a dona.**
- **Usuário**: se o e-mail já existir, **reusa** (não recria, não falha); senão cria com senha aleatória descartável e e-mail já confirmado. A compradora nunca recebe essa senha.
- **`profiles`**: `id`, `email`, `full_name`, `organization_id`, `recovery_whatsapp` = telefone da compra, `is_active=true`.
- **`user_roles`**: `admin`.
- Dispara o **e-mail de boas-vindas** (§4.3).

**Passo 9 — Semeia o espaço.** *(só na 1ª ativação)*

| O que | Quantos | Conteúdo |
|---|:--:|---|
| **Serviços** | **10** | Corte · Escova · Coloração · Manicure · Esmaltação em gel · Alongamento de cílios · Design de sobrancelha · Podologia / Spa dos pés · Limpeza de pele · Depilação |
| **Automações** | **4** | `aniversario` (0 dias) · `pacote_vencendo` (3 dias) · `agendamento_24h` (1 dia) · `retorno_inativo` (45 dias) — todas **ligadas** |
| **Radar** | **1** | Agenda "Radar Automático", cron `0 8 * * *` |

**Passo 10 — Passa o bastão para a Lia** (ELO 5).
Caso, por qualquer motivo, a Lia não cumprimente, sai um WhatsApp de boas-vindas genérico:
> "Olá, *PrimeiroNome*! 🎉 Sua conta NexvyBeauty do plano *X* foi ativada com sucesso. Enviamos ao seu e-mail o link para definir a senha e acessar o painel. Qualquer dúvida, é só responder por aqui."

**Princípio de robustez do elo:** seeds, WhatsApp de boas-vindas e handoff são explicitamente *melhor-esforço* — nenhum deles pode derrubar o provisionamento. A **única** falha que aborta o fluxo é a impossibilidade de criar a organização.

## 4.3 O e-mail de boas-vindas

| Campo | Valor |
|---|---|
| Template | `welcome-admin-access` |
| Remetente | `NexvyBeauty <noreply@nexvybeauty.com.br>` |
| Assunto | *"Bem-vinda ao NexvyBeauty — seu acesso ao **plano X** está pronto"* |
| Preview | *"Um novo tempo começou — sua EquipIA já está de plantão"* |
| Idempotência | `welcome-admin-<userId>`, propagada ao provedor como `Idempotency-Key` |
| Entrega | enfileirado em `transactional_emails` e consumido por `process-email-queue` |
| Supressão | checagem **fail-closed** contra `suppressed_emails` antes de enfileirar |

**Corpo (teor literal):**
> "Estamos muito felizes em ter você no universo NexvyBeauty! Agora começa o seu onboarding, que vai ser acompanhado com nossa Equip(IA) - sim, também temos a nossa!"
> "Nosso desejo é ajudá-la a trazer suas clientes de volta, fidelizá-las; além de atendê-las virtualmente no dia-a-dia com qualidade e agilidade!"
> "Prepare-se para transformar a experiência no seu salão e impulsionar o sucesso do seu negócio com inteligência e sofisticação."

**CTA principal:** botão rosa **"Começar meu Onboarding"** → o link de implantação. Abaixo, a nota que remove o atrito da senha:
> "O botão abre a montagem do seu espaço. Você cria sua senha no último passo — não precisa de senha para começar."

E o fecho de segurança: *"Se você não reconhece esta compra, basta ignorar este e-mail."*

**Bloco Cofounder** (duas colunas, com foto): título **"Programa Cofounder"**, tagline *"Mais do que um sistema: um lugar ao seu lado."*, chamada *"Para um grupo pequeno de fundadoras, o Cofounder é mentoria individual para destravar o seu negócio de dentro pra fora:"* e os **4 pilares** — Mentoria individual e personalizada · Raio-X financeiro do seu negócio · Percepção de marca e precificação · 8 encontros individuais, no seu tempo. CTA secundário verde-sálvia: **"Quero conhecer o Cofounder"** → `https://nexvybeauty.com.br/f/interesse-cofounder`.

**Rodapé:** logo, slogan *"sua EquipIA para transformar clientes de primeira vez em clientes de sempre."*, Instagram `@nexvytech`, WhatsApp (11) 95502-1205, e a identificação legal — NEXVY TECNOLOGIA E COMUNICAÇÃO LTDA · CNPJ 64.930.755/0001-78 · Av. Brig. Faria Lima, 1572 – Sala 1022 · Jardim Paulistano · São Paulo/SP.

## 4.4 EM QUANTO TEMPO

| Trecho | Padrão |
|---|---|
| Pagamento aprovado → pedido em `cakto_orders` | **< 1 min** (referência: 44 s) |
| Criação da organização → seeds completos → 1ª bolha da Lia | **< 2 s** (referência: 1,5 s) |
| Provisionamento inteiro | **síncrono dentro do webhook** — não há fila intermediária |

## 4.5 COMO SE PROVA

```sql
-- 1. O pedido chegou e está pago
select cakto_ref_id, status, amount, paid_at, created_at
from cakto_orders where cakto_ref_id = '<REF>';

-- 2. A empresa nasceu com plano ativo
select name, slug, plan_id, plan_status, plan_activated_at, enabled_modules, created_at
from organizations where cakto_customer_email = '<email>';

-- 3. Os seeds existem: 10 | 4 | 1
select (select count(*) from products                  where organization_id=$1 and tipo='servico') servicos,
       (select count(*) from salon_automation_rules    where organization_id=$1) automacoes,
       (select count(*) from opportunity_scan_schedules where organization_id=$1) radar;

-- 4. O link de implantação existe e ainda vale (expires_at ≈ criação + 72 h)
select mode, status, created_at, expires_at
from onboarding_submissions where organization_id=$1 and mode='link';

-- 5. A dona existe e é admin; o e-mail saiu
select p.email, p.full_name, r.role
from profiles p join user_roles r on r.user_id = p.id where p.organization_id=$1;

select status, template_name, created_at from email_send_log
where recipient_email='<email>' and template_name='welcome-admin-access' order by created_at;
```

**➡️ Próximo estado esperado:** a Lia assume a conversa e entrega o link (ELO 5).

---

# ELO 5 — HANDOFF PARA A LIA

**Objetivo do elo:** a compradora recebe o link **na mesma conversa** em que comprou — sem trocar de número, sem link genérico, sem repetição.

## 5.1 GATILHO

Última etapa do provisionamento, **só na 1ª ativação**. Renovação e reentrega de webhook não redisparam.

## 5.2 O QUE O SISTEMA FAZ

**Passo 1 — Acha a agente.** Em `platform_crm_product_agents`: tipo `support`, ativa, nome contendo "implanta". A agente canônica é **"Lia · Implantação"**, do produto `nexvybeauty`. Sem agente, o sistema alerta e **não improvisa**.

**Passo 2 — Acha a conversa da compradora.**
1. Por telefone (variantes brasileiras, com e sem `+`) em `visitor_whatsapp`/`visitor_phone`, canal `whatsapp`, no produto da agente, a mais recente;
2. Fallback por e-mail, via `platform_crm_leads` / `visitor_email`.

**Passo 3 — Passa o bastão.** Em `platform_crm_conversations`:
- `current_agent_id` → Lia
- `provisioned_organization_id` → a organização recém-criada

O `status` da conversa **não** é alterado — é a mesma thread, viva.

**Passo 4 — Cumprimenta.** **4 bolhas**, na ordem, pelo **mesmo número por onde a venda aconteceu** — a conexão é resolvida a partir da própria conversa, nunca "a conexão ativa mais recente". Se a conexão não for resolvível, as bolhas ficam registradas no CRM e a Nexvy é alertada, em vez de sair por um número errado.

## 5.3 As 4 bolhas — teor literal

> **1/4** — Oi *{PrimeiroNome}*! Que alegria te ver no NexvyBeauty 💚 Sou a Lia, vou te acompanhar na montagem do seu espaço.

> **2/4** — Esse é o link da montagem: `https://app.nexvybeauty.com.br/implantacao/<token>` — é o mesmo que te mandei no e-mail, pode abrir por onde preferir.

> **3/4** — Funciona assim: são 10 passos rapidinhos (seu espaço, horários, serviços, profissionais, sua EquipIA…) e tudo que você preenche salva sozinho — pode parar e voltar depois de onde parou, até em outro aparelho. Sua senha você cria no último passo.

> **4/4** — Duas dicas: o link abre em um navegador por vez (se aparecer "em uso", é só tocar em "Usar neste navegador"). E o último passo tem um QR code pra conectar o WhatsApp do espaço — abre o link no computador ou em outro celular, porque o QR precisa ser escaneado com o SEU 😉 Qualquer dúvida, me chama aqui!

*Sem nome da compradora, a saudação degrada para "Oi!". Se excepcionalmente não houver link a entregar, a Lia usa a versão de 2 bolhas — a primeira igual, e a segunda: "Te mandei no e-mail o link pra montar seu espaço. Quando abrir, me chama aqui que a gente faz junto, um passo por vez. Bora?"*

## 5.4 Idempotência — a regra que importa

Cada bolha é registrada em `platform_crm_messages` **antes** da entrega, com:

```json
{ "channel": "whatsapp_cloud", "proactive_greeting": "lia",
  "onboarding_org_id": "<uuid da organização>",
  "bubble_n": 1, "bubble_total": 4, "connection_id": "<uuid da conexão>" }
```

A guarda procura mensagem da conversa com remetente `bot` **E** `proactive_greeting='lia'` **E** `onboarding_org_id = <esta organização>`.

**Consequência desejada, e é o padrão:** a idempotência é **por provisionamento, não por conversa**. Uma cliente que compra de novo (nova organização) é cumprimentada de novo, na mesma conversa. Cumprimentos de outro provisionamento não silenciam o novo.

## 5.5 EM QUANTO TEMPO

| Trecho | Padrão |
|---|---|
| Organização criada → 1ª bolha entregue | **< 2 s** (referência: 1,5 s) |
| 1ª → 4ª bolha | **< 4 s** (referência: 2,85 s) — saem em rajada, ritmadas só pela latência de entrega |

## 5.6 COMO SE PROVA

```sql
select created_at,
       metadata->>'bubble_n' n, metadata->>'bubble_total' total,
       metadata->>'onboarding_org_id' org, left(content, 60) preview
from platform_crm_messages
where metadata->>'proactive_greeting' = 'lia'
  and metadata->>'onboarding_org_id' = '<org_id>'
order by created_at;

select current_agent_id, provisioned_organization_id
from platform_crm_conversations where id = '<conversation_id>';
```

Esperado: **exatamente 4 linhas**, `bubble_n` de 1 a 4, mesmo `onboarding_org_id`, dentro de poucos segundos; e a conversa apontando para a Lia e para a organização.

💬 No celular da dona: 4 mensagens seguidas da Lia, no mesmo fio da conversa de venda.

**➡️ Próximo estado esperado:** ela toca no link e o wizard abre no passo 1 (ELO 6).

---

# ELO 6 — WIZARD DE IMPLANTAÇÃO

**Objetivo do elo:** a dona monta o espaço dela em ~12 minutos, sem senha, sem suporte, podendo parar e voltar — e ao final o espaço está de fato montado no banco.

## 6.1 GATILHO

Abertura de `https://app.nexvybeauty.com.br/implantacao/<token>`.

**Portaria do link:**

| Situação | O que acontece |
|---|---|
| Token válido, 1º acesso | abre o wizard e emite uma sessão guardada no navegador |
| Token válido, sessão já aberta noutro navegador | *"Este link está aberto em outro navegador ou aba…"* + botão **"Usar neste navegador"**, que assume o controle e derruba a aba anterior (padrão WhatsApp Web) |
| Já aplicado | *"A implantação desta empresa já foi concluída. Para alterar dados, entre em contato com o suporte."* |
| Expirado (> 72 h) ou queimado | mensagem de link inválido |

Cada acesso incrementa o contador de acessos do link.

## 6.2 Os 10 passos

| # | Passo | O que é pedido | O que fica gravado |
|---|---|---|---|
| 1 | **Seu espaço** | Logo, nome do espaço, CNPJ (opcional), telefone, Instagram, link de agendamento (slug), cor principal (8 presets + seletor), endereço com CEP auto-preenchido | `empresa.{logo_url, nome_fantasia, cnpj, telefone, instagram, slug, cor_principal, endereco{cep,rua,numero,complemento,bairro,cidade,uf}}` |
| 2 | **Horários de Funcionamento** | Fuso horário + liga/desliga e início/fim por dia da semana | `horarios.{timezone, schedule{monday…sunday}}` |
| 3 | **Serviços** | Lista: nome, categoria, duração (min), preço | `servicos[]` |
| 4 | **Seus profissionais** | Lista: nome, especialidade | `profissionais[]` |
| 5 | **Sua EquipIA** | 3 presets ligáveis + agentes próprios: nome, tom de voz (Amigável / Formal / Consultivo / Técnico), "O que ela faz?" | `equipia.agentes[]` |
| 6 | **Seus usuários da Plataforma** | Lista: nome, e-mail, perfil (Administrador / Gestor / Atendente) — *"Se preferir, pule e convide depois"* | `usuarios[]` |
| 7 | **Resumo** | Card "Seu acesso de administradora" (e-mail mascarado) + 7 cartões de conferência + **aceite obrigatório** dos Termos e da Política | trava o botão até o aceite |
| 8 | **Conectar seu WhatsApp** | Declaração de dados → "Gerar QR Code" → leitura (ELO 7) | cria a instância; nada no payload |
| 9 | **Montando seu Espaço 💆🏻‍♀️💅🏻💄** | nada — tela de progresso real (ELO 8) | — |
| 10 | **Crie sua senha e entre** | Senha + confirmação (mínimo 10 caracteres) | define a senha e entra |

*(No fluxo já logado, dentro do app, são 9 passos — a criação de senha não existe porque ela já tem sessão.)*

**Os 3 presets da EquipIA** — é o que ela vê pronto para ligar:
**Recepcionista virtual** (tom Amigável) · **Assistente de reativação** (Amigável) · **Consultora de serviços** (Consultivo).

**Declaração de dados no passo 8 (teor literal):**
> "Declaro que tenho o consentimento das minhas clientes para o uso dos dados das nossas conversas de WhatsApp. Eu sou a Controladora desses dados; a Nexvy atua como Operadora, tratando-os exclusivamente para operar o meu atendimento (LGPD)."

**Aceite no passo 7:** Termos de Uso + Política de Privacidade, com a nota de que os dados dela são tratados pela Nexvy como Controladora — distinção deliberada em relação ao passo 8, onde os dados são das clientes dela.

## 6.3 Autosave e retomada — o comportamento que sustenta a promessa

| Comportamento | Padrão |
|---|---|
| Salvamento | **automático**, 800 ms depois da última digitação |
| Troca de passo | força o salvamento na hora e grava o passo atual |
| Reabertura | o wizard abre **exatamente no passo em que ela parou**, em qualquer aparelho |
| Ponto de partida | se o rascunho estiver vazio, o passo 1 já vem pré-preenchido com o que a organização sabe (nome, telefone, Instagram, logo, endereço, slug) |
| Um navegador por vez | garantido por sessão do link; "Usar neste navegador" transfere o controle |
| Resiliência de rede | cada gravação tem 3 tentativas automáticas em caso de falha de rede |
| Navegação livre | pelos passos 1 a 7, antes de aplicar; depois de aplicado, esses passos congelam |
| Adiar | há um "X" que adia a implantação, com limite de 3 adiamentos — **apenas no fluxo logado**. Pelo link público não existe adiar |

## 6.4 O que "Confirmar e montar meu espaço" faz de fato

Ao confirmar (fim do passo 7): salva → marca como enviado → aplica. A aplicação escreve nas tabelas reais, em 6 blocos:

| Bloco | Destino | Regra |
|---|---|---|
| **Empresa** | `organizations` | nome, CNPJ, telefone, Instagram, site, logo, endereço, cor principal; marca `onboarding_completed_at` e `onboarding_locked=true`. O slug é gravado à parte, com resolução de colisão |
| **Horários** | `business_hours` | fuso + grade semanal |
| **Serviços** | `products` (`tipo='servico'`, `status='published'`) | preço e duração em `settings`; **dedupe** por `(organização, nome minúsculo, tipo)` — o serviço digitado por ela **atualiza** o serviço-template semeado de mesmo nome, em vez de duplicar |
| **Profissionais** | `profissionais` | dedupe por nome minúsculo; entram ativos |
| **EquipIA** | `product_agents` | um agente por item, com o tom traduzido, tipo `custom`, ancorado ao 1º serviço da organização; idempotente por nome ativo (reaplicar só atualiza tom e papel) |
| **Usuários** | convites de equipe | cria os membros informados, com o perfil mapeado |

Cada bloco é isolado: um problema num deles vira aviso, **não derruba os outros**.

Ao final: `onboarding_submissions.status='applied'`, `applied_at`, e o **recibo** em `applied_refs`:

```json
{ "servicos": ["…"], "profissionais": ["…"], "agents": ["…","…","…"], "invitations": [] }
```

Grava ainda auditoria (`platform_audit_logs`, ação `onboarding_applied`) e a notificação interna **"Implantação concluída"**. A dona vê o aviso "Implantação concluída".

**A trava de conclusão:** `organizations.onboarding_locked = true` + `onboarding_completed_at` é o que marca o espaço como montado — é isso que libera a plataforma. Quem volta ao wizard já logado vê a tela terminal:
> **"Seu espaço já está montado"** — *"Essas configurações já estão ativas. Você pode ajustar tudo quando quiser nas configurações do seu espaço."* + botão "Ir para o início".

## 6.5 A criação da senha (passo 10)

Tela **"Falta só criar sua senha"**, com o e-mail da compra mascarado, dois campos (mínimo 10 caracteres), botão **"Criar senha e entrar"** e o rodapé:
> "Só você tem essa senha — nem a gente consegue vê-la. Guarde num lugar seguro."

O que acontece ao confirmar, na ordem:
1. valida o token e a sessão do link;
2. define a senha no usuário e confirma o e-mail;
3. **queima o token** — o link não serve mais para ninguém;
4. encerra qualquer sessão anterior naquele navegador;
5. faz login com o e-mail da compra;
6. leva para **`/`** — a Home, já dentro do espaço dela.

Se o login automático falhar, a mensagem é honesta e recuperável: *"Senha criada! / Entre com o e-mail da sua compra e a senha que você acabou de criar."* → tela de login.

## 6.6 EM QUANTO TEMPO

| Trecho | Padrão |
|---|---|
| Link aberto → wizard enviado | **~12 min** de preenchimento (referência: 11 min 55 s) |
| Enviado → aplicado no banco | **< 3 s** (referência: 2,4 s) |
| Validade do link | **72 h** desde a criação |

## 6.7 COMO SE PROVA

```sql
select mode, status, created_at, submitted_at, applied_at, expires_at, applied_refs
from onboarding_submissions where organization_id = '<org_id>' and mode='link';

select name, slug, onboarding_completed_at, onboarding_locked from organizations where id='<org_id>';
select count(*) from business_hours  where organization_id='<org_id>';  -- 1
select count(*) from product_agents  where organization_id='<org_id>';  -- ≥1 (3 com os presets)
select count(*) from profissionais   where organization_id='<org_id>';  -- = nº informado
```

Esperado: `status='applied'` com `applied_at`; `onboarding_locked=true`; `applied_refs` com os ids do que nasceu.
No caso de referência: **3 agentes**, **1 serviço novo**, **1 profissional**.

**➡️ Próximo estado esperado:** o QR aparece e o WhatsApp é pareado (ELO 7).

---

# ELO 7 — CONEXÃO DO WHATSAPP

**Objetivo do elo:** parear o WhatsApp do salão em menos de meio minuto, já inscrito nos eventos e já pedindo o histórico completo.

## 7.1 GATILHO

Passo 8 do wizard: aceite da declaração → botão **"Gerar QR Code"**.
(Fora do onboarding, o mesmo fluxo vive em **Conexões**, no app.)

## 7.2 O que a tela mostra antes do QR

Cabeçalho **"Conectar seu WhatsApp"** — *"É rápido e você só precisa do seu celular em mãos."* — e o porquê, dito sem jargão:
> "Conectar o WhatsApp é o coração do seu espaço: **é assim que suas conversas viram sua carteira de clientes** — tudo organizado, sem você digitar nada."

Seguido do passo a passo numerado: abrir o WhatsApp → Aparelhos conectados → **Toque em Conectar aparelho** → **Aponte a câmera para o código abaixo**.

Há também **"Conectar depois"**, com confirmação — e a mensagem deixa claro o custo: sem WhatsApp conectado, não há carteira.

## 7.3 O QUE O SISTEMA FAZ

**Passo 1 — Cria a instância.**

| Item | Regra |
|---|---|
| Nome | `<slug-da-organização>-<nome-informado>`, minúsculo, só `[a-z0-9-]`, cortado em 50 caracteres. *Referência: `meuteste1-sal-o1`* |
| Unicidade | rejeita se já existir instância com esse nome |
| Limite | respeita `max_connections` do plano (padrão 1) |
| Parâmetros enviados | integração Baileys, token próprio da instância, **`syncFullHistory: true`** |
| Registro | `evolution_instances`: `name`, `instance_id`, `instance_token`, `status='disconnected'`, `is_default` (verdadeiro na primeira), `metadata{instance_uuid, display_name, created_via}` |

`created_via` distingue a origem: `onboarding_wizard`, `self_service` (Conexões, pela própria dona) ou `super_admin`.

**Passo 2 — Inscreve os eventos.** A instância assina exatamente estes **9** eventos:

```
MESSAGES_SET · MESSAGES_UPSERT · MESSAGES_UPDATE · MESSAGES_DELETE
CHATS_SET · CONTACTS_SET
CONNECTION_UPDATE · QRCODE_UPDATED · SEND_MESSAGE
```

Sucesso → `webhook_subscribed = true` e registro da tentativa em `metadata`.

**Passo 3 — Pede o QR.**
- Se a instância **já** estiver conectada, o sistema reconhece e **não força logout** — devolve "já conectado" e segue.
- Senão, limpa o QR antigo (`status='qr_pending'`), pede o novo e, se não vier de imediato, tenta mais **4 vezes a cada 1,5 s** (~6 s de janela).
- O código é normalizado antes de exibir, para que o QR lido seja o payload de pareamento correto.

**Passo 4 — A tela acompanha.** Polling a cada **3 segundos**. No wizard sem sessão, a consulta passa pela função pública de onboarding; logada, lê a tabela direto. A lista de Conexões usa 3 s enquanto algo estiver por conectar e 30 s depois de estabilizado.

**Passo 5 — Conectou.** Ao chegar `CONNECTION_UPDATE` com estado aberto:

| Campo | Valor |
|---|---|
| `status` | `connected` |
| `last_connected_at` | agora |
| `qr_code` | `null` |
| `phone_number` | o número real, só dígitos |

E o front grava `profiles.default_connection_id` — daí em diante é essa a conexão padrão da dona.

**Renovação do QR:** quem empurra QR novo é o servidor de WhatsApp (`QRCODE_UPDATED`); o sistema registra e a tela troca a imagem sozinha.

## 7.4 EM QUANTO TEMPO

| Trecho | Padrão |
|---|---|
| Clicar "Gerar QR Code" → QR na tela | **< 6 s** (referência: 4,9 s) |
| QR na tela → conectado | **~15 s** (referência: 16 s) |
| Total do passo | **< 30 s** (referência: 21 s) |

## 7.5 COMO SE PROVA

```sql
select name, status, phone_number, webhook_subscribed, is_default,
       created_at, qr_code_updated_at, last_connected_at,
       metadata->>'created_via' via
from evolution_instances where organization_id = '<org_id>';
```

Esperado: `status='connected'`, `webhook_subscribed=true`, `phone_number` preenchido, `last_connected_at` poucos segundos após `qr_code_updated_at`.

🖥️ Na tela: o QR some e o wizard avança sozinho para "Montando seu Espaço".

**➡️ Próximo estado esperado:** o histórico começa a entrar (ELO 8).

---

# ELO 8 — INGESTÃO DO HISTÓRICO

**Objetivo do elo:** a dona sai do wizard com a carteira de clientes dela já dentro do sistema — sem digitar nada, sem importar planilha.

## 8.1 GATILHO

O pareamento com `syncFullHistory: true` faz o WhatsApp despejar o histórico do aparelho, e o servidor emite os eventos de histórico.

## 8.2 O QUE O SISTEMA FAZ

**Passo 1 — Separa o histórico do tempo real.** Antes de qualquer processamento, os eventos de histórico são interceptados e encaminhados **crus e inteiros**, servidor-a-servidor, para o sincronizador. O webhook responde imediatamente — **a ingestão nunca segura a linha do tempo real**.

Eventos tratados como histórico:
```
messages.set / MESSAGES_SET · chats.set / CHATS_SET · contacts.set / CONTACTS_SET
messaging-history.set · contacts.upsert · contacts.update · chats.upsert
```

**Passo 2 — Extrai contatos.** De cada tipo de evento saem três coisas: **telefone**, **nome** e **data da última interação**.

| Evento | Telefone | Nome | Última interação |
|---|---|---|---|
| `MESSAGES_SET` | `key.remoteJid` | `pushName` — **só de mensagens recebidas** | `messageTimestamp` — **só de recebidas** |
| `CHATS_SET` | `id`/`remoteJid`/`jid` | `name`/`pushName` | `conversationTimestamp` |
| `CONTACTS_SET` | do contato | `name`/`pushName`/`notify`/`verifiedName` | — |

*Por que só de recebidas: `pushName` de mensagem enviada é o nome da própria dona, e a data de envio dela não é sinal de atividade da cliente.*

**O que é descartado, por regra:** grupos (`@g.us`), listas de transmissão, newsletters, entradas sem telefone resolvível, e **o próprio número da instância**. Os descartes são contabilizados no log (por LID, por grupo, por vazio).

**O que é conciliado:** telefone normalizado ao formato canônico brasileiro (`55 + DDD + 9 dígitos`); o mesmo contato visto em vários eventos vira **uma entrada só** — fica o nome mais completo e a data mais recente.

**Passo 3 — Grava em lotes.** Blocos de **500 contatos**, sequenciais. Cada lote é serializado por trava por organização — duas rajadas simultâneas não se atropelam.

**Passo 4 — A regra de escrita na carteira (`clientes`):**

| Situação | Comportamento |
|---|---|
| Contato já existe (mesma organização, mesmo telefone normalizado) | **atualiza** |
| Nome já curado pela dona | **nunca é sobrescrito** — só substitui nome vazio, nulo, ou que "pareça um telefone" |
| Data de última interação | fica sempre a **maior** entre a existente e a nova |
| Contato novo | insere com `status='ativo'`, `tags=['whatsapp']`, nome = o nome ou o próprio telefone |

## 8.3 O que a dona vê enquanto isso — "Montando seu Espaço"

A tela mostra progresso **real**: conta os clientes da organização a cada **4 segundos** e mostra o número subindo. A barra é assintótica — chega a 92% e só vai a 100% quando termina de verdade.

Frases que giram a cada 4 s:
> "Estamos preparando tudo pro seu negócio alcançar o próximo nível ✨"
> "Hora do seu espaço decolar 🚀"
> "Preparando o melhor atendimento pras suas clientes 💖"
> "Organizando suas conversas e sua carteira de clientes 📇"

**Critérios de conclusão:** contagem **estável por 15 s** depois de já ter passado de zero **OU** teto de **3 minutos** **OU** ela ter pulado o QR (aí conclui em 4 s, com mensagem própria).

**A tela de sucesso:**
> **"Seu espaço está pronto! 🎉"**
> *"**84.194 clientes já importadas** pra sua carteira — e as próximas conversas entram sozinhas."*
> botão: **"Começar um novo tempo no meu negócio"**

Se ela pulou o QR: *"Tudo montado! Você pode conectar seu WhatsApp depois, em **Conexões** — é ele que traz suas conversas e sua carteira de clientes pra cá."*

## 8.4 EM QUANTO TEMPO — a régua de volume

Medição real, base de **84.194 contatos**:

| Marco | Tempo |
|---|---|
| Conectado → 1º cliente gravado | **12 s** |
| Ingestão completa | **2 min 27 s** |
| Vazão média | **~570 contatos/segundo** |
| Pico (minuto mais cheio) | **43.716 contatos/min** |

**Régua derivada:** uma base de dezenas de milhares de contatos deve estar dentro em **menos de 3 minutos** — dentro do teto da tela. Bases pequenas terminam em segundos.

## 8.5 COMO SE PROVA

**Prova 1 — volume e velocidade** (que o motor deu conta):

```sql
select count(*)                          total,
       count(ultima_interacao_wa)        com_data,
       min(ultima_interacao_wa)          historico_desde,
       min(created_at)                   inicio_ingestao,
       max(created_at)                   fim_ingestao
from clientes where organization_id = '<org_id>';

-- vazão por minuto
select date_trunc('minute', created_at) minuto, count(*)
from clientes where organization_id='<org_id>' group by 1 order by 1;
```

**Prova 2 — qualidade. É esta que decide.** Volume alto com conteúdo vazio não é carteira, é ruído. Uma carteira no padrão precisa passar nos três testes abaixo:

```sql
select
 count(*)                                                              total,
 count(*) filter (where nome !~ '^[0-9()+\s-]+$')                      com_nome_real,
 count(*) filter (where telefone_normalizado ~ '^55[1-9][0-9]{9,10}$') discavel_br,
 count(*) filter (where length(telefone_normalizado) > 13)             suspeitos_de_lid
from clientes where organization_id = '<org_id>';
```

| Métrica | Régua de excelência | Por quê |
|---|---|---|
| **`com_nome_real`** | a maior parte da base | contato sem nome não sustenta reativação — a mensagem sai impessoal |
| **`discavel_br`** | a maior parte da base | telefone que não disca não é cliente alcançável |
| **`suspeitos_de_lid`** | **zero** | telefone brasileiro canônico tem 12 ou 13 dígitos. Acima disso é identificador interno do WhatsApp entrando no lugar do número |

**A regra que fecha o elo:** o número anunciado à dona na tela de sucesso (*"N clientes já importadas"*) só é honesto se **N contar contatos alcançáveis**. Anunciar o total bruto quando a maior parte não tem nome nem telefone discável é prometer um ativo que não existe.

🖥️ A dona vê o contador subir e termina lendo o número de clientes importadas — e, ao abrir a carteira, encontra **nomes**, não números.

**➡️ Próximo estado esperado:** ela clica em "Começar um novo tempo no meu negócio", cria a senha, e o primeiro dia começa (ELO 9).

---

# ELO 9 — O PRIMEIRO DIA DA DONA

**Objetivo do elo:** ela entra e o sistema **já está povoado**. Nada de tela vazia, nada de "comece cadastrando".

## 9.1 GATILHO

Primeiro login, logo após criar a senha — o sistema leva direto para a Home.

## 9.2 O que ela encontra pronto

| Área | O que já está lá | Veio de |
|---|---|---|
| **Carteira de clientes** | todos os contatos do WhatsApp dela, com nome e data da última conversa | ELO 8 |
| **Catálogo de serviços** | os 10 serviços de salão + os que ela digitou (fundidos por nome, sem duplicar) | seeds (ELO 4) + wizard (ELO 6) |
| **Horário de funcionamento** | a grade que ela definiu, no fuso dela | wizard |
| **Profissionais** | os que ela cadastrou | wizard |
| **EquipIA** | os agentes ligados (os 3 presets ou os dela) | wizard |
| **Automações** | 4 réguas **já ligadas**: aniversário, pacote vencendo, lembrete 24 h, retorno de inativo (45 dias) | seeds |
| **Radar de oportunidades** | agenda diária às 08:00 já criada | seeds |
| **WhatsApp** | conectado, recebendo e enviando | ELO 7 |
| **Identidade** | logo, cor principal, nome, endereço, Instagram, link público de agendamento | wizard |
| **Plano** | ativo, com `erp_salao`, `crm_vendas` e `atendimento` liberados | provisionamento |

## 9.3 Onde ela navega — o menu, na linguagem dela

O menu é agrupado pela **rotina**, não pela arquitetura. Os nomes são deliberadamente de dona de salão, não de software.

| Grupo | Itens |
|---|---|
| **(sem título — sempre aberto, o uso diário)** | Início · **Minha Agenda** · **Meus Clientes** · **Conversas** |
| **Crescer** | Oportunidades · Mensagens automáticas · Meta do Mês · Minha IA |
| **Meu Catálogo** | Serviços · Pacotes · Produtos de revenda |
| **Meus Números** | Relatórios do negócio · Relatórios de atendimento · Financeiro |
| **Vendas** | Painel de vendas · Atrair Clientes · Funil · Contatos · Tarefas |
| **Configurações** *(só admin)* | Empresa · Plano · Horários · **Conexões (WhatsApp)** · Minha equipe · Departamentos · Suporte |
| **Config. avançada** *(só admin)* | Radar de conversas · Webhooks · Campos personalizados · Etiquetas · Respostas rápidas · Notificações |

Os grupos são recolhíveis e o estado fica salvo no navegador dela.

A vitrine pública fica em **`/s/<slug>`** (agendamento) e **`/s/<slug>/pacotes`**.

## 9.4 COMO SE PROVA

```sql
select
 (select count(*) from clientes                   where organization_id=$1) clientes,
 (select count(*) from products                   where organization_id=$1 and tipo='servico') servicos,
 (select count(*) from profissionais              where organization_id=$1) profissionais,
 (select count(*) from product_agents             where organization_id=$1 and is_active) agentes_ia,
 (select count(*) from salon_automation_rules     where organization_id=$1 and enabled) automacoes_ligadas,
 (select count(*) from business_hours             where organization_id=$1) horarios,
 (select count(*) from opportunity_scan_schedules where organization_id=$1 and is_active) radar,
 (select count(*) from evolution_instances        where organization_id=$1 and status='connected') whatsapp;
```

**Nenhum desses números pode ser zero no primeiro login.** É esse o parâmetro: a dona nunca vê uma tela vazia.

**➡️ Próximo estado esperado:** a operação diária começa (ELO 10).

---

# ELO 10 — A OPERAÇÃO DIÁRIA

**Objetivo do elo:** o salão funciona sozinho no que é repetitivo, e chama a dona só no que exige gente.

## 10.1 Atendimento com IA — o caminho de uma mensagem

**GATILHO:** uma cliente manda mensagem no WhatsApp do salão.

**O QUE O SISTEMA FAZ, na ordem:**

1. **Recebe e registra** — a mensagem entra em `webchat_messages` (`sender_type='visitor'`, `direction='inbound'`), com deduplicação pelo id da mensagem do WhatsApp. Conversa fechada é **reaberta**, nunca duplicada. Grupos e listas de transmissão são ignorados.
2. **Espera ela terminar de falar** — este é o comportamento que separa um atendimento bom de um robô. O sistema **agrupa** as mensagens picotadas em vez de responder cada uma:

   | Ajuste (em `organizations`) | Padrão | O que faz |
   |---|---|---|
   | `ai_grouping_enabled` | ligado | agrupa mensagens seguidas da mesma pessoa |
   | `ai_grouping_window_ms` | **3.000 ms** | espera após a última mensagem antes de responder |
   | `ai_grouping_max_ms` | **8.000 ms** | teto absoluto da espera |
   | `ai_debounce_ms` | — | equivalente legado da janela |
   | `ai_single_processing_per_conversation` | trava por conversa (30 s) | impede duas respostas concorrentes |
   | `ai_dedup_window_ms` | **120.000 ms** (teto 600.000) | impede repetir resposta idêntica |
   | `presence_enabled` | ligado | mostra "digitando…" de verdade |

   Se uma nova mensagem chega durante a espera, a resposta é **adiada e refeita** com o texto completo. Antes de chamar a IA, tudo que a cliente disse desde a última fala do salão é consolidado num único texto.

3. **Escolhe quem responde**, nesta precedência: agente travado na instância → orquestrador da organização (quando a conversa ainda está em triagem) → agente atual da conversa → agente padrão do produto → qualquer agente ativo.

4. **Responde como gente** — no máximo **4 bolhas**, com pausa entre elas de 800 ms a 4 s, atraso inicial limitado a 15 s, "digitando…" real, e sem repetir resposta idêntica. Cada bolha vira uma linha em `webchat_messages`.

**Quando a IA NÃO responde — e isso é regra, não falha:**

| Estado da conversa | Comportamento |
|---|---|
| `bot_active` | a IA responde |
| `human_active` | **a IA cala**. É o que acontece assim que a dona responde pelo próprio celular, ou quando alguém assume a conversa pelo inbox |
| `waiting_human` | **a IA cala**. É o que acontece quando a própria IA usa a transferência para humano — ela zera o agente e marca a conversa como precisando de gente |

**Mensagem enviada pela dona no celular dela** volta pelo webhook e aparece no inbox como mensagem do salão, com dupla proteção contra eco duplicado (pelo id externo e por conteúdo idêntico nos últimos 60 s).

**✅ Como se prova:**
```sql
select status, current_agent_id, needs_human, assigned_user_id, last_message_at
from webchat_conversations where organization_id=$1 order by last_message_at desc limit 10;

select direction, sender_type, left(content,60), created_at
from webchat_messages where conversation_id='<id>' order by created_at;
```
🖥️ No inbox: a cliente escreve 3 mensagens picotadas e recebe **uma** resposta coerente, não três.

## 10.2 Agendamento — as três portas

| Porta | Como nasce | O que grava |
|---|---|---|
| **(a) Link público** `/s/<slug>` | a cliente escolhe serviço, profissional, dia e hora | linha em `agendamentos` com `origem='publico'`, cliente criado/atualizado por telefone, `status='agendado'`, valor puxado do preço do serviço, e os `utm_*` da origem |
| **(b) Pela IA** | a EquipIA consulta a disponibilidade e agenda | **usa exatamente o mesmo caminho da porta (a)** — não existe rota paralela, então as mesmas travas valem |
| **(c) Manual** | a dona lança na Agenda | mesma tabela, com cliente, profissional, serviço, data, hora, valor, duração, forma de pagamento e observações |

**Trava anti-choque de horário:** antes de gravar, o sistema re-checa sobreposição contra os agendamentos em `agendado`, `confirmado` ou `chegou`, e há **índice único no banco** como segunda linha de defesa — colisão devolve conflito, nunca duplica.

**Regras duras da IA ao agendar** (é isso que impede o atendimento de mentir):
- nunca inventar horário — só oferecer o que a consulta de disponibilidade devolveu;
- nunca agendar sem telefone real;
- **nunca dizer "agendado" antes de o agendamento existir de fato**.

**O que a cliente recebe na hora:**
> "Olá {nome}! Seu agendamento de {serviço} foi confirmado para {DD/MM/AAAA} às {HH:MM}. Até lá! 💅"

E a dona recebe notificação no app: **"Novo agendamento — {nome}"**, com link direto para a Agenda.

## 10.3 As 4 automações — a régua que roda sozinha

**GATILHO:** um único motor diário, **08:00 (horário de Brasília)**, sobre as regras ligadas da organização.

| Automação | Dispara quando | Antecedência | Texto padrão |
|---|---|---|---|
| **Aniversário** | é o dia e mês de nascimento da cliente | 0 dias | *"Oi {nome}! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho seu aqui no nosso espaço. Vem buscar? 🎂"* |
| **Pacote vencendo** | pacote ativo com validade dentro dos próximos 3 dias | 3 dias | *"Oi {nome}! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? Posso já deixar separado 😉"* |
| **Lembrete 24 h** | há agendamento não cancelado para amanhã | 1 dia | *"Oi {nome}! Passando pra confirmar seu horário de amanhã 💕 Posso te esperar? Qualquer coisa, me avisa."* |
| **Retorno de inativo** | o último atendimento concluído foi exatamente há 45 dias | 45 dias | *"Oi {nome}! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana? Tenho um mimo te esperando 🎁"* |

A dona pode trocar qualquer texto — o dela substitui o padrão, e `{nome}` vira o primeiro nome da cliente.

**Garantias do motor:**
- **Idempotência**: uma mesma referência já enviada não é reenviada — cada decisão fica registrada em `salon_automation_log`.
- **Prudência**: telefone ausente ou ambíguo → registra como pulado, **não envia**.
- **Ritmo**: 1,5 s entre envios, para não parecer disparo em massa.
- **Prévia**: qualquer chamada que não venha do agendador é forçada a modo de simulação — a tela de prévia mostra o que sairia sem enviar nada.

**A carona inteligente:** quando uma dessas mensagens já vai sair, o sistema **anexa uma única pergunta de coleta** do dado que falta na ficha da cliente, nesta ordem de prioridade: **data de nascimento → endereço → e-mail**. A pergunta fica marcada como feita e o consentimento é registrado. É assim que a ficha da cliente se completa sozinha, sem campanha dedicada.

## 10.4 Radar de oportunidades

**GATILHO:** a agenda "Radar Automático", diária às 08:00, criada no provisionamento.

**O que ele varre:** conversas da organização que **não estão fechadas** e, por padrão, **sem agente de IA ativo** — ou seja, exatamente as que caíram no vão. Janela padrão: inatividade de 0 a 30 dias, até 500 conversas por varredura. Dá para filtrar por produto, responsável, agente, setor, canal, etiqueta, temperatura, valor e time.

**O que ele produz:** cada conversa é classificada em **`hot`**, **`warm`**, **`cold`** ou **`lost`**, com pontuação, motivo, sinais detectados, ação sugerida e uma **mensagem de follow-up já escrita**. Conversa em que a cliente nunca respondeu cai direto em `cold`, com o sinal `sem_resposta_cliente`.

**O que ele faz sozinho, conforme a classificação:** aplica etiqueta · cria tarefa intitulada **"🎯 Radar IA — HOT/WARM/…"** com vencimento (padrão 24 h) · transfere o responsável · notifica o dono.

O agregado da varredura (contagens, receita potencial, custo) fica em `opportunity_scans`, e cada item em `opportunity_scan_items` — com `action_applied` marcando o que já foi executado.

**Como a dona age:** ela abre **Oportunidades**, lê a lista ordenada por temperatura, e a mensagem de retomada já está pronta para enviar.

## 10.5 Relatórios

| Relatório | Quando | O que traz |
|---|---|---|
| **Briefing do dia** (`☀️ Seu briefing do dia`) | de manhã, para organizações com o envio ligado, uma vez por dia por pessoa | tarefas de hoje, tarefas atrasadas, leads parados, leads quentes, progresso da meta, cadências pendentes e negócios recentes — em seções `📊 RESUMO DO DIA`, `🎯 PRIORIDADES`, `🔥 LEADS QUENTES`. Entregue como notificação no app (e por e-mail, se ligado) |
| **Resumo diário por WhatsApp** | na hora configurada pela organização | leads criados ontem (com pontuação), negócios ganhos ontem, conversas em aberto, agendamentos de ontem |
| **Relatório semanal por WhatsApp** | no dia da semana e hora configurados | consolidação da semana |
| **Auditor de cadastro** | varredura da carteira | anota o que falta na ficha de cada cliente (nascimento, endereço, e-mail), marca como inalcançável quem não tem telefone válido — e alimenta a carona das automações (§10.3) |

Todos degradam com elegância: sem chave de IA disponível, o relatório sai em formato determinístico — **nunca sai vazio nem quebra**.

## 10.6 Alertas em tempo real para a dona

Verificação a cada 5 minutos, para organizações com alertas ligados:

| Alerta | Regra |
|---|---|
| **Lead de alto valor** | negócio acima do limiar configurado nos últimos 10 min |
| **Chat sem atendimento** | conversa parada além dos minutos configurados |
| **Vendedor offline** | ausência além do limite |
| **Erros de agente** | acima do limiar |
| **Mudança de reunião** · **Meta atingida** | conforme configurado |

Cada tipo tem deduplicação própria (ex.: lead de alto valor só alerta uma vez por semana), para que o alerta continue significando alguma coisa.

## 10.7 COMO SE PROVA (o dia no padrão)

```sql
-- As automações rodaram e enviaram
select tipo, status, count(*) from salon_automation_log
where organization_id=$1 and created_at::date = current_date group by 1,2;

-- O radar rodou e classificou
select s.created_at, s.total_conversations, i.classification, count(*)
from opportunity_scans s join opportunity_scan_items i on i.scan_id = s.id
where s.organization_id=$1 group by 1,2,3 order by 1 desc;

-- Os agendamentos de hoje, por origem
select origem, status, count(*) from agendamentos
where organization_id=$1 and data = current_date group by 1,2;

-- A IA está atendendo (e cala quando é humano)
select status, count(*) from webchat_conversations where organization_id=$1 group by 1;
```

**➡️ Próximo estado esperado:** o ciclo de vida da assinatura entra em cena (ELO 11).

---

# ELO 11 — RETENÇÃO E CICLO DE VIDA

**Objetivo do elo:** a assinante é acompanhada antes de a fatura chegar, e nenhuma mudança de status financeiro passa em silêncio.

## 11.1 Renovação

**GATILHO:** a Cakto envia um novo pagamento aprovado da mesma assinatura.

**O QUE O SISTEMA FAZ:** exatamente o mesmo provisionamento do ELO 4 — que é **idempotente e reafirma o estado**:

| Campo | Efeito da renovação |
|---|---|
| `plan_id` · `enabled_modules` | reafirmados |
| `plan_status` | `active` |
| **`plan_activated_at`** | **avança para agora** — é esta a âncora do ciclo |
| `billing_history` | nova linha, idempotente pelo id do pedido |

**O que NÃO acontece na renovação, por regra:** não nascem seeds, não nasce link de implantação novo, e a Lia **não** cumprimenta de novo. Tudo isso é gated à primeira ativação.

**✅ Prova:** `organizations.plan_activated_at` avançou e há uma nova linha em `billing_history` com o `cakto_id` do novo pedido.

## 11.2 Nina — o toque de D-7

**GATILHO:** um relógio diário. A Nina calcula a posição da organização dentro do ciclo de cobrança — `dias desde plan_activated_at` módulo o ciclo (padrão **30 dias**) — e aborda quem está a **7 dias** do fim do ciclo.

**Quem entra na varredura:** organizações com `plan_status='active'` e `plan_activated_at` preenchido.

**Como ela acha a conversa:** primeiro pelo vínculo criado no handoff pós-compra (`platform_crm_conversations.provisioned_organization_id`) — o mesmo fio de sempre. Só se não houver, cai para o e-mail da compra → lead → conversa de WhatsApp.

**A guarda que protege a experiência:** a Nina só assume a conversa se existir uma agente ativa e habilitada no WhatsApp com o nome dela. Sem essa agente, ela **não age** — porque deixar a conversa apontando para o vazio jogaria a cliente de volta na agente de vendas, em modo de venda, no pior momento possível.

**O que ela manda — uma bolha, uma pergunta, zero venda:**
> "Oi {nome}! Aqui é a Nina, do NexvyBeauty 💚 Passei pra saber como tá indo seu espaço — tá conseguindo aproveitar o sistema no dia a dia?"

**Idempotência:** no máximo **uma abordagem por ciclo** — a guarda procura mensagem anterior marcada como abordagem proativa da Nina dentro da janela do ciclo.

Quando a cliente responde, quem conduz a conversa é o cérebro em **modo retenção** — não em modo venda.

**✅ Prova:**
```sql
select created_at, left(content,60), metadata->>'signal' sinal
from platform_crm_messages
where metadata->>'proactive_outreach' = 'nina'
order by created_at desc;
```
Esperado: no máximo uma linha por organização por ciclo, com `signal = 'renewal_d_minus_lead'`.

## 11.3 Reembolso, chargeback e cancelamento

**GATILHO:** a Cakto informa `refunded`, `chargeback` ou cancelamento de assinatura.

**O QUE O SISTEMA FAZ:**
1. acha a organização pelo e-mail da compra;
2. se ela ainda não estiver suspensa, marca `organizations.plan_status = 'suspended'` (operação idempotente);
3. 📋 dispara o alerta **"⚠️ Cakto: acesso SUSPENSO por …"** no Telegram da Nexvy.

**O que a dona vê ao entrar:** a tela de conta suspensa, com a mensagem que importa —
> *"Sua assinatura está suspensa… seus dados estão seguros"*
— o WhatsApp de suporte (11) 95502-1205 e o botão de sair.

**Princípio de acesso, deliberado:** o bloqueio é **fail-open** — apenas o valor literal `suspended` bloqueia. Estados `active`, `demo`, `trial` ou ausência de valor passam. Uma leitura ambígua **nunca** tranca uma cliente adimplente fora do próprio sistema. O super_admin nunca é bloqueado.

**Os dados não são apagados na suspensão.** Suspensão corta o acesso, não a carteira.

## 11.4 Recuperação de venda — dos clientes do salão

Este mecanismo é do **tenant**: ele recupera as vendas do salão, não a assinatura da dona com a Nexvy.

| Evento de pagamento no salão | Ação |
|---|---|
| pendente / aguardando pagamento | trata como **abandonado** |
| pago / aprovado | trata como **pago** |
| reembolsado / chargeback | trata como **reembolsado** |

**Como funciona:** exige que a organização tenha a recuperação ligada, com um agente designado, e com o gatilho daquele evento habilitado. É **um disparo por evento**, com **janela de silêncio** configurável que impede repetir o mesmo evento para o mesmo cliente. Toda decisão — inclusive as de não enviar (`recovery_disabled`, `no_phone`, `cooldown`) — fica registrada em `cakto_recovery_dispatches`.

**A mensagem é escrita pela IA**, dentro do briefing de cada situação:
- **abandonado** — tirar dúvidas, urgência leve, reenviar o link ou o Pix;
- **pago** — agradecer, confirmar, dar os próximos passos e, se couber, ofertar o complemento;
- **reembolsado** — empatia, entender o motivo, propor alternativa.

A conversa criada fica com a IA ativa, para que ela continue o atendimento.

## 11.5 A demonstração e seu fim

| Marco | Padrão |
|---|---|
| **Duração** | **72 horas** a partir da criação |
| **Estado inicial** | `plan_status='demo'`, `demo_expires_at = agora + 72 h`, sem módulos liberados |
| **Anti-abuso** | campo-isca invisível + limites duráveis: 1 por minuto por telefone, 10 por hora por IP, teto global de 200 por hora |
| **Aviso** | **24 h antes** de expirar, uma vez só, por WhatsApp |
| **Faxina** | de hora em hora, o zelador recolhe as demonstrações vencidas |

**A mensagem de aviso (teor literal):**
> "Sua demonstração do NexvyBeauty expira amanhã — depois disso seus dados são apagados automaticamente. Se quiser manter a análise, é só assinar um plano. 💜"

**O que a faxina apaga, e o que ela preserva** — a distinção é intencional:

| Apagado | Preservado |
|---|---|
| a instância de WhatsApp da demonstração (com verificação de que sumiu de fato) | `lgpd_consents` — a prova de consentimento |
| os arquivos dela no armazenamento (mídias, uploads, logos, avatares) | `sales_leads` — ela continua sendo uma lead nossa |
| os dados operacionais da organização | `platform_crm_*` — a conversa de venda **continua viva** |
| a própria organização | `platform_audit_logs` — a trilha do que aconteceu |

Ao final, fica um registro de auditoria `demo_org_wiped`. Reexecutar a faxina não faz nada — a organização já não existe.

**Se ela comprar antes de expirar:** o provisionamento **promove a demonstração no lugar** (casando por e-mail ou telefone), zera a expiração e libera os módulos. **Ela não perde nada do que montou.**

## 11.6 COMO SE PROVA (o ciclo no padrão)

```sql
-- Estado do parque
select plan_status, count(*) from organizations group by 1;

-- Renovações registradas
select organization_id, amount, payment_date, metadata->>'cakto_id' pedido
from billing_history order by payment_date desc limit 20;

-- Demonstrações vivas e seu prazo
select name, demo_expires_at, demo_warned_at from organizations
where plan_status='demo' order by demo_expires_at;

-- Recuperação: o que foi enviado e o que foi pulado, e por quê
select event, status, reason, created_at from cakto_recovery_dispatches
where organization_id=$1 order by created_at desc;
```

**➡️ Próximo estado esperado:** a Nexvy acompanha tudo isso do painel da plataforma (ELO 12).

---

# ELO 12 — A OPERAÇÃO DA PLATAFORMA (NÓS)

**Objetivo do elo:** ninguém na Nexvy precisa consultar o banco para saber como o negócio está — e nenhum problema com dinheiro envolvido fica invisível.

## 12.1 Onde fica o painel

O painel da plataforma vive em **`/super-admin`** e, quando o acesso vem pelo domínio de gestão (`gestao.nexvybeauty.com.br`), já é a raiz. Ele tem **dois módulos**.

## 12.2 Módulo **Gestão** — o ERP da plataforma

| Grupo | Tela | O que mostra / permite |
|---|---|---|
| **Topo** | **Dashboard da Plataforma** | MRR Total · ARR Total · Volume de Deals · Leads na Plataforma · Empresas · Usuários |
| | **Empresas** | lista e gestão de todas as organizações; ao abrir uma, o detalhe traz plano, status e assinatura |
| | **Usuários** | gestão de usuários |
| **Comercial (SaaS)** | **Planos** | criação e edição dos planos vendidos |
| | **Assinaturas** | assinaturas ativas |
| | **Faturamento** | faturamento da plataforma |
| | **Pagamentos (Cakto)** | abas **Configuração** · **Recebimentos** · **Vínculo de planos** — é aqui que a oferta da Cakto é casada com o plano do sistema |
| **Crescimento** | **Afiliados** · **Pagamentos (Vendas)** | programa de afiliados e recebimentos de venda |
| **Infra** | **WhatsApp / Evolution** | instâncias e conexões |
| | **Integrações** · **Identidade Visual** · **E-mail** | configuração da plataforma |
| **Sistema** | **Central de Ajuda** · **Suporte** | conteúdo de ajuda e tickets |
| | **Ações dos Agentes** | o que as IAs efetivamente executaram (as ferramentas que elas chamaram) |
| | **Qualidade da IA** | principais problemas + experimentos e variantes de prompt |
| | **Atualizações** · **Logs** · **Saúde** | releases, auditoria e saúde do sistema |

## 12.3 Módulo **Vendas** — o CRM da plataforma

Dashboard · **Mia** · Pipeline · Leads · Agenda · Tarefas
**Atendimentos:** Chat · Painel · Radar IA · Follow-Up · Relatórios · Jornada do Lead
**Automação & IA:** Agentes IA · Campanhas · Cadências · Automações Instagram · Webhooks
**Anúncios**
**Prospecção Ativa:** Buscas · Base consolidada · Campanhas de disparo · Dashboard · Enriquecimento · Importação por vídeo
**Captação:** Quiz · Formulários · Form Vendedores · ChatBot · Widget · WhatsApp · Templates · Resultados · Analytics
**Gestão:** Negócios · Setores · Equipes · Central de Operação · Financeiro
**Configurações:** Conexões · Integrações · Respostas Rápidas · Campos personalizados · Etiquetas · Notificações · Horários

## 12.4 Os alertas que a Nexvy recebe — e o que cada um significa

Todos vão para o Telegram operacional, com amortecimento de rajada (uma mensagem por tipo a cada 15 min) e **sem nunca derrubar a operação** se a entrega falhar.

| Alerta | O que significa | Urgência |
|---|---|---|
| 🚨 **Cakto: PLANO NÃO ENCONTRADO (venda paga sem acesso)** | alguém pagou e não recebeu acesso | **máxima — dinheiro entrou, produto não saiu** |
| 🚨 **Cakto webhook: assinatura inválida** | chamada não autenticada bateu no webhook (traz o e-mail do comprador) | alta |
| 🚨 **Cakto: provisionamento com ERRO / exceção** | a venda passou, mas algo do provisionamento falhou | alta |
| ⚠️ **Cakto: PREÇO DEFASADO / underpay** | um link de oferta antigo continua vendendo pelo preço velho | alta (receita) |
| ⚠️ **Cakto: acesso SUSPENSO** | reembolso, chargeback ou cancelamento processado | informativa |
| **Handoff pós-compra falhou** | a Lia não pôde assumir (agente de implantação ausente, ou a conversa não pôde ser atualizada) | alta — a compradora ficaria sem o link pelo WhatsApp |
| **Resposta NÃO enviada — múltiplas conexões ativas** | o sistema não soube por qual número responder e **preferiu não responder** a responder pelo número errado | alta |
| **SDR ausente no número de vendas** | chegou lead e não há agente para atender | alta |
| **Raio-X saiu vazio / backfill vazio** | a prova entregue à lead não tinha conteúdo | alta (é a peça central da oferta) |
| **Régua de inatividade falhou** | o follow-up automático não pôde ser gerado | média |

**A leitura correta desses alertas:** o silêncio do Telegram é o estado de excelência. Cada alerta é uma exceção que exige ação humana — não ruído de fundo.

## 12.5 Relatório executivo

Disponível sob demanda, restrito a super_admin, e sempre por produto. Traz, no período escolhido:

**leads criados · leads quentes · conversas ativas · conversas aguardando humano · negócios ganhos · receita ganha · pipeline aberto · agentes ativos**

A síntese é escrita por IA; sem chave de IA disponível, o relatório sai em formato determinístico — **o botão nunca fica morto**.

## 12.6 A separação que não pode ser confundida

| Sinal | Para quem | Sobre o quê |
|---|---|---|
| Alertas do Telegram · Relatório executivo | **Nexvy** | a saúde do nosso negócio e das nossas vendas |
| Resumo diário · Relatório semanal · Alertas em tempo real | **a dona do salão** | a saúde do negócio *dela* |

Misturar os dois canais é o oposto do padrão.

## 12.7 COMO SE PROVA

```sql
-- O parque, num olhar
select plan_status, count(*) from organizations group by 1 order by 2 desc;

-- Receita reconhecida no mês
select date_trunc('month', payment_date) mes, sum(amount) from billing_history
where status='paid' group by 1 order by 1 desc;

-- Vendas que entraram sem virar acesso (deve ser SEMPRE zero)
select o.cakto_ref_id, o.customer_email, o.amount, o.paid_at
from cakto_orders o
where o.scope='platform' and o.status in ('paid','approved')
  and not exists (select 1 from organizations g where g.cakto_customer_email = o.customer_email);
```

**A última consulta é o teste de sanidade mais importante da plataforma: o resultado esperado é vazio.** Toda venda paga tem que ter virado uma empresa viva.

---

# ANEXO A — A RÉGUA, NUMA PÁGINA

| # | Elo | Gatilho | Prova de que está no padrão | Prazo |
|---|---|---|---|---|
| 1 | Atração | visita à LP | cookie `nxv_track` com a origem; a origem chega no checkout | instantâneo |
| 2 | Venda (Duda) | mensagem no WhatsApp da Nexvy | conversa `bot_active` + lead com `utm_medium='ctwa'` + evento **LeadSubmitted** | segundos |
| 3 | Checkout | clique em "Assinar agora" | pedido pago na Cakto + tela `/bem-vindo` | instantâneo |
| 4 | Provisionamento | webhook da Cakto | organização com plano ativo + **10 serviços, 4 automações, 1 radar** + link de 72 h + perfil admin + e-mail enviado | < 2 s |
| 5 | Handoff (Lia) | fim do provisionamento | **4 bolhas** com o mesmo `onboarding_org_id`, na conversa da venda | < 4 s |
| 6 | Wizard | abertura do link | `status='applied'` + `onboarding_locked=true` + `applied_refs` preenchido | ~12 min de preenchimento, < 3 s para aplicar |
| 7 | WhatsApp | "Gerar QR Code" | instância `connected`, `webhook_subscribed=true`, telefone preenchido | < 30 s |
| 8 | Ingestão | pareamento concluído | carteira populada, com data de última interação e histórico de meses/anos | < 3 min |
| 9 | Primeiro dia | primeiro login | **nenhum contador em zero** | — |
| 10 | Operação | mensagem da cliente / 08:00 | uma resposta por rajada · automações registradas · radar classificado | diário |
| 11 | Ciclo de vida | renovação / D-7 / cancelamento | `plan_activated_at` avança · 1 toque da Nina por ciclo · suspensão idempotente | mensal |
| 12 | Plataforma | operação contínua | consulta de "venda paga sem acesso" **vazia** · Telegram silencioso | contínuo |

# ANEXO B — OS SETE NÚMEROS QUE DEFINEM O PADRÃO

| Número | O que é |
|---|---|
| **72 h** | validade do link de implantação e duração da demonstração |
| **10 · 4 · 1** | serviços, automações e radar que toda organização nova recebe |
| **4** | bolhas da Lia · e também o teto de bolhas de uma resposta da IA |
| **10** | passos do wizard pelo link público (9 no fluxo já logado) |
| **3 s / 8 s** | janela e teto de agrupamento das mensagens da cliente antes de a IA responder |
| **8 · 20 · 25 · 35 min** | a régua de silêncio do follow-up da Duda |
| **< 3 min** | ingestão de uma carteira de dezenas de milhares de contatos |

---

*Fim do playbook. Toda régua aqui é verificável — se a prova não aparece, o elo não está no padrão.*

