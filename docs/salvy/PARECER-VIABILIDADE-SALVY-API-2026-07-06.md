# Parecer de Viabilidade — Automação da Gestão de Números via API Salvy

> **Data:** 2026-07-06 · **Branch:** `feat/salvy-gestao-numeros` · **Autor:** Claude (Opus 4.8) para Marcelo Silva
> **Fonte primária:** OpenAPI spec cru (`https://api.salvy.com.br`, v1.0.0) — arquivado em [`salvy-openapi-2026-07-06.json`](./salvy-openapi-2026-07-06.json) · 17 endpoints · 461KB
> **Método:** leitura determinística do spec completo (não do índice) + inspeção do dashboard logado no Chrome real.

---

## 1. TL;DR — o veredito em uma tabela

Você pediu três coisas automatizadas via API: **gerir números**, **gerir faturas**, **pedir números novos**. O resultado honesto:

| Eixo | Automatizável via API? | Prova |
|---|:---:|---|
| **Pedir número novo** | ✅ **100% API** | `POST /api/v2/virtual-phone-accounts` — só exige `areaCode` (DDD); devolve `phoneNumber` + `status` na hora |
| **Gerir números** | ✅ **100% API** | list · get · update · cancel · redirect · ler SMS · consultar DDDs disponíveis |
| **Gerir faturas** | ❌ **NÃO existe API** | Zero endpoints de billing no spec. Faturas são feature **só do dashboard** ("Faturas & Cobranças" / "Diagnóstico de faturas") |

**Resposta direta:** 2 dos 3 objetivos são totalmente automatizáveis hoje. **Faturas não** — a Salvy não expõe nenhuma API de billing, e isso é uma decisão de produto deles, não uma limitação sua a contornar com código. Para faturas você tem 4 saídas (§6), sendo a mais elegante **manter seu próprio ledger** — já que *você* controla o provisionamento via API, *você* sabe o custo esperado sem precisar da fatura deles.

### ✅ Confirmação empírica (spike read-only, 2026-07-06)

Rodei o fluxo com a key real (read-only, **custo zero**) e confirmei ao vivo:

- **Auth Bearer** → `GET /api/v2/virtual-phone-accounts` = `200`, 2 linhas reais retornadas ("Salão Teste - Nexvy" `pending`, "Vendas - Nexvy" `active`).
- **Leitura de OTP funciona E vem estruturada:** a linha "Vendas" recebeu `"Your WhatsApp code: 944-591"` e a Salvy **já entrega o código parseado** em `detections.whatsapp.verificationCode: "944591"` — não precisa nem de regex na mensagem. Isso eleva o onboarding WhatsApp de *provável* para **comprovado**.
- **`status`** distingue `pending` (aguardando confirmação) de `active` — é a máquina de estados do onboarding.
- **`area-codes`** devolve `{ areaCode, available }` por DDD → dá pra checar disponibilidade antes de provisionar.

> O único eixo ainda não exercido ao vivo é o `POST create` (billable) — travado no spike atrás de `SALVY_ALLOW_CREATE=1`, aguardando OK explícito.

---

## 2. Inventário completo da API (as 17 rotas, todas)

Base URL: **`https://api.salvy.com.br`** · Auth: **Bearer token** em todas.

