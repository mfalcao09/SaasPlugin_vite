# Placar GO LIVE — 22/07/2026 · v2 (fim do dia)

> Substitui o `PLACAR-GO-LIVE-2026-07-22.md` da manhã. **Tudo aqui foi reverificado
> agora**, não copiado da versão anterior. Onde não houve prova, está escrito
> "não provado" — não "pronto".

---

## Veredito: **continua não liberado.** Os dois bloqueadores da manhã seguem intactos.

Nada do que foi feito hoje tocou neles, porque nenhum é código de produto:

1. **`ads_capi_events = 0`.** Reverificado agora. Nenhum evento de `Purchase` jamais
   chegou ao Meta. Tráfego pago sem CAPI é pagar por clique e não devolver sinal de
   conversão.
2. **Duas policies de `INSERT` abertas a qualquer anônimo** (`booking_requests`,
   `sales_leads`), sem rate limit. Reverificado: 2, inalterado.

O que mudou hoje foi **abaixo** desses dois: a carteira deixou de ser um lixão e o
disparo ganhou trava. Isso não libera o anúncio — mas era o que tornava o anúncio
perigoso mesmo se liberado.

---

## O que fechou hoje (14 commits, todos com prova executada)

### Frente B4 — carteira inteligente, 5 fases

| Fase | Entrega | Prova |
|---|---|---|
| **0 · Reconhecimento** | O histórico do WhatsApp estava no Postgres do Evolution, no VPS, o tempo todo | 166.383 msgs, 128.434 com corpo. **Sem reconexão, sem ação do Marcelo** |
| **1 · Carga do legado** | `carteira-import-legacy` puxa via `chat/findMessages` | **81.045 mensagens**, 348 contatos, **0 erro**. Idempotência: 60.677 linhas reenviadas → diferença **0** |
| **2 · Tag de assunto** | `pessoal \| misto \| indefinido` em `tipo_contato` | valor inválido rejeitado pela constraint |
| **3 · Gate de disparo** | `salon-automation-run` filtra `principal` + ≠ `pessoal` | sogra → 🚫 BLOQUEADO · cliente real → 📨 RECEBE |
| **4 · Agente classificador** | `carteira-classify` lê janela de 40 msgs e devolve **evidência** | **346/346 classificados, 0 erro**, 100% com evidência |
| **5 · Tela** | Filtro por assunto, evidência a um hover, revisão em 1 clique | `tsc` limpo · build verde · demo 0 erro de console |

**Distribuição final da carteira** (346 classificados):

| Assunto | Qtd | % | Confiança |
|---|---|---|---|
| pessoal | 163 | 47,1% | 0,94 |
| indefinido | 142 | 41,0% | 0,89 |
| salão | 36 | 10,4% | 0,94 |
| misto | 5 | 1,4% | 0,91 |

### Segurança

| Item | Antes | Agora |
|---|---|---|
| `security_definer_view` (ERROR) | **2** | **1** — fechei o vazamento de faturamento por anônimo; sobra `public_plans`, intencional |
| `anon_security_definer_function` | 13 | 13 — subiu para 14 com um trigger meu, **revogado no mesmo dia** |

---

## Aberto — bloqueia o anúncio

| # | Item | Estado reverificado |
|---|---|---|
| **B7/D5** | Meta Purchase / CAPI | `ads_capi_events = 0`. **Nunca disparou.** |
| **B8a** | `booking_requests` + `sales_leads`: `INSERT` com `WITH CHECK` sempre verdadeiro | **2 policies**, inalterado |
| **B8b** | Proteção de senha vazada (HaveIBeenPwned) | **Ainda desligada** (advisor confirma) |
| **B9** | Alerta de WhatsApp caído + PITR | Não configurado |
| — | 5 buckets públicos permitem **listagem** | Inalterado (13 buckets públicos no total) |
| — | 8 funções com `search_path` mutável | Inalterado |
| **B3** | Webhook Evolution | **Ainda em shadow** — depende de tráfego real |
| **D1** | E-mail de boas-vindas na recompra | Fix deployado 21/07 23:28 · **0 e-mails desde então** → **não provado** |

