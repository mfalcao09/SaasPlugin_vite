# Placar GO LIVE — v3 (pós Bloco A)

**23/07/2026, madrugada.** Substitui o `_v2`. **Tudo reverificado agora**, não copiado.

---

## Veredito: **ainda não liberado — mas o motivo mudou.**

Na v2 o bloqueio era *"o encanamento do CAPI não existe"*. Agora existe, provado ponta
a ponta. O que falta deixou de ser código:

| # | O que falta | De quem depende |
|---|---|---|
| 1 | `META_CAPI_TOKEN` + `META_CAPI_DATASET_ID` | **você** — Events Manager |
| 2 | Um anúncio CTWA rodando (gera `ads_attribution`) | **você** |
| 3 | Flip do B3 | **tráfego real** (reconectar + 1 msg) |

**Nenhum é código.** É a primeira vez que o placar chega nesse estado.

---

## O que fechou no Bloco A

Advisor de segurança: **77 → 60 alertas**, quatro regras zeradas.

| # | Item | Prova executada |
|---|---|---|
| **A1** | CAPI produtor | compra Essencial R$275 → `sale_completed`/`sale`/NexvyBeauty · remarcar pago **não duplica** · `cakto_product_id` desconhecido **não é chutado** |
| **A1b** | Plano → produto explícito | 5/5 planos com `product_id` |
| **A2** | CAPI consumidor | cron `*/5` ativo · invocação pelo vault → `200`, `mode: dry_run` |
| **A3** | Policies `INSERT` abertas | anônimo `42501` nas duas · `capture-lead` → `{"ok":true,"lead_id":"c809a621…"}` |
| **A4** | Flip do B3 | ⛔ **NÃO FEITO** — ver abaixo |
| **A5** | `search_path` mutável | **8 → 0** |
| **A6** | Enumeração de bucket | **5 → 0** · leitura pública segue `200` (provado com objeto de teste) |
| **A7** | Alerta de WhatsApp caído | 1º disparo alertou · 2º silenciou (throttle no banco) · cron `*/15` |

---

## A4 — por que eu não flipei

O comentário do próprio `evolution-webhook` registra:

> *"Não há prova de que o Evolution Go ecoa `instance_token` no corpo; enforce cego
> mataria a ingestão em silêncio."*

Meu teste sintético prova que **o mecanismo funciona quando o token chega**. Isso não é
a mesma afirmação que **"o Evolution manda esse token"** — e eu quase tratei uma como a
outra. `instance_token` é gerado por *nós* e enviado *para* o Evolution; que ele volte
no webhook é suposição.

Instância desconectada = sem tráfego real para observar. Flipar agora significa: se o
Evolution não ecoar, o WhatsApp **para de entrar no minuto em que você reconectar**, sem
sintoma óbvio. Não é um trade que eu faço sozinho.

---

## Estado reverificado agora

| Métrica | Valor | Leitura |
|---|---|---|
| `ads_capi_events` | **0** | correto — sem credencial e sem anúncio |
| `ads_attribution` | **0** | correto — sem clique de anúncio não há atribuição |
| `sale_completed` na jornada | 0 | correto — nenhuma venda real desde o trigger |
| Policies `INSERT` abertas | **0** | ✅ fechadas |
| Crons novos ativos | **2** | ✅ CAPI + saúde do WhatsApp |
| Carteira classificada | **346** | ✅ 100% com evidência |
| Instância WhatsApp | `disconnected` | desde 21/07 03:28 |

---

## Aberto

| # | Item | Estado |
|---|---|---|
| **B7/D5** | Meta CAPI | encanamento ✅ · **credenciais faltam** |
| **B8b** | Senha vazada (HaveIBeenPwned) | ainda desligada — toggle no painel |
| **B9** | PITR | não configurado (plano pago) · *alerta de queda já feito no A7* |
| **B3** | Webhook Evolution | shadow — depende de tráfego real |
| **D1** | E-mail de recompra | deployado 21/07 · **0 e-mails desde** → não provado |
| — | View `SECURITY DEFINER` | 1 restante (`public_plans`, intencional) |
| — | `rls_enabled_no_policy` | 3 (tabelas internas de cron) |

---

## Depende de você — todas curtas

| # | Ação | Destrava |
|---|---|---|
| 1 | **Events Manager**: gerar token da Conversions API + copiar o ID do dataset | CAPI real. O `WABA_ID` eu tiro do banco |
| 2 | **Toggle** de senha vazada no painel Supabase | B8b — 30 segundos |
| 3 | **Reconectar** `meuteste1-sal-o1` + 1 mensagem | Flip do B3 **e** prova do classificador em tráfego novo |
| 4 | **Uma compra real** no Essencial | D1 **e** o `sale_completed` de verdade |
| 5 | **Um WhatsApp de salão REAL** | A demonstração comercial — segue sendo o mais importante |

---

## Dois erros meus neste bloco

**1. Escrevi na tabela errada e reportei como pronto.** O trigger do A1 inseria em
`ads_capi_events`, que é o registro de *saída*. A fila de *entrada* é
`platform_crm_journey_events`. O evento nascia órfão e pareceria correto numa inspeção
da tabela. Corrigido — mas chegou até você como "feito" antes de ser pego.

**2. Quase flipei o B3 com prova insuficiente.** Confundi "o mecanismo funciona" com
"o Evolution envia o token".

O padrão comum aos dois, e ao erro de ontem: **contador zerado com aparência de
sucesso.** `candidates: 0` com a tabela cheia; `sem_conversa: 10` sempre igual. Nos três
casos o código respondia `200` e `erros: 0`.

> **Ausência de erro não é prova de progresso.** Passei a tratar contador parado entre
> execuções como sintoma, não como ruído.

---

## O que o Bloco A realmente entregou

Reduziu risco: fechou 17 alertas de segurança, tirou duas portas anônimas de `INSERT`,
fechou a enumeração de 5 buckets e pôs de pé o alerta de canal caído.

**Não destravou o GO LIVE** — e é importante não confundir as duas coisas. O anúncio
continua parado pelos mesmos motivos de ontem, só que agora nenhum deles é código nosso.
