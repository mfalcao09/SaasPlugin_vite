# PR-2c — Contrato do sinal de pagamento
### NexvyBeauty · 2026-08-04 · Controladora GO-LIVE

> **Origem:** achado da sessão BDR na revisão cruzada. O `PR-BDR-6` (travessia Camila → Lia) declarava este contrato como *"entregue pela controladora"* — e ele não existia em PR nenhuma.
> **Consome:** a Camila (para **encerrar** a própria conversa) e a Lia · Implantação (para **assumir** no número oficial).

---

## 0. A manchete: o sinal existe, o vínculo com a lead NÃO

```
cakto_orders        2 pedidos · 2 pagos · status distintos: 'paid'
  paid_at           2 de 2 preenchidos      ✅ o sinal de "pagou" existe
  organization_id   1 de 2 preenchido       ⚠️
  lead_id           0 de 2 preenchidos      🔴 ZERO

organizations       plan_status distintos: 'active' · 'demo'
  plan_activated_at 1 de 2
```

**O `PR-BDR-6` tem como check binário "a Lia assume com o MESMO `lead_id`". Hoje esse `lead_id` não existe em nenhum pedido pago.** A travessia não falha por bug — falha porque o dado que ela pede nunca foi gravado.

Não é motivo para redesenhar: `cakto_orders.lead_id` **existe como coluna** e o `cakto-webhook` tem um `resolveOrCreateLead` (`:356`). O que não sabemos é se ele não roda, se roda e não casa, ou se os 2 pedidos são anteriores a ele. **Medir isso é pré-requisito da PR-BDR-6**, e o casamento por telefone é o que a seção C conserta — o que amarra esta PR à **PR-5**, travada na palavra do Marcelo.

---

## 1. O contrato

### 1.1 O fato "pagou"

| | |
|---|---|
| **Fonte da verdade** | `cakto_orders` |
| **Predicado** | `paid_at IS NOT NULL` **e** `status = 'paid'` |
| **Instante** | `paid_at` — nunca `created_at` (ver §3) |
| **Idempotência** | um pedido dispara **uma** travessia; reentrega do webhook não pode disparar duas |

### 1.2 O fato "o espaço está de pé"

| | |
|---|---|
| **Fonte** | `organizations` |
| **Predicado** | `plan_status = 'active'` **e** `plan_activated_at IS NOT NULL` |
| ⚠️ | `plan_status = 'demo'` **não** é cliente — é Raio-X. Confundir manda a Lia atender quem não comprou |

### 1.3 Quem consome, e o que faz

```
CAMILA (BDR)     ao ver o sinal → ENCERRA a própria conversa e não responde mais
                 a última mensagem ANTES do checkout já nomeou o +55 11 95502-1205
                 (a travessia é anunciada antes, nunca depois — sem aviso prévio
                  é o formato exato do golpe, segundos depois de pagar)

LIA (onboarding) assume no número oficial de Vendas
                 connection_id   1f7ca6e3-a846-493d-908e-b6d74ccf8c84
                 phone_number_id 1239336002593934
                 template        boas_vindas_ativacao
```

### 1.4 A chave de junção — e o que fazer enquanto ela não existe

```
CANÔNICO   cakto_orders.lead_id → platform_crm_leads.id
FALLBACK   customer_phone via helper de _shared/ (variantes plataforma: dígitos + "+")
           ⚠️ NUNCA phoneVariantsBR cru: devolve só dígitos e casa ZERO linhas
              (8/8 dos leads são gravados com "+")
```

**Invariante:** sinal de pagamento que não resolve lead **não segue em silêncio.** Ou repete, ou marca a conversa como precisando de vínculo, ou alerta. O caminho de falha silenciosa já produziu 4 conversas órfãs no canal oficial — uma com 56 mensagens, invisível no CRM por semanas.

---

## 2. Check binário

1. Pedido pago dispara a travessia **uma vez** — reentrega não duplica.
2. `plan_status='demo'` **não** dispara nada.
3. A conversa da Camila encerra e não responde mais.
4. A Lia assume com o **mesmo** `lead_id`. **Hoje impossível de satisfazer** — ver §0.
5. Sinal que não resolve lead produz sinal observável, nunca silêncio.

---

## 3. Armadilha de instante — herdada, e vale aqui

`created_at` **não** é o instante do fato: neste schema é `DEFAULT now()`, o instante do **insert**. E `cakto_orders` ainda tem `created_at_cakto` separado, que é o relógio do provedor.

- **"quando pagou"** → `paid_at`
- **"quando a linha ficou visível para nós"** → `created_at`
- **nunca** ordenar um pelo outro

---

## 4. Dependências

| Trava | Com quem |
|---|---|
| Medir por que `lead_id` é NULL em 2/2 | eu — mas o **conserto** é PR-5 |
| **PR-5** (identidade de lead) | **Marcelo — palavra separada, muda dado em produção** |
| Helper de `_shared/` | sessão BDR — variantes agora, `merged_into` só com a PR-5 |
| `model` da Lia | ver PR-4 — a escolha é do Marcelo (custo × qualidade) |

---

## 5. O que este contrato NÃO resolve

- **Não implementa** a travessia. Define o que ela lê e o que não pode fazer.
- **Não decide** o `model` da Lia. Ela hoje cai no encadeamento `persona.model (NULL) → env → 'google/gemini-2.5-flash'`. Tornar explícito é **mudar**, não documentar.
- **Não cobre** checkout enviado e não pago — continua sendo da Camila, não do onboarding.
- **N = 2.** Todo número aqui vem de dois pedidos. É o universo, não uma amostra — mas é um universo minúsculo, e o primeiro cliente de volume pode exercitar caminho que estes dois não exercitaram.