### Números virtuais (o núcleo do que interessa) — v2 é a versão atual
| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/v2/virtual-phone-accounts` | **Criar número** (pedir linha). Req: `areaCode` (obrig.) · `name`, `employeeId`, `costCenter`, `customFields` (opc.) |
| `GET` | `/api/v2/virtual-phone-accounts` | Listar todos os números |
| `GET` | `/api/v2/virtual-phone-accounts/{id}` | Detalhe de um número |
| `PATCH` | `/api/v2/virtual-phone-accounts/{id}` | Atualizar (nome, centro de custo, campos) |
| `DELETE` | `/api/v2/virtual-phone-accounts/{id}` | Cancelar número |
| `GET` | `/api/v2/virtual-phone-accounts/area-codes` | Listar DDDs disponíveis em estoque |
| `GET` | `/api/v2/virtual-phone-accounts/{id}/sms-messages` | **Ler SMS recebidos** (paginado) — é aqui que sai o OTP |

> Existem versões `v1` e `/api/...` **deprecated** das mesmas rotas + um `PATCH .../redirect`. Ignorar as deprecated; usar **v2**.

### Colaboradores
`GET /api/v1/employees` · `POST /api/v1/employees/sync` — vincular número a um colaborador.

### Equipamentos (assets — gestão de ativos)
CRUD completo: `create` · `list` · `get` · `update` · `archive` · `timeline-notes` — inventário de equipamentos/chips.

### Webhooks
`sms.received` — **único evento existente.** Não há webhook de "número provisionado", "número cancelado" nem "fatura emitida".

---

## 3. O que a `CREATE` devolve (por que "pedir número" é trivial)

```
POST /api/v2/virtual-phone-accounts
Authorization: Bearer <key>
{ "areaCode": 11, "name": "Salão X - Tenant 123", "costCenter": "beauty" }

200 → { id, name, phoneNumber, status, createdAt, canceledAt,
        cancelReason, costCenter, employeeId, customFields }
```

Você manda um DDD e recebe **o número de telefone real de volta na mesma resposta**. Não há etapa de "aprovação", "pagamento" ou "aguardando estoque" no contrato da API — o custo simplesmente entra na sua fatura mensal Salvy. Isso é o que torna o onboarding automatizável: 1 chamada = 1 número pronto.

---

## 4. O achado estratégico: onboarding de WhatsApp por tenant

No dashboard logado, a linha de teste "Salão Teste - Nexvy" `(11) 9XXXX-XXXX` mostrava um bloco **"Confirmação do WhatsApp — insira este código na configuração do seu número na API da Meta"**.

Traduzindo o fluxo real de negócio que isso habilita:

```
Venda de tenant (webhook Cakto/Stripe)
  → Edge Function server-side:
     1. POST /api/v2/virtual-phone-accounts  { areaCode }         → número novo
     2. Registra número na Meta WhatsApp Business API (tenant)
     3. Meta envia OTP por SMS → chega no número Salvy
     4. GET /.../{id}/sms-messages  (ou webhook sms.received)     → lê o OTP
     5. Confirma o número na Meta com o OTP                       → WhatsApp ativo