---

## Depende de você (HITL)

| # | O que precisa | Destrava |
|---|---|---|
| 1 | **Ligar o toggle** de senha vazada no painel Supabase | B8b — 30 segundos, não tenho acesso ao painel |
| 2 | **Uma compra real no Essencial** | Única prova possível do D1 e do funil com dinheiro real |
| 3 | **Reconectar `meuteste1-sal-o1`** + 1 mensagem | Flip do B3 (preciso ver `would_pass` em tráfego real) |
| 4 | **Um WhatsApp de salão REAL conectado** | Ver abaixo — é o mais importante |

> **A Fase 0 eliminou o antigo item 1 da lista de manhã.** O re-sync do histórico não
> depende mais de reconexão: leio do Evolution direto. Sobrou só o flip do B3.

---

## A descoberta que muda a conversa comercial

O agente classificou os 346 contatos e o resultado foi **47% pessoal contra 10% salão**.
As evidências citadas nos contatos de maior volume:

> "responsabilidades e viagens de lazer" · "declarações de afeto" ·
> **"notas do IGC e Enade"** · **"autorização de cursos pelo MEC"** · **"diplomas e XML"**

Isso não é conversa de salão de beleza. **O número conectado como `meuteste1-sal-o1` é
um WhatsApp pessoal/profissional, não de um salão.** O classificador não errou — ele
acertou, e o que acertou é que essa carteira não é de salão.

**Consequência ruim:** não dá para demonstrar "análise de carteira" com essa base. A
frase que a tela mostra — *"N contatos falam de serviço e nunca agendaram, esse é o
dinheiro parado"* — vai aparecer com N pequeno.

**Consequência boa, e talvez maior:** este é o caso de uso real mais comum. A dona do
salão usa o mesmo WhatsApp para tudo — cliente, filho, igreja, fornecedor. O
classificador acabou de demonstrar que separa isso, com evidência citável, num telefone
genuinamente misturado. É validação mais dura do que um salão limpo teria dado.

**O que falta não é código: é um WhatsApp de salão real conectado**, nem que seja de uma
cliente-piloto.

---

## Três defeitos que só apareceram executando

Registrados porque cada um custou um ciclo, e o padrão é o mesmo nos três.

1. **`is_br_dialable` rejeitava celular pré-2012.** Assumi que 12 dígitos = fixo. O
   alarme inicial de que 82% da conversa estava na lixeira era **falso** —
   `normalize_phone_br` insere o nono dígito antes da checagem, impacto real zero. A
   regra estava errada mesmo assim e foi corrigida (20/20 na suíte).
2. **Idempotência por leitura prévia falhava em conversa grande.** O PostgREST tem teto
   de linhas e devolvia conjunto incompleto numa conversa de 37.848 mensagens. Corrigido
   promovendo o id do Evolution a coluna real: a idempotência virou **garantia do banco**
   em vez de disciplina da aplicação.
3. **Um `continue` sem gravar estado travou a fila para sempre.** Contato com conversa só
   de áudio voltava ao topo da fila a cada chamada. Rodou 59 lotes girando nos mesmos 10,
   **relatando `erros: 0` o tempo todo** — do ponto de vista do código, nada falhou.

> A lição operacional: **ausência de erro não é prova de progresso.** Foi o contador
> `sem_conversa` parado entre lotes que denunciou, não o `erros`.

---

## Correção de rumo desta versão

O placar da manhã afirmava que os gaps de segurança estavam fechados. Ao reverificar
para escrever esta v2 — em vez de copiar — encontrei **uma função de trigger que eu
mesmo deixei executável por anônimo hoje**. Revogada e provada no mesmo dia.

É o segundo dia seguido em que reverificar encontra algo que afirmar de memória teria
deixado passar.