```

**Isso fecha ponta-a-ponta, sem intervenção humana.** É o prêmio real desta integração — muito mais valioso que "gerir faturas". Os números Salvy são *receive-only* (só recebem SMS), o que é exatamente o suficiente para receber o OTP da Meta.

---

## 5. Limitações que você precisa saber ANTES de arquitetar (não descobrir depois)

| Limitação | Impacto |
|---|---|
| ❌ **Sem envio de SMS** | Números só *recebem*. Se algum SaaS precisar *disparar* SMS pelo número, a Salvy não serve — precisaria de outro provider (Twilio/Zenvia) |
| ❌ **Sem voz / sem internet** | São linhas de dados-zero, SMS-inbound-only. Não dá pra fazer/receber ligação nem usar como eSIM de dados |
| ❌ **Sem API de faturas** | Confirmado no spec E no painel. Billing é 100% dashboard |
| ⚠️ **Um único webhook** (`sms.received`) | Você não é *notificado* quando um número é provisionado/cancelado por outra via, nem quando uma fatura fecha. Estado tem que ser puxado (polling) ou você é a fonte da verdade |
| ⚠️ **Rate limit não documentado** | O spec não declara 429 nem limites. Trate como desconhecido → backoff conservador, não martele o `create` em loop |
| ⚠️ **Key exibida uma única vez** | Igual ao seu padrão da Seção 11.1 — gere server-side, guarde o hash/secret no cofre, nunca reexibível |

---

## 6. Faturas: as 4 saídas (e a que eu recomendo)

Já que não há API de billing, escolha uma:

- **(a) Aceitar painel-only** — humano confere fatura mensal no dashboard. Simples, mas não é o "tudo automatizado" que você quer.
- **(b) Scraping do dashboard** — ❌ **NÃO recomendo.** Frágil, quebra a cada deploy deles, e você me ensinou (Seção 3.2) a atacar causa raiz, não gambiarra.
- **(c) Pedir à Salvy** uma API de faturas ou webhook `invoice.issued`. Vale abrir o chamado — é o caminho *certo* a médio prazo. Custo: depende deles.
- **(d) ✅ RECOMENDADA — seu próprio ledger.** Você provisiona/cancela cada número via API, então *você tem o registro canônico* de números ativos por tenant por período. Calcule o custo esperado internamente (nº de números × tarifa) e use a fatura Salvy só para reconciliação/auditoria, não como fonte operacional. Você não precisa da API de faturas para automatizar o *negócio* — só precisaria dela para *conferência contábil*, que é mensal e tolera ser semi-manual.

---

## 7. Arquitetura recomendada (alinhada à Seção 11.1)

```
┌─────────────┐   JWT Supabase    ┌──────────────────────┐   Bearer (server) ┌──────────────┐
│  Frontend   │ ────────────────► │  Edge Function proxy │ ────────────────► │  Salvy API   │
│  (tenant)   │                   │  (valida JWT, chama  │                   │ api.salvy... │
└─────────────┘                   │   Salvy c/ a key)    │                   └──────────────┘
                                  └──────────┬───────────┘
                                             │ escreve
                                             ▼
                                  ┌──────────────────────┐
                                  │  ledger próprio (DB)  │  ← fonte da verdade p/ faturas
                                  │  números × tenant ×   │     (reconcilia c/ fatura Salvy)
                                  │  período × status     │
                                  └──────────────────────┘
```

- **Key Salvy** só no `.env` server-side / cofre — **nunca** `NEXT_PUBLIC_*` (Seção 11.1, regra inegociável).
- Todo acesso do front passa por **Edge Function proxy** com JWT Supabase.
- Webhook `sms.received` aponta para uma Edge Function que grava o OTP → dispara o passo de confirmação Meta.
- Cada `create`/`cancel` grava no **ledger próprio** → base para reconciliação de faturas.

---

## 8. Critério de "pronto" (verificável, Seção 8.3)

Antes de considerar a integração concluída:
1. `POST` de criar número retorna `200` + `phoneNumber` válido → **check: número aparece no dashboard**
2. `GET .../sms-messages` lê um OTP real da Meta → **check: OTP capturado sem humano**
3. Key Salvy ausente do bundle do front → **check: `grep -r salvy_ dist/` vazio**
4. Ledger registra 1 número provisionado → **check: linha no DB reconcilia com 1 item na fatura Salvy do mês**

---

## 9. Perguntas abertas para você / para a Salvy

1. **Tarifa por número** — qual o custo unitário mensal? (define o ledger e o gate de "vale a pena provisionar automático")
2. **Salvy tem API/webhook de faturas no roadmap?** (decide entre saída (c) e (d))
3. **Rate limit real do `create`** — quantos números/minuto aguenta? (para provisionar em lote sem tomar block)
4. **Portabilidade** — dá pra portar um número existente do tenant, ou só números novos do estoque Salvy? (não há endpoint de portabilidade no spec — provável que seja fluxo comercial)
5. **Escopo do uso** — os números são para WhatsApp Business por tenant (minha leitura), ou também para 2FA/SMS de outros fluxos?

---

## 10. Próximo passo sugerido

Isto foi **descoberta + parecer**, não implementação (conforme combinado). Se aprovar a direção, o próximo passo natural é um **spike**: uma Edge Function que faz `create` → `list-sms` num número de teste, provando o fluxo ponta-a-ponta com a sua key real, antes de plugar no onboarding de tenant. Só codo isso com seu de-acordo.
